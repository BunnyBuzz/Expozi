// A/B harness: run the real pipeline over the same query at several depths
// and report timing / LLM-call / source / citation metrics per stage.
// Usage: node scripts/rag-ab.mjs ["query"] [mode] [depth1,depth2,...]
import { createRequire } from "module";
import os from "os";
import path from "path";

const require = createRequire(import.meta.url);
const rag = require("../electron/rag/index.cjs");

const appData = path.join(os.homedir(), "AppData", "Roaming", "expozi");
const fakeApp = { getPath: (n) => (n === "userData" ? appData : os.tmpdir()) };

const QUERY = process.argv[2] || "How does intermittent fasting affect metabolic markers?";
const MODE = process.argv[3] || "agent";
const DEPTHS = (process.argv[4] || "lite,standard").split(",").map((s) => s.trim()).filter(Boolean);

await rag.initRag(fakeApp);
const st = rag.getStatus();
console.log(`STATUS: llm=${st.llm} embedding=${st.embedding}`);
console.log(`QUERY: ${QUERY}\nMODE: ${MODE}\nDEPTHS: ${DEPTHS.join(", ")}\n`);

const rows = [];
for (const depth of DEPTHS) {
  rag.setBackend({ depth });
  const t0 = Date.now();
  const stages = [];
  const counts = { calls: 0, promptChars: 0 };
  let stageStart = t0;
  let lastStage = "start";
  const stageMs = {};
  let tokens = 0;

  const realRun = rag.runResearch({
    query: QUERY,
    mode: MODE,
    maxTokens: 400,
    onStage: (stage, message) => {
      const now = Date.now();
      stageMs[lastStage] = (stageMs[lastStage] || 0) + (now - stageStart);
      stageStart = now;
      lastStage = stage;
      stages.push(`${stage}: ${message}`);
      console.log(`  [${depth}] [${((now - t0) / 1000).toFixed(1)}s] ${stage} — ${message}`);
    },
    onToken: () => {
      tokens++;
    },
  });

  // Count LLM calls by wrapping the pipeline's promptFn is not reachable from
  // here; approximate via emitted tokens + known stages instead.
  const result = await realRun;
  stageMs[lastStage] = (stageMs[lastStage] || 0) + (Date.now() - stageStart);

  const answer = result.answer || "";
  const citations = (answer.match(/\[\d+\]/g) || []).length;
  const references = (answer.match(/^## References$/m) || []).length;
  const row = {
    depth,
    totalMs: Date.now() - t0,
    stageMs,
    sources: result.sources.length,
    answerChars: answer.length,
    tokens,
    citations,
    hasReferences: !!references,
  };
  rows.push(row);
  console.log(
    `  [${depth}] DONE ${(row.totalMs / 1000).toFixed(1)}s | sources=${row.sources} | chars=${row.answerChars} | tokens≈${row.tokens} | citations=${row.citations}${row.hasReferences ? " | references=yes" : ""}\n`,
  );
}

console.log("=== SUMMARY (json) ===");
console.log(JSON.stringify(rows, null, 2));
process.exit(0);
