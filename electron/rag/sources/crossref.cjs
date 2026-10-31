// Crossref search API (free polite pool, official registry of academic DOIs).
// Covers peer-reviewed journal articles, conference proceedings, and books
// from virtually all publishers (Nature, IEEE, Springer, Elsevier, Wiley, etc.).
const { typeFromTitle, applyQuality } = require("../quality.cjs");

function cleanAbstract(raw) {
  if (!raw || typeof raw !== "string") return "";
  return raw
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);
}

async function searchCrossref(query, limit = 8) {
  const q = String(query || "").trim();
  if (!q) return [];

  const url =
    "https://api.crossref.org/works?query=" +
    encodeURIComponent(q) +
    "&rows=" +
    Math.min(limit, 20) +
    "&sort=relevance";

  const res = await fetch(url, {
    headers: {
      "User-Agent": "Expozi/0.1 (mailto:research@expozi.app)",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) throw new Error(`Crossref HTTP ${res.status}`);
  const data = await res.json();
  const items = (data && data.message && data.message.items) || [];

  return items
    .filter((item) => item && item.title && item.title.length > 0)
    .map((item) => {
      const title = String(item.title[0] || "").replace(/\s+/g, " ").trim();
      const authors = (item.author || [])
        .map((a) => [a.given, a.family].filter(Boolean).join(" "))
        .filter(Boolean);

      const year =
        (item.published && item.published["date-parts"] && item.published["date-parts"][0] && Number(item.published["date-parts"][0][0])) ||
        (item.created && item.created["date-parts"] && item.created["date-parts"][0] && Number(item.created["date-parts"][0][0])) ||
        null;

      const journal =
        (item["container-title"] && item["container-title"][0]) ||
        (item.publisher) ||
        "Crossref";

      const citations = Number(item["is-referenced-by-count"]) || 0;
      const doi = item.DOI ? item.DOI.toLowerCase() : null;
      const url =
        (item.resource && item.resource.primary && item.resource.primary.URL) ||
        item.URL ||
        (doi ? `https://doi.org/${doi}` : null);

      let pdfUrl = null;
      if (Array.isArray(item.link)) {
        const pdfLink = item.link.find((l) => l && l["content-type"] === "application/pdf");
        if (pdfLink && pdfLink.URL) pdfUrl = pdfLink.URL;
      }

      const abstract = cleanAbstract(item.abstract);
      const studyType = typeFromTitle(title) || (item.type === "journal-article" ? "article" : "other");

      const doc = {
        title,
        authors,
        year,
        journal,
        citations,
        url,
        doi,
        abstract,
        pdfUrl,
        provenance: "crossref",
        studyType,
      };
      applyQuality(doc);
      return doc;
    });
}

module.exports = { searchCrossref };
