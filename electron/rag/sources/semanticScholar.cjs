let lastCall = 0;

async function throttle(ms = 1000) {
  const wait = ms - (Date.now() - lastCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

function normalize(p) {
  return {
    title: p.title || "",
    authors: ((p.authors || []).map((a) => a.name).filter(Boolean)),
    year: typeof p.year === "number" ? p.year : null,
    journal: p.venue || "",
    citations: p.citationCount || 0,
    url: (p.openAccessPdf && p.openAccessPdf.url) || p.url || null,
    doi: (p.externalIds && p.externalIds.DOI) || null,
    abstract: p.abstract || "",
    pdfUrl: (p.openAccessPdf && p.openAccessPdf.url) || null,
    provenance: "scholar",
  };
}

async function searchSemanticScholar(query, limit = 12, key = "", retried = false) {
  await throttle(1000);
  try {
    const url =
      "https://api.semanticscholar.org/graph/v1/paper/search?query=" +
      encodeURIComponent(query) +
      "&limit=" +
      limit +
      "&fields=title,abstract,authors,year,venue,citationCount,url,openAccessPdf,externalIds";
    const res = await fetch(url, {
      headers: { Accept: "application/json", ...(key ? { "x-api-key": key } : {}) },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 429 && !retried) {
      await new Promise((r) => setTimeout(r, 2500));
      return searchSemanticScholar(query, limit, key, true);
    }
    if (!res.ok) return [];
    const data = await res.json();
    return ((data && data.data) || []).filter((p) => p.title).map(normalize);
  } catch {
    return [];
  }
}

module.exports = { searchSemanticScholar };
