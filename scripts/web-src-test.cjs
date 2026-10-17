// Live probe of the real web-search source, tiers included — run in Electron
// (the built-in browser tier needs it):
//   npx electron scripts/web-src-test.cjs ["query"]
// Prints each tier's outcome (which served, why the others failed) and the
// results, so the channel is transparent — never a silent zero.
const { app } = require("electron");
app.on("window-all-closed", () => {});

const { searchWebDetailed } = require("../electron/rag/sources/webSearch.cjs");
const { destroy } = require("../electron/rag/browser.cjs");

app.whenReady().then(async () => {
  const q =
    process.argv.slice(2).join(" ") || "systematic review intermittent fasting metabolic markers";
  console.log("query:", q);
  const t0 = Date.now();
  try {
    const res = await searchWebDetailed(q, 8);
    console.log(`\nparts (${Date.now() - t0}ms):`);
    for (const p of res.parts) {
      console.log(
        `  ${p.name}: ${p.status}${p.count != null ? ` ${p.count}` : ""}${p.reason ? ` — ${p.reason}` : ""}`,
      );
    }
    console.log(`\ndocs: ${res.docs.length}`);
    res.docs.forEach((d, i) => {
      console.log(`\n${i + 1}. ${d.title}`);
      console.log(`   ${d.url}`);
      console.log(`   [${d.journal}] ${d.abstract.slice(0, 140)}`);
    });
  } catch (e) {
    console.log("FAILED:", (e && e.message) || e);
  }

  // Fan-out integration: the real searchQueryDetailed (PubMed + arXiv + web),
  // with the same dedupe + part merging the pipeline uses.
  try {
    const { searchQueryDetailed } = require("../electron/rag/sources/index.cjs");
    console.log("\n--- fan-out: searchQueryDetailed ---");
    const t1 = Date.now();
    const r = await searchQueryDetailed(q, 6);
    console.log(`merged: ${r.docs.length} docs in ${Date.now() - t1}ms`);
    console.log(
      "parts:",
      r.parts
        .map((p) => `${p.name}=${p.status}${p.count != null ? `(${p.count})` : ""}${p.reason ? ` [${String(p.reason).slice(0, 56)}]` : ""}`)
        .join(" · "),
    );
    const byProv = {};
    for (const d of r.docs) byProv[d.provenance] = (byProv[d.provenance] || 0) + 1;
    console.log("provenance mix:", JSON.stringify(byProv));
  } catch (e) {
    console.log("fan-out FAILED:", (e && e.message) || e);
  }
  destroy();
  app.exit(0);
});
