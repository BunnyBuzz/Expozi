import { createRequire } from "module";
import os from "os";
import path from "path";

const require = createRequire(import.meta.url);
const appData = path.join(os.homedir(), "AppData", "Roaming", "expozi");
const db = require("../electron/rag/db.cjs");
const { loadEmbeddingModel } = require("../electron/rag/embed.cjs");
const { createEmbedder } = require("../electron/rag/embedder.cjs");
const { kvSet } = require("../electron/rag/keys.cjs");

await db.openDb(path.join(appData, "rag", "data", "expozi.sqlite"));
// ONNX (multilingual-e5-small) is the local embedder; the GGUF fallback file
// is optional and may not be installed — null keeps this on the ONNX path.
await loadEmbeddingModel(null);

const uniq = Date.now().toString(36);
const texts = [
  `alpha ${uniq} chunk about fasting glucose and insulin sensitivity`,
  `beta ${uniq} chunk about sleep duration and cognition`,
  `alpha ${uniq} chunk about fasting glucose and insulin sensitivity`,
];

// --- local mode ---
kvSet("embedBackend", "local");
kvSet("backend", "local");
kvSet("embedModel", "");
let e = await createEmbedder({ onProgress: (d, t, n) => console.log("  progress:", d + "/" + t, n || "") });
console.log("LOCAL available:", e.available, "source:", e.source, "modelId:", e.modelId);
let t0 = Date.now();
const v1 = await e.embed(texts);
console.log("first embed:", Date.now() - t0, "ms | dims:", JSON.stringify(v1.map((v) => (v ? v.length : null))));
t0 = Date.now();
const v2 = await e.embed(texts);
const ms = Date.now() - t0;
console.log("cached embed:", ms, "ms | identical:", JSON.stringify(v1[0]) === JSON.stringify(v2[0]), "| dedup:", JSON.stringify(v1[0]) === JSON.stringify(v1[2]));
console.log(ms < 150 ? "CACHE OK" : "CACHE FAIL");

// --- cache survives a new embedder instance (persistent) ---
const e1b = await createEmbedder();
t0 = Date.now();
await e1b.embed(texts);
console.log("re-instance embed:", Date.now() - t0, "ms");

// --- api mode with failing provider must fall back to local ---
kvSet("embedBackend", "api");
kvSet("backend", "openai");
kvSet("embedModel", "text-embedding-3-small");
const e2 = await createEmbedder({ onProgress: (d, t, n) => console.log("  progress:", d + "/" + t, n || "") });
console.log("API-FALLBACK available:", e2.available, "modelId:", e2.modelId);
const fresh = `gamma ${uniq} totally new text that was never embedded before`;
t0 = Date.now();
const v3 = await e2.embed([fresh]);
console.log("api->local fallback:", Date.now() - t0, "ms | source:", e2.source, "| dim:", v3[0] ? v3[0].length : null, "| ok:", !!v3[0]);

// --- cleanup: restore local defaults ---
kvSet("embedBackend", "local");
kvSet("backend", "local");
kvSet("embedModel", "");
const rows = db.all("SELECT COUNT(*) AS n FROM embed_cache")[0].n;
console.log("CACHE ROWS:", rows);
process.exit(0);
