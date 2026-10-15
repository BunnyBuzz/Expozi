import { chromium } from "playwright";

// Read-only state check of a running Expozi window (does not type or click).
// Usage: node scripts/rag-state.mjs [port]
const PORT = Number(process.argv[2] || 9343);

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
await page.waitForTimeout(500);

const state = await page.evaluate(async () => {
  const ps = Array.from(document.querySelectorAll("p")).map((e) => e.textContent || "");
  const title = document.querySelector("header h1")?.textContent || "(none)";
  const stages = ps.filter((t) => /Breaking down|Searching papers|Reading|Indexing|Ranking|Writing/.test(t));
  const answers = ps.filter((t) => t.length > 250 && !t.startsWith("Yes — the literature speaks"));
  const cited = ps.find((t) => /cited sources/.test(t)) || "";
  const err = ps.find((t) => /Research failed|Something went wrong/i.test(t))?.slice(0, 250) || "";
  let status = null;
  try {
    status = await window.expozi.rag.getStatus();
  } catch {
    /* bridge absent */
  }
  return {
    title,
    stages,
    answerLen: answers[0]?.length || 0,
    answerHead: (answers[0] || "").slice(0, 160),
    cited,
    err,
    status,
  };
});

const srcBtn = page.getByRole("button", { name: /View \d+ cited sources/ });
const srcBtnCount = await srcBtn.count();

console.log("TITLE:", JSON.stringify(state.title));
console.log("STAGES:", JSON.stringify(state.stages));
console.log("ANSWER LEN:", state.answerLen, "| HEAD:", JSON.stringify(state.answerHead));
console.log("CITED TEXT:", JSON.stringify(state.cited));
console.log("CITED BUTTON:", srcBtnCount);
console.log("ERROR:", JSON.stringify(state.err));
console.log("STATUS:", JSON.stringify(state.status));

await page.screenshot({ path: "tmp/v15-state.png" });
console.log("SHOT: tmp/v15-state.png");
process.exit(0);
