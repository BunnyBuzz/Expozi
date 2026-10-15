const fs = require("fs");
const path = require("path");
const { ragDirs, ensureDirs } = require("./paths.cjs");
const { openDb } = require("./db.cjs");
const { scanModels, loadModelFile, promptStream } = require("./llm.cjs");
const { loadEmbeddingModel, hasEmbedding } = require("./embed.cjs");
const { downloadModel, downloadModelFile, cancelDownload, MODELS, MODEL_NAME } = require("./download.cjs");
const { runResearch: runResearchPipeline } = require("./pipeline.cjs");
const { chatComplete } = require("./backends.cjs");
const { getKey, mask } = require("./keys.cjs");
const { testProvider, PROVIDERS } = require("./providers.cjs");

const state = {
  booted: false,
  llm: "missing",
  modelFile: null,
  download: null,
  error: null,
  embedding: "missing",
  embedFile: null,
};

let dirs = null;
let promptAborter = null;
let researchAborter = null;

function classifyModels(files) {
  const ggufs = files.filter((f) => f.toLowerCase().endsWith(".gguf"));
  if (ggufs.length === 0) return { chat: null, embedding: null };
  const bySize = [...ggufs].sort(
    (a, b) => fs.statSync(path.join(dirs.models, b)).size - fs.statSync(path.join(dirs.models, a)).size,
  );
  const full = (f) => path.join(dirs.models, f);
  if (bySize.length === 1) return { chat: full(bySize[0]), embedding: null };
  return { chat: full(bySize[0]), embedding: full(bySize[bySize.length - 1]) };
}

// Scan the models folder and record what is installed. This never loads the
// models: they are loaded on first use (ensureLlm/ensureEmbedding), so app
// startup is instant and an API-only user never loads a local model at all.
async function refreshModels() {
  const files = fs.existsSync(dirs.models) ? fs.readdirSync(dirs.models) : [];
  const { chat, embedding } = classifyModels(files);
  state.modelFile = chat || null;
  state.embedFile = embedding || null;
  state.llm = chat ? "available" : "missing";
  state.embedding = embedding ? "available" : "missing";
}

function pushStatus(send) {
  if (!send) return;
  try {
    send("rag:status", getStatus());
  } catch {
    /* window gone */
  }
}

// Load the chat model on first use (never at app startup).
async function ensureLlm(send) {
  if (state.llm === "ready") return true;
  if (!state.modelFile || !fs.existsSync(state.modelFile)) {
    state.llm = "missing";
    state.error = null;
    pushStatus(send);
    return false;
  }
  state.llm = "loading";
  state.error = null;
  pushStatus(send);
  try {
    await loadModelFile(state.modelFile);
    state.llm = "ready";
    pushStatus(send);
    return true;
  } catch (e) {
    state.llm = "error";
    state.error = String((e && e.message) || e);
    pushStatus(send);
    return false;
  }
}

// Load the local embedding model on first use, when one is installed.
async function ensureEmbedding(send) {
  if (state.embedding === "ready") return true;
  if (!state.embedFile || !fs.existsSync(state.embedFile)) return false;
  state.embedding = "loading";
  try {
    await loadEmbeddingModel(state.embedFile);
    state.embedding = "ready";
    pushStatus(send);
    return true;
  } catch {
    state.embedding = "error";
    pushStatus(send);
    return false;
  }
}

async function initRag(app) {
  dirs = ragDirs(app);
  ensureDirs(fs, dirs);
  try {
    await openDb(dirs.dbFile);
  } catch (e) {
    state.llm = "error";
    state.error = "Database failed: " + String((e && e.message) || e);
    state.booted = true;
    return { dirs, state };
  }
  const models = await scanModels(dirs.models);
  if (models.length === 0) {
    state.llm = "missing";
    state.embedding = "missing";
  } else {
    await refreshModels();
  }
  state.booted = true;
  return { dirs, state };
}

function getBackend() {
  const { kvGet } = require("./keys.cjs");
  return {
    backend: kvGet("backend") || "local",
    apiModel: kvGet("apiModel") || "",
    baseURL: kvGet("baseURL") || "",
    embedBackend: kvGet("embedBackend") || "local",
    embedModel: kvGet("embedModel") || "",
    depth: kvGet("depth") || "auto",
  };
}

function setBackend(cfg) {
  const { kvSet } = require("./keys.cjs");
  if (cfg.backend !== undefined) kvSet("backend", cfg.backend);
  if (cfg.apiModel !== undefined) kvSet("apiModel", cfg.apiModel);
  if (cfg.baseURL !== undefined) kvSet("baseURL", cfg.baseURL);
  if (cfg.embedBackend !== undefined) kvSet("embedBackend", cfg.embedBackend);
  if (cfg.embedModel !== undefined) kvSet("embedModel", cfg.embedModel);
  if (cfg.depth !== undefined) kvSet("depth", cfg.depth);
  return getBackend();
}

// "auto" follows the chat backend: API providers get the full pipeline,
// local models get the standard one (deep is too slow on CPU).
function effectiveDepth(cfg) {
  const setting = (cfg && cfg.depth) || "auto";
  if (setting !== "auto") return setting;
  return cfg && cfg.backend && cfg.backend !== "local" ? "deep" : "standard";
}

