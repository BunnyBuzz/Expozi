Build an Electron AI Research Assistant app. Node.js backend, React + Tailwind renderer.

## CORE PIPELINE (registry-driven — `electron/tools/`)
Every step is a registered tool; the UI trace reports each as `name count` /
`name failed (reason)` / `name skipped (reason)` — silent failures are not
allowed.
1. plan_queries — model-generated sub-queries (standard/deep; skipped in lite).
   Lite searches the raw question plus the first two `expand_query` sub-queries
   (previously it searched only the raw question, wasting the expansion and
   leaving question-phrased runs with web-only results)
2. scan_topic / gather_perspectives / generate_questions — deep-run context
3. search_papers — arXiv + PubMed + OpenAlex + web tiers in parallel, fanned
   out over the sub-queries
4. enrich_sources — OpenAlex batch lookup → citations, years, study types,
   quality score (see SOURCE QUALITY & ORDERING)
5. read_pages — tiered readers (see FETCH STRATEGY) with per-tier trace
6. index_sources — chunk + embed + BM25/vector hybrid index (RRF)
7. select_evidence / rank_evidence — LLM passage rerank, then a
   quality-ordered evidence pool
8. rubric_filter + screen_sources — review-mode screening proposals
9. write_answer — agent/report answer; report deep: build_outline +
   write_section + assemble_report

## SEARCH SOURCES
- OpenAlex API — https://api.openalex.org/works (multi-disciplinary direct search: 250M+ works covering social sciences, economics, humanities, physics, engineering, and biology. Reconstructs abstracts from inverted indexes, extracts OA pdf links, citation counts, and study types)
- Crossref API — https://api.crossref.org/works (polite pool with user-agent, covers DOIs from all major publishers and journals globally)
- Unpaywall API — https://api.unpaywall.org/v2/{doi} (automatically discovers legal open-access PDFs for peer-reviewed papers)
- arXiv API — https://export.arxiv.org/api/query (tokenized: stopwords dropped,
  terms ANDed — a raw question otherwise degrades into matching "How"/"does")
- PubMed — esearch + efetch eutils endpoints (the term is sanitized first:
  trailing "?" and leading interrogative scaffold stripped — a raw
  "What is the effect of …?" returns 0 hits for phrasings that otherwise have
  thousands)
- Web supplement — DuckDuckGo via duck-duck-scrape, then the app's built-in
  browser (hidden Electron window), then a SearXNG public-instance pool
  (searx.space online list). Marked `web`, capped per run, ranked after the
  scholarly sources. No API keys needed for any source.
- Semantic Scholar removed.

## FETCH STRATEGY (reader tiers — reader v2)
1. cheerio — local fetch (got-scraping) + article extraction; PDFs skip to Jina
2. https://r.jina.ai/{url} — clean markdown (optional API key)
3. built-in browser — hidden Electron window render for JS-gated pages
4. optional (detected, never auto-installed): crawl4ai / scrapy+selectolax /
   BeautifulSoup+lxml / DrissionPage (Python, `EXPOZI_PYTHON` env picks the
   interpreter) / playwright-core with a system Chrome or Edge — skipped with
   a trace reason when absent
Max 3 concurrent fetches. Every tier outcome is reported; `read_pages` traces
show the reader breakdown (e.g. `cheerio 4 · browser 11 · failed 1 (…)`).

## SOURCE QUALITY & ORDERING (2.5c)
- `electron/rag/quality.cjs` scores every source 0–100 = study type (0–40) +
  recency (0–30) + citations (min(30, 8·log10(1+c))); retracted → 0.
  Types: umbrella/meta-analysis > systematic review > guideline/RCT > trial >
  cohort > review > preprint > web > comment; SEO look-alike domains
  (youboost, orivivo) demoted to 2.
- `enrich_sources` tool (OpenAlex, no key) fills missing citations / years /
  study types by DOI in batches of 25 and applies the score; PubMed efetch
  publication types and title heuristics cover the rest. Trace:
  `10 enriched (OpenAlex) · 0 retracted · openalex 10 · no-doi skipped (6 docs)`.
- Ordering: source lists show badges (`2024 · Meta-analysis · cited by 38`),
  reading priority is scholarly-first and strongest-first within each source,
  and evidence numbering sorts the pool by parent-document quality — a
  report's `[1]` is its strongest source.
- Report prompts require exact figures from the evidence (never invented), a
  `## Conflicting evidence` section when sources disagree (stating which side
  has the stronger designs), and treat web pages as a marked supplement.

## SCREENING (Stage 3)
- Review mode runs `screen_sources` after quality ordering. Rubric (fixed,
  explainable): retracted → exclude; strong designs (umbrella / meta-analysis /
  systematic review / guideline / RCT / trial / cohort) → include when quality
  ≥ 45 else maybe; review → include when quality ≥ 60 else maybe; preprint →
  maybe; case report / editorial comment → exclude; web / unclassified → maybe;
  no content-word overlap with the question demotes "include" to "maybe".
- Each proposal carries a reason line (`Meta-analysis · 2024 · cited by 38 ·
  quality 78.7`) and is persisted per session (`screening.suggested/reason`) so
  a reopened review still shows the reasoning.
- Decisions (include | maybe | exclude) and notes are the user's, stored per
  `(session_id, url)`; suggestions never write a decision.
