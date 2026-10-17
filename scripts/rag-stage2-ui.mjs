// Continues after the report run: card -> panel -> export PDF/MD.
import fs from "fs";
import os from "os";
import path from "path";
import { execSync } from "child_process";
import { chromium } from "playwright";

const PORT = Number(process.argv[2] || 9343);
const DOWNLOADS = path.join(os.homedir(), "Downloads");
fs.mkdirSync("scripts/shots", { recursive: true });

const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
const pages = browser.contexts().map((c) => c.pages()).flat();
const page = pages.find((p) => /index\.html|localhost:1420/.test(p.url())) || pages[0];
if (!page) {
  console.log("NO PAGE");
  process.exit(1);
}
const shot = (n) =>
  page.screenshot({ path: `scripts/shots/${n}.png`, timeout: 20000 }).catch(() => console.log("(shot skipped:", n, ")"));

// wait for the artifact card (answer ready)
let ok = false;
for (let i = 0; i < 36; i++) {
  const info = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      card: /Report · V\d+/.test(text),
      cited: (text.match(/View (\d+) cited sources/) || [])[1] || null,
      failed: /Research failed:/.test(text),
      noAnswer: /No answer was generated\./.test(text),
    };
  });
  if (info.card) {
    ok = true;
    console.log("artifact card present (cited:", info.cited, ")");
    break;
  }
  if (info.failed || info.noAnswer) {
    console.log("run did not produce an answer:", info);
    break;
  }
  await page.waitForTimeout(5000);
}
if (!ok) {
  await shot("stage2-00-not-ready");
  console.log(await page.evaluate(() => document.body.innerText.slice(0, 700)));
  await browser.close();
  process.exit(0);
}

// card + hover
const cardSub = page.getByText(/Report · V\d+/, { exact: false }).first();
await cardSub.waitFor({ timeout: 10000 }).catch(() => {});
await page.waitForTimeout(800);
await shot("stage2-01-card");
try {
  await cardSub.hover({ timeout: 5000 });
  await page.waitForTimeout(600);
  await shot("stage2-02-card-hover");
} catch {
  console.log("(card hover skipped)");
}

// open panel
await cardSub.click({ timeout: 5000 }).catch(() => console.log("(card click failed)"));
await page.waitForTimeout(1200);
await shot("stage2-03-panel");

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
console.log("pdf buttons clicked:", await clickExport("Download PDF"));
await page.waitForTimeout(2500);
console.log("dialog:", runPs("accept-save-dialog.ps1"));
await page.waitForTimeout(2000);
const pdfs = listNew(since, ".pdf");
console.log("new PDFs in Downloads:", pdfs.join(", ") || "(none)");
await shot("stage2-04-saved-pdf");

console.log("\n=== export Markdown ===");
since = Date.now();
console.log("md buttons clicked:", await clickExport("Download Markdown (.md)"));
await page.waitForTimeout(2500);
console.log("dialog:", runPs("accept-save-dialog.ps1"));
await page.waitForTimeout(1500);
const mds = listNew(since, ".md");
console.log("new MDs in Downloads:", mds.join(", ") || "(none)");
await shot("stage2-05-saved-md");

const status = await page.evaluate(() => {
  const m = document.body.innerText.match(/(Exporting [^\n]*|Saved to [^\n]*|Export failed[^\n]*|Export canceled)/);
  return m ? m[1] : null;
});
console.log("export status line:", status);
await browser.close();
process.exit(0);
