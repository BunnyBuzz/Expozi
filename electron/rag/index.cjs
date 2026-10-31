const fs = require("fs");
const path = require("path");
const { randomUUID } = require("crypto");
const { ragDirs, ensureDirs } = require("./paths.cjs");
const { openDb, run: dbRun, all: dbAll } = require("./db.cjs");
const { scanModels, loadModelFile, promptStream } = require("./llm.cjs");
const { loadEmbeddingModel, onnxAvailable, setCacheDir, error: embedBackendError } = require("./embed.cjs");
const { downloadModel, downloadModelFile, cancelDownload, MODELS, MODEL_NAME } = require("./download.cjs");
const { runResearch: runResearchPipeline, runV2: runV2Pipeline } = require("./pipeline.cjs");
const { runAgent } = require("./agent.cjs");
const { runResearchAgent } = require("./agentFlow.cjs");
const { runReportPipeline, answerReportFollowUp } = require("./reportFlow.cjs");
const { findSimilarPastSession } = require("./sessionMemory.cjs");
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
  embedKind: null,
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
  // The fast ONNX embedder needs no user file (the model downloads on first
  // use); a GGUF embedding model is the fallback when ONNX cannot load.
  if (state.embedding !== "ready") {
    state.embedKind = onnxAvailable() ? "onnx" : embedding ? "gguf" : null;
    state.embedding = state.embedKind ? "available" : "missing";
  }
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

// Load the local embedder on first use. Prefers the fast ONNX model
// (multilingual-e5-small), which needs no user file (the weights download on
// first use); a GGUF embedding model is the fallback when ONNX cannot load.
async function ensureEmbedding(send, onStage) {
  if (state.embedding === "ready") return true;
  if (!state.embedKind) return false;
  state.embedding = "loading";
  pushStatus(send);
  try {
    let lastPct = -10;
    const kind = await loadEmbeddingModel(state.embedFile, {
      onProgress: (p) => {
        if (!onStage || !p || p.status !== "progress" || !p.total) return;
        if (!/\.onnx$/i.test(p.file || "")) return;
        // One stage line per 10% — the download fires a callback per chunk.
        const pct = Math.floor((p.loaded / p.total) * 100);
        if (pct < lastPct + 10 && pct !== 100) return;
        lastPct = pct;
        onStage("embed", `Preparing the embedding model… ${pct}%`);
      },
    });
    state.embedKind = kind;
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
  // ONNX model files (multilingual-e5-small) live next to the GGUF models the user manages.
  setCacheDir(path.join(dirs.models, "onnx"));
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
    embedKind: state.embedKind,
    embedError: state.embedding === "error" ? embedBackendError() : null,
  };
}

// --- screening workspace (stage 3) -----------------------------------------
// Decisions and notes are stored per (session, url). The screen_sources tool
// persists its proposals into the same row; a user decision never overwrites
// the proposal and vice versa.
const DECISIONS = new Set(["include", "exclude", "maybe"]);

function setScreening({ sessionId, url, decision, note } = {}) {
  if (!sessionId || !url) return { saved: false, error: "sessionId and url required" };
  const d = decision ? String(decision) : null;
  if (d && !DECISIONS.has(d)) return { saved: false, error: `unknown decision: ${d}` };
  try {
    dbRun(
      "INSERT INTO screening (session_id, url, decision, note, updated_at) VALUES (?,?,?,?,datetime('now')) " +
        "ON CONFLICT(session_id, url) DO UPDATE SET decision=excluded.decision, note=excluded.note, updated_at=excluded.updated_at",
      [sessionId, url, d, note != null ? String(note) : null],
    );
    return { saved: true };
  } catch (e) {
    return { saved: false, error: String((e && e.message) || e) };
  }
}

function listScreening(sessionId) {
  try {
    return dbAll("SELECT url, decision, note, suggested, reason FROM screening WHERE session_id=? ORDER BY id", [sessionId]);
  } catch {
    return [];
  }
}

// Reopen a saved session (Recents) — sources + screening state, no re-run.
// Source rows are read in the order screen_sources proposed them (the live
// display order); rows persisted before the per-session migration fall back to
// the same URL from any session, and unscreened extras follow at the end.
const SOURCE_COLS = "title, url, authors, year, journal, doi, citations, source_type, abstract, study_type, quality, retracted";

