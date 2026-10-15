import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://localhost:9333");
const ctxs = browser.contexts();
const page = ctxs.map((c) => c.pages()).flat()[0];
if (!page) {
  console.log("NO PAGE FOUND");
  process.exit(1);
}
await page.waitForTimeout(8000);
await page.screenshot({ path: "tmp/v12-modal.png" });

const checks = [
  ["modal heading", "Local AI model required"],
  ["model card", "Qwen 2.5 3B Instruct"],
  ["download button", "Download model"],
  ["folder button", "Models folder"],
  ["own file button", "Use my own file"],
];
for (const [name, text] of checks) {
  const n = await page.getByText(text, { exact: false }).count();
  console.log(name.toUpperCase() + ":", n > 0 ? "ok" : "FAIL");
}
console.log("DONE");
process.exit(0);
