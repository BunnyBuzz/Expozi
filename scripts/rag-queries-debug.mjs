// See exactly what the local model plans/searches for a question.
import { createRequire } from "module";
import os from "os";
import path from "path";

const require = createRequire(import.meta.url);
const rag = require("../electron/rag/index.cjs");

const appData = path.join(os.homedir(), "AppData", "Roaming", "expozi");
const fakeApp = { getPath: (n) => (n === "userData" ? appData : os.tmpdir()) };

const Q = process.argv[2] || "How does intermittent fasting affect metabolic markers?";

await rag.initRag(fakeApp);
const { promptStream } = require("../electron/rag/llm.cjs");
const { planQueries, genPerspectives, genQuestions, cardsFromDocs } = require("../electron/rag/plan.cjs");
const { searchQuery, interleaveByProvenance } = require("../electron/rag/sources/index.cjs");

const t0 = Date.now();
const ts = () => `[${((Date.now() - t0) / 1000).toFixed(1)}s]`;
const promptFn = (messages, mt, tk) => promptStream(messages, { onToken: tk, maxTokens: mt });

console.log(ts(), "QUESTION:", Q);

const grounding = interleaveByProvenance(await searchQuery(Q, {}, { perSource: 5, web: 0 }));
console.log(ts(), `scan → ${grounding.length} docs`);
grounding.slice(0, 6).forEach((d, i) => console.log(`   [${d.provenance}] ${String(d.title).slice(0, 80)}`));
const cards = cardsFromDocs(grounding, { chars: 200, limit: 6 });

const planned = await planQueries(promptFn, Q, cards, 4);
console.log(ts(), "PLAN:", JSON.stringify(planned, null, 1));

const perspectives = await genPerspectives(promptFn, Q, 2);
console.log(ts(), "PERSPECTIVES:", JSON.stringify(perspectives, null, 1));

const questions = await genQuestions(promptFn, Q, perspectives.length ? perspectives : ["General fact writer"], [], cards, 1);
console.log(ts(), "QUESTIONS:", JSON.stringify(questions, null, 1));

const all = [Q, ...planned, ...questions];
console.log("\n=== what each search returns (PubMed/arXiv) ===");
for (const q of all) {
  const docs = interleaveByProvenance(await searchQuery(q, {}, { perSource: 5, web: 0 }));
  console.log(`\nQ: ${q}`);
  console.log(`   → ${docs.length} docs`);
  docs.slice(0, 3).forEach((d) => console.log(`     [${d.provenance}] ${String(d.title).slice(0, 82)}`));
}
process.exit(0);
