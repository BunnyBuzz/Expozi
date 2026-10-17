// Ranking / filtering tools — turn the ranked chunk pool into the evidence set
// the writers see.
const { selectEvidence, rubricScore } = require("../rag/filter.cjs");
const { rrfFuse } = require("../rag/rrf.cjs");
const { rerank } = require("../rag/rerank.cjs");
const { define, isAbortError } = require("./registry.cjs");

define({
  name: "select_evidence",
  description:
    "Select the evidence pool: fuse vector + BM25 ranks, threshold similarity, and cap passages per source and by character budget.",
  input: {
    capped: "[{ text, docIdx, vec }] — indexed chunks",
    bmRanked: "[{ id, score }]",
    vecRanked: "[{ i, score }]",
    maxPerDoc: "number",
    budgetChars: "number",
  },
  async run(input) {
    let pool = selectEvidence(input.capped || [], {
      vecRanked: input.vecRanked || [],
      bmRanked: input.bmRanked || [],
      maxPerDoc: input.maxPerDoc == null ? 3 : input.maxPerDoc,
      budgetChars: input.budgetChars == null ? 12000 : input.budgetChars,
    });
    if (pool.length === 0) pool = (input.capped || []).map((_, i) => i).slice(0, 12);
    return { data: pool, count: pool.length, detail: `${pool.length} passages selected` };
  },
});

define({
  name: "rubric_filter",
  description:
    "Deep-mode rubric scoring (0-3 usefulness for the question) that trims the evidence pool; keeps everything when scoring fails.",
  input: { query: "string", pool: "number[] — chunk indices", capped: "[{ text }]" },
  async run(input, ctx) {
    const pool = input.pool || [];
    try {
      const scores = await rubricScore(
        ctx.promptFn,
        input.query,
        pool.map((i) => input.capped[i]),
      );
      if (scores.length === pool.length) {
        const kept = pool.filter((_, k) => scores[k] >= 1);
        if (kept.length >= 4) {
          return {
            data: kept,
            count: kept.length,
            detail: `rubric kept ${kept.length}/${pool.length}`,
          };
        }
      }
      return { data: pool, count: pool.length, detail: `rubric kept all ${pool.length}` };
    } catch (e) {
      if (isAbortError(e)) throw e;
      return { data: pool, count: pool.length, detail: `rubric unavailable — kept ${pool.length}` };
    }
  },
});

define({
  name: "rank_evidence",
  description:
    "Rank the evidence: fuse BM25 + vector ranks (RRF) and rerank with the model, returning the top passages (lite flow).",
  input: {
    query: "string",
    capped: "[{ text, docIdx }]",
    bmRanked: "[{ id, score }]",
    vecRanked: "[{ i, score }]",
    topN: "number — passages to keep (default 5)",
  },
  async run(input, ctx) {
    const capped = input.capped || [];
    const bmRanked = input.bmRanked || [];
    const vecRanked = input.vecRanked || [];
    const fused = rrfFuse(
      [bmRanked.map((r) => r.id), vecRanked.map((r) => r.i)],
      vecRanked.length > 0 ? [0.35, 0.65] : [1, 0],
    ).slice(0, 20);
    const topN = input.topN == null ? 5 : input.topN;
    const top = await rerank(
      ctx.promptFn,
      input.query,
      fused.map((f) => capped[f.idx]),
      topN,
    );
    return {
      data: { fused, top },
      count: top.length,
      detail: `${capped.length} passages → top ${top.length} reranked`,
    };
  },
});
