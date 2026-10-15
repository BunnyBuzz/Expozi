import { createRequire } from "module";
import os from "os";
import path from "path";

const require = createRequire(import.meta.url);
const rag = require("../electron/rag/index.cjs");
const { all } = require("../electron/rag/db.cjs");
const { downloadModelFile } = require("../electron/rag/download.cjs");

const appData = path.join(os.homedir(), "AppData", "Roaming", "expozi");
const fakeApp = { getPath: (n) => (n === "userData" ? appData : os.tmpdir()) };

await rag.initRag(fakeApp);
console.log("STATUS:", JSON.stringify(rag.getStatus(), null, 1).slice(0, 400));

// Ensure embedding model present
if (rag.getStatus().embedding !== "ready") {
  console.log("Downloading embedding model...");
  const fs = await import("fs");
  const modelsDir = path.join(appData, "rag", "models");
  await downloadModelFile("embedding", modelsDir, (p) => {
    process.stdout.write(`\r  ${(p.received / 1048576).toFixed(0)} / ${(p.total / 1048576).toFixed(0)} MB`);
  });
  console.log("\nRefreshing models...");
  const { scanModels } = require("../electron/rag/llm.cjs");
  void scanModels;
  // reload via fresh init state
  const { loadEmbeddingModel } = require("../electron/rag/embed.cjs");
  const files = fs.readdirSync(modelsDir).filter((f) => f.endsWith(".gguf"));
  const emb = files.sort()[0];
  console.log("Loading embedding:", emb);
  await loadEmbeddingModel(path.join(modelsDir, emb));
  console.log("EMBEDDING READY");
}

console.log("Running full pipeline...");
let tokens = 0;
const result = await rag.runResearch({
  query: "do daytime naps improve alertness?",
  mode: "agent",
  maxTokens: 300,
  onStage: (stage, message) => console.log(`[stage:${stage}] ${message}`),
  onToken: () => {
    tokens++;
  },
});
console.log("TOKENS STREAMED:", tokens);
console.log("SOURCES:", result.sources.length);
result.sources.slice(0, 5).forEach((s, i) => console.log(`  [${i + 1}] ${s.title.slice(0, 70)} | ${s.provenance} | ${s.url}`));
console.log("ANSWER:", JSON.stringify((result.answer || "").slice(0, 400)));
const nPass = all("SELECT COUNT(*) AS n FROM passages")[0].n;
console.log("PASSAGES IN DB:", nPass);
process.exit(0);
