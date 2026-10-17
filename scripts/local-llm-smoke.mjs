// Local chat smoke test over CDP: temporarily switches the backend to the
// local GGUF model, asks a one-word prompt (streaming, as the UI does), then
// restores the previous backend settings. Usage: node scripts/local-llm-smoke.mjs [port]
import { chromium } from "playwright";

const PORT = Number(process.argv[2] || 9343);
const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
const pages = browser.contexts().map((c) => c.pages()).flat();
const page = pages.find((p) => /index\.html|localhost:1420/.test(p.url())) || pages[0];
if (!page) {
  console.log("NO PAGE");
  process.exit(1);
}

const cfg = await page.evaluate(() => window.expozi.rag.getBackend());
console.log("saved backend cfg:", JSON.stringify(cfg));
await page.evaluate(() => window.expozi.rag.setBackend({ backend: "local" }));

const t0 = Date.now();
const out = await page.evaluate(async () => {
  const rag = window.expozi.rag;
  let streamed = "";
  const offTok = rag.onToken((d) => {
    streamed += d.token;
  });
  const done = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ error: "timeout after 240s" }), 240000);
    const offDone = rag.onDone((d) => {
      clearTimeout(timer);
      offDone();
      resolve(d);
    });
    rag.prompt([{ role: "user", content: "Reply with exactly one word: ok" }], 24);
  });
  offTok();
  return { ...done, streamed };
});
console.log(`local prompt in ${((Date.now() - t0) / 1000).toFixed(1)}s:`, JSON.stringify(out).slice(0, 400));

await page.evaluate((c) => window.expozi.rag.setBackend(c), cfg);
const restored = await page.evaluate(() => window.expozi.rag.getBackend());
console.log("restored backend cfg:", JSON.stringify(restored));
await browser.close();
process.exit(out.error ? 1 : 0);
