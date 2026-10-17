// Stage 2.5c UI check — source ordering + report quality in the real app:
//   1. a live lite REPORT run shows the enrich_sources trace line (OpenAlex
//      citations/study types) and the read_pages reader breakdown
//   2. the sources list carries quality badges (year · study type · cited by N)
//      ordered newest → best
//   3. the report body renders with [n] citations and references
// Settings are snapshotted first and restored exactly at the end.
// Usage: node scripts/rag-stage25c-check.mjs [port]
import fs from "fs";
import { chromium } from "playwright";

const PORT = Number(process.argv[2] || 9343);
const PREFIX = process.env.SHOT_PREFIX || "stage25c";
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
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await page.screenshot({ path: `scripts/shots/${n}.png`, timeout: 60000 });
      return;
    } catch {
      if (attempt === 2) console.log("(shot skipped:", n, ")");
      await page.waitForTimeout(2000);
    }
  }
};

// 0) snapshot the user's real settings
const saved = await page.evaluate(() => localStorage.getItem("expozi-settings"));
console.log("settings snapshot:", saved);

// 1) hermetic lite/local REPORT run
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem("expozi-settings") || "{}");
  raw.backend = "local";
  raw.apiModel = "";
  raw.baseURL = "";
  raw.embedBackend = "local";
  raw.embedModel = "";
  raw.depth = "lite";
  raw.workflow = "report";
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
console.log("submitted (report/lite):", QUERY);

const probe = () =>
  page.evaluate(() => {
    const text = document.body.innerText;
    const stages = [
      ...text.matchAll(
        /(Loading the local model|Breaking down your question|Searching \d+ queries|Reading \d+ sources|Indexing the sources|Ranking the evidence|Writing answer)[^\n]*/g,
      ),
    ];
    return {
      enrichLine: (text.match(/enriched \(OpenAlex\)[^\n]*/) || [])[0] || "",
      readLine: (text.match(/read \d+\/\d+ sources[^\n]*/) || [])[0] || "",
      writeLine: (text.match(/wrote (agent|report) answer[^\n]*/) || [])[0] || "",
      failed: /Research failed:/.test(text),
      stage: stages.length ? stages[stages.length - 1][0].slice(0, 60) : "",
    };
  });

const t0 = Date.now();
let last = "";
let shotTrace = false;
let settled = false;
while (Date.now() - t0 < 30 * 60 * 1000) {
  await page.waitForTimeout(4000);
  const s = Math.round((Date.now() - t0) / 1000);
  const info = await probe();
  const key = `${info.stage}|${!!info.enrichLine}|${!!info.readLine}|${!!info.writeLine}`;
  if (key !== last) {
    last = key;
    console.log(
      `+${s}s stage:"${info.stage}" enrich:${info.enrichLine ? "yes" : "no"} read:${info.readLine ? "yes" : "no"} write:${info.writeLine ? "yes" : "no"}`,
    );
  }
  if (info.failed) {
    console.log("run failed");
    break;
  }
  if (info.enrichLine && info.readLine && !shotTrace) {
    console.log("enrich :", info.enrichLine.slice(0, 220));
    console.log("read   :", info.readLine.slice(0, 220));
    await shot(`${PREFIX}-01-enrich-trace`);
    shotTrace = true;
  }
  if (info.writeLine) {
    await page.waitForTimeout(8000); // let the card + sources render
    settled = true;
    break;
  }
}
console.log("settled:", settled);

if (settled) {
  // 2) cited-sources view — badges + ordering
  const srcBtn = page.locator("button", { hasText: /View \d+ cited sources/ }).first();
  if (await srcBtn.count()) {
    await srcBtn.click();
    await page.waitForTimeout(1500);
  }
  await shot(`${PREFIX}-02-sources`);

  const info = await page.evaluate(() => {
    const seen = new Set();
    const metas = [];
    for (const e of document.querySelectorAll("p,div,span")) {
      const t = (e.textContent || "").trim();
      if (t.length < 320 && /cited by \d+|RETRACTED/.test(t) && !seen.has(t)) {
        seen.add(t);
        metas.push(t);
      }
    }
    const text = document.body.innerText;
    const headings = [...document.querySelectorAll("h1,h2,h3")]
      .map((e) => e.textContent.trim())
      .filter((t) => t && t.length < 120)
      .slice(0, 12);
    return {
      metas: metas.slice(0, 12),
      headings,
      conflicting: /Conflicting evidence/i.test(text),
      citations: (text.match(/\[\d{1,2}\]/g) || []).slice(0, 10),
    };
  });
  console.log("source meta lines (display order):");
  info.metas.forEach((m, i) => console.log(`  ${i + 1}. ${m}`));
  console.log("answer headings:", info.headings.join(" | ").slice(0, 300));
  console.log("conflicting-evidence heading:", info.conflicting, "| citations:", info.citations.join(" "));

  // 3) report card screenshot (close the panel, scroll to the answer start)
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll("h1,h2,h3,p,div,span")).find((e) =>
      /^(Abstract|#\s*Abstract)$/i.test((e.textContent || "").trim()),
    );
    if (el) el.scrollIntoView({ block: "start" });
    else window.scrollTo(0, 0);
  });
  await page.waitForTimeout(800);
  await shot(`${PREFIX}-03-report`);
}

// 4) stop (only if still streaming), restore settings, reload
if (!settled) await page.evaluate(() => window.expozi?.rag?.stopResearch?.());
await page.waitForTimeout(800);
await page.evaluate((snap) => {
  if (snap) localStorage.setItem("expozi-settings", snap);
}, saved);
await page.reload();
await page.waitForTimeout(1500);
console.log("settings restored:", await page.evaluate(() => localStorage.getItem("expozi-settings")));
await browser.close();
process.exit(0);
