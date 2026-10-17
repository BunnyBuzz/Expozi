// Stage 2.5a UI check — sources v2 in the real app:
//   1. Settings shows the new key list (no Semantic Scholar / no Exa search)
//   2. a live lite agent run reaches the search stage with the web tier in the
//      Tools trace (web:builtin-browser) and the merged source mix
//   3. settled view + cited-sources list (web entries labelled "Web · host")
// The user's real settings are snapshotted first and restored at the end.
// Usage: node scripts/rag-stage25a-check.mjs [port]
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

// 0) snapshot the user's real settings so they can be restored exactly
const saved = await page.evaluate(() => localStorage.getItem("expozi-settings"));
console.log("settings snapshot:", saved);

// 1) Settings modal: dead key entries must be gone
await page.keyboard.press("Control+k");
await page.waitForTimeout(1000);
await page.locator("button", { hasText: "Go to Settings" }).click();
await page.waitForTimeout(1500);
const modal = await page.evaluate(() => {
  const text = document.body.innerText;
  return {
    hasSemanticScholar: /Semantic Scholar/i.test(text),
    hasExaSearch: /Exa search/i.test(text),
    keyInputs: document.querySelectorAll('input[type="password"]').length,
  };
});
console.log("settings modal:", JSON.stringify(modal));
await shot("stage25a-01-settings");
await page.keyboard.press("Escape");
await page.waitForTimeout(700);

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
      webTier: /web:(builtin-browser|duckduckgo|searxng)/.test(text),
      traceLine: (text.match(/search_papers[^\n]*/) || [])[0] || "",
      cited: (text.match(/View (\d+) cited sources/) || [])[1] || null,
      webLabel: /Web · /.test(text),
      failed: /Research failed:/.test(text),
      stage: (text.match(/(Loading the local model|Searching \d+ queries|Reading \d+ sources|Indexing the sources|Selecting the evidence|Writing the answer|Expanding the question)[^\n]*/) || [])[1] || "",
    };
  });

const t0 = Date.now();
let last = "";
let traceShot = false;
let done = false;
while (Date.now() - t0 < 16 * 60 * 1000) {
  await page.waitForTimeout(4000);
  const s = Math.round((Date.now() - t0) / 1000);
  const info = await probe();
  const key = `${info.stage}|${info.webTier}|${info.cited}`;
  if (key !== last) {
    last = key;
    console.log(`+${s}s stage:"${info.stage}" webTier:${info.webTier} cited:${info.cited} webLabel:${info.webLabel}`);
    if (info.traceLine) console.log(`     trace: ${info.traceLine.slice(0, 240)}`);
  }
  if (info.webTier && !traceShot) {
    traceShot = true;
    console.log(`+${s}s TRACE HAS WEB TIER`);
    await shot("stage25a-02-trace-web");
    if (process.env.STOP_AFTER_TRACE) {
      console.log("STOP_AFTER_TRACE set — stopping here");
      break;
    }
  }
  if (info.failed) {
    console.log("run failed");
    done = true;
    break;
  }
  if (info.cited) {
    console.log(`+${s}s settled, cited=${info.cited}`);
    done = true;
    break;
  }
}
console.log("finished:", done, "traceShot:", traceShot);

// 3) settled view + cited-sources list
if (done) {
  await page.waitForTimeout(1500);
  await shot("stage25a-03-settled");
  const info = await probe();
  console.log("final:", JSON.stringify({ cited: info.cited, webLabel: info.webLabel }));
  const btn = page.locator("button", { hasText: /View \d+ cited sources/ }).first();
  if (await btn.count()) {
    await btn.click();
    await page.waitForTimeout(1000);
    await shot("stage25a-04-sources");
    const labels = await page.evaluate(() => (document.body.innerText.match(/Web · [^\n]+/g) || []).slice(0, 5));
    console.log("web-labelled sources:", JSON.stringify(labels));
  }
}

// 4) stop if still running, restore the user's settings, reload
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
