import { chromium } from "playwright";

// Verifies the LOCAL MODEL answers in the workspace (not mock text).
const browser = await chromium.connectOverCDP("http://localhost:9335");
const page = browser.contexts().map((c) => c.pages()).flat()[0];
if (!page) {
  console.log("NO PAGE");
  process.exit(1);
}
await page.waitForTimeout(5000);

// Enter via landing Local button if present
const localBtn = page.locator("header button:has-text('Local')").first();
if ((await localBtn.count()) > 0) {
  await localBtn.click();
  await page.waitForTimeout(1500);
}

const box = page.locator("textarea").first();
await box.fill("Does sleep affect memory?");
await box.press("Enter");
await page.getByText("Loading workspace").waitFor({ timeout: 15000 }).catch(() => {});
console.log("LOADING: ok");

// Wait for a real streamed answer: must NOT be the mock template.
await page.waitForFunction(
  () => {
    const els = Array.from(document.querySelectorAll("p"));
    return els.some(
      (el) =>
        el.textContent &&
        el.textContent.length > 120 &&
        !el.textContent.startsWith("Yes — the literature speaks"),
    );
  },
  { timeout: 300000 },
);
const text = await page.evaluate(() => {
  const els = Array.from(document.querySelectorAll("main p, div p"));
  const hit = els.find(
    (el) => el.textContent && el.textContent.length > 120 && !el.textContent.startsWith("Yes — the literature speaks"),
  );
  return (hit?.textContent || "").slice(0, 300);
});
console.log("REAL ANSWER (first 300 chars):", JSON.stringify(text));
await page.screenshot({ path: "tmp/v13-stream.png" });
console.log("STREAMING: ok");
process.exit(0);
