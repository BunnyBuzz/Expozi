// Local Library search source.
// Matches past starred papers from the SQLite library table against the current query.
// Runs locally with 0 latency, 0 tokens, and works offline.
const db = require("../db.cjs");
const { tokenize } = require("../bm25.cjs");
const { applyQuality } = require("../quality.cjs");

async function searchLibrary(query, limit = 5) {
  const qTerms = tokenize(query);
  if (qTerms.length === 0) return [];

  let rows = [];
  try {
    rows = db.all(
      "SELECT title, url, authors, year, journal, citation_count AS citations, abstract, doi, source_type, study_type AS studyType, quality, retracted FROM library ORDER BY rowid DESC",
    );
  } catch {
    return [];
  }

  if (!rows || rows.length === 0) return [];

  const scored = [];
  for (const row of rows) {
    if (!row.title) continue;
    const titleTerms = new Set(tokenize(row.title));
    const absTerms = new Set(tokenize(row.abstract || ""));
    const authorTerms = new Set(tokenize(row.authors || ""));

    let matches = 0;
    for (const term of qTerms) {
      if (titleTerms.has(term)) matches += 3; // Title match has higher weight
      else if (absTerms.has(term)) matches += 1;
      else if (authorTerms.has(term)) matches += 2;
    }

    if (matches > 0) {
      const doc = {
        title: row.title,
        authors: typeof row.authors === "string" ? row.authors.split("; ") : Array.isArray(row.authors) ? row.authors : [],
        year: Number(row.year) || null,
        journal: row.journal || "Library",
        citations: Number(row.citations) || 0,
        url: row.url,
        doi: row.doi || null,
        abstract: row.abstract || "",
        pdfUrl: null,
        provenance: "library",
        studyType: row.studyType || "article",
        quality: typeof row.quality === "number" ? row.quality : null,
        retracted: Boolean(row.retracted),
        _matchScore: matches,
      };
      applyQuality(doc);
      scored.push(doc);
    }
  }

  scored.sort((a, b) => b._matchScore - a._matchScore || (b.quality || 0) - (a.quality || 0));
  return scored.slice(0, limit);
}

module.exports = { searchLibrary };
