// Offline test of the v2 pipeline logic: stubbed search + fetch + promptFn.
// Verifies grounded planning, perspectives, questions, filtering, outline,
// sectioned writing, citation renumbering and references.
//
// Usage: node scripts/rag-v2-test.mjs
import { createRequire } from "module";
import fs from "fs";
import os from "os";
import path from "path";

const require = createRequire(import.meta.url);

// --- stub the network-facing modules before the pipeline requires them -------
const fakeDocs = Array.from({ length: 8 }, (_, i) => ({
  id: `https://example.org/paper-${i}`,
  url: `https://example.org/paper-${i}`,
  title: `Study ${i} on intermittent fasting and metabolic markers`,
  abstract: `We examined fasting windows and glucose control in cohort ${i}. `.repeat(3),
  authors: [`Author ${i}`, "Second A"],
  year: 2018 + i,
  journal: "Test Journal",
  doi: null,
  citations: 10 + i,
  provenance: "arxiv",
}));

function stubModule(relPath, exports) {
  const p = require.resolve(relPath);
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
}
stubModule("../electron/rag/sources/index.cjs", {
  searchAll: async () => fakeDocs,
  searchQuery: async () => fakeDocs,
  searchMany: async () => fakeDocs,
  interleaveByProvenance: (docs) => docs,
  normUrl: (u) => String(u),
});
stubModule("../electron/rag/fetch.cjs", {
  fetchMany: async (urls) =>
    urls.map(
      (_, i) =>
        Array.from(
          { length: 140 },
          (_, k) => `Sentence ${k} about fasting glucose insulin sensitivity and metabolic markers from source ${i}.`,
        ).join(" "),
    ),
  looksBlocked: () => false,
});

// --- real DB state, but in a throwaway file ---------------------------------
const db = require("../electron/rag/db.cjs");
const tmpDb = path.join(os.tmpdir(), `expozi-v2-test-${Date.now()}.sqlite`);
await db.openDb(tmpDb);

const { runResearch } = require("../electron/rag/pipeline.cjs");

// --- scripted promptFn -------------------------------------------------------
let rubricCount = 0;
const promptFn = async (messages, maxTokens, onToken) => {
  const content = messages[0]?.content || "";
  let out = "";
  if (content.includes("search queries to research this task")) {
    out = JSON.stringify([
      "fasting windows glucose metabolism trials",
      "intermittent fasting insulin sensitivity systematic review",
      "time-restricted eating metabolic risk markers",
      "fasting inflammation markers randomized",
    ]);
  } else if (content.includes("researcher perspectives")) {
    out = "Clinical nutritionist: focuses on patient outcomes and diets.\nMethodologist: focuses on trial quality and bias.";
  } else if (content.includes("research question(s) per perspective")) {
    out = JSON.stringify([
      "What effects do fasting windows have on glucose metabolism?",
      "How strong is the randomized evidence for insulin sensitivity gains?",
    ]);
  } else if (content.includes("Score each passage")) {
    const m = content.match(/exactly (\d+) numbers/);
    rubricCount = m ? Number(m[1]) : 0;
    out = `{"scores":[${Array.from({ length: rubricCount }, (_, i) => (i % 4 === 0 ? 3 : 2)).join(",")}]}`;
  } else if (content.includes("Write an outline for a research report")) {
    out =
      "# Intermittent fasting and metabolic health\n" +
      "## Metabolic effects of fasting windows\n### Glucose and insulin\n### Lipids\n" +
      "## Strength of the evidence\n" +
      "## Safety and adherence\n";
  } else if (content.includes("Improve this report outline")) {
    out =
      "# Intermittent fasting and metabolic health\n" +
      "## Effects on glucose and insulin\n### Fasting windows\n### Insulin sensitivity\n" +
      "## Markers of inflammation and lipids\n" +
      "## Evidence quality and limitations\n";
  } else if (content.includes("Section to write")) {
    out = "Fasting windows reduced fasting glucose in several cohorts [1]. Insulin sensitivity improved [2]. Some trials found no effect [3].";
  } else if (content.includes('"## Abstract"')) {
    out = "## Abstract\nThis report reviews fasting windows and metabolic markers.\n## Conclusion\nFasting windows may help, but evidence is mixed [1].";
  } else if (content.includes("Answer ONLY from the evidence")) {
    out = "Intermittent fasting improved glucose control in most cohorts [1][2], though randomized evidence remains mixed [3].";
  } else {
    out = "unexpected prompt";
  }
  if (onToken) for (const part of out.match(/.{1,24}/g) || []) onToken(part);
  return out;
};

async function runCase(name, mode, depth) {
  const stages = [];
  const tokens = [];
  const result = await runResearch({
    query: "How does intermittent fasting affect metabolic markers?",
    mode,
    promptFn,
    signal: undefined,
    onStage: (stage, message) => stages.push(`${stage}: ${message}`),
    onToken: (t) => tokens.push(t),
    maxTokens: 500,
    keys: {},
    depth,
  });
  const answer = result.answer || "";
  console.log(`\n=== ${name} (${mode}/${depth}) ===`);
  console.log("stages:", stages.length, "| sample:", stages.slice(0, 3).map((s) => s.split(":")[0]).join(" > "));
  console.log("sources:", result.sources.length, "| answer chars:", answer.length, "| streamed chunks:", tokens.length);
  if (mode === "report") {
    const hasTitle = answer.startsWith("# ");
    const sections = (answer.match(/^## /gm) || []).length;
    const refs = /## References/.test(answer);
    const dense = (answer.match(/\[(\d+)\]/g) || []).every((m) => Number(m.slice(1, -1)) <= 9);
    console.log("report check — title:", hasTitle, "| h2 sections:", sections, "| references:", refs, "| numbers sane:", dense);
    console.log("head:", JSON.stringify(answer.slice(0, 220)));
  } else if (mode === "agent") {
    console.log("answer head:", JSON.stringify(answer.slice(0, 140)));
  } else {
    console.log("review check — no answer:", answer === "" || result.answer === null);
  }
  return result;
}

await runCase("agent", "agent", "standard");
await runCase("report", "report", "standard");
await runCase("review", "review", "standard");
await runCase("lite agent", "agent", "lite");
await runCase("deep report", "report", "deep");

console.log("\nrubric scored passages:", rubricCount);
try {
  fs.unlinkSync(tmpDb);
} catch {
  /* noop */
}
process.exit(0);
