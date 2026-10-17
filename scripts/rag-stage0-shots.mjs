// Capture Stage 0 evidence screenshots from the finished run.
import fs from "fs";
import { chromium } from "playwright";
const PORT = Number(process.argv[2] || 9343);
fs.mkdirSync("scripts/shots", { recursive: true });
const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
const pages = browser.contexts().map((c) => c.pages()).flat();
const page = pages.find((p) => /index\.html|localhost:1420/.test(p.url())) || pages[0];
await page.waitForTimeout(800);
const shot = async (n) => {
  try {
    await page.screenshot({ path: `scripts/shots/${n}.png`, timeout: 20000 });
    console.log("shot:", n);
  } catch (e) {
    console.log("shot failed:", n, String(e).slice(0, 80));
  }
};

// 1) the finished answer with pipeline
await shot("stage0-10-answer");

// 2) open cited sources
const srcBtn = page.getByRole("button", { name: /View \d+ cited sources/ }).first();
if (await srcBtn.count()) {
  await srcBtn.click();
  await page.waitForTimeout(700);
  await shot("stage0-11-sources");
} else {
  console.log("source button not found on current screen");
}

// dump the answer text
const answer = await page.evaluate(() => {
  const els = [...document.querySelectorAll("h1, h2, h3, p, li")];
  return els.map((e) => e.innerText.trim()).filter((x) => x.length > 0);
});
const start = answer.findIndex((x) => /^Yes, sleep duration/.test(x));
const slice = start >= 0 ? answer.slice(start, start + 20) : answer.slice(0, 20);
console.log("ANSWER BLOCKS:\n" + slice.join("\n").slice(0, 1400));

// source rows (title lines) if the table is open
const rows = await page.evaluate(() => {
  const els = [...document.querySelectorAll("table tr, [class*=grid] > div")];
  return els
    .map((e) => e.innerText.replace(/\n+/g, " | ").trim())
    .filter((x) => x.length > 40 && x.length < 300)
    .slice(0, 8);
});
console.log("SOURCE-ISH ROWS:\n" + rows.join("\n").slice(0, 1200));

// 3) home + mode dropdown
const newBtn = page.getByRole("button", { name: "New", exact: true });
if (await newBtn.count()) {
  await newBtn.first().click();
  await page.waitForTimeout(1200);
  await shot("stage0-12-home");
  const modeBtn = page.locator("button", { hasText: /Research agent/ }).first();
  if (await modeBtn.count()) {
    await modeBtn.click();
    await page.waitForTimeout(600);
    await shot("stage0-13-modes");
  }
}
await browser.close();
process.exit(0);
