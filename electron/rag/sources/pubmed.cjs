const { parseStringPromise } = require("xml2js");

// PubMed's eSummary has no abstracts and the article pages are JS-only
// (0 chars when fetched), so without efetch the results were dropped by the
// pipeline's text filter. efetch XML carries the abstract — one extra request.
let lastCall = 0;
async function throttle(ms = 350) {
  const wait = ms - (Date.now() - lastCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

function textOf(node) {
  if (node === null || node === undefined) return "";
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (Array.isArray(node)) return textOf(node[0]);
  if (typeof node === "object") return typeof node._ === "string" ? node._ : "";
  return "";
}

function parseArticle(a) {
  const cit = a && a.MedlineCitation;
  if (!cit) return null;
  const art = cit.Article || {};
  const pmid = textOf(cit.PMID);
  const title = textOf(art.ArticleTitle).replace(/\s+/g, " ").trim();
  const absNode = art.Abstract && art.Abstract.AbstractText;
  const abstract = []
    .concat(absNode || [])
    .map(textOf)
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 8000);
  const authors = [];
  const list = art.AuthorList && art.AuthorList.Author;
  [].concat(list || []).forEach((au) => {
    if (!au) return;
    const name = [textOf(au.LastName), textOf(au.Initials)].filter(Boolean).join(" ") || textOf(au.CollectiveName);
    if (name) authors.push(name);
  });
  const pd = (art.Journal && art.Journal.JournalIssue && art.Journal.JournalIssue.PubDate) || art.ArticleDate || {};
  const year = Number(textOf(pd.Year)) || (pd.MedlineDate ? Number(String(textOf(pd.MedlineDate)).slice(0, 4)) || null : null);
  const journal = textOf(art.Journal && art.Journal.Title) || "PubMed";
  let doi = null;
  const ids = a.PubmedData && a.PubmedData.ArticleIdList && a.PubmedData.ArticleIdList.ArticleId;
  [].concat(ids || []).forEach((x) => {
    if (x && x.$ && x.$.IdType === "doi") doi = textOf(x);
  });
  if (!doi) {
    const el = textOf(art.ELocationID);
    if (/^doi:/i.test(el)) doi = el.replace(/^doi:\s*/i, "");
  }
  return {
    title: title || "(untitled)",
    authors,
    year,
    journal,
    citations: 0,
    url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    doi,
    abstract,
    pdfUrl: null,
    provenance: "pubmed",
  };
}

async function searchPubmed(query, limit = 10) {
  try {
    await throttle(350);
    const es = await fetch(
      "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=" +
        encodeURIComponent(query) +
        "&retmax=" +
        limit +
        "&retmode=json&sort=relevance",
      { signal: AbortSignal.timeout(15000) },
    );
    if (!es.ok) return [];
    const esj = await es.json();
    const ids = (((esj || {}).esearchresult || {}).idlist) || [];
    if (!ids.length) return [];
    await throttle(350);
    const ef = await fetch(
      "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=" +
        ids.join(",") +
        "&rettype=abstract&retmode=xml",
      { signal: AbortSignal.timeout(20000) },
    );
    if (!ef.ok) return [];
    const parsed = await parseStringPromise(await ef.text(), { explicitArray: false, trim: true });
    const arts = (parsed && parsed.PubmedArticleSet && parsed.PubmedArticleSet.PubmedArticle) || [];
    return [].concat(arts).map(parseArticle).filter((x) => x && x.title);
  } catch {
    return [];
  }
}

module.exports = { searchPubmed };
