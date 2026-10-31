const { randomUUID } = require("crypto");
const { interleaveByProvenance } = require("./sources/index.cjs");
const { orderByQuality } = require("./quality.cjs");
const { buildIndex, searchIndex } = require("./bm25.cjs");
const { searchVector } = require("./vector.cjs");
const { rrfFuse } = require("./rrf.cjs");
const { cardsFromDocs, DEFAULT_PERSPECTIVE } = require("./plan.cjs");
const db = require("./db.cjs");
const tools = require("../tools/index.cjs");
const { AGENT_PROMPT, REPORT_PROMPT } = require("../tools/writeAnswer.cjs");

function checkAbort(signal) {
  if (signal && signal.aborted) {
    const e = new Error("aborted");
    e.name = "AbortError";
    throw e;
  }
}

// Execution context handed to every tool call: the environment (model, keys,
// abort signal, progress + trace sinks) plus the run's session id.
function makeCtx({ sessionId, promptFn, keys, signal, onStage, onToken, onTool }) {
  return { sessionId, promptFn, keys, signal, onStage, onToken, emit: onTool };
}

function persistSources(sessionId, docs) {
  try {
    for (const d of docs) {
      // Upsert so a re-persist (deep runs add more docs after the first pass)
      // refreshes the enrichment fields instead of being ignored.
      db.run(
        "INSERT INTO sources (session_id, title, url, authors, year, journal, doi, citations, source_type, abstract, study_type, quality, retracted) " +
          "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) " +
          "ON CONFLICT(session_id, url) DO UPDATE SET citations=excluded.citations, year=excluded.year, doi=excluded.doi, study_type=excluded.study_type, quality=excluded.quality, retracted=excluded.retracted",
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
          d.studyType || null,
          typeof d.quality === "number" ? d.quality : null,
          d.retracted ? 1 : 0,
        ],
      );
    }
  } catch {
    /* never break the pipeline on DB errors */
  }
}

// Read pages + index them into a ranked evidence base. Shared by all depths.
async function loadEvidence({ sessionId, query, docs, maxUrls, ctx }) {
  const { signal, onStage } = ctx;
  onStage("fetch", `Reading ${Math.min(docs.length, maxUrls)} sources…`);
  checkAbort(signal);
  const fetchDocs = interleaveByProvenance(docs).slice(0, maxUrls);

  const read = await tools.run("read_pages", { docs: fetchDocs }, ctx);
  const withText = read.data;
  if (withText.length === 0) return null;

  const indexed = await tools.run("index_sources", { sessionId, query, withText }, ctx);
  const { capped, bmRanked, vecRanked, embedder } = indexed.data;
  return { withText, capped, bmRanked, vecRanked, embedder };
}

