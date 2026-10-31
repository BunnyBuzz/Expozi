const { parseStringPromise } = require("xml2js");
const { typeFromTitle } = require("../quality.cjs");

// arXiv only understands field-prefixed boolean queries. Passing a whole
// natural-language question to `all:` silently degrades into matching a
// single common word ("How", "does"...), which is why long questions used to
// return unrelated physics papers. Tokenise, drop stopwords, AND the terms.
const STOP = new Set(
  (
    "a an and are as at be been being but by for from had has have he her his how i if in into is it its " +
    "may might must no not of on or our shall should so than that the their them then there these they this " +
    "those to under up was we were what when where which who why will with would you your does do did can " +
    "could about after before between during over again also more most such other some any"
  ).split(/\s+/),
);

function arxivTerms(query) {
  return String(query || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .slice(0, 8);
}

async function searchArxiv(query, limit = 10) {
  const terms = arxivTerms(query);
  if (terms.length === 0) return [];
  const searchQuery = terms.map((t) => "all:" + encodeURIComponent(t)).join("+AND+");
  const url =
    "https://export.arxiv.org/api/query?search_query=" +
    searchQuery +
    "&start=0&max_results=" +
    limit +
    "&sortBy=relevance&sortOrder=descending";
  const res = await fetch(url, { headers: { "User-Agent": "Expozi/0.1 research-app" }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`arXiv HTTP ${res.status}`);
  const data = await parseStringPromise(await res.text(), { explicitArray: false, trim: true });
  const entries = data && data.feed && data.feed.entry;
  if (!entries) return [];
  const list = Array.isArray(entries) ? entries : [entries];
  return list
    .filter((e) => e.title)
    .map((e) => {
      const au = e.author ? (Array.isArray(e.author) ? e.author : [e.author]) : [];
      const absId = String(e.id || "").split("/abs/")[1] || "";
      const year = e.published ? Number(String(e.published).slice(0, 4)) || null : null;
      const title = String(e.title).replace(/\s+/g, " ");
      const abstract = String(e.summary || "").replace(/\s+/g, " ").trim();
      return {
        id: e.id || (absId ? `https://arxiv.org/abs/${absId}` : null) || String(Math.random()),
        title,
        authors: au.map((a) => a.name).filter(Boolean),
        year,
        journal: "arXiv",
        citations: 0,
        citationCount: 0,
        url: e.id || null,
        doi: e["arxiv:doi"] || null,
        abstract,
        snippet: abstract,
        pdfUrl: absId ? `https://arxiv.org/pdf/${absId}` : null,
        source: "arXiv",
        provenance: "arxiv",
        studyType: typeFromTitle(title) || "preprint",
      };
    });
}

module.exports = { searchArxiv, arxivTerms };
