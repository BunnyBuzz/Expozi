import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://localhost:9337");
const page = browser.contexts().map((c) => c.pages()).flat()[0];
if (!page) {
  console.log("NO PAGE");
  process.exit(1);
}
await page.waitForTimeout(8000);

const dump = async (tag) => {
  const info = await page.evaluate(() => ({
    url: location.href,
    textareas: Array.from(document.querySelectorAll("textarea")).map((t) => ({
      value: t.value.slice(0, 60),
      visible: t.offsetParent !== null,
    })),
    title: document.querySelector("header h1")?.textContent?.slice(0, 60) || "(no h1)",
    body: document.body.innerText.slice(0, 120),
  }));
  console.log(tag, JSON.stringify(info));
};

await dump("T0-boot");
const localBtn = page.locator("header button:has-text('Local')").first();
if ((await localBtn.count()) > 0) {
  await localBtn.click();
  await page.waitForTimeout(1500);
}
await dump("T1-home");
const box = page.locator("textarea").first();
await box.fill("zxq-test Can naps improve alertness?");
await dump("T2-after-fill");
await box.press("Enter");
await page.waitForTimeout(1000);
await dump("T3-after-enter");
process.exit(0);
