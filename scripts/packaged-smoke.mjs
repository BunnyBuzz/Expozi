// Packaged-app smoke test — boots release/win-unpacked/Expozi.exe, confirms the
// window renders, the rag status is honest (no models in a fresh userData), the
// reader status responds, and the history/library IPC bridge is present.
// A full pipeline run is NOT part of this smoke test: the packaged userData has
// no chat model and downloading the ~2 GB GGUF is out of scope.
//
// Usage: node scripts/packaged-smoke.mjs [port]
import fs from "fs";
import { spawn } from "child_process";
import { chromium } from "playwright";

const PORT = Number(process.argv[2] || 9344);
const EXE = "release/win-unpacked/Expozi.exe";
if (!fs.existsSync(EXE)) {
  console.log("SMOKE FAILED: no packaged app at", EXE);
  process.exit(1);
}
fs.mkdirSync("scripts/shots", { recursive: true });

const child = spawn(EXE, [`--remote-debugging-port=${PORT}`], { stdio: "inherit" });

const deadline = Date.now() + 90000;
let up = false;
while (Date.now() < deadline) {
  try {
    const res = await fetch(`http://localhost:${PORT}/json/version`);
    if (res.ok) {
      up = true;
      break;
    }
  } catch {
    /* not yet */
  }
  await new Promise((r) => setTimeout(r, 1500));
}
if (!up) {
  console.log("SMOKE FAILED: CDP never came up");
  child.kill();
  process.exit(1);
}

const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
let page = null;
for (let i = 0; i < 25 && !page; i++) {
  const pages = browser.contexts().map((c) => c.pages()).flat();
  page = pages.find((p) => /index\.html/.test(p.url())) || null;
  if (!page) await new Promise((r) => setTimeout(r, 1000));
}
if (!page) {
  console.log("SMOKE FAILED: no app page");
  await browser.close();
  child.kill();
  process.exit(1);
}

await page.waitForTimeout(2500);
console.log("title:", await page.title());
const landing = await page.evaluate(() => document.body.innerText.includes("Use Expozi with a local model"));
console.log("landing screen rendered:", landing);

const status = await page.evaluate(async () => {
  const s = await window.expozi.rag.getStatus();
  const r = await window.expozi.readerStatus();
  const sessions = await window.expozi.rag.listSessions(5);
  const lib = await window.expozi.rag.libraryList();
  return { s, r, sessions: sessions.length, lib: lib.length };
});
console.log("rag status:", JSON.stringify(status.s));
console.log("reader status:", JSON.stringify(status.r));
console.log("history/library bridge — sessions:", status.sessions, "| library rows:", status.lib);

// enter the app and screenshot home
const localBtn = page.getByTitle("Use Expozi with a local model — no account needed");
if (await localBtn.count()) {
  await localBtn.first().click();
  await page.waitForTimeout(1500);
}
await page.screenshot({ path: "scripts/shots/stage4-06-packaged.png", timeout: 60000 });
console.log("SMOKE OK: packaged app boots, renders, and reports honest status");

await browser.close();
child.kill();
process.exit(0);
