// Local embedding facade. Prefers the fast ONNX model — multilingual-e5-small
// (embed-onnx.cjs, tens of ms per passage); falls back to a user-installed
// GGUF embedding model (embed-gguf.cjs) when ONNX is unavailable or fails to
// load; when neither works the caller gets `false` and the pipeline runs
// BM25-only.
const gguf = require("./embed-gguf.cjs");
const onnx = require("./embed-onnx.cjs");

let kind = null; // "onnx" | "gguf" | null

function setCacheDir(dir) {
  onnx.setCacheDir(dir);
}

function onnxAvailable() {
  return onnx.available();
}

// Load the local embedder. Returns "onnx" or "gguf".
// `opts.onProgress` receives transformers.js progress events (model download).
async function loadEmbeddingModel(modelPath, opts = {}) {
  if (onnx.available()) {
    try {
      await onnx.load(opts.onProgress);
      kind = "onnx";
      return kind;
    } catch (e) {
      if (e && e.name === "AbortError") throw e;
      // ONNX failed (no network for the first download, runtime error…) —
      // fall through to a GGUF embedding model when one is installed.
    }
  }
  if (modelPath) {
    await gguf.loadEmbeddingModel(modelPath);
    kind = "gguf";
    return kind;
  }
  throw new Error(onnx.error() || "no local embedding backend available");
}

function hasEmbedding() {
  if (kind === "onnx") return onnx.ready();
  if (kind === "gguf") return gguf.hasEmbedding();
  return false;
}

function embedIdentity() {
  if (kind === "onnx") return onnx.identity();
  if (kind === "gguf") return gguf.embedIdentity();
  return "";
}

function embedKind() {
  return kind;
}

function error() {
  return kind === "onnx" ? onnx.error() : null;
}

async function embedTexts(texts, opts) {
  if (kind === "onnx") return onnx.embedTexts(texts, opts);
  return gguf.embedTexts(texts, opts);
}

// Instructed text for the active local model (e5 wants "query: " on queries
// and "passage: " on passages). The GGUF fallback embeds raw text.
function queryText(text) {
  if (kind === "gguf") return gguf.queryText(text);
  return onnx.queryText(text);
}

function passageText(text) {
  if (kind === "gguf") return gguf.passageText(text);
  return onnx.passageText(text);
}

function modelLabel() {
  if (kind === "onnx") return onnx.modelLabel();
  if (kind === "gguf") return gguf.modelLabel();
  return "";
}

module.exports = {
  setCacheDir,
  onnxAvailable,
  loadEmbeddingModel,
  hasEmbedding,
  embedIdentity,
  embedKind,
  error,
  embedTexts,
  queryText,
  passageText,
  modelLabel,
};
