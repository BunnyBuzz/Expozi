Build an Electron AI Research Assistant app. Node.js backend, vanilla HTML/CSS/JS frontend.

## CORE PIPELINE (in order)
1. Query Expansion — use node-llama-cpp to turn user query into 4 sub-queries
2. Multi-Source Search — search all sources in parallel with Promise.allSettled
3. Fetch Content — extract clean text from URLs
4. Chunk + Embed — split text, embed with local model
5. Hybrid Search — BM25 + hnswlib vector search, fuse with RRF
6. Rerank — score top 20 passages with LLM, keep top 5
7. Synthesize — generate final answer with citations, stream to UI

## SEARCH SOURCES
- SearXNG at http://localhost:8080 (web)
- Semantic Scholar API — https://api.semanticscholar.org/graph/v1/paper/search
- arXiv API — https://export.arxiv.org/api/query
- PubMed — esearch + esummary eutils endpoints

## FETCH STRATEGY
Try in order:
1. https://r.jina.ai/{url} — returns clean markdown, no API key needed
2. curl-impersonate with chrome124 as fallback
Max 3 concurrent fetches.

## HYBRID SEARCH
- BM25: wink-bm25-text-search
- Vector: hnswlib-node (cosine similarity)
- Fuse results with RRF: score = 1/(k+rank), k=60
- Weights: 0.35 BM25 + 0.65 vector

## DEPENDENCIES
node-llama-cpp, hnswlib-node, wink-bm25-text-search, better-sqlite3, node-fetch, xml2js, uuid

## PROJECT STRUCTURE
main.js, preload.js, renderer/{index.html,style.css,renderer.js}
src/pipeline/{orchestrator,queryExpander,searcher,fetcher,chunker,embedder,hybridIndex,reranker,synthesizer}.js
src/sources/{searxng,semanticScholar,arxiv,pubmed}.js
src/db/store.js, src/utils/rrf.js
models/ (user places GGUF files here), data/db/research.db, data/index/hnsw.bin

## DATABASE (better-sqlite3)
Tables: sessions(id, query, answer, created_at), sources(id, session_id, title, url, source_type, citation_count), passages(id, source_id, text, rerank_score)

## IPC CHANNELS
run-research (query) → streams {type:'progress', stage, message} and {type:'token', text} and {type:'done', sources:[]}

## MODELS
User places two GGUF models  in ./models/:
- embedding model (e.g. nomic-embed-text)
- chat model (e.g. any Llama/Mistral GGUF)
App auto-detects them by size (smallest = embedding, largest = chat).
If no embedding model found, fall back to BM25-only search.

## CHUNKING
512 words per chunk, 100 word overlap, min 50 words, max 20 chunks per doc.

## NOTES
- All LLM prompts expect JSON output — always wrap parse in try/catch with fallback
- Semantic Scholar: add 1000ms delay between requests (rate limit)
- Dedup results by URL before fetching
- Save every session to SQLite for history