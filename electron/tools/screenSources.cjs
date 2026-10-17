// Screening tool (review mode) — deterministic, explainable inclusion
// suggestions. Applies a fixed rubric (study design + quality + question
// overlap) and persists the suggestion per session so a reopened review still
// shows the reasoning. Suggestions never write a user decision — the user
// decides, the tool only proposes.
//
// Rubric:
//   retracted                        -> exclude
//   strong design (umbrella, meta,   -> include when quality >= 45, else maybe
//     systematic review, guideline,
//     RCT, trial, cohort)
//   review                           -> include when quality >= 60, else maybe
//   preprint                         -> maybe (not peer-reviewed)
//   case report / editorial comment  -> exclude
//   web / unclassified               -> maybe
//   no content-word overlap with the question demotes "include" to "maybe"
const db = require("../rag/db.cjs");
const { define, throwIfAborted } = require("./registry.cjs");

const STRONG = new Set(["umbrella", "meta-analysis", "systematic-review", "guideline", "rct", "trial", "cohort"]);
const WEAK = new Set(["case-report", "comment"]);

const TYPE_LABEL = {
  umbrella: "Umbrella review",
  "meta-analysis": "Meta-analysis",
  "systematic-review": "Systematic review",
  guideline: "Guideline",
  rct: "RCT",
  trial: "Trial",
  cohort: "Cohort study",
  review: "Review",
  preprint: "Preprint",
  "case-report": "Case report",
  comment: "Comment",
  web: "Web page",
  other: "Unclassified",
  demoted: "Unclassified",
};

const STOP = new Set([
  "does", "do", "the", "what", "how", "are", "and", "for", "with", "from",
  "that", "this", "than", "into", "over", "when", "have", "has", "was",
  "were", "will", "would", "could", "should", "about", "between", "their",
  "there", "which", "what", "effect", "effects", "impact", "affect",
]);

function contentWords(text) {
  return [...new Set(String(text || "").toLowerCase().match(/[a-z]{4,}/g) || [])].filter((w) => !STOP.has(w));
}

function rubric(doc, queryWords) {
  if (doc.retracted) return { decision: "exclude", reason: "retracted" };

  const type = String(doc.studyType || "");
  const quality = Number(doc.quality) || 0;
  let decision;
  if (STRONG.has(type)) decision = quality >= 45 ? "include" : "maybe";
  else if (type === "review") decision = quality >= 60 ? "include" : "maybe";
  else if (type === "preprint") decision = "maybe";
  else if (WEAK.has(type)) decision = "exclude";
  else decision = "maybe";

  const bits = [
    TYPE_LABEL[type] || (doc.provenance === "web" ? "Web page" : "Unclassified"),
    doc.year ? String(doc.year) : null,
    doc.citations > 0 ? `cited by ${doc.citations}` : null,
    quality > 0 ? `quality ${quality}` : null,
  ].filter(Boolean);

  if (queryWords.length >= 2) {
    const text = String(doc.title || "") + " " + String(doc.abstract || "");
    const overlap = queryWords.some((w) => text.toLowerCase().includes(w));
    if (!overlap) {
      if (decision === "include") decision = "maybe";
      bits.push("little overlap with the question");
    }
  }

  return { decision, reason: bits.join(" · ") };
}

define({
  name: "screen_sources",
  description:
    "Apply a fixed screening rubric (study design, quality, question overlap) to propose include / maybe / exclude per source. Proposals only — decisions stay with the user.",
  input: {
    sessionId: "string",
    query: "string",
    sources: "[{ url, title, year, citations, studyType, quality, retracted, provenance, abstract }]",
  },
  async run(input, ctx) {
    throwIfAborted(ctx.signal);
    const docs = input.sources || [];
    if (docs.length === 0) return { data: docs, skipped: "no sources to screen" };

    const queryWords = contentWords(input.query);
    const counts = { include: 0, maybe: 0, exclude: 0 };
    const rows = [];
    for (const d of docs) {
      const { decision, reason } = rubric(d, queryWords);
      d.suggested = decision;
      d.suggestReason = reason;
      counts[decision]++;
      if (d.url) rows.push([input.sessionId || null, d.url, decision, reason]);
    }

    // Persist suggestions (never the user's decision/note columns).
    try {
      db.runMany(
        "INSERT INTO screening (session_id, url, suggested, reason) VALUES (?,?,?,?) " +
          "ON CONFLICT(session_id, url) DO UPDATE SET suggested=excluded.suggested, reason=excluded.reason",
        rows,
      );
    } catch {
      /* never break the pipeline on DB errors — the trace still shows the rubric */
    }

    return {
      data: docs,
      count: docs.length,
      detail: `${docs.length} sources → include ${counts.include} · maybe ${counts.maybe} · exclude ${counts.exclude}`,
    };
  },
});
