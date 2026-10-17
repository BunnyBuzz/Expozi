// Stage 0 full check: mode dropdown = exactly 3 modes (no Chat), then a full
// real research run to completion — real stages, real answer, real sources.
// Usage: node scripts/rag-stage0-full.mjs [port]
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
await page.waitForTimeout(800);
const shot = (n) =>
  page.screenshot({ path: `scripts/shots/${n}.png`, timeout: 15000 }).catch(() => console.log("(shot skipped:", n, ")"));

// back to home
const newBtn = page.getByRole("button", { name: "New", exact: true });
if (await newBtn.count()) {
  await newBtn.first().click();
  await page.waitForTimeout(900);
  console.log("went home");
}

// 1) mode dropdown — exactly three modes, no Chat
const modeBtn = page.locator("button", { hasText: /Research agent/ }).first();
console.log("mode dropdown button found:", (await modeBtn.count()) > 0);
if (await modeBtn.count()) {
  await modeBtn.click();
  await page.waitForTimeout(700);
  const dd = await page.evaluate(() => document.body.innerText);
  console.log("dropdown: 'Report' present:", dd.includes("Report"));
  console.log("dropdown: 'Systematic review' present:", dd.includes("Systematic review"));
  console.log("dropdown: no 'Chat & Discussion':", !dd.includes("Chat & Discussion"));
  await shot("stage0-05-modes");
  // re-select Research agent (closes menu)
  const agentOpt = page.locator("button", { hasText: /^\s*Research agent\s*$/ }).first();
  if (await agentOpt.count()) {
    await agentOpt.click().catch(() => {});
  } else {
    await page.keyboard.press("Escape").catch(() => {});
  }
  await page.waitForTimeout(400);
}

// 2) full run to completion
const ta = page.locator("textarea").first();
await ta.click();
await ta.fill("Does sleep duration affect cognitive performance in adults?");
await ta.press("Enter");
console.log("submitted; waiting for the real pipeline...");

const t0 = Date.now();
let lastStages = -1;
let hasAnswer = false;
while (Date.now() - t0 < 15 * 60 * 1000) {
  await page.waitForTimeout(5000);
  const t = await page.evaluate(() => document.body.innerText);
  const stages = (
    t.match(
      /(Planning the searches|Gathering perspectives|Asking research questions|Searching \d+ queries|Refining the questions|Reading \d+ sources|Indexing the sources|Ranking[^\n]*|Writing[^\n]*|Composing[^\n]*|Drafting[^\n]*)/g
    ) || []
  ).length;
  if (stages !== lastStages) {
    lastStages = stages;
    console.log(`+${Math.round((Date.now() - t0) / 1000)}s stage count: ${stages}`);
  }
  if (/View \d+ cited sources/.test(t)) {
    hasAnswer = true;
    break;
  }
  if (/Research failed|No answer was generated/.test(t)) break;
}

const finalText = await page.evaluate(() => document.body.innerText);
const cited = finalText.match(/View (\d+) cited sources/);
console.log("finished with sources:", hasAnswer, cited ? `cited: ${cited[1]}` : "(no source button)");
console.log("no demo corpus content:", !/Rahman|Sleep Medicine Reviews/.test(finalText));
await shot("stage0-06-result");

// 3) answer preview — first few rendered blocks after the pipeline panel
const blocks = await page.evaluate(() => {
  const els = [...document.querySelectorAll("p, h1, h2, h3, li")].map((e) => e.innerText.trim()).filter(Boolean);
  return els.filter((x) => x.length > 40).slice(0, 6);
});
console.log("answer preview:", JSON.stringify(blocks).slice(0, 900));

await browser.close();
process.exit(0);
