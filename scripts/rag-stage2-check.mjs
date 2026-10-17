// Stage 2 UI check: report run -> artifact card -> right-side viewer -> export.
// Exercises the real native save dialog (accepted via SendKeys) and verifies
// the written files in the user's Downloads folder.
// Usage: node scripts/rag-stage2-check.mjs [port]
import fs from "fs";
import os from "os";
import path from "path";
import { execSync } from "child_process";
import { chromium } from "playwright";

const PORT = Number(process.argv[2] || 9343);
const QUERY = "How does intermittent fasting affect metabolic markers?";
const DOWNLOADS = path.join(os.homedir(), "Downloads");
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
  page.screenshot({ path: `scripts/shots/${n}.png`, timeout: 20000 }).catch(() => console.log("(shot skipped:", n, ")"));

// --- use the local backend for this run (hermetic, no API dependency) -------
await page.evaluate(() => {
  localStorage.setItem(
    "expozi-settings",
    JSON.stringify({
      model: "Smart",
      workflow: "report",
      backend: "local",
      apiModel: "",
      baseURL: "",
      embedBackend: "local",
      embedModel: "",
      depth: "standard",
    }),
  );
});
await page.reload();
await page.waitForTimeout(2500);

// enter app if landing is showing
const localBtn = page.getByTitle("Use Expozi with a local model — no account needed");
if (await localBtn.count()) {
  await localBtn.first().click();
  await page.waitForTimeout(1200);
}
const newBtn = page.getByRole("button", { name: "New", exact: true });
if (await newBtn.count()) {
  await newBtn.first().click();
  await page.waitForTimeout(800);
}

// --- select Report mode via the workflow dropdown ---------------------------
const modeBtn = page.locator("button", { hasText: /Research agent|Report|Systematic review/ }).first();
await modeBtn.click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: "Report", exact: true }).first().click();
await page.waitForTimeout(400);
console.log("mode set: Report");

// --- submit -----------------------------------------------------------------
const ta = page.locator("textarea").first();
await ta.click();
await ta.fill(QUERY);
await ta.press("Enter");
console.log("submitted:", QUERY);

// --- wait for the run to finish --------------------------------------------
const t0 = Date.now();
let finished = null;
let lastStage = "";
while (Date.now() - t0 < 25 * 60 * 1000) {
  await page.waitForTimeout(5000);
  const info = await page.evaluate(() => {
    const text = document.body.innerText;
    const cited = (text.match(/View (\d+) cited sources/) || [])[1] || null;
    const failed = /Research failed:/.test(text);
    const noAnswer = /No answer was generated\./.test(text);
    const stages = [...text.matchAll(/(Loading the local model|Scanning the topic|Planning the searches|Searching \d+ queries|Reading \d+ sources|Writing section|Assembling the report|Writing the report|Writing the answer|Indexing the sources|Selecting the evidence)[^\n]*/g)].map((m) => m[0]);
    return { cited, failed, noAnswer, stage: stages[stages.length - 1] || "" };
  });
  if (info.stage && info.stage !== lastStage) {
    lastStage = info.stage;
    console.log(`+${Math.round((Date.now() - t0) / 1000)}s ${info.stage}`);
  }
  if (info.failed) {
    finished = "failed";
    break;
  }
  if (info.cited) {
    // wait for streaming to settle
    await page.waitForTimeout(6000);
    finished = "ok";
    break;
  }
  if (info.noAnswer && Date.now() - t0 > 60000) {
    finished = "empty";
    break;
  }
}
console.log("run finished:", finished);
if (finished !== "ok") {
  await shot("stage2-00-failed");
  console.log(await page.evaluate(() => document.body.innerText.slice(0, 600)));
  await browser.close();
  process.exit(0);
}

// --- artifact card (Elicit style) ------------------------------------------
const cardSub = page.getByText(/Report · V\d+/, { exact: false }).first();
await cardSub.waitFor({ timeout: 10000 }).catch(() => {});
await page.waitForTimeout(800);
await shot("stage2-01-card");

// hover the card so the action buttons appear, then open the viewer
try {
  await cardSub.hover({ timeout: 5000 });
  await page.waitForTimeout(500);
  await shot("stage2-02-card-hover");
} catch {
  console.log("(card hover skipped)");
}
await cardSub.click({ timeout: 5000 }).catch(() => console.log("(card click failed)"));
await page.waitForTimeout(1000);
await shot("stage2-03-panel");

// --- export PDF through the native dialog ----------------------------------
const runPs = (file) => {
  try {
    return execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${path.join("scripts", file)}"`, { encoding: "utf8" }).trim();
  } catch (e) {
    return `PS error: ${String(e).slice(0, 200)}`;
  }
};
const listNew = (since, ext) => {
  try {
    return fs
      .readdirSync(DOWNLOADS)
      .filter((f) => f.toLowerCase().endsWith(ext) && fs.statSync(path.join(DOWNLOADS, f)).mtimeMs >= since - 3000);
  } catch {
    return [];
  }
};

const clickExport = async (title) => {
  const n = await page.evaluate((t) => {
    const btns = [...document.querySelectorAll(`button[title="${t}"]`)];
    if (!btns.length) return 0;
    btns[btns.length - 1].click();
    return btns.length;
  }, title);
  return n;
};

console.log("\n=== export PDF ===");
let since = Date.now();
let clicked = await clickExport("Download PDF");
console.log("pdf buttons clicked:", clicked);
await page.waitForTimeout(2500);
console.log("dialog:", runPs("accept-save-dialog.ps1"));
await page.waitForTimeout(2000);
let pdfs = listNew(since, ".pdf");
console.log("new PDFs in Downloads:", pdfs.join(", ") || "(none)");
await shot("stage2-04-saved-pdf");

console.log("\n=== export Markdown ===");
since = Date.now();
clicked = await clickExport("Download Markdown (.md)");
console.log("md buttons clicked:", clicked);
await page.waitForTimeout(2500);
console.log("dialog:", runPs("accept-save-dialog.ps1"));
await page.waitForTimeout(1500);
const mds = listNew(since, ".md");
console.log("new MDs in Downloads:", mds.join(", ") || "(none)");
await shot("stage2-05-saved-md");

// report the panel text for the record
const panelText = await page.evaluate(() => document.body.innerText.slice(0, 900));
console.log("\n--- page head ---\n" + panelText);
await browser.close();
process.exit(0);
