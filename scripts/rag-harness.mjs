import { createRequire } from "module";
import os from "os";
import path from "path";

const require = createRequire(import.meta.url);
const rag = require("../electron/rag/index.cjs");
const { all } = require("../electron/rag/db.cjs");

const appData = path.join(os.homedir(), "AppData", "Roaming", "expozi");
const fakeApp = { getPath: (n) => (n === "userData" ? appData : os.tmpdir()) };

console.log("userData:", appData);
const { state } = await rag.initRag(fakeApp);
console.log("STATUS AFTER INIT:", JSON.stringify({ llm: state.llm, modelFile: state.modelFile, error: state.error }));

const tables = all("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").map((r) => r.name);
console.log("TABLES:", tables.join(","));

if (state.llm === "missing") {
  console.log("Downloading model (this takes a while)...");
  let last = 0;
  await rag.startDownload((ch, p) => {
    const pct = p.total ? (p.received / p.total) * 100 : 0;
    if (pct - last >= 5 || pct >= 100) {
      last = pct;
      console.log(`  ${(p.received / 1048576).toFixed(0)} / ${(p.total / 1048576).toFixed(0)} MB (${pct.toFixed(1)}%)`);
    }
  });
  console.log("STATUS AFTER DOWNLOAD:", rag.getStatus().llm);
}

if (rag.getStatus().llm !== "ready") {
  console.log("NOT READY:", JSON.stringify(rag.getStatus()));
  process.exit(1);
}

console.log("Running smoke prompt...");
let out = "";
const text = await rag.runPrompt({
  messages: [{ role: "user", content: "Reply with exactly: OK" }],
  maxTokens: 32,
  onToken: (t) => {
    out += t;
  },
});
console.log("SMOKE OUTPUT:", JSON.stringify(text));
console.log("SMOKE:", /OK/.test(text) ? "ok" : "FAIL");
process.exit(/OK/.test(text) ? 0 : 1);
