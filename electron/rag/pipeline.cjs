const { randomUUID } = require("crypto");
const { searchAll, searchQuery, searchMany, interleaveByProvenance } = require("./sources/index.cjs");
const { fetchMany, looksBlocked } = require("./fetch.cjs");
const { chunkText } = require("./chunk.cjs");
const { createEmbedder } = require("./embedder.cjs");
const { buildIndex, searchIndex } = require("./bm25.cjs");
const { searchVector } = require("./vector.cjs");
const { rrfFuse } = require("./rrf.cjs");
const { expandQuery } = require("./expand.cjs");
const { rerank } = require("./rerank.cjs");
const {
  planQueries,
  genPerspectives,
  genQuestions,
  cardsFromDocs,
  DEFAULT_PERSPECTIVE,
} = require("./plan.cjs");
const { selectEvidence, rubricScore } = require("./filter.cjs");
const { genOutline, writableSections } = require("./outline.cjs");
const {
  writeSection,
  writeAbstractAndConclusion,
  assembleReport,
  renumberCitations,
  referenceLineFromDoc,
} = require("./write.cjs");
const db = require("./db.cjs");

const AGENT_PROMPT =
  "You are Expozi, a research assistant. Answer ONLY from the evidence below. " +
  "Cite claims with the passage numbers like [1], [2]. Be concise and specific. " +
  "Start directly with the answer; do not repeat or rephrase the question. " +
  "If the evidence covers the task only partially, answer what it supports and state the gap.";

const REPORT_PROMPT =
  "Write a formal research report answering the question below. Use ONLY the provided evidence. Format as:\n" +
  "# Title\n## Abstract (about 120 words)\n## Introduction\n## Key Findings (subsections per theme)\n## Conclusion\n## References\n" +
  "Cite sources as [1], [2] etc. Return plain text with these headings, no JSON.";

function checkAbort(signal) {
  if (signal && signal.aborted) {
    const e = new Error("aborted");
    e.name = "AbortError";
    throw e;
  }
}

function persistSources(sessionId, docs) {
  try {
    for (const d of docs) {
      db.run(
        "INSERT OR IGNORE INTO sources (session_id, title, url, authors, year, journal, doi, citations, source_type, abstract) VALUES (?,?,?,?,?,?,?,?,?,?)",
        [
          sessionId,
          d.title,
          d.url,
          (d.authors || []).join("; "),
          d.year,
          d.journal,
          d.doi,
          d.citations || 0,
          d.provenance,
          d.abstract || "",
        ],
      );
    }
  } catch {
    /* never break the pipeline on DB errors */
  }
}

function persistPassages(sessionId, withText, capped) {
  try {
    const srcIds = {};
    for (const x of withText) {
      const row = db.all("SELECT id FROM sources WHERE session_id=? AND url=?", [sessionId, x.doc.url])[0];
      srcIds[x.doc.url] = row ? row.id : null;
    }
    capped.forEach((c, i) => {
      const url = withText[c.docIdx].doc.url;
      db.run("INSERT INTO passages (source_id, session_id, chunk_index, text, embedding) VALUES (?,?,?,?,?)", [
        srcIds[url] || null,
        sessionId,
        i,
        c.text,
        c.vec ? JSON.stringify(c.vec) : null,
      ]);
    });
  } catch {
    /* noop */
  }
}

// Fetch pages, chunk them, rank with BM25 + embeddings. Shared by all depths.
async function loadEvidence({ sessionId, query, docs, maxUrls, keys, signal, onStage }) {
  onStage("fetch", `Reading ${Math.min(docs.length, maxUrls)} sources…`);
  checkAbort(signal);
  const fetchDocs = interleaveByProvenance(docs).slice(0, maxUrls);
  const fetched = await fetchMany(
    fetchDocs.map((d) => d.url),
    3,
    keys && keys.jina,
  );
  const withText = fetchDocs
    .map((d, i) => ({
      doc: d,
      text:
        fetched[i] && fetched[i].length > 200 && !looksBlocked(fetched[i])
          ? fetched[i]
          : d.abstract || "",
    }))
    .filter((x) => x.text && x.text.length > 100);
  if (withText.length === 0) return null;

  onStage("embed", "Indexing the sources…");
  checkAbort(signal);
  const chunks = [];
  withText.forEach((x, di) => {
    chunkText(x.text).forEach((c, ci) => chunks.push({ docIdx: di, chunkIdx: ci, text: c }));
  });
  const capped = chunks.slice(0, 250);

  const bm = buildIndex(capped.map((c) => c.text));
  const bmRanked = searchIndex(bm, query, 40);

  let vecRanked = [];
  const embedder = await createEmbedder({
    onProgress: (done, total, note) => onStage("embed", note || `Indexing the sources… ${done}/${total}`),
  });
  if (embedder.available) {
    try {
      const qv = (await embedder.embed([query]))[0];
      const vecs = await embedder.embed(capped.map((c) => c.text));
      capped.forEach((c, i) => {
        c.vec = vecs[i];
      });
      checkAbort(signal);
      if (qv) vecRanked = searchVector(qv, vecs, capped.length);
    } catch (e) {
      if (e && e.name === "AbortError") throw e;
      vecRanked = [];
    }
  }

  persistPassages(sessionId, withText, capped);
  return { withText, capped, bmRanked, vecRanked, embedder };
}

