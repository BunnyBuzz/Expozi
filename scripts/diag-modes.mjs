import { chromium } from "playwright";

const browser = await chromium.connectOverCDP("http://localhost:9340");
const page = browser.contexts().map((c) => c.pages()).flat()[0];
if (!page) {
  console.log("NO PAGE");
  process.exit(1);
}
await page.waitForTimeout(8000);
console.log("URL:", await page.evaluate(() => location.href));

// Wait until the local model is actually ready (no more mock path)
try {
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
  console.log("MODEL READY: ok");
} catch {
  const s = await page.evaluate(() => window.expozi?.rag?.getStatus().catch(() => null));
  console.log("MODEL NOT READY, status:", JSON.stringify(s));
  process.exit(1);
}

const submit = async (q) => {
  const box = page.locator("textarea").first();
  await box.fill(q);
  await box.press("Enter");
  await page.getByText("Loading workspace").waitFor({ timeout: 20000 }).catch(() => {});
};

const waitAnswer = async () => {
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll("p")).some(
        (el) => el.textContent && el.textContent.length > 150,
      ),
    { timeout: 300000 },
  );
  return page.evaluate(() => {
    const els = Array.from(document.querySelectorAll("p"));
    const hit = els.find((el) => el.textContent && el.textContent.length > 150);
    const t = hit?.textContent || "";
    return { mock: t.startsWith("Yes — the literature speaks"), head: t.slice(0, 120) };
  });
};

const tableYears = () =>
  page.evaluate(() => {
    const grids = Array.from(document.querySelectorAll("div")).filter(
      (el) => typeof el.className === "string" && el.className.includes("grid-cols-[28px"),
    );
    return grids.slice(1).map((g) => g.children[2]?.textContent?.trim());
  });

// ---------- AGENT ----------
await submit("modetest agent naps and focus");
const a = await waitAnswer();
console.log("AGENT mock?", a.mock ? "YES (BAD)" : "no (real)");
console.log("AGENT answer head:", JSON.stringify(a.head));
console.log("AGENT no artifact card:", (await page.getByText("English Report").count()) === 0 ? "ok" : "FAIL");
console.log("AGENT query bubble:", (await page.getByText("modetest agent naps and focus").count()) >= 2 ? "ok" : "FAIL");
await page.screenshot({ path: "tmp/v14-agent.png" });

// ---------- REVIEW ----------
await page.reload();
await page.waitForTimeout(4000);
await page.locator("button:has-text('Research agent')").first().click();
await page.locator("button", { hasText: "Systematic review" }).last().click();
await submit("modetest review fasting benefits");
await page.getByText(/of \d+ included/).waitFor({ timeout: 30000 });
const boxes0 = await page.locator('button[title="Exclude"]').count();
console.log("REVIEW checkboxes (want 8):", boxes0);
await page.locator('button[title="Exclude"]').first().click();
await page.waitForTimeout(800);
const countText = await page.getByText(/of \d+ included/).first().textContent();
console.log("REVIEW exclude works:", countText, /7 of 8/.test(countText || "") ? "ok" : "FAIL");
await page.locator("select").selectOption("year");
await page.waitForTimeout(800);
const years = await tableYears();
console.log("REVIEW years sorted desc:", JSON.stringify(years), years[0] === "2024" ? "ok" : "FAIL");
await page.getByPlaceholder("from").fill("2024");
await page.waitForTimeout(800);
console.log("REVIEW year filter:", await page.getByText(/of \d+ included/).first().textContent());
await page.screenshot({ path: "tmp/v14-review.png" });

// ---------- REPORT ----------
await page.reload();
await page.waitForTimeout(4000);
await page.locator("button:has-text('Research agent')").first().click();
await page.locator("button", { hasText: "Report" }).last().click();
await submit("modetest report ocean plastic");
await page.getByText("English Report").waitFor({ timeout: 30000 });
console.log("REPORT card: ok");
const r = await waitAnswer();
console.log("REPORT mock?", r.mock ? "YES (BAD)" : "no (real)");
await page.waitForTimeout(90000);
const sug = await page.evaluate(() =>
  Array.from(document.querySelectorAll("button"))
    .map((b) => b.textContent?.trim() || "")
    .filter(
      (t) =>
        t.length > 12 &&
        t.length < 140 &&
        !["View 8 cited sources", "Draft report", "Build deck", "Find papers", "Strategy", "Landscapes"].includes(t),
    )
    .slice(0, 6),
);
console.log("SUGGESTIONS NOW:", JSON.stringify(sug));
await page.screenshot({ path: "tmp/v14-report.png" });
console.log("DONE");
process.exit(0);
