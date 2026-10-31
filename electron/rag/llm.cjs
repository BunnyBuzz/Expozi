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
      // TEMP-DEBUG: tracing generation timing (remove after the local-run diagnosis).
      const t0 = Date.now();
      console.log(`[llm:dbg] start: promptChars=${text.length} maxTokens=${maxTokens} temp=${temperature}`);
      let chunks = 0;
      let chars = 0;
      const wrapped = (c) => {
        chunks++;
        chars += String(c || "").length;
        if (chunks === 1 || chunks % 10 === 0) {
          console.log(`[llm:dbg] chunk#${chunks} +${Date.now() - t0}ms chars=${chars}`);
        }
        if (onToken) onToken(c);
      };
      try {
        const r =
          typeof s.promptWithMeta === "function"
            ? await (async () => {
                const m = await s.promptWithMeta(text, { onTextChunk: wrapped, signal, maxTokens, temperature });
                console.log(`[llm:dbg] done +${Date.now() - t0}ms stop=${m.stopReason} chunks=${chunks} outChars=${String(m.response || "").length}`);
                return m.response;
              })()
            : await s.prompt(text, { onTextChunk: wrapped, signal, maxTokens, temperature });
        if (typeof r === "string") console.log(`[llm:dbg] done +${Date.now() - t0}ms chunks=${chunks} outChars=${r.length}`);
        return r;
      } catch (e) {
        console.log(`[llm:dbg] FAILED +${Date.now() - t0}ms chunks=${chunks}: ${(e && e.message) || e}`);
        throw e;
      }
    });
  const p = queue.then(run, run);
  queue = p.catch(() => {});
  return p;
}

async function withChatSession(fn) {
  if (!chatModel) throw new Error("No model loaded");
  const mod = await import("node-llama-cpp");
  // TEMP-DEBUG: context sizing/timing (remove after the local-run diagnosis).
  const tCtx = Date.now();
  const ctx = await chatModel.createContext();
  let ctxSize = "n/a";
  try {
    ctxSize = String(ctx.contextSize);
  } catch {
    /* newer API */
  }
  console.log(
    `[llm:dbg] context ready +${Date.now() - tCtx}ms size=${ctxSize} train=${chatModel.trainContextSize || "n/a"}`,
  );
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
