// Probe the fixed source modules with a natural-language question.
// Run with plain node: `node scripts/rag-src-test.mjs "question"`.
// (The web tier's browser fallback needs Electron — the raw scraper and the
// SearXNG pool still try here, and the parts line reports exactly what ran.
// For the full web tier use: npx electron scripts/web-src-test.cjs)
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const { searchArxiv } = require("../electron/rag/sources/arxiv.cjs");
const { searchPubmed } = require("../electron/rag/sources/pubmed.cjs");
const { searchQueryDetailed, interleaveByProvenance } = require("../electron/rag/sources/index.cjs");

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

const detailed = await searchQueryDetailed(Q, 6);
console.log(
  "\n== parts:",
  detailed.parts
    .map((p) => `${p.name}=${p.status}${p.count != null ? `(${p.count})` : ""}${p.reason ? ` [${String(p.reason).slice(0, 64)}]` : ""}`)
    .join(" · "),
);
console.log(`== searchQueryDetailed merged: ${detailed.docs.length} docs`);
show("interleaved fetch mix (first 12)", interleaveByProvenance(detailed.docs).slice(0, 12));
process.exit(0);
