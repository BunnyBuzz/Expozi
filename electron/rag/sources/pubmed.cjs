const { parseStringPromise } = require("xml2js");
const { typeFromPubmedTypes, typeFromTitle } = require("../quality.cjs");

// PubMed's eSummary has no abstracts and the article pages are JS-only
// (0 chars when fetched), so without efetch the results were dropped by the
// pipeline's text filter. efetch XML carries the abstract — one extra request.
// Lite runs search three queries (6 requests) back to back, which tripped
// NCBI's rate limiter — keep ~2 requests/second and retry a 429 once.
let lastCall = 0;
async function throttle(ms = 500) {
  const wait = ms - (Date.now() - lastCall);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
}

async function fetchWithRetry(url, opts) {
  let res = await fetch(url, opts);
  if (res.status === 429) {
    await new Promise((r) => setTimeout(r, 1600));
    res = await fetch(url, opts);
  }
  return res;
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
  // PublicationTypeList carries the study design ("Meta-Analysis", "Randomized
  // Controlled Trial", ...) — the strongest ordering signal we get for free.
  const studyTypes = []
    .concat((art.PublicationTypeList && art.PublicationTypeList.PublicationType) || [])
    .map(textOf)
    .filter(Boolean);
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
    studyTypes,
    studyType: typeFromPubmedTypes(studyTypes) || typeFromTitle(title) || "other",
  };
}

// esearch chokes on raw natural-language questions: "What is the effect of
// exercise on depressive symptoms in adults?" returns 0 results while the
// same words without the interrogative scaffold return thousands. Strip the
// trailing punctuation and the leading question scaffold before searching.
function pubmedTerm(query) {
  let t = String(query || "")
    .replace(/[?!.]+$/g, "")
    .trim();
  t = t
    .replace(/^(what|which|how|why|when|where|who)\s+(is|are|was|were|does|do|did|can|could|should|would|has|have|will)\s+/i, "")
    .replace(/^(does|do|did|is|are|was|were|can|could|should|would|has|have|will)\s+/i, "");
  return t.trim() || String(query || "");
}

async function searchPubmed(query, limit = 10) {
  await throttle(500);
  const es = await fetchWithRetry(
    "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=" +
      encodeURIComponent(pubmedTerm(query)) +
      "&retmax=" +
      limit +
      "&retmode=json&sort=relevance",
    { signal: AbortSignal.timeout(15000) },
  );
  if (!es.ok) throw new Error(`PubMed HTTP ${es.status}`);
  const esj = await es.json();
  const ids = (((esj || {}).esearchresult || {}).idlist) || [];
  if (!ids.length) return [];
  await throttle(500);
  const ef = await fetchWithRetry(
    "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=" +
      ids.join(",") +
      "&rettype=abstract&retmode=xml",
    { signal: AbortSignal.timeout(20000) },
  );
  if (!ef.ok) throw new Error(`PubMed HTTP ${ef.status}`);
  const parsed = await parseStringPromise(await ef.text(), { explicitArray: false, trim: true });
  const arts = (parsed && parsed.PubmedArticleSet && parsed.PubmedArticleSet.PubmedArticle) || [];
  return [].concat(arts).map(parseArticle).filter((x) => x && x.title);
}

module.exports = { searchPubmed, pubmedTerm };
