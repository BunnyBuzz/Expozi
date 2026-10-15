// Verifies lazy model loading: app boot must NOT load the chat model; the
// first prompt/research loads it on demand. Usage: node scripts/rag-lazy-test.mjs
import { createRequire } from "module";
import os from "os";
import path from "path";

const require = createRequire(import.meta.url);
const rag = require("../electron/rag/index.cjs");

const appData = path.join(os.homedir(), "AppData", "Roaming", "expozi");
const fakeApp = { getPath: (n) => (n === "userData" ? appData : os.tmpdir()) };
const mb = () => Math.round(process.memoryUsage().rss / 1048576);
const t0 = Date.now();
const ts = () => `[${((Date.now() - t0) / 1000).toFixed(1)}s]`;

await rag.initRag(fakeApp);
const s0 = rag.getStatus();
console.log(ts(), "BOOT STATUS:", s0.llm, "/ embedding:", s0.embedding, "rss=", mb(), "MB");
if (s0.llm === "ready") {
  console.log("FAIL: chat model was loaded at boot");
  process.exit(1);
}
if (s0.llm !== "available") {
  console.log("NOTE: no chat model file found on this machine — skipping first-use load test");
  process.exit(0);
}

const transitions = [];
const send = (ch, data) => {
  if (ch === "rag:status") transitions.push(data.llm);
};
console.log(ts(), "PROMPT (first use should load the model)…");
const text = await rag.runPrompt({
  messages: [{ role: "user", content: "Reply with exactly: PONG" }],
  maxTokens: 12,
  send,
  onToken: () => {},
});
console.log(
  ts(),
  "TRANSITIONS:",
  transitions.join(" -> "),
  "| final:",
  rag.getStatus().llm,
  "rss=",
  mb(),
  "MB",
);
console.log(ts(), "ANSWER:", JSON.stringify(String(text).slice(0, 120)));
const ok = transitions.includes("loading") && rag.getStatus().llm === "ready" && /PONG/i.test(String(text));
console.log(ok ? "PASS" : "FAIL");
process.exit(ok ? 0 : 1);
