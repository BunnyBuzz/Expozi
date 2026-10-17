// Python reader tiers probe (scrapy+selectolax / BeautifulSoup+lxml /
// DrissionPage). Point it at an interpreter that has them:
//   $env:EXPOZI_PYTHON="C:\path\to\python.exe"; npx electron scripts/python-tiers-test.cjs
const { app } = require("electron");
app.on("window-all-closed", () => {});

const { readMany, readerAvailability } = require("../electron/rag/readers.cjs");

const URLS = ["https://pmc.ncbi.nlm.nih.gov/articles/PMC10945168/"];

app.whenReady().then(async () => {
  const avail = await readerAvailability();
  console.log("availability:", JSON.stringify(avail, null, 1));

  for (const tier of ["scrapy", "bs4", "drissionpage"]) {
    const t0 = Date.now();
    const res = await readMany(URLS, 1, { only: [tier] });
    const r = res[0] || {};
    console.log(`\n[${tier}] ${r.via || "FAILED"} ${r.text ? r.text.length : 0} chars in ${Date.now() - t0}ms`);
    if (!r.via) console.log("  reason:", r.reason);
    if (r.text) console.log("  head:", r.text.slice(0, 130).replace(/\s+/g, " "));
  }

  app.exit(0);
});