// ---------------------------------------------------------------------------
// v2 pipeline: grounded planning (GPT-Researcher) + perspective-guided
// questions (STORM) + smart context filtering + outline-first report writing.
// ---------------------------------------------------------------------------
async function runV2({ sessionId, query, mode, promptFn, signal, onStage, onToken, maxTokens, keys, depth }) {
  const deep = depth === "deep";

  onStage("scan", "Scanning the topic…");
  checkAbort(signal);
  let grounding = [];
  try {
    grounding = interleaveByProvenance(await searchQuery(query, keys, { perSource: 5, web: 4 }));
  } catch {
    grounding = [];
  }
  const cards = cardsFromDocs(grounding, { chars: 200, limit: 6 });

  onStage("plan", "Planning the searches…");
  checkAbort(signal);
  const planned = await planQueries(promptFn, query, cards, deep ? 6 : 4);

  let perspectives = [];
  let questions = [];
  if (mode !== "review") {
    onStage("perspectives", "Gathering perspectives…");
    checkAbort(signal);
    perspectives = await genPerspectives(promptFn, query, deep ? 3 : 2);
    if (perspectives.length === 0) perspectives = [DEFAULT_PERSPECTIVE];
    onStage("questions", "Asking research questions…");
    checkAbort(signal);
    questions = await genQuestions(promptFn, query, perspectives, [], cards, deep ? 2 : 1);
  }

  // The raw question is always searched too: it is the most reliable query
  // (blindly trusting small-model sub-queries can drift off-topic).
  const searchList = [query, ...planned, ...questions];
  onStage("search", `Searching ${searchList.length} queries…`);
  checkAbort(signal);
  const docs = await searchMany(searchList, keys, deep ? 70 : 50, { maxQueries: deep ? 12 : 8 });
  persistSources(sessionId, docs);
  if (docs.length === 0) return { sessionId, sources: [], answer: null };

  if (deep && mode !== "review") {
    checkAbort(signal);
    onStage("questions", "Refining the questions…");
    try {
      const more = await genQuestions(
        promptFn,
        query,
        perspectives,
        questions,
        cardsFromDocs(docs, { chars: 120, limit: 8 }),
        1,
      );
      if (more.length > 0) {
        questions.push(...more);
        onStage("search", `Searching ${more.length} follow-up queries…`);
        const extra = await searchMany(more, keys, 30);
        const seen = new Set(docs.map((d) => d.id));
        for (const d of extra) {
          if (!seen.has(d.id)) {
            seen.add(d.id);
            docs.push(d);
          }
        }
        persistSources(sessionId, docs);
      }
    } catch (e) {
      if (e && e.name === "AbortError") throw e;
      /* a failed refinement round must not kill the run */
    }
  }

  const loaded = await loadEvidence({ sessionId, query, docs, maxUrls: deep ? 24 : 18, keys, signal, onStage });
  if (!loaded) return { sessionId, sources: docs.slice(0, 8), answer: null };
  const { withText, capped, bmRanked, vecRanked, embedder } = loaded;

  onStage("filter", "Selecting the evidence…");
  checkAbort(signal);
  let pool = selectEvidence(capped, {
    vecRanked,
    bmRanked,
    maxPerDoc: deep ? 4 : 3,
    budgetChars: deep ? 16000 : 12000,
  });
  if (pool.length === 0) pool = capped.map((_, i) => i).slice(0, 12);

  if (deep && mode === "report") {
    try {
      const scores = await rubricScore(promptFn, query, pool.map((i) => capped[i]));
      if (scores.length === pool.length) {
        const kept = pool.filter((_, k) => scores[k] >= 1);
        if (kept.length >= 4) pool = kept;
      }
    } catch (e) {
      if (e && e.name === "AbortError") throw e;
      /* keep the current pool */
    }
  }

  const numberOf = new Map(pool.map((i, n) => [i, n + 1]));
  const passageByNo = new Map(pool.map((i, n) => [n + 1, capped[i]]));
  const docOfPassage = (p) => (withText[p.docIdx] ? withText[p.docIdx].doc : null);
  const poolTexts = pool.map((i) => capped[i].text);
  const poolVecs = pool.map((i) => capped[i].vec);
  const poolBm = buildIndex(poolTexts);
  const hasPoolVecs = poolVecs.some(Boolean);

  // A pack is a small, globally-numbered evidence set for one question/section.
  const packFor = (topic, qv, k = 4) => {
    const bmIds = searchIndex(poolBm, topic, 8).map((r) => r.id);
    let order = bmIds;
    if (qv && hasPoolVecs) {
      const vr = searchVector(qv, poolVecs, pool.length).map((r) => r.i);
      order = rrfFuse([bmIds, vr], [0.4, 0.6]).map((f) => f.idx);
    }
    return order.slice(0, k).map((pid) => ({ n: numberOf.get(pool[pid]), text: poolTexts[pid] }));
  };

  const parentsFromNumbers = (nos) => {
    const parents = [];
    const seen = new Set();
    for (const n of [...nos].sort((a, b) => a - b)) {
      const chunk = passageByNo.get(n);
      const d = chunk && docOfPassage(chunk);
      if (d && d.url && !seen.has(d.url)) {
        seen.add(d.url);
        parents.push(d);
      }
    }
    return parents;
  };

  // ---- review: sources only -------------------------------------------------
  if (mode === "review") {
    const parents = [];
    const seen = new Set();
    for (const i of pool.slice(0, 24)) {
      const d = docOfPassage(capped[i]);
      if (d && d.url && !seen.has(d.url)) {
        seen.add(d.url);
        parents.push(d);
      }
    }
    return { sessionId, sources: parents.slice(0, 20), answer: null };
  }

  const topicList = questions.length > 0 ? questions : planned;
  let topicVecs = [];
  if (embedder.available && embedder.source === "api" && topicList.length > 0) {
    try {
      topicVecs = await embedder.embed(topicList);
    } catch {
      topicVecs = [];
    }
  }

  // ---- report: outline-first, sectioned writing -----------------------------
  if (mode === "report") {
    onStage("outline", "Building the report outline…");
    checkAbort(signal);
    const maxSections = deep ? 6 : 4;
    const outline = await genOutline(promptFn, query, cardsFromDocs(docs, { chars: 100, limit: 8 }), {
      maxSections,
    });
    const sections = writableSections(outline, maxSections);
    onStage("outline", `Outline ready: ${sections.map((s) => s.title).join(" · ") || "(default)"}`);

    const used = new Set();
    const written = [];
    for (let si = 0; si < sections.length; si++) {
      checkAbort(signal);
      const section = sections[si];
      onStage("write", `Writing section ${si + 1}/${sections.length}: ${section.title}`);
      const topic = [section.title, ...(section.subs || [])].join(". ");
      let qv = null;
      if (embedder.available && embedder.source === "api") {
        try {
          qv = (await embedder.embed([topic]))[0] || null;
        } catch {
          qv = null;
        }
      }
      const items = packFor(topic, qv, 5).filter((it) => it.n && !used.has(it.n));
      for (const it of items) used.add(it.n);
      const text = await writeSection(promptFn, {
        query,
        section,
        evidence: items,
        maxTokens: 420,
        onToken,
      });
      written.push({ title: section.title, text });
    }

    if (written.length === 0) {
      onStage("synthesize", "Writing the report…");
      const ctx = pool
        .slice(0, 8)
        .map((i) => `[${numberOf.get(i)}] ${capped[i].text.slice(0, 700)}`)
        .join("\n\n");
      const ans = await promptFn(
        [{ role: "user", content: REPORT_PROMPT + "\n\nQuestion: " + query + "\n\nEvidence:\n" + ctx }],
        maxTokens || 900,
        onToken,
      );
      return { sessionId, sources: parentsFromNumbers(used), answer: ans };
    }

    onStage("assemble", "Assembling the report…");
    checkAbort(signal);
    const bodyText = written.map((w) => w.text).join("\n\n");
    const { abstract, conclusion } = await writeAbstractAndConclusion(promptFn, { query, body: bodyText });
    const rawFull = assembleReport({
      outlineTitle: outline.title,
      query,
      abstract,
      sections: written,
      conclusion,
      references: [],
    });
    const { text: finalText, references, refDocs } = renumberCitations(rawFull, {
      passageByNo,
      docOfPassage,
      referenceLine: referenceLineFromDoc,
    });
    const answer = references.length
      ? `${finalText}\n\n## References\n${references.join("\n")}`
      : finalText;
    const parents = (refDocs || []).filter(Boolean);
    return {
      sessionId,
      sources: parents.length ? parents : parentsFromNumbers(new Set(numberOf.values())),
      answer,
    };
  }

  // ---- agent: one flat evidence list, one synthesis -------------------------
  // (Research questions are used to pick the evidence, but deliberately NOT
  // shown as labelled blocks: small models then answer the sub-questions
  // instead of the task.)
  onStage("synthesize", "Writing the answer…");
  checkAbort(signal);
  const lines = [];
  const usedNos = new Set();
  const addItems = (items) => {
    for (const it of items) {
      if (!it || !it.n || usedNos.has(it.n)) continue;
      usedNos.add(it.n);
      lines.push(`[${it.n}] ${String(it.text).slice(0, 700)}`);
    }
  };
  addItems(pool.slice(0, deep ? 6 : 4).map((i) => ({ n: numberOf.get(i), text: capped[i].text })));
  for (let qi = 0; qi < topicList.length; qi++) {
    addItems(packFor(topicList[qi], topicVecs[qi], deep ? 4 : 3));
  }
  const prompt =
    AGENT_PROMPT +
    "\n\nQuestion: " +
    query +
    "\n\nEvidence:\n" +
    lines.join("\n\n") +
    "\n\nAnswer the question above from this evidence. Give specific findings (effects, directions, magnitudes) and cite them as [n].";
  const answer = await promptFn([{ role: "user", content: prompt }], maxTokens || 500, onToken);
  const parents = parentsFromNumbers(usedNos);
  return { sessionId, sources: parents.length ? parents : docs.slice(0, 8), answer };
}

