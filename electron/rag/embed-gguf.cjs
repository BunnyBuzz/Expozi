// GGUF embedding model via node-llama-cpp — the fallback local embedder.
// Slow on CPU (~10-17 s per passage here); prefer embed-onnx.cjs. Kept for
// users who already have an embedding GGUF installed and no ONNX runtime.
let embCtx = null;
let embPath = null;

async function loadEmbeddingModel(modelPath) {
  if (embPath === modelPath && embCtx) return;
  const { getLlama } = await import("node-llama-cpp");
  const llama = await getLlama();
  const model = await llama.loadModel({ modelPath, embeddingContext: true });
  embCtx = await model.createEmbeddingContext({ contextSize: 2048, ignoreMemorySafetyChecks: true });
  embPath = modelPath;
}

function hasEmbedding() {
  return !!embCtx;
}

function embedIdentity() {
  if (!embPath) return "";
  return String(embPath).split(/[\\/]/).pop() || "local";
}

// The GGUF fallback embeds raw text — no instructed query/passage format.
function queryText(text) {
  return String(text ?? "");
}

function passageText(text) {
  return String(text ?? "");
}

function modelLabel() {
  return embedIdentity();
}

// Embed one text. Long inputs are retried with progressively shorter text
// (the embedding context has a fixed token budget) until they fit.
async function embedOne(text) {
  let t = String(text || "").trim().slice(0, 6000);
  while (t.length > 0) {
    try {
      const e = await embCtx.getEmbeddingFor(t);
      return Array.from(e.vector);
    } catch (e) {
      const msg = String((e && e.message) || e);
      if (!/context size|too long|tokens/i.test(msg)) throw e;
      t = t.slice(0, Math.floor(t.length / 2));
    }
  }
  return null;
}

// Embed a list of texts. A stop request aborts between texts.
async function embedTexts(texts, { shouldStop, onProgress } = {}) {
  const out = [];
  for (let i = 0; i < texts.length; i++) {
    if (shouldStop && shouldStop()) {
      const e = new Error("aborted");
      e.name = "AbortError";
      throw e;
    }
    out.push(await embedOne(texts[i]));
    if (onProgress) onProgress(i + 1, texts.length);
  }
  return out;
}

module.exports = { loadEmbeddingModel, hasEmbedding, embedIdentity, queryText, passageText, modelLabel, embedTexts };
