// Unpaywall resolver (free, legal Open Access PDF discovery).
// Finds lawful open-access PDF URLs for papers given their DOI.
// API docs: https://unpaywall.org/products/api
const cache = new Map(); // Simple in-memory cache per runtime

function cleanDoi(doi) {
  if (!doi || typeof doi !== "string") return null;
  return doi.trim().replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "");
}

async function resolvePdfUrl(doi) {
  const d = cleanDoi(doi);
  if (!d) return null;

  if (cache.has(d)) return cache.get(d);

  try {
    const url = `https://api.unpaywall.org/v2/${encodeURIComponent(d)}?email=unpaywall@expozi.app`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Expozi/0.1 (mailto:research@expozi.app)" },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      cache.set(d, null);
      return null;
    }

    const data = await res.json();
    let pdfUrl = null;
    if (data && data.is_oa) {
      if (data.best_oa_location && data.best_oa_location.url_for_pdf) {
        pdfUrl = data.best_oa_location.url_for_pdf;
      } else if (Array.isArray(data.oa_locations)) {
        const found = data.oa_locations.find((loc) => loc && loc.url_for_pdf);
        if (found) pdfUrl = found.url_for_pdf;
      }
    }

    cache.set(d, pdfUrl);
    return pdfUrl;
  } catch {
    cache.set(d, null);
    return null;
  }
}

// Batch resolver: takes an array of docs and attaches pdfUrl if missing
async function attachOpenAccessPdfs(docs) {
  if (!Array.isArray(docs) || docs.length === 0) return docs;
  const needResolve = docs.filter((d) => d && d.doi && !d.pdfUrl).slice(0, 15);
  if (needResolve.length === 0) return docs;

  await Promise.all(
    needResolve.map(async (doc) => {
      try {
        const pdf = await resolvePdfUrl(doc.doi);
        if (pdf) doc.pdfUrl = pdf;
      } catch {
        /* best-effort */
      }
    }),
  );
  return docs;
}

module.exports = { resolvePdfUrl, attachOpenAccessPdfs, cleanDoi };
