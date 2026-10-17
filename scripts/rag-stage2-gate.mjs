// Stage 2 gate check: with the fix in place, the artifact card must NOT exist
// while the run is streaming, and MUST exist once the run settled. Then the
// panel + export are exercised on the settled report.
// Usage: node scripts/rag-stage2-gate.mjs [port]
import fs from "fs";
import os from "os";
import path from "path";
import { execSync } from "child_process";
import { chromium } from "playwright";

const PORT = Number(process.argv[2] || 9343);
const QUERY = "Mindfulness meditation and stress reduction in adults";
const DESKTOP = path.join(os.homedir(), "Desktop");
fs.mkdirSync("scripts/shots", { recursive: true });

const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
const pages = browser.contexts().map((c) => c.pages()).flat();
const page = pages.find((p) => /index\.html|localhost:1420/.test(p.url())) || pages[0];
if (!page) {
  console.log("NO PAGE");
  process.exit(1);
}
const shot = async (n) => {
  for (let i = 0; i < 2; i++) {
    try {
      await page.screenshot({ path: `scripts/shots/${n}.png`, timeout: 30000 });
      return;
    } catch {
      if (i === 1) console.log("(shot skipped:", n, ")");
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
};

// lite depth + local backend for a fast hermetic run, then reload with the new bundle
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
  await page.waitForTimeout(1200);
}
const newBtn = page.getByRole("button", { name: "New", exact: true });
if (await newBtn.count()) {
  await newBtn.first().click();
  await page.waitForTimeout(800);
}

// select Report mode
await page.locator("button", { hasText: /Research agent|Report|Systematic review/ }).first().click();
await page.waitForTimeout(400);
await page.getByRole("button", { name: "Report", exact: true }).first().click();
await page.waitForTimeout(400);
console.log("mode set: Report (depth lite, backend local)");

const ta = page.locator("textarea").first();
await ta.click();
await ta.fill(QUERY);
await ta.press("Enter");
console.log("submitted:", QUERY);

const probe = () =>
  page.evaluate(() => {
    const text = document.body.innerText;
    const card = !!document.querySelector("[data-artifact-card]");
    const body = document.querySelector("[data-answer-body]");
    return {
      card,
      answerChars: body ? body.innerText.trim().length : 0,
      cited: (text.match(/View (\d+) cited sources/) || [])[1] || null,
      failed: /Research failed:/.test(text),
      stage: (text.match(/(Searching \d+ queries|Reading \d+ sources|Indexing the sources|Selecting the evidence|Writing the answer|Expanding the question|Loading the local model)[^\n]*/) || [])[1] || "",
    };
  });

const t0 = Date.now();
const shotsAt = [75, 150, 240, 330];
let shotsLeft = [...shotsAt];
let lastStage = "";
let midEvidence = [];
let finished = null;
while (Date.now() - t0 < 20 * 60 * 1000) {
  await page.waitForTimeout(5000);
  const s = Date.now() - t0;
  const info = await probe();
  if (info.stage && info.stage !== lastStage) {
    lastStage = info.stage;
    console.log(`+${Math.round(s / 1000)}s ${info.stage} | card:${info.card} answerChars:${info.answerChars}${info.cited ? " cited:" + info.cited : ""}`);
  }
  // record the key regression situation: answer streaming, card must be absent
  if (info.answerChars > 0 && !info.cited) midEvidence.push({ s: Math.round(s / 1000), card: info.card, answerChars: info.answerChars });
  while (shotsLeft.length && s > shotsLeft[0] * 1000 + 60000) shotsLeft.shift();
  if (shotsLeft.length && s > shotsLeft[0] * 1000) {
    const idx = shotsAt.indexOf(shotsLeft[0]) + 1;
    console.log(`+${Math.round(s / 1000)}s mid-run shot ${idx} (card:${info.card} answerChars:${info.answerChars})`);
    await shot(`stage2-06-gate-mid${idx}`);
    shotsLeft.shift();
  }
  if (info.failed) {
    finished = "failed";
    break;
  }
  if (info.cited) {
    await page.waitForTimeout(5000);
    finished = "ok";
    break;
  }
}
console.log("run finished:", finished);

const final = await probe();
console.log("final state:", JSON.stringify(final));
console.log(
  "mid-run evidence (answer streaming, card must be false):",
  midEvidence.length ? JSON.stringify(midEvidence.slice(0, 8)) : "(no mid-run answer captures)",
);
const cardEverShownMidRun = midEvidence.some((e) => e.card);
console.log(cardEverShownMidRun ? "GATE FAIL: card visible mid-run" : "GATE OK: no card while streaming");
console.log(final.card ? "GATE OK: card present after settle" : "GATE FAIL: card missing after settle");

if (!final.card) {
  await shot("stage2-06-gate-nocrad");
  console.log(await page.evaluate(() => document.body.innerText.slice(0, 800)));
  await browser.close();
  process.exit(0);
}

await shot("stage2-07-gate-done");
await page.getByText(/Report · V\d+/, { exact: false }).first().click({ timeout: 5000 }).catch(() => {});
await page.waitForTimeout(1200);
await shot("stage2-08-gate-panel");

// export MD on the settled report
const before = new Set(fs.readdirSync(DESKTOP).filter((f) => f.endsWith(".md")).map((f) => f + ":" + fs.statSync(path.join(DESKTOP, f)).mtimeMs));
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button[title="Download Markdown (.md)"]')];
  btns[btns.length - 1]?.click();
});
await page.waitForTimeout(2000);
try {
  execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/accept-save-dialog.ps1"`, { encoding: "utf8" });
} catch (e) {
  console.log("PS error:", String(e).slice(0, 120));
}
await page.waitForTimeout(1800);
await shot("stage2-09-gate-saved");
const after = fs.readdirSync(DESKTOP).filter((f) => f.endsWith(".md")).map((f) => ({
  f,
  m: fs.statSync(path.join(DESKTOP, f)).mtimeMs,
}));
const fresh = after.filter((a) => !before.has(a.f + ":" + a.m));
if (fresh.length) {
  const f = fresh[fresh.length - 1].f;
  const head = fs.readFileSync(path.join(DESKTOP, f), "utf8").split(/\r?\n/).slice(0, 3);
  console.log("exported md:", f, "| first lines:", JSON.stringify(head));
} else {
  console.log("exported md: (none found)");
}
const status = await page.evaluate(() => {
  const m = document.body.innerText.match(/(Exporting [^\n]*|Saved to [^\n]*|Export failed[^\n]*|Export canceled)/);
  return m ? m[1] : null;
});
console.log("export status line:", status);
await browser.close();
process.exit(0);
