const { searchArxiv } = require("./arxiv.cjs");
const { searchPubmed } = require("./pubmed.cjs");
const { searchWebDetailed } = require("./webSearch.cjs");

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

// One query -> every source, with a per-source status breakdown.
// PubMed + arXiv always; the web (DuckDuckGo, browser-backed) is a marked
// supplement capped below the scholarly sources. Its tier outcomes
// (duckduckgo / builtin-browser / searxng) are reported individually —
// a failed tier is never a silent zero.
async function searchQueryDetailed(query, perSource = 8, opts = {}) {
  const n =
    typeof perSource === "number"
      ? { arxiv: perSource, pubmed: perSource, web: Math.min(6, perSource) }
      : perSource || {};
  const webLimit =
    opts.web === 0 ? 0 : typeof opts.web === "number" ? opts.web : n.web == null ? 6 : n.web;

  const jobs = [
    { name: "arxiv", fn: () => searchArxiv(query, n.arxiv == null ? 8 : n.arxiv) },
    { name: "pubmed", fn: () => searchPubmed(query, n.pubmed == null ? 8 : n.pubmed) },
  ];
  if (webLimit > 0) jobs.push({ name: "web", fn: () => searchWebDetailed(query, webLimit) });

  const settled = await Promise.allSettled(jobs.map((j) => j.fn()));
  const docs = [];
  const seen = new Set();
  const parts = [];

  settled.forEach((s, i) => {
    const job = jobs[i];
    if (s.status === "fulfilled") {
      const value = s.value;
      const list = Array.isArray(value) ? value : (value && value.docs) || [];
      const extraParts = Array.isArray(value) ? null : (value && value.parts) || null;
      const kept = [];
      for (const d of list) {
        if (!d.url || !d.title) continue;
        const k = normUrl(d.url);
        if (seen.has(k)) continue;
        seen.add(k);
        kept.push({ ...d, id: k });
      }
      docs.push(...kept);
      if (extraParts) parts.push(...extraParts);
      else parts.push({ name: job.name, status: "ran", count: kept.length });
    } else {
      parts.push({
        name: job.name,
        status: "failed",
        reason: String((s.reason && s.reason.message) || s.reason || "error"),
      });
    }
  });
  return { docs, parts };
}

// Fan-out search over several queries (batches of 3 to stay on the good side
// of the free academic APIs), merged and deduped across every source, with a
// combined per-source status breakdown. `webCap` bounds web results across
// the whole run so the supplement can never crowd out the scholarly set.
async function searchManyDetailed(queries, cap = 60, opts = {}) {
  const list = [...new Set((queries || []).map((q) => String(q || "").trim()).filter(Boolean))].slice(
    0,
    opts.maxQueries || 8,
  );
  const webCap = opts.webCap == null ? 10 : opts.webCap;
  const partMap = new Map();
  const addPart = (p) => {
    const cur = partMap.get(p.name);
    if (!cur) {
      partMap.set(p.name, { ...p });
      return;
    }
    if (p.status === "ran") {
      cur.status = "ran";
      cur.count = (cur.count || 0) + (p.count || 0);
      cur.reason = undefined;
    } else if (cur.status !== "ran") {
      cur.status = p.status;
      cur.reason = p.reason;
    }
  };

  if (list.length === 0) return { docs: [], parts: [] };

  const seen = new Set();
  const docs = [];
  let webUsed = 0;
  for (let i = 0; i < list.length; i += 3) {
    const batch = list.slice(i, i + 3);
    const results = await Promise.all(batch.map((q) => searchQueryDetailed(q, opts.perSource, opts)));
    for (const r of results) {
      r.parts.forEach(addPart);
      for (const d of r.docs) {
        if (seen.has(d.id)) continue;
        if (d.provenance === "web") {
          if (webUsed >= webCap) continue;
          webUsed++;
        }
        seen.add(d.id);
        docs.push(d);
        if (docs.length >= cap) return { docs, parts: [...partMap.values()] };
      }
    }
  }
  return { docs, parts: [...partMap.values()] };
}

// Thin wrappers for scripts/debug harnesses that only need the documents.
async function searchQuery(query, opts = {}) {
  const res = await searchQueryDetailed(query, opts.perSource == null ? 8 : opts.perSource, opts);
  return res.docs;
}

async function searchMany(queries, cap = 60, opts = {}) {
  const res = await searchManyDetailed(queries, cap, opts);
  return res.docs;
}

// Fair mixing across sources for reading priority: scholarly first (PubMed,
// then arXiv), web results last. Without this, whichever API returns first
// consumes every fetch slot and the other sources never reach the reader.
// Within each source bucket the strongest documents (quality score: study
// type + recency + citations) are read first.
function interleaveByProvenance(docs, order = ["pubmed", "arxiv", "web"]) {
  const buckets = new Map(order.map((k) => [k, []]));
  const other = [];
  for (const d of docs) {
    const b = buckets.get(d.provenance);
    (b || other).push(d);
  }
  const byQuality = (x, y) => (Number(y && y.quality) || 0) - (Number(x && x.quality) || 0);
  for (const b of buckets.values()) b.sort(byQuality);
  other.sort(byQuality);
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

module.exports = {
  searchQuery,
  searchQueryDetailed,
  searchMany,
  searchManyDetailed,
  interleaveByProvenance,
  normUrl,
};
