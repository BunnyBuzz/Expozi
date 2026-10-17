// Live probe of the tiered reader (reader v2) — run in Electron:
//   npx electron scripts/readers-test.cjs
// Reads a mix of real source URLs (static article, JS-only PubMed, publisher
// pages, a PDF) and prints which tier served each one, or the failure chain.
const { app } = require("electron");
app.on("window-all-closed", () => {});

const { readMany, readerAvailability } = require("../electron/rag/readers.cjs");
const { destroy } = require("../electron/rag/browser.cjs");

const URLS = [
  "https://pmc.ncbi.nlm.nih.gov/articles/PMC10945168/",
  "https://pubmed.ncbi.nlm.nih.gov/39533312/",
  "https://www.frontiersin.org/journals/nutrition/articles/10.3389/fnut.2025.1664811/full",
  "https://dom-pubs.onlinelibrary.wiley.com/doi/full/10.1111/dom.16092",
  "https://www.thelancet.com/pdfs/journals/eclinm/PIIS2589-5370(24)00098-1.pdf",
];

app.whenReady().then(async () => {
  console.log("availability:", JSON.stringify(await readerAvailability()));
  const t0 = Date.now();
  const results = await readMany(URLS, 3, {});
  URLS.forEach((u, i) => {
    const r = results[i] || {};
    const chars = r.text ? r.text.length : 0;
    console.log(`\n- ${r.via || "FAILED"} ${chars} chars`);
    console.log(`  ${u}`);
    if (!r.via && r.reason) console.log(`  reason: ${r.reason}`);
    if (r.text) console.log(`  head: ${r.text.slice(0, 110).replace(/\s+/g, " ")}`);
  });
  console.log(`\ntotal ${Date.now() - t0}ms`);
  destroy();
  app.exit(0);
});
