## MODELS

### Embedding
Use @xenova/transformers (Transformers.js).
Model: 'nomic-ai/nomic-embed-text-v1' (~274MB, downloads automatically on first run).
Pure JS, no compilation, works on all machines.

async function embedText(text) {
  const { pipeline } = await import('@xenova/transformers');
  const embedder = await pipeline('feature-extraction', 'nomic-ai/nomic-embed-text-v1');
  const output = await embedder(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

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