function mapSourceRow(r) {
  return {
    id: r.url,
    title: r.title || "Untitled source",
    authors: String(r.authors || "").split("; ").filter(Boolean),
    year: r.year ?? null,
    journal: r.journal || "",
    doi: r.doi || null,
    citations: r.citations || 0,
    url: r.url,
    provenance: r.source_type || "web",
    abstract: r.abstract || "",
    studyType: r.study_type ?? null,
    quality: r.quality ?? null,
    retracted: !!r.retracted,
  };
}

function loadSession(sessionId) {
  try {
    const s = dbAll("SELECT id, query, mode, answer FROM sessions WHERE id=?", [sessionId])[0];
    if (!s) return null;
    const screening = listScreening(sessionId);
    const rows = [];
    const seen = new Set();
    for (const scr of screening) {
      if (!scr.url || seen.has(scr.url)) continue;
      const src =
        dbAll(`SELECT ${SOURCE_COLS} FROM sources WHERE session_id=? AND url=?`, [sessionId, scr.url])[0] ||
        dbAll(`SELECT ${SOURCE_COLS} FROM sources WHERE url=? LIMIT 1`, [scr.url])[0];
      if (src) {
        seen.add(scr.url);
        rows.push(src);
      }
    }
    for (const src of dbAll(`SELECT ${SOURCE_COLS} FROM sources WHERE session_id=? ORDER BY id`, [sessionId])) {
      if (src.url && !seen.has(src.url)) {
        seen.add(src.url);
        rows.push(src);
      }
    }
    return {
      id: s.id,
      query: s.query,
      mode: s.mode,
      answer: s.answer || "",
      sources: rows.map(mapSourceRow),
      screening,
    };
  } catch {
    return null;
  }
}

// --- history + library (stage 4) --------------------------------------------
// Recents reads the sessions the pipeline wrote; the library stores starred
// sources with the same badge fields the live view shows.

function listSessions(limit = 30) {
  try {
    return dbAll(
      "SELECT id, query, mode, created_at FROM sessions WHERE query IS NOT NULL AND query != '' ORDER BY created_at DESC, rowid DESC LIMIT ?",
      [Number(limit) || 30],
    );
  } catch {
    return [];
  }
}

function libraryList() {
  try {
    return dbAll(
      "SELECT title, url, authors, year, journal, citation_count, abstract, doi, source_type, study_type, quality, retracted FROM library ORDER BY saved_at DESC, rowid DESC",
    );
  } catch {
    return [];
  }
}

function libraryAdd(p = {}) {
  if (!p.url) return { saved: false, error: "url required" };
  try {
    dbRun(
      "INSERT INTO library (title, url, authors, year, journal, citation_count, abstract, doi, source_type, study_type, quality, retracted) " +
        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?) " +
        "ON CONFLICT(url) DO UPDATE SET title=excluded.title, authors=excluded.authors, year=excluded.year, journal=excluded.journal, citation_count=excluded.citation_count, abstract=excluded.abstract, doi=excluded.doi, source_type=excluded.source_type, study_type=excluded.study_type, quality=excluded.quality, retracted=excluded.retracted",
      [
        p.title || "Untitled source",
        p.url,
        p.authors || "",
        p.year ?? null,
        p.journal || "",
        p.citations || 0,
        p.abstract || "",
        p.doi || null,
        p.source_type || null,
        p.study_type || null,
        typeof p.quality === "number" ? p.quality : null,
        p.retracted ? 1 : 0,
      ],
    );
    return { saved: true };
  } catch (e) {
    return { saved: false, error: String((e && e.message) || e) };
  }
}

