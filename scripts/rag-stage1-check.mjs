// Stage 1 UI check: full real run with the Tools trace panel.
// Usage: node scripts/rag-stage1-check.mjs [port] [query]
import fs from "fs";
import { chromium } from "playwright";

const PORT = Number(process.argv[2] || 9343);
const QUERY = process.argv[3] || "How does intermittent fasting affect metabolic markers?";
fs.mkdirSync("scripts/shots", { recursive: true });

const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
const pages = browser.contexts().map((c) => c.pages()).flat();
const page = pages.find((p) => /index\.html|localhost:1420/.test(p.url())) || pages[0];
if (!page) {
  console.log("NO PAGE");
  process.exit(1);
}
await page.waitForTimeout(1500);
const shot = (n) =>
  page.screenshot({ path: `scripts/shots/${n}.png`, timeout: 15000 }).catch(() => console.log("(shot skipped:", n, ")"));

// enter app if landing is showing
const localBtn = page.getByTitle("Use Expozi with a local model — no account needed");
if (await localBtn.count()) {
  await localBtn.first().click();
  await page.waitForTimeout(1200);
}
// go home
const newBtn = page.getByRole("button", { name: "New", exact: true });
if (await newBtn.count()) {
  await newBtn.first().click();
  await page.waitForTimeout(900);
}

const ta = page.locator("textarea").first();
await ta.click();
await ta.fill(QUERY);
await ta.press("Enter");
console.log("submitted:", QUERY);

const t0 = Date.now();
let lastRows = -1;
let done = false;
while (Date.now() - t0 < 15 * 60 * 1000) {
  await page.waitForTimeout(4000);
  const info = await page.evaluate(() => {
    const text = document.body.innerText;
    const m = text.match(/TOOLS\n([\s\S]*?)(\n\n[A-Z]{3,}|\nView \d+ cited sources|$)/);
    const block = m ? m[1] : "";
    const rows = block.split("\n").map((s) => s.trim()).filter(Boolean);
    return { rows, hasTools: /TOOLS/.test(text), cited: (text.match(/View (\d+) cited sources/) || [])[1] || null };
  });
  if (info.rows.length !== lastRows) {
    lastRows = info.rows.length;
    console.log(`+${Math.round((Date.now() - t0) / 1000)}s tool rows: ${info.rows.length}${info.cited ? ` | cited: ${info.cited}` : ""}`);
    if (info.rows.length > 0 && info.rows.length <= 5) console.log("   ", info.rows.join("\n    "));
  }
  if (info.cited || /No answer was generated\.|Research failed/.test(await page.evaluate(() => document.body.innerText))) {
    done = !!info.cited;
    break;
  }
}
await shot("stage1-10-tools");

const finalText = await page.evaluate(() => document.body.innerText);
const m = finalText.match(/TOOLS\n([\s\S]*?)(\n\n[A-Z]{3,}|\nNo answer|\nView \d+ cited sources|$)/);
const rows = m ? m[1].split("\n").map((s) => s.trim()).filter(Boolean) : [];
console.log("\n=== final tools panel ===");
rows.forEach((r) => console.log(" ", r));
console.log("finished with sources:", done);
const cited = finalText.match(/View (\d+) cited sources/);
console.log("cited:", cited ? cited[1] : "none");
await browser.close();
process.exit(0);
