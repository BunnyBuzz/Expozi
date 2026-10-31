// Smart context filtering — adapted from GPT-Researcher:
// - ContextCompressor (`context/compression.py`): similarity threshold,
//   per-page cap and a small-context fast path.
// - JEV rubric (`context/jev_filter.py`): 0-3 usefulness scoring, used only
//   when the caller opts in (deep mode), since it costs an LLM call.

const { rrfFuse } = require("./rrf.cjs");

const SIMILARITY_FLOOR = 0.12;
const RUBRIC = [
  "0 = unrelated to the question",
  "1 = same topic but does not help answer the question",
  "2 = partially answers the question or gives useful supporting facts",
  "3 = directly answers the question with specific facts",
];

// chunks: [{docIdx, text, vec}]
// vecRanked: [{i, score}] cosine-ranked (may be empty)
// bmRanked:  [{id, score}] BM25-ranked (may be empty)
// Returns ordered unique chunk indices forming the evidence pool using Reciprocal Rank Fusion.
function selectEvidence(
  chunks,
  { vecRanked = [], bmRanked = [], maxPerDoc = 3, budgetChars = 14000, threshold = SIMILARITY_FLOOR } = {},
) {
  const simOf = new Map(vecRanked.map((r) => [r.i, r.score]));
  let order = [];
  if (vecRanked.length > 0 && bmRanked.length > 0) {
    const fused = rrfFuse(
      [bmRanked.map((r) => r.id), vecRanked.map((r) => r.i)],
      [0.45, 0.55],
    );
    order = fused.map((f) => f.idx);
  } else if (vecRanked.length > 0) {
    order = vecRanked.map((r) => r.i);
  } else {
    order = bmRanked.map((r) => r.id);
  }

  const perDoc = new Map();
  const out = [];
  let used = 0;
  for (const i of order) {
    const c = chunks[i];
    if (!c) continue;
    const sim = simOf.get(i);
    if (sim !== undefined && sim < threshold) continue;
    const n = perDoc.get(c.docIdx) || 0;
    if (n >= maxPerDoc) continue;
    const len = c.text.length;
    if (out.length >= 6 && used + len > budgetChars) break;
    perDoc.set(c.docIdx, n + 1);
    out.push(i);
    used += len;
  }
  return out;
}

// JEV-style usefulness scoring: 0-3 per passage, best first when used for
// sorting. Returns [] when parsing fails (caller keeps its current ranking).
async function rubricScore(promptFn, question, passages) {
  const list = (passages || []).slice(0, 10);
  if (list.length === 0) return [];
  const text = list.map((p, i) => `[${i}] ${String(p.text || "").slice(0, 500)}`).join("\n\n");
  try {
    const raw = await promptFn(
      [
        {
          role: "user",
          content:
            `Score each passage 0-3 for usefulness in answering: "${question}"\n` +
            RUBRIC.join("\n") +
            "\n\n" +
            text +
            `\n\nReturn ONLY JSON like {"scores":[2,0,3]} with exactly ${list.length} numbers.`,
        },
      ],
      300,
    );
    const m = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(m ? m[0] : raw);
    if (Array.isArray(parsed.scores)) return parsed.scores.map((s) => Number(s) || 0);
  } catch {
    /* fall through */
  }
  return [];
}

module.exports = { selectEvidence, rubricScore, SIMILARITY_FLOOR };
