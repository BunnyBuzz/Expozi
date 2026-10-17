// Source quality — deterministic, explainable scoring used for ordering
// sources "newest → best" (Elicit-style) and for evidence numbering.
//
// score (0-100) = study type (0-40) + recency (0-30) + citations (0-30)
//   - study type: umbrella / meta-analysis > systematic review > guideline /
//     RCT > trial > cohort > review > preprint > web. Editorial comments and
//     case reports score low; content-farm hosts and retracted works bottom out.
//   - recency: 2025-2026 > 2024 > 2023 > 2022 > 2021 > older; unknown year
//     sits in the middle (no boost, no penalty).
//   - citations: log scale — 0 cites = 0, ~100 = 16, ~1000 = 24, 5000+ = 30.
//
// Canonical study types (doc.studyType): umbrella, meta-analysis,
// systematic-review, guideline, rct, trial, cohort, review, preprint, web,
// case-report, comment, other.

const TYPE_SCORES = {
  umbrella: 40,
  "meta-analysis": 40,
  "systematic-review": 34,
  guideline: 30,
  rct: 30,
  trial: 26,
  cohort: 22,
  review: 16,
  other: 12,
  preprint: 10,
  "case-report": 8,
  web: 8,
  comment: 6,
  demoted: 2,
};

// Higher priority wins when a document has several candidate types.
const TYPE_PRIORITY = [
  "umbrella",
  "meta-analysis",
  "systematic-review",
  "guideline",
  "rct",
  "trial",
  "cohort",
  "review",
  "other",
  "preprint",
  "case-report",
  "comment",
];

const PUBMED_TYPE_RULES = [
  ["meta-analysis", /^meta-analysis$/i],
  ["systematic-review", /systematic review/i],
  ["guideline", /practice guideline|^guideline$/i],
  ["rct", /randomized controlled trial/i],
  ["trial", /clinical trial|controlled clinical trial/i],
  ["cohort", /observational study|^cohort/i],
  ["review", /^review$/i],
  ["case-report", /case reports/i],
  ["comment", /editorial|comment|letter/i],
  ["other", /journal article|comparative study|multicenter study|evaluation study|validation study|twin study|research support/i],
];

// Content-farm / SEO look-alike domains seen in web results. Demoted (not
// dropped): they stay visible but rank below every scholarly and reputable
// web source.
const DEMOTE_HOSTS = [/(^|\.)youboost\./i, /(^|\.)orivivo\./i];

function isDemotedHost(host) {
  return DEMOTE_HOSTS.some((re) => re.test(String(host || "")));
}

function typeFromPubmedTypes(types) {
  const list = [].concat(types || []).map((t) => String(t || "").trim()).filter(Boolean);
  for (const canonical of TYPE_PRIORITY) {
    const rule = PUBMED_TYPE_RULES.find(([c]) => c === canonical);
    if (rule && list.some((t) => rule[1].test(t))) return canonical;
  }
  return null;
}

function typeFromTitle(title) {
  const t = String(title || "");
  if (/umbrella\s+(review|analysis)/i.test(t)) return "umbrella";
  if (/meta[-\s]?analys/i.test(t)) return "meta-analysis";
  if (/systematic\s+review/i.test(t)) return "systematic-review";
  if (/randomi[sz]ed\s+controlled|\brct\b/i.test(t)) return "rct";
  if (/practice\s+guideline/i.test(t)) return "guideline";
  return null;
}

// OpenAlex work types are coarse ("article", "review", "preprint", ...) — only
// use them to upgrade weak/unknown types, never to downgrade a known one.
function typeFromOpenAlex(type) {
  const t = String(type || "").toLowerCase();
  if (t === "review") return "review";
  if (t === "preprint" || t === "posted-content") return "preprint";
  return null;
}

// Best-effort canonical type for a source document.
function resolveType(doc) {
  const existing = String((doc && doc.studyType) || "");
  if (existing && TYPE_SCORES[existing] != null) return existing;
  if (doc && doc.provenance === "web") return typeFromTitle(doc.title) || "web";
  if (doc && doc.provenance === "arxiv") return typeFromTitle(doc.title) || "preprint";
  return typeFromTitle(doc && doc.title) || "other";
}

function recencyScore(year) {
  const y = Number(year) || 0;
  if (y >= 2025) return 30;
  if (y === 2024) return 26;
  if (y === 2023) return 20;
  if (y === 2022) return 14;
  if (y === 2021) return 8;
  if (y > 0) return 3;
  return 10; // unknown year: no boost, no penalty
}

function citationScore(citations) {
  const c = Math.max(0, Number(citations) || 0);
  if (c <= 0) return 0;
  return Math.round(Math.min(30, 8 * Math.log10(1 + c)) * 10) / 10;
}

// Annotates a document in place: canonical studyType + numeric quality.
function applyQuality(doc) {
  const studyType = resolveType(doc);
  const demoted = doc.provenance === "web" && isDemotedHost(doc.journal);
  const retracted = !!doc.retracted;
  const typeScore = retracted ? 0 : demoted ? TYPE_SCORES.demoted : TYPE_SCORES[studyType] || TYPE_SCORES.other;
  const recency = retracted ? 0 : recencyScore(doc.year);
  const citations = retracted ? 0 : citationScore(doc.citations);
  doc.studyType = studyType;
  doc.quality = Math.round((typeScore + recency + citations) * 10) / 10;
  return doc;
}

function qualityOf(doc) {
  if (doc && typeof doc.quality === "number") return doc.quality;
  return applyQuality({ ...(doc || {}) }).quality;
}

// Quality-first ordering; ties break by newer year, then more citations, then
// the original order (stable).
function orderByQuality(docs) {
  return [...(docs || [])]
    .map((d, i) => ({ d, i, q: qualityOf(d) }))
    .sort(
      (a, b) =>
        b.q - a.q ||
        (Number(b.d && b.d.year) || 0) - (Number(a.d && a.d.year) || 0) ||
        (Number(b.d && b.d.citations) || 0) - (Number(a.d && a.d.citations) || 0) ||
        a.i - b.i,
    )
    .map((x) => x.d);
}

module.exports = {
  TYPE_SCORES,
  DEMOTE_HOSTS,
  isDemotedHost,
  typeFromPubmedTypes,
  typeFromTitle,
  typeFromOpenAlex,
  resolveType,
  recencyScore,
  citationScore,
  applyQuality,
  qualityOf,
  orderByQuality,
};
