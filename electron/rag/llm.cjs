const fs = require("fs");
const path = require("path");

let llama = null;
let loadedPath = null;
let chatModel = null;
let embCtx = null;
let embPath = null;

async function scanModels(modelsDir) {
  if (!fs.existsSync(modelsDir)) return [];
  return fs
    .readdirSync(modelsDir)
    .filter((f) => f.toLowerCase().endsWith(".gguf"))
    .map((f) => path.join(modelsDir, f))
    .sort((a, b) => fs.statSync(b).size - fs.statSync(a).size);
}

async function ensureLlama() {
  if (!llama) {
    const mod = await import("node-llama-cpp");
    llama = await mod.getLlama({ gpu: false });
  }
  return llama;
}

async function loadModelFile(modelPath) {
  if (loadedPath === modelPath && chatModel) return;
  const l = await ensureLlama();
  chatModel = await l.loadModel({ modelPath });
  loadedPath = modelPath;
}

let queue = Promise.resolve();

async function promptStream(messages, { onToken, signal, maxTokens = 512, temperature = 0.2 } = {}) {
  const run = () =>
    withChatSession(async (s) => {
      const text = messages
        .map((m) => (m.role === "user" ? m.content : ""))
        .filter(Boolean)
        .join("\n");
      return s.prompt(text, { onTextChunk: onToken, signal, maxTokens, temperature });
    });
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

async function withChatSession(fn) {
  if (!chatModel) throw new Error("No model loaded");
  const mod = await import("node-llama-cpp");
  const ctx = await chatModel.createContext();
  const s = new mod.LlamaChatSession({ contextSequence: ctx.getSequence() });
  try {
    return await fn(s);
  } finally {
    try {
      await s.dispose();
    } catch {
      /* noop */
    }
    try {
      await ctx.dispose();
    } catch {
      /* noop */
    }
  }
}

async function loadEmbeddingModel(modelPath) {
  if (embPath === modelPath && embCtx) return;
  const l = await ensureLlama();
  const model = await l.loadModel({ modelPath, embeddingContext: true });
  embCtx = await model.createEmbeddingContext();
  embPath = modelPath;
}

function hasEmbedding() {
  return !!embCtx;
}

async function embedTexts(texts) {
  const out = [];
  for (const t of texts) {
    const e = await embCtx.getEmbeddingFor(String(t).slice(0, 4000));
    out.push(Array.from(e.vector));
  }
  return out;
}

module.exports = { scanModels, loadModelFile, promptStream, loadEmbeddingModel, hasEmbedding, embedTexts };
