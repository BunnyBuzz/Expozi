// Probe the fixed source modules with a natural-language question.
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { searchArxiv } = require("../electron/rag/sources/arxiv.cjs");
const { searchPubmed } = require("../electron/rag/sources/pubmed.cjs");
const { searchSemanticScholar } = require("../electron/rag/sources/semanticScholar.cjs");
const { searchWeb } = require("../electron/rag/sources/searxng.cjs");
const { searchQuery, interleaveByProvenance } = require("../electron/rag/sources/index.cjs");

const Q = process.argv[2] || "How does intermittent fasting affect metabolic markers?";

function show(name, r) {
  console.log(`\n== ${name} — ${r.length} results`);
  r.slice(0, 6).forEach((d, i) =>
    console.log(`  ${i + 1}. [${d.provenance}] abs=${(d.abstract || "").length} ${String(d.title).slice(0, 88)} [${d.year ?? "?"}]`),
  );
}

console.log("QUERY:", Q);
show("arxiv (tokenised)", await searchArxiv(Q, 8));
show("pubmed (efetch abstracts)", await searchPubmed(Q, 8));
show("s2", await searchSemanticScholar(Q, 8));
show("web", await searchWeb(Q, 5));

const merged = await searchQuery(Q, {}, { perSource: 6, web: 4 });
console.log(`\n== searchQuery merged: ${merged.length} docs`);
show("interleaved fetch mix (first 12)", interleaveByProvenance(merged).slice(0, 12));
process.exit(0);
