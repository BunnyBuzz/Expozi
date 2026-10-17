// Offline check: assemble_report must report honestly what the summary step
// produced (abstract/conclusion present, empty, or failed).
// Usage: node scripts/assemble-detail-check.cjs
require("../electron/tools/writeReport.cjs");
const { run } = require("../electron/tools/registry.cjs");

const input = {
  outlineTitle: "Caffeine and sleep",
  query: "Caffeine and sleep",
  sections: [{ title: "Effects", text: "## Effects\nCaffeine reduced sleep quality [1]." }],
  passageByNo: new Map([[1, { text: "passage one", docKey: "d1" }]]),
  docOfPassage: () => ({ title: "A real paper", url: "https://example.org/a", authors: ["Doe J"], year: 2024 }),
};

const cases = [
  ["both parts", async () => "## Abstract\nShort abstract.\n\n## Conclusion\nMain takeaway."],
  ["throwing", async () => { throw new Error("context window exceeded"); }],
  ["empty out", async () => ""],
  ["only abstract", async () => "## Abstract\nJust an abstract."],
];

(async () => {
  for (const [label, promptFn] of cases) {
    const res = await run("assemble_report", input, { promptFn });
    console.log(`[${label}]`);
    console.log(`  detail: ${res.detail}`);
    console.log(`  answer head: ${JSON.stringify(res.data.answer.split("\n").slice(0, 3))}`);
  }
})();
