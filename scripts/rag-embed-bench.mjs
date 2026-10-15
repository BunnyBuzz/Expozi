import os from "os";
import path from "path";

const { getLlama } = await import("node-llama-cpp");

const modelPath = path.join(
  os.homedir(),
  "AppData",
  "Roaming",
  "expozi",
  "rag",
  "models",
  "Qwen3-Embedding-0.6B-Q8_0.gguf",
);
const text =
  "Intermittent fasting (IF) has gained popularity as a weight-loss strategy. " +
  "This review examines metabolic markers including insulin sensitivity, fasting glucose, HbA1c, " +
  "and lipid profiles across randomized controlled trials of time-restricted eating and alternate-day fasting. " +
  " ".repeat(1) +
  "Effects appear modest beyond caloric restriction, with adherence declining over time. ".repeat(30);

console.log("cores:", os.cpus().length, "| text chars:", text.length);

const llama = await getLlama({ gpu: false });
const model = await llama.loadModel({ modelPath, embeddingContext: true });
console.log("model loaded");

const configs = [
  { contextSize: 2048, threads: undefined, label: "ctx2048 threads:default" },
  { contextSize: 2048, threads: 0, label: "ctx2048 threads:0(max)" },
  { contextSize: 2048, threads: 4, label: "ctx2048 threads:4" },
  { contextSize: 1024, threads: 0, label: "ctx1024 threads:0(max)" },
  { contextSize: 512, threads: 0, label: "ctx512 threads:0(max)" },
];

for (const cfg of configs) {
  const ctx = await model.createEmbeddingContext({
    contextSize: cfg.contextSize,
    ...(cfg.threads !== undefined ? { threads: cfg.threads } : {}),
    ignoreMemorySafetyChecks: true,
  });
  // warmup
  await ctx.getEmbeddingFor("warmup").catch(() => {});
  const t0 = Date.now();
  const n = 5;
  for (let i = 0; i < n; i++) await ctx.getEmbeddingFor(text);
  const ms = (Date.now() - t0) / n;
  console.log(`${cfg.label}: ${ms.toFixed(0)} ms/embed`);
  await ctx.dispose();
}
process.exit(0);
