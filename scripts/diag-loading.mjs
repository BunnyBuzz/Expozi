import { chromium } from "playwright";

const b = await chromium.launch({ channel: "chromium-headless-shell" });
const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
p.on("pageerror", (e) => errs.push(String(e).split("\n")[0]));
try {
  await p.goto("http://localhost:1420", { waitUntil: "networkidle", timeout: 30000 });
} catch {
  /* proceed anyway */
}
await p.waitForTimeout(2500);
await p.locator("header button:has-text('Local')").first().click();
await p.waitForTimeout(1200);

const box = p.locator("textarea").first();
await box.fill("Does sleep affect cognitive performance?");
await box.press("Enter");
await p.getByText("Loading workspace").waitFor({ timeout: 8000 });
await p.screenshot({ path: "tmp/v11-loading.png" });
console.log("LOADING SHOWN: ok");

await p.getByText("View 8 cited sources").waitFor({ timeout: 15000 });
console.log("REPORT READY: ok");

const fbox = p.locator("textarea").first();
await fbox.fill("Summarize the findings for a non-expert");
await fbox.press("Enter");
await p.getByText("Thinking").waitFor({ timeout: 8000 });
await p.screenshot({ path: "tmp/v11-thinking.png" });
console.log("THINKING SHOWN: ok");

await p.locator('button[title="Stop"]').click();
await p.waitForTimeout(2200);
const thinkingGone = (await p.getByText("Thinking").count()) === 0;
const noAnswer = (await p.getByText("Short version for a non-expert").count()) === 0;
console.log("STOP WORKS:", thinkingGone && noAnswer ? "ok" : "FAIL");

const fbox2 = p.locator("textarea").first();
await fbox2.fill("Which paper has the strongest study design?");
await fbox2.press("Enter");
await p.getByText("strongest: largest sample").waitFor({ timeout: 15000 });
console.log("FOLLOWUP ANSWER: ok");
console.log("PAGEERRORS:", JSON.stringify(errs));
await b.close();