// ---------------------------------------------------------------------------
// lite pipeline: the original single-pass flow (blind expansion, one global
// ranking, flat synthesis). Kept for the depth setting and A/B comparisons.
// ---------------------------------------------------------------------------
async function runLite({ sessionId, query, mode, promptFn, signal, onStage, onToken, maxTokens, keys }) {
  onStage("expand", "Breaking down your question…");
  checkAbort(signal);
  const subs = await expandQuery(promptFn, query);

  onStage("search", "Searching papers and the web…");
  checkAbort(signal);
  const docs = await searchAll(subs, keys);
  persistSources(sessionId, docs);
  if (docs.length === 0) return { sessionId, sources: [], answer: null };

  const loaded = await loadEvidence({ sessionId, query, docs, maxUrls: 18, keys, signal, onStage });
  if (!loaded) return { sessionId, sources: docs.slice(0, 8), answer: null };
  const { withText, capped, bmRanked, vecRanked } = loaded;

  onStage("rerank", "Ranking the evidence…");
  checkAbort(signal);
  const fused = rrfFuse(
    [bmRanked.map((r) => r.id), vecRanked.map((r) => r.i)],
    vecRanked.length > 0 ? [0.35, 0.65] : [1, 0],
  ).slice(0, 20);
  const top = await rerank(promptFn, query, fused.map((f) => capped[f.idx]), 5);

  const parents = [];
  const seen = new Set();
  const ranked = mode === "review" ? fused.map((f) => ({ ...capped[f.idx], score: f.score })) : top;
  for (const p of ranked) {
    const w = withText[p.docIdx];
    if (!w) continue;
    const d = w.doc;
    if (d && d.url && !seen.has(d.url)) {
      seen.add(d.url);
      parents.push(d);
    }
  }

  if (mode === "review") {
    return { sessionId, sources: parents.slice(0, 20), answer: null };
  }

  onStage("synthesize", "Writing answer…");
  checkAbort(signal);
  const ctxLines = top
    .filter((p) => withText[p.docIdx])
    .map((p) => {
      const d = withText[p.docIdx].doc;
      const n = parents.indexOf(d) + 1;
      return `[${n}] ${p.text.slice(0, 700)}`;
    });
  const prompt =
    (mode === "report" ? REPORT_PROMPT : AGENT_PROMPT) +
    "\n\nQuestion: " +
    query +
    "\n\nEvidence:\n" +
    ctxLines.join("\n\n");
  const answer = await promptFn([{ role: "user", content: prompt }], maxTokens || 500, onToken);
  return { sessionId, sources: parents, answer };
}

async function runResearch({ query, mode, promptFn, signal, onStage, onToken, maxTokens, keys, depth = "standard" }) {
  const sessionId = randomUUID();
  try {
    db.run("INSERT INTO sessions (id, query, mode) VALUES (?, ?, ?)", [sessionId, query, mode]);
  } catch {
    /* never break the pipeline on DB errors */
  }
  const args = { sessionId, query, mode, promptFn, signal, onStage, onToken, maxTokens, keys };
  if (depth === "lite") return runLite(args);
  return runV2({ ...args, depth });
}

module.exports = { runResearch, AGENT_PROMPT, REPORT_PROMPT };
