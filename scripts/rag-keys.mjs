import { chromium } from "playwright";

const [OR_KEY, GEM_KEY] = process.argv.slice(2);
if (!OR_KEY || !GEM_KEY) {
  console.log("usage: node rag-keys.mjs <openrouter-key> <gemini-key>");
  process.exit(1);
}

const browser = await chromium.connectOverCDP("http://localhost:9342");
const page = browser.contexts().map((c) => c.pages()).flat()[0];
if (!page) {
  console.log("NO PAGE");
  process.exit(1);
}
await page.waitForTimeout(5000);

await page.keyboard.press("Control+k");
await page.waitForTimeout(1200);
await page.locator("button", { hasText: "Go to Settings" }).click();
await page.waitForTimeout(1200);

const saveKey = async (idx, key) => {
  await page.locator('input[type="password"]').nth(idx).fill(key);
  await page.getByRole("button", { name: "Save", exact: true }).nth(idx).click();
  await page.waitForTimeout(1500);
};
// KEY_PROVIDERS order: scholar, jina, exa, tavily, openai, openrouter(5), anthropic, gemini(7)
await saveKey(5, OR_KEY);
await page.getByRole("button", { name: "Test", exact: true }).nth(5).click();
await page.waitForTimeout(15000);
const orRes = await page.evaluate(() => {
  const els = Array.from(document.querySelectorAll("p")).filter((p) => p.textContent && /Endpoint reachable|Rejected|Unreachable|Network/.test(p.textContent));
  return els.map((e) => e.textContent);
});
console.log("OPENROUTER TEST:", JSON.stringify(orRes));

await saveKey(7, GEM_KEY);
await page.getByRole("button", { name: "Test", exact: true }).nth(7).click();
await page.waitForTimeout(15000);
const gRes = await page.evaluate(() => {
  const els = Array.from(document.querySelectorAll("p")).filter((p) => p.textContent && /Key accepted|Rejected|Unreachable|Network/.test(p.textContent));
  return els.map((e) => e.textContent);
});
console.log("GEMINI TEST:", JSON.stringify(gRes));

// Switch chat backend to OpenRouter
await page.getByRole("button", { name: "OpenRouter", exact: true }).first().click();
await page.waitForTimeout(1000);
const modelVal = await page.locator('input[placeholder*="Model name"]').inputValue().catch(() => "(none)");
console.log("BACKEND MODEL FIELD:", JSON.stringify(modelVal));
await page.screenshot({ path: "tmp/v15-settings.png" });

// Close settings
await page.keyboard.press("Escape");
await page.waitForTimeout(800);
console.log("DONE");
process.exit(0);
