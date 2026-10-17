// Drives the model-download flow over CDP (same IPC the Settings buttons call):
// downloads the chat model (the optional embedding GGUF only with --all).
// Usage: node scripts/model-download.mjs [port]
// The app must be running with --remote-debugging-port.
import { chromium } from "playwright";

const PORT = Number(process.argv[2] || 9343);
const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
const pages = browser.contexts().map((c) => c.pages()).flat();
const page = pages.find((p) => /index\.html|localhost:1420/.test(p.url())) || pages[0];
if (!page) {
  console.log("NO PAGE");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const status = async () => {
  try {
    return await page.evaluate(() => window.expozi.rag.getStatus());
  } catch (e) {
    console.log("[dl] app window closed — download aborted:", String(e).slice(0, 120));
    process.exit(2);
  }
};

async function waitIdle() {
  for (;;) {
    const s = await status();
    if (s.download == null && s.llm !== "downloading") return s;
    await sleep(5000);
  }
}

async function doDownload(which) {
  const before = await waitIdle();
  if (which === "chat" && before.modelFile) {
    console.log(`[dl] chat already present — skipping (${before.modelFile})`);
    return true;
  }
  if (which === "embedding" && before.embedFile) {
    console.log(`[dl] embedding already present — skipping (${before.embedFile})`);
    return true;
  }
  console.log(`[dl] start ${which} — llm=${before.llm} embedding=${before.embedding} embedKind=${before.embedKind}`);
  await page.evaluate((w) => window.expozi.rag.downloadModel(w), which);
  let lastLogged = 0;
  for (;;) {
    await sleep(5000);
    const s = await status();
    if (s.download) {
      const pct = s.download.total ? Math.floor((s.download.received / s.download.total) * 100) : 0;
      if (pct >= lastLogged + 5 || pct === 100) {
        lastLogged = pct;
        const mb = (n) => (n / 1048576).toFixed(0);
        console.log(`[dl] ${which} ${pct}% (${mb(s.download.received)}/${mb(s.download.total)} MB)`);
      }
      continue;
    }
    if (s.llm === "downloading") continue;
    if (s.error) {
      console.log(`[dl] ${which} ERROR: ${s.error}`);
      return false;
    }
    console.log(`[dl] ${which} done — llm=${s.llm} model=${s.modelFile} embedding=${s.embedding} embedKind=${s.embedKind}`);
    return true;
  }
}

// The embedding GGUF is an optional ONNX-failure fallback (the app embeds via
// the ONNX model by default) — only fetch it when asked with --all.
const okChat = await doDownload("chat");
const okEmb = okChat && (process.argv.includes("--all") ? await doDownload("embedding") : true);
const end = await status();
console.log(
  "[dl] FINAL " +
    JSON.stringify({
      llm: end.llm,
      modelFile: end.modelFile,
      embedding: end.embedding,
      embedKind: end.embedKind,
      embedFile: end.embedFile,
      error: end.error,
    }),
);
await browser.close();
process.exit(okChat && okEmb ? 0 : 1);
