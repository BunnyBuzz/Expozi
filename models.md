## MODELS

### Embedding
Use @huggingface/transformers (Transformers.js v4, ONNX Runtime).
Model: 'Xenova/multilingual-e5-small' (384-dim, q8, ~140MB incl. tokenizer,
downloads automatically on first run into the models folder; 100+ languages,
~17 ms/passage on CPU measured on this machine). Queries are embedded with a
"query: " prefix and every passage with "passage: " (embedQuery/embedPassages
in embedder.cjs) — the instructed format this model is trained for. Swapping
models = change MODEL_ID + the prefixes in embed-onnx.cjs — the embed cache is
keyed per model identity, so vectors never mix.
Pure JS + prebuilt native binaries, no compilation, works on all machines.

async function embedTexts(texts) {
  const { pipeline, env } = await import("@huggingface/transformers");
  env.cacheDir = "<models folder>/onnx";
  const embedder = await pipeline("feature-extraction", "Xenova/multilingual-e5-small", { dtype: "q8" });
  const output = await embedder(texts, { pooling: "mean", normalize: true });
  return output.tolist();
}

The ONNX path needs no user file. A GGUF embedding model (smallest .gguf in
./models/) remains an optional fallback when ONNX cannot load — it is not
pre-downloaded; without one, search runs BM25-only.

### Chat LLM
Use node-llama-cpp v3.
Uses prebuilt binaries — no compilation, no Visual Studio needed.
Automatically detects GPU at install time:
- NVIDIA GPU found → loads CUDA binary → fast
- No GPU → loads CPU binary → slower but works

User places any GGUF model in ./models/ directory.
App auto-selects the largest .gguf file found.

Recommended models (list in README with direct HuggingFace download links):
- llama-3.2-3b.Q4_K_M.gguf (~2GB) — works on CPU, acceptable speed
- mistral-7b.Q4_K_M.gguf (~4GB) — better quality, needs GPU for speed

On startup:
1. Load Transformers.js embedder
2. Scan ./models/ for .gguf files
3. If found → load with node-llama-cpp
4. If not found → show modal with download links to recommended models

### Storage
All rag storage lives in ONE root folder — models, the sqlite DB and the cache:
- default: `%APPDATA%\expozi\rag`
- override: `%APPDATA%\expozi\rag-location.json` = `{ "ragDir": "D:\\Expozi\\data" }`
  (honoured by the dev app and installed app alike; falls back to the default
  if the pointer or the folder is unreadable)
Inside the root: `models/` (GGUFs + `onnx/`), `data/expozi.sqlite`,
`embed-cache/`. Resolution lives in `electron/rag/paths.cjs`.