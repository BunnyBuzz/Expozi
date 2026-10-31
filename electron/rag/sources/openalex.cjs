// OpenAlex direct search API (free, no API key required, 250M+ scientific works).
// Covers all scholarly disciplines: social sciences, economics, humanities,
// physical sciences, engineering, biology, medicine, and mathematics.
const { typeFromOpenAlex, typeFromTitle, applyQuality } = require("../quality.cjs");

function abstractFromInvertedIndex(inv) {
  if (!inv || typeof inv !== "object") return "";
  const words = [];
  for (const [word, positions] of Object.entries(inv)) {
    if (!Array.isArray(positions)) continue;
    for (const pos of positions) {
      words[pos] = word;
    }
  }
  return words.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

async function searchOpenAlex(query, limit = 8) {
  const q = String(query || "").trim();
  if (!q) return [];

  const url =
    "https://api.openalex.org/works?search=" +
    encodeURIComponent(q) +
    "&per_page=" +
    Math.min(limit, 25) +
    "&sort=relevance_score:desc&mailto=contact@openelicit.app";

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Expozi/0.1 (mailto:contact@openelicit.app)",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) throw new Error(`OpenAlex HTTP ${res.status}`);
  const data = await res.json();
  const results = (data && data.results) || [];

  return results
    .filter((w) => w && w.title)
    .map((w) => {
      const authors = (w.authorships || [])
        .map((a) => a.author && a.author.display_name)
        .filter(Boolean);
      const doi = w.doi ? w.doi.replace(/^https?:\/\/doi\.org\//i, "") : null;
      const title = String(w.title).replace(/\s+/g, " ").trim();
      const journal =
        (w.primary_location && w.primary_location.source && w.primary_location.source.display_name) ||
        "OpenAlex";
      const year = Number(w.publication_year) || null;
      const citations = Number(w.cited_by_count) || 0;
      const landing = (w.primary_location && w.primary_location.landing_page_url) || null;
      const url = landing || (doi ? `https://doi.org/${doi}` : w.id || null);
      const pdfUrl =
        (w.best_oa_location && w.best_oa_location.pdf_url) ||
        (w.open_access && w.open_access.oa_url) ||
        null;
      const abstract = abstractFromInvertedIndex(w.abstract_inverted_index);
      const studyType = typeFromOpenAlex(w.type) || typeFromTitle(title) || "article";
      const retracted = !!w.is_retracted;

      const doc = {
        id: url || doi || String(Math.random()),
        title,
        authors,
        year,
        journal,
        citations,
        citationCount: citations,
        url,
        doi,
        abstract,
        snippet: abstract,
        pdfUrl,
        source: "OpenAlex",
        provenance: "openalex",
        studyType,
        retracted,
      };
      applyQuality(doc);
      return doc;
    });
}

module.exports = { searchOpenAlex, abstractFromInvertedIndex };