// ---------------------------------------------------------------------------
// v2 pipeline: grounded planning (GPT-Researcher) + perspective-guided
// questions (STORM) + smart context filtering + outline-first report writing.
// Every capability is invoked through the tools registry (electron/tools/),
// so each step is traced for the Tool panel and the dev logs.
// ---------------------------------------------------------------------------
async function runV2({ sessionId, query, mode, promptFn, signal, onStage, onToken, maxTokens, keys, depth, onTool }) {
  const deep = depth === "deep";
  const ctx = makeCtx({ sessionId, promptFn, keys, signal, onStage, onToken, onTool });

  onStage("scan", "Scanning the topic…");
  checkAbort(signal);
  let grounding = [];
  try {
    const scan = await tools.run("scan_topic", { query, perSource: 5 }, ctx);
    grounding = interleaveByProvenance(scan.data);
  } catch {
    grounding = [];
  }
  const cards = cardsFromDocs(grounding, { chars: 200, limit: 6 });

  onStage("plan", "Planning the searches…");
  checkAbort(signal);
  const planned = (await tools.run("plan_queries", { query, cards, max: deep ? 6 : 4 }, ctx)).data;

  let perspectives = [];
  let questions = [];
  if (mode !== "review") {
    onStage("perspectives", "Gathering perspectives…");
    checkAbort(signal);
    perspectives = (await tools.run("gather_perspectives", { query, max: deep ? 3 : 2 }, ctx)).data;
    if (perspectives.length === 0) perspectives = [DEFAULT_PERSPECTIVE];
    onStage("questions", "Asking research questions…");
    checkAbort(signal);
    questions = (
      await tools.run(
        "generate_questions",
        { query, perspectives, asked: [], cards, perPerspective: deep ? 2 : 1 },
        ctx,
      )
    ).data;
  }

  // The raw question is always searched too: it is the most reliable query
  // (blindly trusting small-model sub-queries can drift off-topic).
  const searchList = [query, ...planned, ...questions];
  onStage("search", `Searching ${searchList.length} queries…`);
  checkAbort(signal);
  const searchRes = await tools.run(
    "search_papers",
    { queries: searchList, cap: deep ? 70 : 50, maxQueries: deep ? 12 : 8, perSource: 8 },
    ctx,
  );
  // Citation counts, years, study types and the quality score that drives
  // ordering (newest → best) and evidence numbering.
  const docs = searchRes.data.length
    ? (await tools.run("enrich_sources", { docs: searchRes.data }, ctx)).data
    : searchRes.data;
  persistSources(sessionId, docs);
  if (docs.length === 0) return { sessionId, sources: [], answer: null };

  if (deep && mode !== "review") {
    checkAbort(signal);
    onStage("questions", "Refining the questions…");
    try {
      const more = (
        await tools.run(
          "generate_questions",
          {
            query,
            perspectives,
            asked: questions,
            cards: cardsFromDocs(docs, { chars: 120, limit: 8 }),
            perPerspective: 1,
          },
          ctx,
        )
      ).data;
      if (more.length > 0) {
        questions.push(...more);
        onStage("search", `Searching ${more.length} follow-up queries…`);
        const extra = (await tools.run("search_papers", { queries: more, cap: 30, perSource: 8 }, ctx)).data;
        const extraEnriched = extra.length
          ? (await tools.run("enrich_sources", { docs: extra }, ctx)).data
          : extra;
        const seen = new Set(docs.map((d) => d.id));
        for (const d of extraEnriched) {
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

  const loaded = await loadEvidence({ sessionId, query, docs, maxUrls: deep ? 24 : 18, ctx });
  if (!loaded) return { sessionId, sources: orderByQuality(docs).slice(0, 8), answer: null };
  const { withText, capped, bmRanked, vecRanked, embedder } = loaded;

  onStage("filter", "Selecting the evidence…");
  checkAbort(signal);
  let pool = (
    await tools.run(
      "select_evidence",
      {
        capped,
        vecRanked,
        bmRanked,
        maxPerDoc: deep ? 4 : 3,
        budgetChars: deep ? 16000 : 12000,
      },
      ctx,
    )
  ).data;

  if (deep && mode === "report") {
    try {
      pool = (await tools.run("rubric_filter", { query, pool, capped }, ctx)).data;
    } catch (e) {
      if (e && e.name === "AbortError") throw e;
      /* keep the current pool */
    }
  }

  // Evidence numbering follows source quality: [1] is the strongest source
  // (study type + recency + citations), so the report cites its best evidence
  // first instead of whichever passage BM25 happened to rank first.
  const qualityOfPassage = (i) => {
    const p = capped[i];
    const d = p && withText[p.docIdx] ? withText[p.docIdx].doc : null;
    return (d && Number(d.quality)) || 0;
  };
  pool = [...pool].sort((a, b) => qualityOfPassage(b) - qualityOfPassage(a) || a - b);

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
    const sorted = orderByQuality(parents).slice(0, 20);
    try {
      await tools.run("screen_sources", { sessionId, query, sources: sorted }, ctx);
    } catch {
      /* proposals are best-effort — the trace already shows the failure */
    }
    return { sessionId, sources: sorted, answer: null };
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
    const { outline, sections } = (
      await tools.run(
        "build_outline",
        { query, cards: cardsFromDocs(docs, { chars: 100, limit: 8 }), maxSections },
        ctx,
      )
    ).data;
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
      const text = (
        await tools.run(
          "write_section",
          { query, section, evidence: items, maxTokens: 420, progress: `${si + 1}/${sections.length}` },
          ctx,
        )
      ).data;
      written.push({ title: section.title, text });
    }

    if (written.length === 0) {
      onStage("synthesize", "Writing the report…");
      const ctxText = pool
        .slice(0, 8)
        .map((i) => `[${numberOf.get(i)}] ${capped[i].text.slice(0, 700)}`)
        .join("\n\n");
      const ans = (
        await tools.run(
          "write_answer",
          { query, evidence: ctxText, style: "report", tail: false, maxTokens: maxTokens || 900 },
          ctx,
        )
      ).data;
      return { sessionId, sources: parentsFromNumbers(used), answer: ans };
    }

    onStage("assemble", "Assembling the report…");
    checkAbort(signal);
    const { answer, refDocs } = (
      await tools.run(
        "assemble_report",
        { outlineTitle: outline.title, query, sections: written, passageByNo, docOfPassage },
        ctx,
      )
    ).data;
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
  const answer = (
    await tools.run(
      "write_answer",
      { query, evidence: lines.join("\n\n"), style: "agent", maxTokens: maxTokens || 500 },
      ctx,
    )
  ).data;
  const parents = parentsFromNumbers(usedNos);
  return { sessionId, sources: parents.length ? parents : orderByQuality(docs).slice(0, 8), answer };
}

// ---------------------------------------------------------------------------
// lite pipeline: the original single-pass flow (blind expansion, one global
// ranking, flat synthesis). Kept for the depth setting and A/B comparisons.
// ---------------------------------------------------------------------------
async function runLite({ sessionId, query, mode, promptFn, signal, onStage, onToken, maxTokens, keys, onTool }) {
  const ctx = makeCtx({ sessionId, promptFn, keys, signal, onStage, onToken, onTool });

  onStage("expand", "Breaking down your question…");
  checkAbort(signal);
  const subs = (await tools.run("expand_query", { query }, ctx)).data;

  onStage("search", "Searching papers…");
  checkAbort(signal);
  // expandQuery returns [rawQuestion, ...expandedSubQueries]; searching only
  // the raw question wasted the expansion and left question-phrased searches
  // with web-only results, so lite searches the raw question plus the first
  // two expanded sub-queries.
  const docs = (
    await tools.run(
      "search_papers",
      {
        queries: subs.slice(0, 3),
        cap: 40,
        maxQueries: 3,
        perSource: { scholar: 15, arxiv: 10, pubmed: 10 },
      },
      ctx,
    )
  ).data;
  const enriched = docs.length
    ? (await tools.run("enrich_sources", { docs }, ctx)).data
    : docs;
  persistSources(sessionId, enriched);
  if (enriched.length === 0) return { sessionId, sources: [], answer: null };

  const loaded = await loadEvidence({ sessionId, query, docs: enriched, maxUrls: 18, ctx });
  if (!loaded) return { sessionId, sources: orderByQuality(enriched).slice(0, 8), answer: null };
  const { withText, capped } = loaded;

  onStage("rerank", "Ranking the evidence…");
  checkAbort(signal);
  const ranked = await tools.run(
    "rank_evidence",
    { query, capped, bmRanked: loaded.bmRanked, vecRanked: loaded.vecRanked, topN: 5 },
    ctx,
  );
  const { fused, top } = ranked.data;

  const parents = [];
  const seen = new Set();
  const rankedPassages = mode === "review" ? fused.map((f) => ({ ...capped[f.idx], score: f.score })) : top;
  for (const p of rankedPassages) {
    const w = withText[p.docIdx];
    if (!w) continue;
    const d = w.doc;
    if (d && d.url && !seen.has(d.url)) {
      seen.add(d.url);
      parents.push(d);
    }
  }

  if (mode === "review") {
    const sorted = orderByQuality(parents).slice(0, 20);
    try {
      await tools.run("screen_sources", { sessionId, query, sources: sorted }, ctx);
    } catch {
      /* proposals are best-effort — the trace already shows the failure */
    }
    return { sessionId, sources: sorted, answer: null };
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
  const answer = (
    await tools.run(
      "write_answer",
      {
        query,
        evidence: ctxLines.join("\n\n"),
        style: mode === "report" ? "report" : "agent",
        tail: false,
        maxTokens: maxTokens || 500,
      },
      ctx,
    )
  ).data;
  return { sessionId, sources: orderByQuality(parents), answer };
}

async function runResearch({
  query,
  mode,
  promptFn,
  signal,
  onStage,
  onToken,
  maxTokens,
  keys,
  depth = "standard",
  onTool,
}) {
  const sessionId = randomUUID();
  try {
    db.run("INSERT INTO sessions (id, query, mode) VALUES (?, ?, ?)", [sessionId, query, mode]);
  } catch {
    /* never break the pipeline on DB errors */
  }
  const args = { sessionId, query, mode, promptFn, signal, onStage, onToken, maxTokens, keys, onTool };
  if (depth === "lite") return runLite(args);
  return runV2({ ...args, depth });
}

module.exports = { runResearch, runV2, AGENT_PROMPT, REPORT_PROMPT };
