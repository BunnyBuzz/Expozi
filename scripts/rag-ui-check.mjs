// UI check via CDP: app must start with NO model modal, models stay unloaded
// until first use, and the Settings gear (next to the profile) opens Settings
// with the on-device model card. Usage:
//   node scripts/rag-ui-check.mjs [port]
import fs from "fs";
import { chromium } from "playwright";

const PORT = Number(process.argv[2] || 9343);
fs.mkdirSync("scripts/shots", { recursive: true });

const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
const pages = browser.contexts().map((c) => c.pages()).flat();
const page = pages.find((p) => /localhost:1420/.test(p.url())) || pages[0];
if (!page) {
  console.log("NO PAGE");
  process.exit(1);
}
await page.waitForTimeout(2500);
const shot = (n) =>
  page
    .screenshot({ path: `scripts/shots/${n}.png`, timeout: 10000 })
    .catch(() => console.log("(screenshot skipped:", n, ")"));

// 1) no blocking modal at startup
const bodyText = await page.evaluate(() => document.body.innerText);
console.log("modal absent:", !/Local AI model required/i.test(bodyText));

// 2) status: found but NOT loaded
const st = await page.evaluate(async () => await window.expozi.rag.getStatus());
console.log("status at boot:", st.llm, "/ embedding:", st.embedding, "/ modelFile:", st.modelFile ? "yes" : "no");

// 3) enter the app
const localBtn = page.getByTitle("Use Expozi with a local model — no account needed");
if (await localBtn.count()) {
  await localBtn.first().click();
  await page.waitForTimeout(1200);
  console.log("entered app");
}

// 4) settings gear next to profile (close any modal left open by a previous run)
const closeBtn = page.locator('button[title="Close"]');
if (await closeBtn.count()) {
  await closeBtn.first().click().catch(() => {});
  await page.waitForTimeout(400);
}
const gear = page.locator('button[title="Settings"]');
console.log("settings gear buttons:", await gear.count());
await shot("01-app-start");

await gear.last().click();
await page.waitForTimeout(500);
const modal = await page.evaluate(() => document.body.innerText);
console.log("settings open:", /On-device model/i.test(modal));
console.log("card status line:", /Installed|Not installed|Loaded/.test(modal));
await shot("02-settings");

// 5) load the model on demand from settings
const loadBtn = page.getByRole("button", { name: /Load now/i });
if (await loadBtn.count()) {
  await loadBtn.first().click();
  const ok = await page
    .locator("span", { hasText: /^Loaded$/ })
    .first()
    .waitFor({ timeout: 120000 })
    .then(() => true)
    .catch(() => false);
  const st2 = await page.evaluate(async () => await window.expozi.rag.getStatus());
  console.log("load now worked:", ok, "| status:", st2.llm);
  await shot("03-loaded");
} else {
  console.log("load now button: not present (model may already be loaded)");
}
await browser.close();
