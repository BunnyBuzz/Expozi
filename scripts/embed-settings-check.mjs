// Settings probe — the "Embedding model" row must reflect the fast ONNX
// path (stage 2.5d): `multilingual-e5-small ONNX — fast local` instead of the old GGUF
// download nudge. The LocalModelCard only renders for the on-device backend,
// so the probe switches to it and restores the saved settings afterwards.
// Usage: node scripts/embed-settings-check.mjs [port]
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
const saved = await page.evaluate(() => localStorage.getItem("expozi-settings"));

// The modal may already be open from an earlier probe — only open it when needed.
const open = await page.evaluate(() => !!document.querySelector(".fixed.inset-0.z-50"));
if (!open) {
  let btn = page.locator("button", { hasText: "Go to Settings" });
  if (!(await btn.count())) btn = page.locator("button[title*='ettings'], button[aria-label*='ettings']");
  if (!(await btn.count())) btn = page.locator("button").filter({ has: page.locator("svg.lucide-settings") });
  await btn.first().click();
  await page.waitForTimeout(1200);
}

// The on-device card (with the embedding row) renders only for the local backend.
const onDevice = page.locator("button", { hasText: /Local model \(this PC\)/i });
if (await onDevice.count()) {
  await onDevice.first().click();
  await page.waitForTimeout(600);
}

const text = await page.evaluate(() => {
  const lines = document.body.innerText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const i = lines.findIndex((l) => /^Embedding model:/.test(l));
  return i >= 0 ? lines.slice(Math.max(0, i - 1), i + 3).join("\n") : "(embedding row not found)";
});
console.log("embedding block:\n" + text);

await page.evaluate(() => {
  const el = Array.from(document.querySelectorAll("span,p")).find((e) =>
    /^Embedding model:/.test((e.textContent || "").trim()),
  );
  if (el) el.scrollIntoView({ block: "center" });
});
await page.waitForTimeout(500);
// playwright's page.screenshot waits for document.fonts.ready, which can hang
// in this app (font fetch pending) — use raw CDP capture instead.
try {
  const cdp = await page.context().newCDPSession(page);
  const shot = await cdp.send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync("scripts/shots/stage25d-01-embedding-settings.png", Buffer.from(shot.data, "base64"));
  await cdp.detach();
} catch (e) {
  console.log("(shot skipped:", String((e && e.message) || e).slice(0, 140), ")");
}

// Restore the user's settings and close the modal.
await page.evaluate((snap) => {
  if (snap) localStorage.setItem("expozi-settings", snap);
}, saved);
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
await page.reload();
await page.waitForTimeout(800);
console.log("settings restored:", await page.evaluate(() => localStorage.getItem("expozi-settings")));
await browser.close();
process.exit(0);
