import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://localhost:9341");
const pages = browser.contexts().map((c) => c.pages()).flat();
console.log("PAGES:", pages.length);
const page = pages[0];
if (!page) {
  console.log("NO PAGE");
  process.exit(1);
}
await page.waitForTimeout(8000);

// 1. Initial state must be HOME (no thread, composer visible, no title)
const init = await page.evaluate(() => ({
  title: document.querySelector("header h1")?.textContent || "(home: no title bar)",
  textareas: document.querySelectorAll("textarea").length,
}));
console.log("INIT:", JSON.stringify(init));

// 2. Wait for model ready (patient)
try {
  await page.waitForFunction(
    async () => {
      try {
        return (await window.expozi.rag.getStatus()).llm === "ready";
      } catch {
        return false;
      }
    },
    { timeout: 300000 },
  );
  console.log("MODEL READY");
} catch {
  console.log("MODEL NEVER READY");
  process.exit(1);
}

// 3. Submit unique query
const QUERY = "patienttest how do vaccines work?";
const box = page.locator("textarea").first();
await box.fill(QUERY);
await box.press("Enter");
await page.waitForTimeout(2000);
console.log(
  "AFTER SUBMIT title:",
  JSON.stringify(await page.locator("header h1").first().textContent().catch(() => "(none)")),
);

// 4. Wait patiently for a complete streamed answer (up to 10 min)
await page.waitForFunction(
  () =>
    Array.from(document.querySelectorAll("p")).some(
      (el) => el.textContent && el.textContent.length > 200 && !el.textContent.startsWith("Yes — the literature speaks"),
    ),
  undefined,
  { timeout: 600000 },
);
const body = await page.evaluate(() => {
  const els = Array.from(document.querySelectorAll("p"));
  const hit = els.find(
    (el) => el.textContent && el.textContent.length > 200 && !el.textContent.startsWith("Yes — the literature speaks"),
  );
  return (hit?.textContent || "").slice(0, 300);
});
console.log("ANSWER:", JSON.stringify(body));
await page.screenshot({ path: "tmp/v14-patient.png" });
console.log("DONE");
process.exit(0);
