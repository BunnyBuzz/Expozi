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

async function embedTexts(texts) {
  const out = [];
  for (const t of texts) out.push(await embedOne(t));
  return out;
}

module.exports = { loadEmbeddingModel, hasEmbedding, embedIdentity, embedTexts };