function libraryRemove(url) {
  if (!url) return { saved: false, error: "url required" };
  try {
    dbRun("DELETE FROM library WHERE url=?", [url]);
    return { saved: true };
  } catch (e) {
    return { saved: false, error: String((e && e.message) || e) };
  }
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

async function runResearch({
  query,
  mode,
  maxTokens,
  onStage,
  onToken,
  onTool,
  send,
  template,
  depth: depthParam,
  criteria,
}) {
  researchAborter = new AbortController();
  const cfg = getBackend();
  const depth = effectiveDepth(cfg);
  const keys = { jina: getKey("jina") };
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
  if ((cfg.embedBackend || "local") === "local" && state.embedding !== "ready" && state.embedKind) {
    if (onStage) {
      onStage(
        "embed",
        state.embedKind === "onnx"
          ? "Preparing the fast embedding model…"
          : "Loading the local embedding model…",
      );
    }
    await ensureEmbedding(send, onStage);
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
    const args = {
      query,
      mode,
      promptFn,
      signal: researchAborter.signal,
      onStage,
      onToken,
      onTool,
      maxTokens: maxTokens || 500,
      keys,
      depth,
    };
    // Research Agent mode (Complete Elicit-style flow)
    if (mode === "agent") {
      const sessionId = randomUUID();
      return await runResearchAgent({
        ...args,
        sessionId,
        keys: {
          ...keys,
          semanticScholar: getKey("semantic-scholar"),
          jina: getKey("jina"),
        },
      });
    }
    // Report Mode (Complete 6-step Systematic Review Report flow)
    if (mode === "report") {
      const sessionId = randomUUID();
      return await runReportPipeline({
        ...args,
        sessionId,
        template: template || "General Review",
        depth: depthParam || depth || "balanced",
        criteria: criteria || null,
        onStepData: (data) => {
          try {
            if (send) send("rag:report-step-data", { id: sessionId, data });
          } catch {}
        },
        keys: {
          ...keys,
          semanticScholar: getKey("semantic-scholar"),
          jina: getKey("jina"),
        },
      });
    }
    return await runResearchPipeline(args);
  } finally {
    researchAborter = null;
  }
}

function checkPastSession(query) {
  return findSimilarPastSession(query);
}

async function runAgentFollowUp({ sessionId, query, maxTokens, onToken, onTool, send }) {
  researchAborter = new AbortController();
  const cfg = getBackend();
  const keys = { jina: getKey("jina"), semanticScholar: getKey("semantic-scholar") };
  const promptFn = async (messages, mt, tk) => {
    if (cfg.backend && cfg.backend !== "local") {
      return await chatComplete({
        backend: cfg.backend,
        baseURL: cfg.baseURL,
        key: getKey(cfg.backend),
        model: cfg.apiModel,
        messages,
        maxTokens: mt || maxTokens || 600,
        temperature: 0.2,
        onToken: tk,
        signal: researchAborter.signal,
      });
    }
    return promptStream(messages, { onToken: tk, signal: researchAborter.signal, maxTokens: mt || maxTokens || 600 });
  };
  try {
    return await runResearchAgent({
      sessionId,
      query,
      promptFn,
      signal: researchAborter.signal,
      onToken,
      onTool,
      keys,
      isFollowUp: true,
    });
  } finally {
    researchAborter = null;
  }
}

async function runReportQA({ sessionId, query, followUpQuery, extractionMatrix, reportText, onToken }) {
  researchAborter = new AbortController();
  const cfg = getBackend();
  const promptFn = (messages, mt, tk) => {
    if (cfg.backend && cfg.backend !== "local") {
      return chatComplete({
        backend: cfg.backend,
        baseURL: cfg.baseURL,
        key: getKey(cfg.backend),
        model: cfg.apiModel,
        messages,
        maxTokens: mt || 500,
        temperature: 0.3,
        onToken: tk,
        signal: researchAborter.signal,
      });
    }
    return promptStream(messages, { onToken: tk, signal: researchAborter.signal, maxTokens: mt || 500 });
  };
  try {
    return await answerReportFollowUp(promptFn, {
      query,
      followUpQuery,
      extractionMatrix,
      reportText,
      onToken,
    });
  } finally {
    researchAborter = null;
  }
}

function getReportVersions(sessionId) {
  const { listReportVersions } = require("./db.cjs");
  return listReportVersions(sessionId);
}

function getReportExtractions(sessionId) {
  const { listExtractions } = require("./db.cjs");
  return listExtractions(sessionId);
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
  checkPastSession,
  runAgentFollowUp,
  runReportQA,
  getReportVersions,
  getReportExtractions,
  getBackend,
  setBackend,
  listKeys,
  testKeyP,
  setScreening,
  listScreening,
  loadSession,
  listSessions,
  libraryList,
  libraryAdd,
  libraryRemove,
};
