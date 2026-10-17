// Final state for review: reopen the newest saved review from Recents.
import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://localhost:9343");
const pages = browser.contexts().map((c) => c.pages()).flat();
const page = pages.find((p) => /index\.html/.test(p.url())) || pages[0];
if (!page) {
  console.log("NO PAGE");
  process.exit(1);
}
await page.waitForTimeout(2500);
const localBtn = page.getByTitle("Use Expozi with a local model — no account needed");
if (await localBtn.count()) {
  await localBtn.first().click();
  await page.waitForTimeout(1200);
}
const item = page.locator('[data-history-mode="review"]').first();
if (await item.count()) {
  await item.click();
  console.log("clicked newest review entry");
} else {
  console.log("no review entry found in Recents");
}
for (let i = 0; i < 15; i++) {
  const t = await page.evaluate(() => !!document.querySelector("[data-screening-table]"));
  if (t) break;
  await page.waitForTimeout(1500);
}
const info = await page.evaluate(() => ({
  line: (document.body.innerText.match(/Reopened saved review[^\n]*/) || [""])[0],
  counts: (document.querySelector("[data-screening-counts]")?.textContent || "").trim(),
  rows: document.querySelectorAll("[data-screening-row]").length,
}));
console.log(JSON.stringify(info));
await page.screenshot({ path: "scripts/shots/stage4-07-final.png", timeout: 60000 }).catch(() => {});
await browser.close();
process.exit(0);
