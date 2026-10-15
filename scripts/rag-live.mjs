import { chromium } from "playwright";

// Usage: node scripts/rag-live.mjs [port] [query]
const PORT = Number(process.argv[2] || 9343);
const QUERY = process.argv[3] || "How do intermittent fasting windows affect metabolic markers?";

const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
const pages = browser
  .contexts()
  .map((c) => c.pages())
  .flat();
const page = pages.find((p) => /localhost:1420/.test(p.url())) || pages[0];
if (!page) {
  console.log("NO PAGE");
  process.exit(1);
}
await page.waitForTimeout(3000);

// Sign in as local user if the landing page is up.
const localBtn = page.getByTitle("Use Expozi with a local model — no account needed");
if (await localBtn.count()) {
  await localBtn.first().click();
  await page.waitForTimeout(1500);
  console.log("SIGNED-IN: local");
}

// Wait for the local model to be loaded.
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

// If the model modal is up (ready card), continue into the app.
const cont = page.getByRole("button", { name: "Continue to Expozi" });
if (await cont.count()) {
  await cont.first().click();
  console.log("CONTINUED FROM MODAL");
  await page.waitForTimeout(1000);
}

await page.waitForSelector("textarea", { timeout: 120000 });

// Return to the home composer (in case a workspace is open) and pick the workflow.
const newBtn = page.getByRole("button", { name: "New", exact: true });
if (await newBtn.count()) {
  await newBtn.first().click();
  await page.waitForTimeout(400);
}
const MODE_LABELS = { agent: "Research agent", report: "Report", review: "Systematic review" };
const MODE = process.argv[4];
if (MODE && MODE_LABELS[MODE]) {
  const trigger = page.locator("button", { hasText: /Research agent|Report|Systematic review/ }).first();
  if (await trigger.count()) {
    await trigger.click();
    await page.waitForTimeout(300);
    const opt = page.locator("button.text-left", { hasText: MODE_LABELS[MODE] }).first();
    if (await opt.count()) {
      await opt.click();
      console.log("MODE:", MODE);
      await page.waitForTimeout(300);
    } else {
      await page.keyboard.press("Escape");
      console.log("WARN: mode option not found");
    }
  } else {
    console.log("WARN: mode trigger not found");
  }
}

const box = page.locator("textarea").first();
await box.fill(QUERY);
await box.press("Enter");
await page.waitForTimeout(1200);
console.log(
  "TITLE:",
  JSON.stringify(await page.locator("header h1").first().textContent().catch(() => "(none)")),
);

// Pipeline status card + stage lines
await page
  .waitForFunction(() => document.body.textContent.includes("Pipeline"), undefined, { timeout: 60000 })
  .catch(() => console.log("WARN: no pipeline card"));
const stages = await page.evaluate(() =>
  Array.from(document.querySelectorAll("p"))
    .map((e) => e.textContent || "")
    .filter((t) => /Breaking down|Searching papers|Reading|Indexing|Ranking|Writing/.test(t)),
);
console.log("STAGES:", JSON.stringify(stages));

// Wait for the real answer to stream (long — local 3B on CPU).
try {
  await page.waitForFunction(
    (isReview) => {
      const ps = Array.from(document.querySelectorAll("p"));
      if (
        ps.some(
          (el) =>
            el.textContent &&
            el.textContent.length > 250 &&
            !el.textContent.startsWith("Yes — the literature speaks"),
        )
      )
        return true;
      if (isReview && document.querySelectorAll("table tbody tr").length > 0) return true;
      return false;
    },
    MODE === "review",
    { timeout: 900000 },
  );
} catch {
  console.log("TIMEOUT waiting for answer");
  await page.screenshot({ path: "tmp/v15-live-timeout.png" });
  const err = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll("p, div")).find((e) => /Research failed/.test(e.textContent || ""));
    return el ? el.textContent.slice(0, 300) : "(no error banner)";
  });
  console.log("ERROR BANNER:", JSON.stringify(err));
  process.exit(1);
}

const state = await page.evaluate(() => {
  const ps = Array.from(document.querySelectorAll("p")).map((e) => e.textContent || "");
  const answer = ps.find((t) => t.length > 250 && !t.startsWith("Yes — the literature speaks")) || "";
  const cited = ps.find((t) => /cited sources/.test(t)) || "";
  return { answer: answer.slice(0, 350), cited };
});
console.log("ANSWER:", JSON.stringify(state.answer));
console.log("CITED:", JSON.stringify(state.cited));

const srcBtn = page.getByRole("button", { name: /View \d+ cited sources/ });
if (await srcBtn.count()) {
  await srcBtn.first().click();
  await page.waitForTimeout(800);
  const rows = await page.evaluate(
    () => document.querySelectorAll("div.mt-3.overflow-hidden.rounded-xl.border > div").length,
  );
  console.log("SOURCE ROWS:", rows);
} else {
  console.log("WARN: no cited-sources button");
}

const tableRows = await page.evaluate(() => document.querySelectorAll("table tbody tr").length);
if (tableRows > 0) console.log("TABLE ROWS:", tableRows);

await page.screenshot({ path: "tmp/v15-live.png" });
console.log("DONE");
process.exit(0);
