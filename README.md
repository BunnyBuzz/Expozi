<img width="1920" height="1014" alt="image" src="https://github.com/user-attachments/assets/a7abd100-77ee-40fb-8fc6-b870cb95a567" />
<img width="1920" height="1002" alt="image" src="https://github.com/user-attachments/assets/4f4315d5-462e-4a30-8637-fd9479c6f37a" />

<div align="center">
  <h1>OpenElicit</h1>
  <p>Open-source AI research assistant for students and researchers — runs locally on your machine.</p>

  ![Electron](https://img.shields.io/badge/Electron-latest-47848F?logo=electron)
  ![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)
  ![License](https://img.shields.io/badge/license-MIT-green)
</div>

---

## What is OpenElicit?

OpenElicit is a desktop research assistant inspired by [Elicit](https://elicit.com). It takes a research question and returns a synthesized, cited answer drawn from real academic sources — entirely on your machine, no subscriptions, no data sent to the cloud.

## How it works

Your question
↓
Query Expansion — LLM generates 4 sub-queries
↓
Multi-Source Search — Semantic Scholar · arXiv · PubMed · OpenAlex (parallel)
↓
Content Fetch — Jina Reader · curl-impersonate
↓
Chunk + Embed — nomic-embed-text via Transformers.js
↓
Hybrid Search — BM25 + vector search fused with RRF
↓
Rerank — LLM scores top passages
↓
Synthesize — Streamed answer with [1][2] citations


## Modes

| Mode | Output |
|------|--------|
| **Research Agent** | Streamed answer with citations |
| **Report** | Full structured document (Abstract · Findings · Conclusion · References) |
| **Systematic Review** | Sortable paper table with Include/Exclude screening |

## Features

- Fully local — LLM and embeddings run on your machine
- PDF reading and drag-and-drop upload
- Structured extraction (methodology, sample size, findings, limitations)
- Session history and projects
- Library to save papers permanently
- Export to PDF, Word, CSV, Excel

## Requirements

- Node.js 18+
- A GGUF chat model placed in `./models/` (see below)
- Ollama (optional, for faster inference)

## Getting Started

```bash
git clone https://github.com/BunnyBuzz/OpenElicit
cd OpenElicit
npm install
npm start
```

### Models

Place GGUF models in the `./models/` directory. The app auto-detects them.

Recommended:

| Model | Size | Speed |
|-------|------|-------|
| `llama-3.2-3b.Q4_K_M.gguf` | ~2GB | CPU: acceptable |
| `qwen2.5-7b.Q4_K_M.gguf` | ~4GB | GPU: fast |

Embedding model downloads automatically on first run (~274MB).

## Academic Sources

| Source | Coverage |
|--------|----------|
| Semantic Scholar | 200M+ papers |
| arXiv | Preprints |
| PubMed | Medicine & biology |
| OpenAlex | 320M+ works |

## Stack

Electron · TypeScript · node-llama-cpp · Transformers.js · hnswlib-node · better-sqlite3 · pdfjs-dist

## License

Apache 2.0
