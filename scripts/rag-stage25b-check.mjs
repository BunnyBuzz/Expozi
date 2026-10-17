// Stage 2.5b UI check — reader v2 in the real app:
//   1. Settings "Crawling" block: built-in browser ready; crawl4ai and
//      system Chrome/Edge reported honestly (installed or why not)
//   2. a live lite agent run shows the read_pages tier breakdown in the Tools
//      trace (which reader served how many sources), then the run is stopped
// Settings are snapshotted first and restored exactly at the end.
// Usage: node scripts/rag-stage25b-check.mjs [port]
import fs from "fs";
import { chromium } from "playwright";

const PORT = Number(process.argv[2] || 9343);
const QUERY = "How does intermittent fasting affect metabolic markers?";
fs.mkdirSync("scripts/shots", { recursive: true });

const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
const pages = browser.contexts().map((c) => c.pages()).flat();
const page = pages.find((p) => /index\.html|localhost:1420/.test(p.url())) || pages[0];
if (!page) {
  console.log("NO PAGE");
  process.exit(1);
}
const shot = async (n) => {
  try {
    await page.screenshot({ path: `scripts/shots/${n}.png`, timeout: 30000 });
  } catch {
    console.log("(shot skipped:", n, ")");
  }
};

// 0) snapshot the user's real settings
const saved = await page.evaluate(() => localStorage.getItem("expozi-settings"));
console.log("settings snapshot:", saved);

// 1) Settings → Crawling block
await page.keyboard.press("Control+k");
await page.waitForTimeout(1000);
await page.locator("button", { hasText: "Go to Settings" }).click();
let crawlBlock = "";
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(500);
  crawlBlock = await page.evaluate(() => {
    const lines = document.body.innerText.split("\n");
    const i = lines.findIndex((l) => /^CRAWLING$/.test(l.trim()));
    return i >= 0 ? lines.slice(i, i + 12).join("\n") : "";
  });
  if (crawlBlock && !/checking/.test(crawlBlock)) break;
}
console.log("crawling block:\n" + crawlBlock);
await page.evaluate(() => {
  const el = Array.from(document.querySelectorAll("p")).find((p) => p.textContent.trim() === "Crawling");
  if (el) el.scrollIntoView({ block: "center" });
});
await page.waitForTimeout(500);
await shot("stage25b-01-crawling");
await page.keyboard.press("Escape");
await page.waitForTimeout(700);

if (process.env.STOP_AFTER_SETTINGS === "1") {
  await page.evaluate((snap) => {
    if (snap) localStorage.setItem("expozi-settings", snap);
  }, saved);
  console.log("stopped after settings");
  await browser.close();
  process.exit(0);
}

// 2) hermetic lite/local run
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("expozi-settings") || "{}");
  raw.backend = "local";
  raw.apiModel = "";
  raw.baseURL = "";
  raw.embedBackend = "local";
  raw.embedModel = "";
  raw.depth = "lite";
  localStorage.setItem("expozi-settings", JSON.stringify(raw));
});
await page.reload();
await page.waitForTimeout(2500);
const localBtn = page.getByTitle("Use Expozi with a local model — no account needed");
if (await localBtn.count()) {
  await localBtn.first().click();
  await page.waitForTimeout(1000);
}
const newBtn = page.getByRole("button", { name: "New", exact: true });
if (await newBtn.count()) {
  await newBtn.first().click();
  await page.waitForTimeout(600);
}

const ta = page.locator("textarea").first();
await ta.click();
await ta.fill(QUERY);
await ta.press("Enter");
console.log("submitted:", QUERY);

const probe = () =>
  page.evaluate(() => {
    const text = document.body.innerText;
    return {
      searchLine: (text.match(/search_papers[^\n]*/) || [])[0] || "",
      readLine: (text.match(/read \d+\/\d+ sources[^\n]*/) || [])[0] || "",
      failed: /Research failed:/.test(text),
      stage: (text.match(/(Loading the local model|Searching \d+ queries|Reading \d+ sources|Indexing the sources|Writing the answer)[^\n]*/) || [])[1] || "",
    };
  });

const t0 = Date.now();
let last = "";
let captured = false;
while (Date.now() - t0 < 12 * 60 * 1000) {
  await page.waitForTimeout(4000);
  const s = Math.round((Date.now() - t0) / 1000);
  const info = await probe();
  const key = `${info.stage}|${!!info.readLine}`;
  if (key !== last) {
    last = key;
    console.log(`+${s}s stage:"${info.stage}" readLine:${info.readLine ? "yes" : "no"}`);
  }
  if (info.failed) {
    console.log("run failed");
    break;
  }
  if (info.readLine) {
    console.log(`+${s}s READER BREAKDOWN CAPTURED`);
    console.log("search:", info.searchLine.slice(0, 200));
    console.log("read  :", info.readLine);
    await shot("stage25b-02-readers-trace");
    captured = true;
    break;
  }
}
console.log("captured:", captured);

// 3) stop the run, restore settings, reload
await page.evaluate(() => window.expozi?.rag?.stopResearch?.());
await page.waitForTimeout(800);
await page.evaluate((snap) => {
  if (snap) localStorage.setItem("expozi-settings", snap);
}, saved);
await page.reload();
await page.waitForTimeout(1500);
console.log("settings restored:", await page.evaluate(() => localStorage.getItem("expozi-settings")));
await browser.close();
process.exit(0);
