// Prints the app's RAG status over CDP plus the loaded renderer bundle names —
// used after a restart to confirm models/embedding availability and that the
// latest dist build is the one loaded.
// Usage: node scripts/app-status.mjs [port]
import { chromium } from "playwright";

const PORT = Number(process.argv[2] || 9343);
const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
const pages = browser.contexts().map((c) => c.pages()).flat();
const page = pages.find((p) => /index\.html|localhost:1420/.test(p.url())) || pages[0];
if (!page) {
  console.log("NO PAGE");
  process.exit(1);
}

const status = await page.evaluate(() => window.expozi.rag.getStatus());
const bundle = await page.evaluate(() =>
  performance
    .getEntriesByType("resource")
    .map((e) => e.name)
    .filter((n) => /assets\/index-.*\.js/.test(n))
    .map((n) => n.split("/").pop()),
);
console.log("page:", page.url());
console.log("bundle:", JSON.stringify(bundle));
console.log("status:", JSON.stringify(status, null, 2));
await browser.close();
