// Stage 0 UI check via CDP: exactly three modes (no Chat), no Search toggle,
// submits run the real pipeline (stages stream in the workspace, no demo data).
// Usage: node scripts/rag-stage0-check.mjs [port]
import fs from "fs";
import { chromium } from "playwright";

const PORT = Number(process.argv[2] || 9343);
fs.mkdirSync("scripts/shots", { recursive: true });

const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
const pages = browser.contexts().map((c) => c.pages()).flat();
const page = pages.find((p) => /index\.html|localhost:1420/.test(p.url())) || pages[0];
if (!page) {
  console.log("NO PAGE");
  process.exit(1);
}
await page.waitForTimeout(2500);

const shot = (n) =>
  page.screenshot({ path: `scripts/shots/${n}.png`, timeout: 10000 }).catch(() => console.log("(screenshot skipped:", n, ")"));

// enter the app if the landing screen is showing
const localBtn = page.getByTitle("Use Expozi with a local model — no account needed");
if (await localBtn.count()) {
  await localBtn.first().click();
  await page.waitForTimeout(1500);
  console.log("entered app");
}

// 1) exactly three modes, no Chat
const homeText = await page.evaluate(() => document.body.innerText);
console.log("mode 'Research agent' present:", homeText.includes("Research agent"));
console.log("mode 'Report' present:", homeText.includes("Report"));
console.log("mode 'Systematic review' present:", homeText.includes("Systematic review"));
console.log("'Chat & Discussion' absent:", !homeText.includes("Chat & Discussion"));

// 2) no Search tool toggle anywhere on home
console.log("no 'Search tool ON/OFF' text:", !/Search tool (ON|OFF)|Search tool\b/i.test(homeText));
await shot("stage0-01-home");

// 3) command palette workflows have no chat
await page.keyboard.press("Control+KeyK").catch(() => {});
await page.waitForTimeout(700);
const paletteText = await page.evaluate(() => document.body.innerText);
console.log("palette has no chat workflow:", !/Chat & Discussion/i.test(paletteText));
await shot("stage0-02-palette");
await page.keyboard.press("Escape").catch(() => {});
await page.waitForTimeout(500);

// 4) submit a question -> loading spinner -> workspace with real pipeline stages
const ta = page.locator("textarea").first();
await ta.click();
await ta.fill("Does sleep duration affect cognitive performance in adults?");
await ta.press("Enter");
await page.waitForTimeout(300);
const t1 = await page.evaluate(() => document.body.innerText);
console.log("workspace loading shown:", /Loading workspace|PIPELINE/i.test(t1));

let pipelineSeen = false;
let stageText = "";
const deadline = Date.now() + 120000;
while (Date.now() < deadline) {
  const t = await page.evaluate(() => document.body.innerText);
  if (/PIPELINE|Pipeline/i.test(t)) {
    pipelineSeen = true;
    const m = t.match(/PIPELINE/i);
    const idx = m ? t.indexOf(m[0]) : -1;
    stageText = idx >= 0 ? t.slice(idx, idx + 400).split("\n").filter(Boolean).slice(0, 5).join(" | ") : "";
    break;
  }
  await page.waitForTimeout(2000);
}
console.log("pipeline panel visible:", pipelineSeen);
console.log("first stage lines:", stageText || "(none yet)");
await shot("stage0-03-pipeline");

// 5) no fabricated demo content for our sleep query (no canned 'Rahman' etc.)
const wsText = await page.evaluate(() => document.body.innerText);
console.log("no demo corpus content:", !/Rahman|Sleep Medicine Reviews/.test(wsText));

// 6) abort the run so we don't wait minutes on a local model
try {
  await page.evaluate(async () => await window.expozi.rag.stopResearch());
  console.log("run aborted (expected)");
} catch (e) {
  console.log("abort attempted:", String(e).slice(0, 80));
}
console.log("DONE");
await browser.close();
process.exit(0);
