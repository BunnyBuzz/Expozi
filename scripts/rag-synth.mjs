import { createRequire } from "module";
import os from "os";
import path from "path";

const require = createRequire(import.meta.url);
const { loadModelFile, promptStream } = require("../electron/rag/llm.cjs");

const appData = path.join(os.homedir(), "AppData", "Roaming", "expozi");
const chat = path.join(appData, "rag", "models", "qwen2.5-3b-instruct-q4_k_m.gguf");
await loadModelFile(chat);

const run = async (name, content, maxTokens = 200) => {
  const t0 = Date.now();
  const text = await promptStream([{ role: "user", content }], { maxTokens, temperature: 0.3 });
  console.log(`--- ${name} (${Date.now() - t0}ms) ---`);
  console.log(JSON.stringify(text.slice(0, 500)));
};

await run(
  "short-noctx",
  "In one sentence: do daytime naps improve alertness? Start directly with the answer.",
);
await run(
  "short-ctx",
  "Answer ONLY from the evidence. Cite like [1].\n\nQuestion: do naps help?\n\nEvidence:\n[1] Daytime naps improve procedural motor memory (Tucker et al. 2006).",
);
process.exit(0);
