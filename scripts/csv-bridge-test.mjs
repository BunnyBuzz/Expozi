// End-to-end check of the screening CSV export path: calls the exact IPC the
// CSV button uses (expozi:export-report with format "csv"), accepts the native
// save dialog, then byte-compares the written file against the payload.
// Usage: node scripts/csv-bridge-test.mjs [port]
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { chromium } from "playwright";

const PORT = Number(process.argv[2] || 9343);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = (msg) => {
  console.log("FAIL —", msg);
  process.exit(1);
};

// Same shape screeningCsv() produces: BOM, header, one row with a quoted note.
const payload = {
  format: "csv",
  csv: '\uFEFFDecision,Note,Title,Authors,Year,Journal,Citations,Study type,Quality,Retracted,DOI,URL\r\ninclude,"Keep: ""strong"", RCT\nsecond line","Effects of ""exercise"", dose-response","Ada Lovelace, Alan Turing",2025,Journal of Testing,12,Meta-analysis,83.2,,10.1000/xyz,https://example.org/a\r\n',
  title: "Screening — CSV bridge test",
  suggestedName: "expozi-csv-bridge-test",
  meta: "Expozi · Systematic review — screening",
};

// Avoid an overwrite-confirm prompt on the save dialog.
const defaultPath = path.join(os.homedir(), "Downloads", "expozi-csv-bridge-test.csv");
try {
  fs.rmSync(defaultPath, { force: true });
} catch {
  /* noop */
}

const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
const pages = browser.contexts().map((c) => c.pages()).flat();
const page = pages.find((p) => /index\.html|localhost:1420/.test(p.url())) || pages[0];
if (!page) fail("no page");

const pending = page.evaluate((p) => window.expozi.exportReport(p), payload).then(
  (v) => ({ v }),
  (e) => ({ e }),
);

const accept = () => {
  try {
    execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/accept-save-dialog.ps1"], {
      stdio: "ignore",
    });
  } catch {
    /* the dialog may not be up yet — retried below */
  }
};

let res = null;
for (let i = 0; i < 6 && !res; i++) {
  await sleep(i === 0 ? 1500 : 2500);
  accept();
  res = await Promise.race([pending, sleep(150).then(() => null)]);
}
if (!res) res = await pending;

if (res.e) fail("invoke error: " + String(res.e));
const out = res.v || {};
console.log("result:", JSON.stringify(out));
if (!out.saved || !out.path) fail("export did not report saved");
if (!/\.csv$/i.test(out.path)) fail("saved path is not .csv: " + out.path);

const got = fs.readFileSync(out.path, "utf8");
if (got !== payload.csv) {
  fail(`bytes differ — got ${got.length} chars, expected ${payload.csv.length}`);
}
fs.rmSync(out.path, { force: true });
console.log(`PASS — CSV written via the real dialog and byte-identical (${got.length} chars); test file removed: ${out.path}`);
await browser.close();
process.exit(0);
