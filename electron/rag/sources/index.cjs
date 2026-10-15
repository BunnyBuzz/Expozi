const { searchSemanticScholar } = require("./semanticScholar.cjs");
const { searchArxiv } = require("./arxiv.cjs");
const { searchPubmed } = require("./pubmed.cjs");
const { searchWeb } = require("./searxng.cjs");

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

async function searchAll(subQueries, keys, cap = 40) {
  const q0 = subQueries[0] || "";
  const jobs = [
    searchSemanticScholar(q0, 15, keys && keys.s2),
    searchArxiv(q0, 10),
    searchPubmed(q0, 10),
    searchWeb(q0, 8),
    ...subQueries.slice(1, 3).map((q) => searchWeb(q, 5)),
  ];
  const settled = await Promise.allSettled(jobs);
  const seen = new Set();
  const docs = [];
  for (const s of settled) {
    if (s.status !== "fulfilled") continue;
    for (const d of s.value || []) {
      if (!d.url || !d.title) continue;
      const k = normUrl(d.url);
      if (seen.has(k)) continue;
      seen.add(k);
      docs.push({ ...d, id: k });
      if (docs.length >= cap) break;
    }
    if (docs.length >= cap) break;
  }
  return docs;
}

// One query -> every source (papers first, then the web). Used by the
// grounded planning pipeline so every sub-question reaches the academic
// APIs, not only SearXNG.
async function searchQuery(query, keys, { perSource = 8, web = 5 } = {}) {
  const jobs = [
    searchSemanticScholar(query, perSource, keys && keys.s2),
    searchArxiv(query, perSource),
    searchPubmed(query, perSource),
    searchWeb(query, web),
  ];
  const settled = await Promise.allSettled(jobs);
  const seen = new Set();
  const docs = [];
  for (const s of settled) {
    if (s.status !== "fulfilled") continue;
    for (const d of s.value || []) {
      if (!d.url || !d.title) continue;
      const k = normUrl(d.url);
      if (seen.has(k)) continue;
      seen.add(k);
      docs.push({ ...d, id: k });
    }
  }
  return docs;
}

// Fan-out search over several queries (limited concurrency to stay on the
// good side of the free academic APIs).
async function searchMany(queries, keys, cap = 60, opts = {}) {
  const list = [...new Set((queries || []).map((q) => String(q || "").trim()).filter(Boolean))].slice(0, opts.maxQueries || 8);
  if (list.length === 0) return [];
  const seen = new Set();
  const docs = [];
  for (let i = 0; i < list.length; i += 3) {
    const batch = list.slice(i, i + 3);
    const settled = await Promise.allSettled(batch.map((q) => searchQuery(q, keys, opts)));
    for (const s of settled) {
      if (s.status !== "fulfilled") continue;
      for (const d of s.value) {
        if (seen.has(d.id)) continue;
        seen.add(d.id);
        docs.push(d);
        if (docs.length >= cap) return docs;
      }
    }
  }
  return docs;
}

// Fair mixing across sources: without this, whichever API returns first
// (usually arXiv) consumes every fetch slot and the other sources never
// reach the reading stage.
function interleaveByProvenance(docs, order = ["scholar", "pubmed", "arxiv", "web"]) {
  const buckets = new Map(order.map((k) => [k, []]));
  const other = [];
  for (const d of docs) {
    const b = buckets.get(d.provenance);
    (b || other).push(d);
  }
  const out = [];
  let more = true;
  while (more) {
    more = false;
    for (const k of order) {
      const b = buckets.get(k);
      if (b.length) {
        out.push(b.shift());
        more = true;
      }
    }
  }
  return [...out, ...other];
}

module.exports = { searchAll, searchQuery, searchMany, interleaveByProvenance, normUrl };
