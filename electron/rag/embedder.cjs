const crypto = require("crypto");
const db = require("./db.cjs");
const local = require("./embed.cjs");
const { embedComplete, EMBED_CAPABLE } = require("./backends.cjs");
const { getKey, kvGet } = require("./keys.cjs");

const DEFAULT_EMBED_MODEL = {
  openai: "text-embedding-3-small",
  ollama: "nomic-embed-text",
  gemini: "text-embedding-004",
};

const API_BATCH = 32;
const MAX_CHARS = 8000;

function embedConfig() {
  const mode = kvGet("embedBackend") || "local"; // "local" | "api"
  const model = kvGet("embedModel") || "";
  const chatBackend = kvGet("backend") || "local";
  const baseURL = kvGet("baseURL") || "";
  const canApi = mode === "api" && EMBED_CAPABLE.includes(chatBackend);
  return { mode, model, chatBackend, baseURL, canApi };
}

const hashOf = (modelId, text) => crypto.createHash("sha1").update(modelId + "\u0000" + text).digest("hex");

function cacheGet(hash) {
  try {
    const row = db.all("SELECT vec FROM embed_cache WHERE hash=?", [hash])[0];
    return row ? JSON.parse(row.vec) : null;
  } catch {
    return null;
  }
}

/**
 * Create an embedder that resolves vectors from (in order):
 *   1. the persistent cache (per model + content hash),
 *   2. the configured API provider (when embeddings are set to "api"),
 *   3. the local embedder — fast ONNX (multilingual-e5-small) by default, GGUF as fallback.
 * Vectors are cached under the model that actually produced them, so local
 * and API vectors (different dimensions) never mix.
 */
async function createEmbedder({ onProgress, shouldStop } = {}) {
  const stopped = () => {
    if (shouldStop && shouldStop()) {
      const e = new Error("aborted");
      e.name = "AbortError";
      throw e;
    }
  };
  const cfg = embedConfig();
  const localReady = local.hasEmbedding();
  const useApi = cfg.canApi;
  if (!useApi && !localReady) {
    return {
      available: false,
      source: "none",
      localKind: null,
      localModelLabel: null,
      embed: async (texts) => new Array(texts.length).fill(null),
      embedQuery: async (texts) => new Array(texts.length).fill(null),
      embedPassages: async (texts) => new Array(texts.length).fill(null),
    };
  }

  const apiModel = cfg.model || DEFAULT_EMBED_MODEL[cfg.chatBackend] || "";
  const apiId = useApi ? `api:${cfg.chatBackend}:${apiModel}` : null;
  const localId = localReady ? `local:${local.embedIdentity()}` : null;
  let source = useApi && localReady ? "api" : useApi ? "api" : "local";

  async function embed(texts) {
    stopped();
    const out = new Array(texts.length).fill(null);
    const misses = [];
    texts.forEach((t, i) => {
      const aKey = apiId ? hashOf(apiId, t) : null;
      const lKey = localId ? hashOf(localId, t) : null;
      const hit = (aKey && cacheGet(aKey)) || (lKey && cacheGet(lKey));
      if (hit) out[i] = hit;
      else misses.push({ i, t, aKey, lKey });
    });
    if (misses.length === 0) return out;

    let vecs = null;
    let used = null;
    if (apiId) {
      try {
        vecs = [];
        for (let s = 0; s < misses.length; s += API_BATCH) {
          stopped();
          const batch = misses.slice(s, s + API_BATCH);
          const got = await embedComplete({
            backend: cfg.chatBackend,
            baseURL: cfg.baseURL,
            key: getKey(cfg.chatBackend),
            model: apiModel,
            texts: batch.map((m) => String(m.t).slice(0, MAX_CHARS)),
          });
          vecs.push(...got);
        }
        used = "api";
      } catch (e) {
        if (e && e.name === "AbortError") throw e;
        vecs = null;
        if (onProgress) onProgress(0, misses.length, "API embeddings unavailable — using the local model…");
      }
    }

    if (!vecs) {
      if (!localId) return out;
      used = "local";
      vecs = await local.embedTexts(
        misses.map((m) => String(m.t).slice(0, MAX_CHARS)),
        {
          shouldStop,
          onProgress: (done, total) => {
            if (onProgress) onProgress(done, total);
          },
        },
      );
    } else if (onProgress) {
      onProgress(misses.length, misses.length);
    }
    source = used;

    const inserts = [];
    misses.forEach((m, k) => {
      if (!vecs[k]) return;
      out[m.i] = vecs[k];
      const key = used === "api" ? m.aKey : m.lKey;
      if (key) inserts.push([key, vecs[k].length, JSON.stringify(vecs[k])]);
    });
    if (inserts.length > 0) {
      try {
        db.runMany("INSERT OR REPLACE INTO embed_cache (hash, dim, vec) VALUES (?, ?, ?)", inserts);
      } catch {
        /* cache is best-effort */
      }
    }
    return out;
  }

  // Queries and passages: when the local tier produces the vectors, embed
  // them with the model's instructed prefixes (e5 "query: " / "passage: ");
  // API embedding models take raw text. The cache keys off the exact text, so
  // prefixes only ever affect local rows.
  async function embedQuery(texts) {
    if (!useApi && localReady) return embed(texts.map((t) => local.queryText(t)));
    return embed(texts);
  }

  async function embedPassages(texts) {
    if (!useApi && localReady) return embed(texts.map((t) => local.passageText(t)));
    return embed(texts);
  }

  return {
    available: true,
    embed,
    embedQuery,
    embedPassages,
    modelId: apiId || localId,
    localKind: localReady ? local.embedKind() : null,
    localModelLabel: localReady ? local.modelLabel() : null,
    get source() {
      return source;
    },
  };
}

module.exports = { createEmbedder, embedConfig, DEFAULT_EMBED_MODEL };