function listKeys() {
  const { getKey, mask } = require("./keys.cjs");
  return PROVIDERS.filter((p) => p.needsKey).map((p) => ({
    provider: p.id,
    label: p.label,
    kind: p.kind,
    has: !!getKey(p.id),
    masked: mask(getKey(p.id)),
  }));
}

async function testKeyP(provider, opts = {}) {
  const { getKey } = require("./keys.cjs");
  return testProvider(provider, {
    key: getKey(provider),
    baseURL: opts.baseURL || getBackend().baseURL,
    model: opts.model,
  });
}

function getStatus() {
  return {
    llm: state.llm,
    modelFile: state.modelFile,
    download: state.download,
    error: state.error,
    modelName: MODEL_NAME,
    embedding: state.embedding,
    embedFile: state.embedFile || null,
    embedModelName: MODELS.embedding.name,
  };
}

async function startDownload(send, which = "chat") {
  if (!dirs) throw new Error("RAG not initialized");
  if (state.llm === "downloading") return;
  state.llm = "downloading";
  state.error = null;
  state.download = { received: 0, total: 0, which };
  try {
    await downloadModelFile(which, dirs.models, (p) => {
      state.download = { ...p, which };
      send("rag:download-progress", state.download);
    });
    state.download = null;
    state.llm = "missing";
    await refreshModels();
    send("rag:status", getStatus());
  } catch (e) {
    const msg = String((e && e.message) || e);
    state.download = null;
    if ((e && e.name) === "AbortError" || /abort/i.test(msg)) {
      state.error = null;
    } else {
      state.llm = "error";
      state.error = msg;
    }
    if (state.llm !== "error") {
      state.llm = "missing";
      await refreshModels();
    }
    send("rag:status", getStatus());
  }
}

function cancelDl() {
  cancelDownload();
}

async function importModelFile(d, srcPath) {
  const target = d || dirs;
  if (!target) throw new Error("RAG not initialized");
  const dest = path.join(target.models, path.basename(srcPath));
  fs.copyFileSync(srcPath, dest);
  await refreshModels();
  return dest;
}

async function runPrompt({ messages, maxTokens, onToken, send }) {
  promptAborter = new AbortController();
  const cfg = getBackend();
  try {
    if (cfg.backend && cfg.backend !== "local") {
      return await chatComplete({
        backend: cfg.backend,
        baseURL: cfg.baseURL,
        key: getKey(cfg.backend),
        model: cfg.apiModel,
        messages,
        maxTokens: maxTokens || 512,
        temperature: 0.3,
        onToken,
        signal: promptAborter.signal,
      });
    }
    const ok = await ensureLlm(send);
    if (!ok) {
      throw new Error(
        "Local model is not available — open Settings to download it or choose an API provider.",
      );
    }
    return await promptStream(messages, {
      onToken,
      signal: promptAborter.signal,
      maxTokens: maxTokens || 512,
      fresh: true,
    });
  } finally {
    promptAborter = null;
  }
}

function stopPrompt() {
  if (promptAborter) {
    try {
      promptAborter.abort();
    } catch {
      /* noop */
    }
  }
}

async function runResearch({ query, mode, maxTokens, onStage, onToken, send }) {
  researchAborter = new AbortController();
  const cfg = getBackend();
  const depth = effectiveDepth(cfg);
  const keys = { s2: getKey("semantic-scholar"), jina: getKey("jina") };
  const useLocalLlm = !cfg.backend || cfg.backend === "local";

  if (useLocalLlm) {
    if (onStage && state.llm !== "ready") onStage("model", "Loading the local model…");
    const ok = await ensureLlm(send);
    if (!ok) {
      researchAborter = null;
      throw new Error(
        "Local model is not available — open Settings to download it or choose an API provider.",
      );
    }
  }
  if ((cfg.embedBackend || "local") === "local" && state.embedding !== "ready" && state.embedFile) {
    if (onStage) onStage("embed", "Loading the local embedding model…");
    await ensureEmbedding(send);
  }

  const promptFn = (messages, mt, tk) => {
    if (cfg.backend && cfg.backend !== "local") {
      return chatComplete({
        backend: cfg.backend,
        baseURL: cfg.baseURL,
        key: getKey(cfg.backend),
        model: cfg.apiModel,
        messages,
        maxTokens: mt,
        temperature: 0.3,
        onToken: tk,
        signal: researchAborter.signal,
      });
    }
    return promptStream(messages, { onToken: tk, signal: researchAborter.signal, maxTokens: mt });
  };
  try {
    return await runResearchPipeline({
      query,
      mode,
      promptFn,
      signal: researchAborter.signal,
      onStage,
      onToken,
      maxTokens: maxTokens || 500,
      keys,
      depth,
    });
  } finally {
    researchAborter = null;
  }
}

function stopResearch() {
  if (researchAborter) {
    try {
      researchAborter.abort();
    } catch {
      /* noop */
    }
  }
  stopPrompt();
}

module.exports = {
  initRag,
  getStatus,
  startDownload,
  cancelDl,
  importModelFile,
  ensureLlm,
  runPrompt,
  stopPrompt,
  runResearch,
  stopResearch,
  getBackend,
  setBackend,
  listKeys,
  testKeyP,
};
