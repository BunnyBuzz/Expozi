// Research Agent — Complete Flow (Engineered according to specification)
// Steps:
//   Step 0: Classify query (Smalltalk -> direct, Ambiguous -> clarify, Memory -> resume)
//   Step 1: Think (Internal JSON research plan: core question, angles, queries, depth)
//   Step 2: Search Round 1 (Parallel: Semantic Scholar, arXiv, PubMed, OpenAlex)
//   Step 3: Evaluate & Refine (Skip if shallow; identify gaps, refined queries, Round 2)
//   Step 4: Select Sources to Read (Top N by priority: PDF -> DOI -> URL -> Abstract only)
//   Step 5: Chunk + Embed + Index (Session hybrid index: BM25 + Vector)
//   Step 6: Retrieve Passages (Top 20 via RRF 0.35/0.65 -> LLM Rerank 0-10 -> Top 5)
//   Step 7: Synthesize (Strict citation [1][2], streamed answer, word/citation stats)
//   Step 8: Display Result (Rich source cards with badges & used snippet)
//   Step 9: Follow-up (Same session index retrieval without re-search unless requested)
const { randomUUID } = require("crypto");
const { searchArxiv } = require("./sources/arxiv.cjs");
const { searchPubmed } = require("./sources/pubmed.cjs");
const { searchOpenAlex } = require("./sources/openalex.cjs");
const { searchSemanticScholar } = require("./sources/semanticScholar.cjs");
const { readMany } = require("./readers.cjs");
const { chunkText } = require("./chunk.cjs");
const { createEmbedder } = require("./embedder.cjs");
const { getOrCreateSessionIndex, getSessionIndex } = require("./sessionIndex.cjs");
const { findSimilarPastSession } = require("./sessionMemory.cjs");
const db = require("./db.cjs");

const SMALLTALK_REGEX = /^(hi|hello|hey|thanks|thank you|who are you|what can you do|help|good morning|good evening|howdy)[\s!.]*$/i;

function isSmallTalk(q) {
  const s = String(q || "").trim();
  return SMALLTALK_REGEX.test(s) || (s.length < 15 && /^(hi|hello|hey|thanks)[\s,!.]/i.test(s));
}

function isAmbiguous(q) {
  const words = String(q || "").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 5) return false;
  // If it's phrased like an interrogative question, it's not ambiguous
  if (/^(what|how|why|does|can|which|is|are)\s+/i.test(q)) return false;
  // Very short non-question noun phrases (e.g. "cancer", "sleep", "batteries")
  return words.length <= 3;
}

function normUrl(u) {
  try {
    const x = new URL(u);
    x.hash = "";
    let s = x.toString().toLowerCase();
    if (s.endsWith("/")) s = s.slice(0, -1);
    return s;
  } catch {
    return String(u || "").toLowerCase().replace(/\/$/, "");
  }
}

function checkAbort(signal) {
  if (signal && signal.aborted) {
    const e = new Error("aborted");
    e.name = "AbortError";
    throw e;
  }
}

