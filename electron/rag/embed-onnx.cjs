// Fast local embedder — multilingual-e5-small (100+ languages) via ONNX
// Runtime (transformers.js). 384-dim, quantized (~140 MB incl. tokenizer,
// downloaded once into the models folder), runs on CPU in tens of ms per
// passage — the GGUF embedding path takes ~10-17 s per passage on the same
// machine, which made "Indexing the sources…" the slowest stage of every run.
// Swapping models is just MODEL_ID + the prefixes below: the embed cache is
// keyed per model identity, so vectors never mix across models.
const fs = require("fs");

const MODEL_ID = "Xenova/multilingual-e5-small";
const BATCH = 16;

// e5 is an instructed retrieval model (intfloat/multilingual-e5-small): the
// query side gets "query: " and every passage gets "passage: ".
const QUERY_PREFIX = "query: ";
const PASSAGE_PREFIX = "passage: ";

function queryText(text) {
  return QUERY_PREFIX + String(text ?? "");
}

function passageText(text) {
  return PASSAGE_PREFIX + String(text ?? "");
}

function modelLabel() {
  return MODEL_ID.split("/").pop();
}

let pipe = null;
let loading = null;
let cacheDir = null;
let lastErr = null;

function setCacheDir(dir) {
  cacheDir = dir;
}

// The dependency is a plain npm package — availability is just "is it there".
function available() {
  try {
    require.resolve("@huggingface/transformers");
    return true;
  } catch {
    return false;
  }
}

function ready() {
  return !!pipe;
}

function identity() {
  return `onnx:${MODEL_ID}`;
}

function error() {
  return lastErr;
}

// Load (and, on first use, download) the model. onProgress receives
// transformers.js progress events so the run can show the download.
async function load(onProgress) {
  if (pipe) return pipe;
  if (loading) return loading;
  loading = (async () => {
    try {
      const { pipeline, env } = await import("@huggingface/transformers");
      if (cacheDir) {
        fs.mkdirSync(cacheDir, { recursive: true });
        env.cacheDir = cacheDir;
      }
      env.useBrowserCache = false;
      pipe = await pipeline("feature-extraction", MODEL_ID, {
        dtype: "q8",
        progress_callback: (p) => {
          if (onProgress) onProgress(p);
        },
      });
      lastErr = null;
      return pipe;
    } catch (e) {
      lastErr = String((e && e.message) || e).slice(0, 300);
      throw e;
    } finally {
      loading = null;
    }
  })();
  return loading;
}

// Embed a list of texts. Batched; a stop request aborts between batches.
async function embedTexts(texts, { shouldStop, onProgress } = {}) {
  if (!pipe) throw new Error("ONNX embedder is not loaded");
  const out = [];
  for (let k = 0; k < texts.length; k += BATCH) {
    if (shouldStop && shouldStop()) {
      const e = new Error("aborted");
      e.name = "AbortError";
      throw e;
    }
    const slice = texts.slice(k, k + BATCH);
    const res = await pipe(slice, { pooling: "mean", normalize: true });
    const list = res.tolist();
    for (const v of list) out.push(Array.from(v));
    if (onProgress) onProgress(Math.min(k + BATCH, texts.length), texts.length);
  }
  return out;
}

module.exports = {
  MODEL_ID,
  QUERY_PREFIX,
  PASSAGE_PREFIX,
  queryText,
  passageText,
  modelLabel,
  setCacheDir,
  available,
  ready,
  identity,
  error,
  load,
  embedTexts,
};