- Export: the screened set as .md / .pdf / .csv (Included / Maybe / Excluded /
  Undecided sections, notes included) through the same native-dialog export as
  reports; the CSV (`screeningCsv` in `src/data/screening.ts`, RFC 4180 with a
  UTF-8 BOM) is one row per source — decision, note, badges, identifiers.

## HISTORY & LIBRARY (Stage 4)
- Recents reads the `sessions` table (`rag:sessions-list`, newest first, cap
  30) merged with any pre-DB localStorage entries (deduped by query) — DB
  entries reopen (review) or re-run (agent/report) from the sidebar. Every
  run records a session row when it starts.
- Starring a source writes it to the `library` table with the same badge
  fields the live view shows (`study_type`, `quality`, `retracted`, DOI,
  provenance, citations); un-starring removes it. A failed save reverts the
  star instead of showing state that was not persisted.
- The Library view renders from the DB (`rag:library-list`), so stars survive
  restarts; clicking a saved row opens the detail pane.
- Reopened sessions carry the enrichment fields on `sources`
  (`study_type`/`quality`/`retracted`), so a reopened review shows the same
  study-type/quality/retracted badges as the live run.

## HYBRID SEARCH
- BM25: wink-bm25-text-search
- Vector: brute-force cosine over per-run passage vectors (vector.cjs)
- Embeddings: ONNX multilingual-e5-small (384-dim, q8, ~140 MB incl.
  tokenizer; ~17 ms/passage on CPU, measured). Queries are embedded with a
  "query: " prefix and passages with "passage: " (`embedQuery`/`embedPassages`
  in embedder.cjs) — the instructed format e5 is trained for; 100+ languages,
  cross-lingual retrieval verified. API embeddings when configured; a GGUF
  embedding model as optional fallback; BM25-only when none is available. The
  index trace names the embedder (`58/58 embedded · ONNX multilingual-e5-small`).
- Fuse results with RRF: score = 1/(k+rank), k=60
- Weights: 0.35 BM25 + 0.65 vector

## DEPENDENCIES
node-llama-cpp (GGUF chat + fallback embeddings), @huggingface/transformers
(ONNX e5 embeddings), wink-bm25-text-search, sql.js (SQLite), xml2js,
got-scraping + cheerio (readers), duck-duck-scrape + playwright-core (web),
react + react-dom + lucide-react (renderer).

## PROJECT STRUCTURE
electron/main.cjs, electron/preload.cjs, electron/export.cjs (native-dialog
.md/.pdf/.csv export)
electron/tools/ — registry + tools (search, enrich, read, index, evidence,
screening, writing)
electron/rag/ — pipeline.cjs, db.cjs (sql.js), index.cjs (sessions/screening/
library), readers.cjs, quality.cjs, browser.cjs, embed*.cjs, providers.cjs,
sources/{arxiv,pubmed,webSearch}.cjs
src/ — React renderer (App.tsx, components/, data/, rag.ts bridge)
dist/ — built renderer (vite), release/ — electron-builder output

## DATABASE (sql.js)
File: `<rag root>/data/expozi.sqlite` — loaded with sql.js, saved after
writes. The rag root is `<userData>/rag` by default, or the folder set in
`%APPDATA%\expozi\rag-location.json` (`{ "ragDir": "D:\\Expozi\\data" }`);
it holds `models/`, `data/` and `embed-cache/`. Tables:
- sessions(id, query, mode, answer, created_at)
- sources(id, session_id, title, url, authors, year, journal, doi, citations,
  source_type, abstract, study_type, quality, retracted, UNIQUE(session_id,url))
- passages(id, source_id, text, rerank_score)
- screening(session_id, url, decision, note, suggested, reason, updated_at,
  UNIQUE(session_id,url))
- library(url UNIQUE, title, authors, year, journal, citation_count, abstract,
  doi, source_type, study_type, quality, retracted, saved_at)
- kv(key, value)
Older databases gain new columns at open (`ensureColumns`); the sources table
was rebuilt once for the per-session unique key (`migrateSources`,
regression `scripts/db-migrate-test.cjs`).

## IPC CHANNELS
expozi:export-report (native save dialog; .md/.csv written directly, .pdf via
printToPDF),
expozi:reader-status
rag:get-status, rag:download-model, rag:cancel-download, rag:open-models-folder,
rag:import-model, rag:load-model, rag:prompt, rag:stop-prompt, rag:research
(streams rag:stage / rag:tool / rag:token / rag:done / rag:error),
rag:stop-research
rag:screening-set, rag:screening-list, rag:session-load
rag:sessions-list, rag:library-list, rag:library-add, rag:library-remove

## MODELS
- Chat: a local GGUF model via node-llama-cpp (downloaded once into the models
  folder from Settings, or imported), or an API backend (OpenAI-compatible /
  Groq / Gemini) when a key is configured.
- Embeddings: ONNX multilingual-e5-small (384-dim, q8, 100+ languages) via
  @huggingface/transformers — the fast local default (queries "query: ",
  passages "passage: "); API embeddings when configured; an optional GGUF
  embedding model as fallback; BM25-only when none is available.

## CHUNKING
512 words per chunk, 100 word overlap, min 50 words, max 20 chunks per doc.

## NOTES
- All LLM prompts expect JSON output — always wrap parse in try/catch with fallback
- Dedup results by URL before fetching
- Save every session to SQLite for history