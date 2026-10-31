// Live end-to-end check for the agent mode:
//   A. bridge-level "hi" — must return a direct answer with ZERO tool calls
//   B. UI-level research run — types a real question, waits for the run to
//      finish, then extracts the merged "Agent trace" lines from the DOM and
//      verifies the playbook actually ran (scan → … → synthesize), with no
//      duplicate stage lines.
// Usage: node scripts/agent-live-check.mjs [port] [query]
import fs from "fs";
import { chromium } from "playwright";

const PORT = Number(process.argv[2] || 9343);
const QUERY = process.argv[3] || "effects of caffeine on sleep";
fs.mkdirSync("scripts/shots", { recursive: true });

const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
const pages = browser.contexts().map((c) => c.pages()).flat();
const page = pages.find((p) => /index\.html|localhost:1420/.test(p.url())) || pages[0];
if (!page) {
  console.log("NO PAGE");
  process.exit(1);
}

// ---------------------------------------------------------------- Part A ----
console.log("== Part A: bridge-level 'hi' (must be zero tool calls) ==");
const tA = Date.now();
const a = await page.evaluate(
  () =>
    new Promise((resolve) => {
      const events = [];
      const b = window.expozi.rag;
      let id = "";
      let offProg = null;
      let offTool = null;
      let offDone = null;
      const cleanup = () => {
        offProg && offProg();
        offTool && offTool();
        offDone && offDone();
      };
      offProg = b.onProgress((d) => {
        if (d.id === id) events.push({ kind: "stage", stage: d.stage, message: d.message, seq: d.seq });
      });
      offTool = b.onTool((d) => {
        if (d.id === id) {
          events.push({ kind: "tool", tool: d.event.tool, status: d.event.status, detail: d.event.detail, seq: d.event.seq });
        }
      });
      offDone = b.onDone((d) => {
        if (d.id !== id) return;
        cleanup();
        resolve({ answer: d.text || "", error: d.error || null, sources: (d.sources || []).length, events });
      });
      b.research("hi", "agent").then((r) => {
        id = r.id;
      });
    }),
);
console.log(`(${((Date.now() - tA) / 1000).toFixed(1)}s)`);
console.log("answer:", JSON.stringify(a.answer));
console.log("sources:", a.sources);
console.log("events:", JSON.stringify(a.events));
const toolCount = a.events.filter((e) => e.kind === "tool").length;
console.log(toolCount === 0 ? "PASS: no tools ran for 'hi'" : `FAIL: ${toolCount} tool events for 'hi'`);

// ---------------------------------------------------------------- Part B ----
console.log(`\n== Part B: UI run — "${QUERY}" ==`);
// Make sure the workflow picker is on Research agent.
await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((b) =>
    /^(Research agent|Report|Systematic review)$/.test(b.textContent.trim()),
  );
  if (btn && btn.textContent.trim() !== "Research agent") btn.click();
});
await page.waitForTimeout(300);
await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((b) => b.textContent.trim() === "Research agent");
  if (btn) btn.click();
});
await page.waitForTimeout(300);
await page.fill("textarea", QUERY);
await page.keyboard.press("Enter");

const readTrace = () =>
  page.evaluate(() => {
    const p = [...document.querySelectorAll("p")].find(
      (x) => x.textContent.trim().toLowerCase() === "agent trace",
    );
    const panel = p ? p.closest("div") : null;
    return {
      found: !!panel,
      spins: panel ? panel.querySelectorAll(".animate-spin").length : -1,
      text: panel ? panel.innerText : "",
    };
  });

const tB = Date.now();
let last = { found: false, spins: -1, text: "" };
for (let i = 0; i < 120; i++) {
  await page.waitForTimeout(5000);
  last = await readTrace();
  const secs = ((Date.now() - tB) / 1000).toFixed(0);
  if (i % 3 === 0 || (last.found && last.spins === 0)) {
    console.log(`  [${secs}s] trace=${last.found} spins=${last.spins} lines=${last.text ? last.text.split("\n").length : 0}`);
  }
  if (last.found && last.spins === 0 && /synthesize/i.test(last.text)) break;
}
console.log("--- agent trace ---");
console.log(last.text);
const body = await page.evaluate(() => document.body.innerText);
const cite = /\[\d+\]/.test(body);
console.log("answer has [n] citations:", cite);
const synthLine = last.text.split("\n").find((l) => /synthesize/i.test(l)) || "";
console.log("synthesize line:", JSON.stringify(synthLine));
const embedLines = last.text.split("\n").filter((l) => /embedding model/i.test(l)).length;
console.log("embedding-model stage lines (want ≤1):", embedLines);
await page.screenshot({ path: "scripts/shots/agent-live.png", fullPage: false });
console.log("shot: scripts/shots/agent-live.png");

await browser.close();
