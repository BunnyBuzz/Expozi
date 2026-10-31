// Full-page Settings probe — walks the left-nav sections, verifies Groq appears
// as a chat backend (model prefill openai/gpt-oss-120b) and in the API-keys
// list, saves one screenshot per section, and checks Escape closes the page.
// The Groq selection is reverted to the previously saved backend before exit.
// Usage: node scripts/settings-ui-check.mjs [port]
import fs from "fs";
import { chromium } from "playwright";

const PORT = Number(process.argv[2] || 9343);
fs.mkdirSync("scripts/shots", { recursive: true });

const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
const pages = browser.contexts().map((c) => c.pages()).flat();
const page = pages.find((p) => /index\.html|localhost:1420/.test(p.url())) || pages[0];
if (!page) {
  console.log("NO PAGE");
  process.exit(1);
}

const isOpen = () => page.evaluate(() => !!document.querySelector(".fixed.inset-0.z-50"));
const shot = async (name) => {
  const file = `scripts/shots/settings-${name}.png`;
  await page.screenshot({ path: file });
  console.log("shot:", file);
};

const before = await page.evaluate(() => localStorage.getItem("expozi-settings"));

if (!(await isOpen())) {
  let btn = page.locator("button[title*='ettings'], button[aria-label*='ettings']");
  if (!(await btn.count())) btn = page.locator("button").filter({ has: page.locator("svg.lucide-settings") });
  await btn.first().click();
  await page.waitForTimeout(800);
}
console.log("settings open:", await isOpen());

const nav = (label) => page.locator("nav button", { hasText: label }).first();
const heading = () => page.locator("div.fixed.inset-0 main h3").first().textContent();

// 1. General
await nav("General").click();
await page.waitForTimeout(300);
console.log("heading:", JSON.stringify(await heading()));
await shot("1-general");

// 2. AI backend — Groq present; picking it prefills the model; then restore local
await nav("AI backend").click();
await page.waitForTimeout(300);
const groqBtn = page.locator("main button", { hasText: /^Groq$/ }).first();
console.log("groq button in backend grid:", await groqBtn.count());
await shot("2-ai-backend");
if (await groqBtn.count()) {
  await groqBtn.click();
  await page.waitForTimeout(300);
  console.log("model prefill after picking Groq:", JSON.stringify(await page.locator("main input").first().inputValue()));
  console.log(
    "groq hint:",
    await page.evaluate(() => {
      const p = Array.from(document.querySelectorAll("main p")).find((x) => /gsk-/.test(x.textContent || ""));
      return p ? p.textContent.trim() : "(groq hint not found)";
    }),
  );
  await shot("3-ai-backend-groq");
  await page.locator("main button", { hasText: /Local model \(this PC\)/ }).first().click();
  await page.waitForTimeout(300);
}

// 3. On-device model
await nav("On-device model").click();
await page.waitForTimeout(300);
console.log("device card present:", await page.evaluate(() => document.body.innerText.includes("Embedding model:")));
await shot("4-on-device");

// 4. API keys — Groq row present
await nav("API keys").click();
await page.waitForTimeout(700);
console.log(
  "keys:",
  JSON.stringify(await page.evaluate(() => {
    const t = document.body.innerText;
    const i = t.indexOf("Groq");
    return { hasGroq: i >= 0, around: i >= 0 ? t.slice(i, i + 60).replace(/\n/g, " | ") : null };
  })),
);
await shot("5-api-keys");

// 5. Crawling
await nav("Crawling").click();
await page.waitForTimeout(300);
await shot("6-crawling");

// Escape closes; saved settings untouched
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
console.log("closed via Escape:", !(await isOpen()));
const after = await page.evaluate(() => localStorage.getItem("expozi-settings"));
console.log("settings restored:", before === after, before === after ? "" : `\n  before: ${before}\n  after:  ${after}`);

await browser.close();
