// Semantic Scholar API source with 1000ms delay and explicit rate limit handling.
let lastCall = 0;

async function throttle(ms = 1000) {
  const wait = ms - (Date.now() - lastCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

function normalize(p) {
  const url = (p.openAccessPdf && p.openAccessPdf.url) || p.url || (p.paperId ? `https://www.semanticscholar.org/paper/${p.paperId}` : null);
  const pdfUrl = (p.openAccessPdf && p.openAccessPdf.url) || null;
  const doi = (p.externalIds && p.externalIds.DOI) || null;
  const authors = (p.authors || []).map((a) => (typeof a === "string" ? a : a.name)).filter(Boolean);

  return {
    id: url || doi || p.paperId || String(Math.random()),
    title: String(p.title || "").replace(/\s+/g, " ").trim(),
    authors,
    url,
    snippet: String(p.abstract || "").replace(/\s+/g, " ").trim(),
    source: "Semantic Scholar",
    year: typeof p.year === "number" ? p.year : null,
    citationCount: Number(p.citationCount) || 0,
    pdfUrl,
    doi,
    provenance: "scholar",
    studyType: "article",
  };
}

async function searchSemanticScholar(query, limit = 10, key = "", retried = false) {
  const q = String(query || "").trim();
  if (!q) return [];

  await throttle(1000);

  const url =
    "https://api.semanticscholar.org/graph/v1/paper/search?query=" +
    encodeURIComponent(q) +
    "&limit=" +
    Math.min(limit, 20) +
    "&fields=title,abstract,authors,year,citationCount,url,openAccessPdf,externalIds";

  const headers = {
    Accept: "application/json",
    "User-Agent": "Expozi/0.1 (mailto:contact@openelicit.app)",
  };
  if (key) headers["x-api-key"] = key;

  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
    if (res.status === 429) {
      if (!retried) {
        await new Promise((r) => setTimeout(r, 2500));
        return searchSemanticScholar(query, limit, key, true);
      }
      const err = new Error("rate limited");
      err.code = "RATE_LIMITED";
      throw err;
    }
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const data = await res.json();
    return ((data && data.data) || []).filter((p) => p && p.title).map(normalize);
  } catch (e) {
    if (e.code === "RATE_LIMITED" || /rate limit|429/i.test(e.message)) {
      const err = new Error("rate limited");
      err.code = "RATE_LIMITED";
      throw err;
    }
    throw e;
  }
}

module.exports = { searchSemanticScholar };
