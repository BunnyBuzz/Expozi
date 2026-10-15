import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://localhost:9340");
const page = browser.contexts().map((c) => c.pages()).flat()[0];
if (!page) {
  console.log("NO PAGE");
  process.exit(1);
}
const errs = [];
page.on("pageerror", (e) => errs.push("PAGEERROR: " + String(e).split("\n")[0]));
await page.waitForTimeout(5000);

await page.waitForFunction(
  async () => {
    try {
      const s = await window.expozi.rag.getStatus();
      return s.llm === "ready";
    } catch {
      return false;
    }
  },
  { timeout: 300000 },
);
console.log("MODEL READY");

const box = page.locator("textarea").first();
await box.fill("diagtest why is the sky blue?");
await box.press("Enter");
await page.waitForTimeout(20000);
await page.screenshot({ path: "tmp/v14-debug.png" });
const dump = await page.evaluate(() => ({
  title: document.querySelector("header h1")?.textContent || "(none)",
  paras: Array.from(document.querySelectorAll("p")).map((p) => (p.textContent || "").slice(0, 80)),
}));
console.log("DUMP:", JSON.stringify(dump, null, 1));
console.log("ERRORS:", JSON.stringify(errs));
process.exit(0);
