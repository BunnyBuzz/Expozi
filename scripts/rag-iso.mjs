import { chromium } from "playwright";

// Fully isolated: fresh profile (own model copy), unique query, assert title + streamed answer.
const browser = await chromium.connectOverCDP("http://localhost:9338");
const page = browser.contexts().map((c) => c.pages()).flat()[0];
if (!page) {
  console.log("NO PAGE");
  process.exit(1);
}
await page.waitForTimeout(8000);

const localBtn = page.locator("header button:has-text('Local')").first();
if ((await localBtn.count()) > 0) {
  await localBtn.click();
  await page.waitForTimeout(1500);
} else {
  console.log("NO LANDING (unexpected for fresh profile)");
}

const QUERY = "isode-test Does green tea improve focus?";
const box = page.locator("textarea").first();
await box.fill(QUERY);
await box.press("Enter");
await page.getByText("Loading workspace").waitFor({ timeout: 20000 }).catch(() => {});
console.log("LOADING: ok");

await page.waitForFunction(
  () => {
    const els = Array.from(document.querySelectorAll("p"));
    return els.some(
      (el) =>
        el.textContent &&
        el.textContent.length > 150 &&
        !el.textContent.startsWith("Yes — the literature speaks"),
    );
  },
  { timeout: 300000 },
);
const title = await page.locator("header h1").first().textContent();
const body = await page.evaluate(() => {
  const els = Array.from(document.querySelectorAll("p"));
  const hit = els.find(
    (el) => el.textContent && el.textContent.length > 150 && !el.textContent.startsWith("Yes — the literature speaks"),
  );
  return (hit?.textContent || "").slice(0, 250);
});
console.log("TITLE:", JSON.stringify(title));
console.log("TITLE MATCH:", title && title.includes("isode-test") ? "ok" : "FAIL");
console.log("ANSWER:", JSON.stringify(body));
await page.screenshot({ path: "tmp/v13-iso.png" });
console.log("DONE");
process.exit(0);