function parseJsonSafe(raw) {
  let s = String(raw || "").trim();
  s = s.replace(/```[a-z]*/gi, "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const candidate = s.slice(start, end + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      try {
        return JSON.parse(candidate.replace(/,\s*([}\]])/g, "$1"));
      } catch {
        return null;
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Step 2 Core: Search Round across the 4 primary academic APIs in parallel
// ---------------------------------------------------------------------------
async function runParallelSearch(queries, { key = "", limitPerSource = 10, signal } = {}) {
  const t0 = Date.now();
  const list = [...new Set(queries.map((q) => String(q || "").trim()).filter(Boolean))].slice(0, 6);
  if (list.length === 0) return { docs: [], summary: "no queries", ms: 0, parts: [] };

  const perSource = Math.max(4, Math.floor(limitPerSource / Math.max(1, list.length)));
  const allJobs = [];

  for (const q of list) {
    allJobs.push({
      source: "Semantic Scholar",
      fn: () => searchSemanticScholar(q, perSource, key),
    });
    allJobs.push({
      source: "arXiv",
      fn: () => searchArxiv(q, perSource),
    });
    allJobs.push({
      source: "PubMed",
      fn: () => searchPubmed(q, perSource),
    });
    allJobs.push({
      source: "OpenAlex",
      fn: () => searchOpenAlex(q, perSource),
    });
  }

  const results = await Promise.allSettled(allJobs.map((j) => j.fn()));
  checkAbort(signal);

  const seen = new Set();
  const docs = [];
  const sourceCounts = { "Semantic Scholar": 0, arXiv: 0, PubMed: 0, OpenAlex: 0 };
  const sourceErrors = {};

  results.forEach((r, idx) => {
    const job = allJobs[idx];
    if (r.status === "fulfilled") {
      const items = Array.isArray(r.value) ? r.value : [];
      for (const item of items) {
        if (!item || !item.title) continue;
        const k = normUrl(item.url || item.doi || item.id);
        if (seen.has(k)) continue;
        seen.add(k);
        docs.push(item);
        sourceCounts[job.source] = (sourceCounts[job.source] || 0) + 1;
      }
    } else {
      const err = r.reason;
      const msg = err && err.code === "RATE_LIMITED" ? "rate limited" : String((err && err.message) || err || "error").slice(0, 30);
      sourceErrors[job.source] = msg;
    }
  });

  // Sort by citationCount descending, then year descending
  docs.sort((a, b) => {
    const cDiff = (Number(b.citationCount) || 0) - (Number(a.citationCount) || 0);
    if (cDiff !== 0) return cDiff;
    return (Number(b.year) || 0) - (Number(a.year) || 0);
  });

  const capped = docs.slice(0, 50);
  const ms = Date.now() - t0;

  // Build detail string e.g. "34 results · Semantic Scholar(12) arXiv(8) PubMed(7) OpenAlex(7) · 2841ms"
  const parts = [];
  for (const src of ["Semantic Scholar", "arXiv", "PubMed", "OpenAlex"]) {
    if (sourceCounts[src] > 0) {
      parts.push(`${src}(${sourceCounts[src]})`);
    } else if (sourceErrors[src]) {
      parts.push(`${src}: ${sourceErrors[src]}`);
    }
  }

  const summary = `${capped.length} results · ${parts.join(" · ") || "none"} · ${ms}ms`;
  return { docs: capped, summary, ms, counts: sourceCounts, errors: sourceErrors };
}

// ---------------------------------------------------------------------------
// Step 4 Core: Priority-based reading
// ---------------------------------------------------------------------------
async function readTopSources(docs, targetCount, { jinaKey = "", signal, onProgress } = {}) {
  const t0 = Date.now();
  // 1. Priority scoring:
  //    1. Has pdfUrl -> top priority
  //    2. Has DOI + year >= 2020 + citationCount >= 10 -> high
  //    3. Has URL -> standard
  //    4. Abstract only -> low
  const scored = docs.map((d) => {
    let p = 0;
    if (d.pdfUrl) p += 100;
    if (d.doi && (d.year || 0) >= 2020 && (d.citationCount || 0) >= 10) p += 50;
    if (d.url) p += 20;
    return { doc: d, p };
  });

  scored.sort((a, b) => b.p - a.p);
  const selected = scored.slice(0, targetCount).map((x) => x.doc);

  const urlsToFetch = selected.map((d) => d.pdfUrl || d.url).filter(Boolean);
  const readResults = await readMany(urlsToFetch, 3, { jinaKey, signal });

  let abstractOnlyCount = 0;
  const withText = selected.map((d) => {
    const fetchUrl = d.pdfUrl || d.url;
    const idx = urlsToFetch.indexOf(fetchUrl);
    const r = idx >= 0 ? readResults[idx] : null;
    const text = r && r.text && r.text.length > 250 ? r.text : null;

    if (!text) abstractOnlyCount++;

    return {
      doc: d,
      text: text || d.snippet || d.abstract || "",
      isAbstractOnly: !text,
      hasPdf: !!d.pdfUrl,
      source: d.source || "Academic",
    };
  }).filter((x) => x.text && x.text.length > 60);

  const ms = Date.now() - t0;
  return { withText, abstractOnlyCount, totalRead: selected.length, ms };
}

// ---------------------------------------------------------------------------
// Step 6 Core: LLM Passage Reranking (parallel batches of 5)
// ---------------------------------------------------------------------------
async function rerankPassages(promptFn, query, passages, topN = 5) {
  if (!passages || passages.length <= topN) return passages || [];

  const batches = [];
  for (let i = 0; i < passages.length; i += 5) {
    batches.push(passages.slice(i, i + 5));
  }

  const scoredPassages = [];

  for (const batch of batches) {
    const promises = batch.map(async (p) => {
      try {
        const prompt =
          `Rate relevance of this passage to the question on 0-10. Return JSON only: {"score": N}\n` +
          `Question: ${query}\n` +
          `Passage: ${p.text.slice(0, 800)}`;
        const raw = await promptFn([{ role: "user", content: prompt }], 60);
        const parsed = parseJsonSafe(raw);
        const score = parsed && typeof parsed.score === "number" ? parsed.score : 5;
        return { passage: p, score };
      } catch {
        return { passage: p, score: 5 };
      }
    });

    const settled = await Promise.all(promises);
    scoredPassages.push(...settled);
  }

  scoredPassages.sort((a, b) => b.score - a.score);
  return scoredPassages.slice(0, topN).map((x) => x.passage);
}

// ---------------------------------------------------------------------------
// Main Flow: runResearchAgent
// ---------------------------------------------------------------------------
async function runResearchAgent({
  sessionId = randomUUID(),
  query,
  promptFn,
  signal,
  onStage,
  onToken,
  onTool,
  keys = {},
  isFollowUp = false,
}) {
  let callSeq = 0;
  const emitTrace = (tool, status, detail, ms = null, count = null) => {
    if (onTool) {
      onTool({
        call: ++callSeq,
        tool,
        status,
        detail,
        ms,
        count,
      });
    }
  };

  const rawQuery = String(query || "").trim();

  // -------------------------------------------------------------------------
  // STEP 0 — RECEIVE QUERY & CLASSIFICATION
  // -------------------------------------------------------------------------
  if (isSmallTalk(rawQuery)) {
    const greeting = await promptFn(
      [
        {
          role: "system",
          content: "You are Expozi, a dedicated AI research assistant. Reply warmly and concisely, asking what academic research topic the user would like to investigate today.",
        },
        { role: "user", content: rawQuery },
      ],
      150,
      onToken,
    );
    return {
      sessionId,
      answer: String(greeting || "").trim(),
      sources: [],
      isDirect: true,
    };
  }

  if (isAmbiguous(rawQuery)) {
    const clarify = await promptFn(
      [
        {
          role: "system",
          content: "The user entered a very short, vague search term. Ask ONE concise, specific clarifying question to identify their research focus (e.g., specific mechanism, population, outcome, or design).",
        },
        { role: "user", content: `User query: "${rawQuery}"` },
      ],
      120,
      onToken,
    );
    return {
      sessionId,
      answer: String(clarify || "").trim(),
      sources: [],
      isClarification: true,
    };
  }

  // Session Memory Check (Past session similarity)
  if (!isFollowUp) {
    try {
      const pastMatch = await findSimilarPastSession(rawQuery);
      if (pastMatch && pastMatch.shouldSuggest) {
        if (onStage) {
          onStage("memory", `Found past research from ${pastMatch.timeAgo} (${Math.round(pastMatch.similarity * 100)}% match)`);
        }
      }
    } catch {
      /* non-blocking */
    }
  }

  // -------------------------------------------------------------------------
  // STEP 9 — FOLLOW-UP HANDLING (same session index)
  // -------------------------------------------------------------------------
  const sessionIdx = getOrCreateSessionIndex(sessionId);
  const wantsNewSearch = /search for more|find more papers|additional studies|look for more/i.test(rawQuery);

  if (isFollowUp && sessionIdx.hasContent() && !wantsNewSearch) {
    emitTrace("retrieve_passages", "running", "Retrieving from existing session index…");
    const tRet = Date.now();
    const embedder = await createEmbedder({ shouldStop: () => signal && signal.aborted });
    const top20 = await sessionIdx.retrievePassages(rawQuery, embedder, 20);
    const top5 = await rerankPassages(promptFn, rawQuery, top20, 5);
    const msRet = Date.now() - tRet;
    emitTrace("retrieve_passages", "ran", `from session index · ${top5.length} selected · ${msRet}ms`, msRet, top5.length);

    // Synthesize Step 7
    emitTrace("synthesize", "running", "writing…");
    const tSynth = Date.now();
    const evidenceText = top5.map((p, i) => `[${i + 1}] ${p.text}`).join("\n\n");
    const sysPrompt =
      "You are a research assistant. Answer the question using ONLY the provided sources.\n" +
      "Cite every claim with [1], [2], etc.\n" +
      "Be thorough but concise. Use markdown.\n" +
      "If sources are insufficient, say so explicitly and explain what is missing.\n" +
      "Never fabricate data or citations.";

    const answer = await promptFn(
      [
        { role: "system", content: sysPrompt },
        { role: "user", content: `Question: ${rawQuery}\n\nSources:\n${evidenceText}` },
      ],
      600,
      onToken,
    );

    const msSynth = Date.now() - tSynth;
    const wordCount = String(answer || "").split(/\s+/).filter(Boolean).length;
    emitTrace("synthesize", "ran", `${wordCount} words · ${top5.length} citations · ${(msSynth / 1000).toFixed(1)}s`, msSynth);

    const sources = top5.map((p, i) => ({
      ...(p.doc || {}),
      source: (p.doc && p.doc.source) || "Session Index",
      hasPdf: !!(p.doc && p.doc.pdfUrl),
      isAbstractOnly: false,
      usedSnippet: p.text.slice(0, 280),
      passageNo: i + 1,
    }));

    return { sessionId, answer: String(answer || ""), sources };
  }

  // -------------------------------------------------------------------------
  // STEP 1 — THINK (Internal Research Plan)
  // -------------------------------------------------------------------------
  checkAbort(signal);
  const thinkPrompt =
    `You are an expert research planner. Break down the user's research query into an angled plan.\n` +
    `Return ONLY a JSON object:\n` +
    `{\n` +
    `  "core_question": "the precise question to answer",\n` +
    `  "angles": ["angle1", "angle2", "angle3"],\n` +
    `  "queries": ["query1", "query2", "query3", "query4"],\n` +
    `  "depth": "shallow | standard | deep"\n` +
    `}\n` +
    `Depth rules:\n` +
    `- shallow: simple factual question -> 2 queries\n` +
    `- standard: default research question -> 4 queries\n` +
    `- deep: systematic review, comprehensive meta-analyses -> 5 queries\n` +
    `User query: "${rawQuery}"`;

  let plan = {
    core_question: rawQuery,
    angles: [rawQuery],
    queries: [rawQuery],
    depth: /systematic|comprehensive|all studies|meta-analysis/i.test(rawQuery) ? "deep" : "standard",
  };

  try {
    const rawPlan = await promptFn([{ role: "user", content: thinkPrompt }], 240);
    const parsed = parseJsonSafe(rawPlan);
    if (parsed && Array.isArray(parsed.queries) && parsed.queries.length > 0) {
      plan = parsed;
      if (!plan.queries.includes(rawQuery)) plan.queries.unshift(rawQuery);
    }
  } catch {
    /* fallback to default plan */
  }

  const depth = plan.depth || "standard";
  const targetReadCount = depth === "deep" ? 20 : depth === "shallow" ? 5 : 12;

  // -------------------------------------------------------------------------
  // STEP 2 — SEARCH ROUND 1
  // -------------------------------------------------------------------------
  checkAbort(signal);
  emitTrace("search_papers", "running", `Searching ${plan.queries.length} queries across Semantic Scholar, arXiv, PubMed, OpenAlex…`);
  const r1 = await runParallelSearch(plan.queries, { key: keys.semanticScholar, limitPerSource: targetReadCount, signal });
  emitTrace("search_papers", "ran", r1.summary, r1.ms, r1.docs.length);

  let mergedDocs = [...r1.docs];

  // -------------------------------------------------------------------------
  // STEP 3 — EVALUATE & REFINE (Skip if depth = shallow)
  // -------------------------------------------------------------------------
  if (depth !== "shallow" && mergedDocs.length > 0) {
    checkAbort(signal);
    const evalPrompt =
      `You are reviewing search results for: "${rawQuery}"\n` +
      `Results found:\n` +
      mergedDocs.slice(0, 8).map((d) => `- ${d.title} (${d.year || "n.d."}): ${(d.snippet || "").slice(0, 160)}`).join("\n") +
      `\n\nIdentify: (1) what angles are covered, (2) what gaps remain.\n` +
      `Return JSON only:\n` +
      `{\n  "coverage": "good | partial | poor",\n  "gaps": ["gap1", "gap2"],\n  "refined_queries": ["query1", "query2"]\n}`;

    try {
      const tEval = Date.now();
      const rawEval = await promptFn([{ role: "user", content: evalPrompt }], 200);
      const evalParsed = parseJsonSafe(rawEval);
      const msEval = Date.now() - tEval;

      if (evalParsed && (evalParsed.coverage === "partial" || evalParsed.coverage === "poor") && Array.isArray(evalParsed.refined_queries) && evalParsed.refined_queries.length > 0) {
        emitTrace("refine_questions", "ran", `${(evalParsed.gaps || []).length} gaps found · ${evalParsed.refined_queries.length} refined queries · ${msEval}ms`, msEval);

        // Search Round 2
        emitTrace("search_papers (round 2)", "running", "Searching refined queries…");
        const r2 = await runParallelSearch(evalParsed.refined_queries, { key: keys.semanticScholar, limitPerSource: 8, signal });
        const existingIds = new Set(mergedDocs.map((d) => normUrl(d.url || d.doi || d.id)));
        let added = 0;
        for (const d of r2.docs) {
          const k = normUrl(d.url || d.doi || d.id);
          if (!existingIds.has(k)) {
            existingIds.add(k);
            mergedDocs.push(d);
            added++;
          }
        }
        emitTrace("search_papers (round 2)", "ran", `${added} additional results · ${r2.ms}ms`, r2.ms, added);
      }
    } catch {
      /* best-effort refinement */
    }
  }

  if (mergedDocs.length === 0) {
    const errorMsg =
      `No academic papers were returned across the queried sources:\n` +
      `• ${r1.summary}\n\n` +
      `Please try retrying with a broader research query or different academic keywords.`;
    if (onToken) onToken(errorMsg);
    return { sessionId, answer: errorMsg, sources: [] };
  }

  // -------------------------------------------------------------------------
  // STEP 4 — SELECT SOURCES TO READ
  // -------------------------------------------------------------------------
  checkAbort(signal);
  emitTrace("read_source", "running", `Selecting top ${targetReadCount} sources to read…`);
  const readRes = await readTopSources(mergedDocs, targetReadCount, { jinaKey: keys.jina, signal });
  emitTrace(
    "read_source",
    "ran",
    `${readRes.withText.length}/${readRes.totalRead} read · ${readRes.abstractOnlyCount} abstract only · ${readRes.ms}ms`,
    readRes.ms,
    readRes.withText.length,
  );

  // -------------------------------------------------------------------------
  // STEP 5 — CHUNK + EMBED + INDEX (Session Hybrid Index)
  // -------------------------------------------------------------------------
  checkAbort(signal);
  emitTrace("index_content", "running", "Chunking and indexing sources…");
  const tIdx = Date.now();
  const chunks = [];
  readRes.withText.forEach((item, di) => {
    const cList = chunkText(item.text, { words: 512, overlap: 100, minWords: 50, maxChunks: 20 });
    cList.forEach((cText, ci) => {
      chunks.push({
        docIdx: di,
        chunkIdx: ci,
        text: cText,
        doc: item.doc,
      });
    });
  });

  const embedder = await createEmbedder({ shouldStop: () => signal && signal.aborted });
  let embeddedCount = 0;
  if (embedder.available) {
    try {
      const vecs = await embedder.embedPassages(chunks.map((c) => c.text));
      chunks.forEach((c, i) => {
        c.vec = vecs[i] || null;
        if (c.vec) embeddedCount++;
      });
    } catch {
      /* fall back to keyword index */
    }
  }

  sessionIdx.addDocsAndChunks({ docs: readRes.withText.map((x) => x.doc), chunks });

  // Persist session into SQLite
  try {
    db.run("INSERT OR REPLACE INTO sessions (id, query, mode) VALUES (?, ?, ?)", [sessionId, rawQuery, "agent"]);
    for (const d of readRes.withText.map((x) => x.doc)) {
      db.run(
        "INSERT INTO sources (session_id, title, url, authors, year, journal, citations, abstract, source_type) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(session_id, url) DO NOTHING",
        [
          sessionId,
          d.title,
          d.url,
          Array.isArray(d.authors) ? d.authors.join("; ") : String(d.authors || ""),
          d.year,
          d.journal || d.source,
          d.citationCount || 0,
          d.snippet || d.abstract || "",
          d.source || "Academic",
        ],
      );
    }
  } catch {
    /* ignore DB errors */
  }

  const msIdx = Date.now() - tIdx;
  const embedNote = embedder.available ? `${embeddedCount}/${chunks.length} embedded` : "vector search unavailable — using keyword search only";
  emitTrace("index_content", "ran", `${readRes.withText.length}/${readRes.withText.length} indexed · ${embedNote} · ${msIdx}ms`, msIdx, chunks.length);

  // -------------------------------------------------------------------------
  // STEP 6 — RETRIEVE PASSAGES (RRF 0.35/0.65 + LLM Reranking)
  // -------------------------------------------------------------------------
  checkAbort(signal);
  emitTrace("retrieve_passages", "running", "Retrieving top passages…");
  const tRet = Date.now();
  const top20 = await sessionIdx.retrievePassages(rawQuery, embedder, 20);
  const top5 = await rerankPassages(promptFn, rawQuery, top20, 5);
  const msRet = Date.now() - tRet;
  emitTrace("retrieve_passages", "ran", `top ${top20.length} · reranked · ${top5.length} selected · ${msRet}ms`, msRet, top5.length);

  // -------------------------------------------------------------------------
  // STEP 7 — SYNTHESIZE
  // -------------------------------------------------------------------------
  checkAbort(signal);
  emitTrace("synthesize", "running", "writing…");
  const tSynth = Date.now();
  const evidenceText = top5.map((p, i) => `[${i + 1}] ${p.text}`).join("\n\n");
  const sysPrompt =
    "You are a research assistant. Answer the question using ONLY the provided sources.\n" +
    "Cite every claim with [1], [2], etc.\n" +
    "Be thorough but concise. Use markdown.\n" +
    "If sources are insufficient, say so explicitly and explain what is missing.\n" +
    "Never fabricate data or citations.";

  let answer = "";
  try {
    answer = await promptFn(
      [
        { role: "system", content: sysPrompt },
        { role: "user", content: `Question: ${rawQuery}\n\nSources:\n${evidenceText}` },
      ],
      650,
      onToken,
    );
  } catch (err) {
    // If LLM fails during synthesis: Show the top 5 passages directly with their sources
    answer =
      `**Note:** The synthesis step encountered an error, but here are the key extracted evidence passages directly from the top scholarly sources:\n\n` +
      top5.map((p, i) => `### [${i + 1}] ${(p.doc && p.doc.title) || "Source"}\n${p.text}\n`).join("\n\n");
    if (onToken) onToken(answer);
  }

  const msSynth = Date.now() - tSynth;
  const wordCount = String(answer || "").split(/\s+/).filter(Boolean).length;
  const citationCount = (answer.match(/\[\d+\]/g) || []).length;
  emitTrace("synthesize", "ran", `${wordCount} words · ${citationCount} citations · ${(msSynth / 1000).toFixed(1)}s`, msSynth);

  // Update session answer in DB
  try {
    db.run("UPDATE sessions SET answer=? WHERE id=?", [answer, sessionId]);
  } catch {
    /* ignore */
  }

  // -------------------------------------------------------------------------
  // STEP 8 — DISPLAY RESULT & SOURCE CARDS
  // -------------------------------------------------------------------------
  const sources = top5.map((p, i) => ({
    ...(p.doc || {}),
    source: (p.doc && p.doc.source) || "Scholarly",
    hasPdf: !!(p.doc && p.doc.pdfUrl),
    isAbstractOnly: !p.doc || !p.doc.pdfUrl,
    usedSnippet: p.text.slice(0, 300),
    passageNo: i + 1,
  }));

  return {
    sessionId,
    answer: String(answer || ""),
    sources,
  };
}

module.exports = {
  runResearchAgent,
  runParallelSearch,
  readTopSources,
  rerankPassages,
  isSmallTalk,
  isAmbiguous,
};
