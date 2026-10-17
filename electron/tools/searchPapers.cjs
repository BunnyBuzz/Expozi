// Search tools — the only way the pipeline reaches sources.
// Sources: PubMed + arXiv always; web (DuckDuckGo through the built-in
// browser, with a SearXNG pool fallback) as a clearly marked supplement.
// No API keys required for any source.
const { searchQueryDetailed, searchManyDetailed } = require("../rag/sources/index.cjs");
const { define } = require("./registry.cjs");

define({
  name: "scan_topic",
  description:
    "Quick grounding scan: search the topic once across PubMed, arXiv, and the web (marked supplement) to gather snippet cards for planning.",
  input: { query: "string", perSource: "number — results per source (default 8)" },
  async run(input) {
    const res = await searchQueryDetailed(input.query, input.perSource == null ? 8 : input.perSource);
    return { data: res.docs, count: res.docs.length, parts: res.parts };
  },
});

define({
  name: "search_papers",
  description:
    "Search PubMed, arXiv, and the web for one or more queries, merge and dedupe the results, and stop at the cap. Scholarly sources rank above web results; the raw question should be the first query.",
  input: {
    queries: "string[] — the queries to run (the raw question should be first)",
    cap: "number — maximum merged results (default 60)",
    maxQueries: "number — maximum queries to run (default 8)",
    perSource: "number | { arxiv?, pubmed?, web? } — results per source",
    webCap: "number — maximum web results across the whole run (default 10)",
  },
  async run(input) {
    const res = await searchManyDetailed(input.queries || [], input.cap == null ? 60 : input.cap, {
      maxQueries: input.maxQueries,
      perSource: input.perSource,
      webCap: input.webCap,
    });
    return { data: res.docs, count: res.docs.length, parts: res.parts };
  },
});
