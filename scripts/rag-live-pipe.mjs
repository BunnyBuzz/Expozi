// Headless run of the real pipeline (local model + real network).
// Usage: node scripts/rag-live-pipe.mjs ["query"] [mode] [depth] [maxTokens]
//   mode:  agent | report | review
//   depth: lite | standard | deep
import { createRequire } from "module";
import os from "os";
import path from "path";

const require = createRequire(import.meta.url);
const rag = require("../electron/rag/index.cjs");

const appData = path.join(os.homedir(), "AppData", "Roaming", "expozi");
const fakeApp = { getPath: (n) => (n === "userData" ? appData : os.tmpdir()) };

const QUERY = process.argv[2] || "How do intermittent fasting windows affect metabolic markers?";
const MODE = process.argv[3] || "agent";
const DEPTH = process.argv[4] || "standard";
const MAXTOK = process.argv[5] ? Number(process.argv[5]) : 400;

const t0 = Date.now();
const ts = () => `[${((Date.now() - t0) / 1000).toFixed(1)}s]`;
const mb = () => Math.round(process.memoryUsage().rss / 1048576);

await rag.initRag(fakeApp);
const s = rag.getStatus();
console.log(ts(), "STATUS:", s.llm, "/", s.embedding, "rss=", mb(), "MB");
rag.setBackend({ depth: DEPTH });
console.log(ts(), `RUN mode=${MODE} depth=${DEPTH} maxTokens=${MAXTOK}`);

let tokens = 0;
let lastLog = Date.now();
const result = await rag.runResearch({
  query: QUERY,
  mode: MODE,
  maxTokens: MAXTOK,
  onStage: (stage, message) => {
    console.log(ts(), `[stage:${stage}] ${message}`, "rss=", mb(), "MB");
  },
  onToken: () => {
    tokens++;
    if (tokens % 40 === 0 || Date.now() - lastLog > 45000) {
      lastLog = Date.now();
      console.log(ts(), `tokens=${tokens} rss=${mb()}MB`);
    }
  },
});
const answer = result.answer || "";
console.log(ts(), "DONE tokens=", tokens, "sources=", result.sources.length, "answerChars=", answer.length, "rss=", mb(), "MB");
result.sources.slice(0, 6).forEach((x, i) => console.log(`  [${i + 1}] ${String(x.title).slice(0, 70)} | ${x.provenance}`));
try {
  const db = require("../electron/rag/db.cjs");
  const rows = db.all("SELECT source_type, title FROM sources WHERE session_id=?", [result.sessionId]);
  console.log("ALL STORED SOURCES:", rows.length);
  rows.forEach((r, i) => console.log(`  ${i + 1}. [${r.source_type}] ${String(r.title).slice(0, 85)}`));
} catch {
  /* noop */
}
console.log("ANSWER HEAD:", JSON.stringify(answer.slice(0, 400)));
if (MODE === "report") console.log("ANSWER TAIL:", JSON.stringify(answer.slice(-300)));
process.exit(0);
