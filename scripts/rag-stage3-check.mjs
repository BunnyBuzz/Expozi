// Stage 3 UI check — review screening workspace in the real app, in phases:
//
//   run     live lite REVIEW run → screening table appears with rubric
//           suggestions → then runs the shared decide+export flow.
//
//   decide  assumes the screening table is open (fresh run or reopened from
//           Recents): set decisions (include / maybe / exclude) + a note,
//           check counts, verify the rows landed in the library DB, export
//           the screened set as .md through the native save dialog.
//
//   verify  click the saved review in Recents → the workspace reopens from the
//           library DB with every decision and the note restored — no re-run.
//
// Usage: node scripts/rag-stage3-check.mjs run|decide|verify [port]
import fs from "fs";
import os from "os";
import path from "path";
import { execSync } from "child_process";
import { chromium } from "playwright";

const PHASE = process.argv[2] || "run";
const PORT = Number(process.argv[3] || 9343);
const EXPECT = process.argv[4] || "decided";
const PREFIX = process.env.SHOT_PREFIX || "stage3";
const QUERY = "How does intermittent fasting affect metabolic markers?";
const NOTE = "Key RCT — keep for synthesis";
fs.mkdirSync("scripts/shots", { recursive: true });

const browser = await chromium.connectOverCDP(`http://localhost:${PORT}`);
const pages = browser.contexts().map((c) => c.pages()).flat();
const page = pages.find((p) => /index\.html|localhost:1420/.test(p.url())) || pages[0];
if (!page) {
  console.log("NO PAGE");
  process.exit(1);
}
const shot = async (n) => {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await page.screenshot({ path: `scripts/shots/${n}.png`, timeout: 60000 });
      return;
    } catch {
      if (attempt === 2) console.log("(shot skipped:", n, ")");
      await page.waitForTimeout(2000);
    }
  }
};

// DOM probe shared by all phases.
const probe = () =>
  page.evaluate(() => {
    const text = document.body.innerText;
    const rows = [...document.querySelectorAll("[data-screening-row]")].map((r) => {
      const btns = [...r.querySelectorAll("button[data-decision]")];
      const activeBtn = btns.find((b) => /bg-teal-600|bg-amber-500|bg-gray-500/.test(b.className));
      const titleBtn = [...r.querySelectorAll("button")].find((b) => (b.className || "").includes("flex-1"));
      const noteBtn = [...r.querySelectorAll("button")].find((b) => /^Note:/.test((b.textContent || "").trim()));
      const suggestSpan = [...r.querySelectorAll("span")].find((s) => (s.textContent || "").trim().startsWith("Suggested:"));
      return {
        url: r.getAttribute("data-screening-row"),
        title: (titleBtn?.querySelector("span.block")?.textContent || "").trim(),
        active: activeBtn ? activeBtn.getAttribute("data-decision") : null,
        note: noteBtn ? noteBtn.textContent.trim().replace(/^Note:\s*/, "") : null,
        suggestion: (suggestSpan?.textContent || "").trim(),
      };
    });
    return {
      table: !!document.querySelector("[data-screening-table]"),
      counts: (document.querySelector("[data-screening-counts]")?.textContent || "").trim(),
      saveError: (text.match(/Could not save decision[^\n]*/) || [])[0] || "",
      rows,
      screenLine: (text.match(/\d+ sources → include[^\n]*/) || [])[0] || "",
      reopenLine: (text.match(/Reopened saved review[^\n]*/) || [])[0] || "",
      failed: /Research failed:/.test(text),
      stage: [...text.matchAll(/(Breaking down your question|Searching \d+ queries|Reading \d+ sources|Indexing the sources|Ranking the evidence)[^\n]*/g)].slice(-1)[0]?.[0] || "",
    };
  });

const reviewSessionId = () =>
  page.evaluate(() => {
    const hist = JSON.parse(localStorage.getItem("expozi-history") || "[]");
    const entry = hist.find((h) => h.mode === "review" && h.sessionId);
    return entry ? entry.sessionId : null;
  });

// Shared: set decisions + note on the first three rows, confirm counts, confirm
// the rows actually landed in the library DB, then export .md via the dialog.
const decideAndExport = async () => {
  const before = await probe();
  console.log("screen_sources trace:", before.screenLine || "(none)");
  console.log("counts before decisions:", before.counts, "| rows:", before.rows.length);
  console.log("suggestions (display order):");
  before.rows.slice(0, 8).forEach((r, i) => console.log(`  ${i + 1}. ${r.suggestion || "(no suggestion)"} — ${r.title.slice(0, 70)}`));
  const missing = before.rows.filter((r) => !r.suggestion).length;
  console.log(missing === 0 ? "SUGGESTIONS OK: every row carries a rubric proposal" : `SUGGESTIONS MISSING on ${missing} rows`);

  for (const [decision, idx] of [
    ["include", 0],
    ["maybe", 1],
    ["exclude", 2],
  ]) {
    const row = page.locator("[data-screening-row]").nth(idx);
    if ((await row.count()) === 0) {
      console.log(`(no row ${idx} — skipping ${decision})`);
      continue;
    }
    await row.locator(`button[data-decision="${decision}"]`).click();
    await page.waitForTimeout(400);
  }
  const noteRow = page.locator("[data-screening-row]").nth(0);
  await noteRow.getByText("+ Add note", { exact: false }).click();
  await page.waitForTimeout(300);
  const noteInput = noteRow.locator("input[placeholder*='Why this decision']");
  await noteInput.fill(NOTE);
  await noteInput.press("Enter");
  await page.waitForTimeout(1000);

  const after = await probe();
  console.log("counts after decisions:", after.counts);
  const expected = `1 included · 1 maybe · 1 excluded · ${Math.max(0, after.rows.length - 3)} undecided`;
  console.log(after.counts === expected ? "COUNTS OK" : `COUNTS MISMATCH — expected "${expected}"`);
  console.log("save error line:", after.saveError || "(none)");

  // Immediate DB check — the UI is optimistic, this is the source of truth.
  const sid = await reviewSessionId();
  const persisted = await page.evaluate(async (s) => {
    if (!s) return null;
    const rows = await window.expozi.rag.listScreening(s);
    return {
      total: rows.length,
      decided: rows.filter((r) => r.decision).map((r) => ({ url: r.url, decision: r.decision, note: r.note })),
    };
  }, sid);
  console.log("persisted immediately:", JSON.stringify(persisted));
  const persistedOk = persisted && persisted.decided.length === 3 && persisted.decided.some((r) => r.note === NOTE);
  console.log(persistedOk ? "DB PERSIST OK: 3 decisions + note stored" : "DB PERSIST FAILED");
  await shot(`${PREFIX}-01-screening`);

  // Export the screened set as .md through the native dialog.
  const dirs = [path.join(os.homedir(), "Downloads"), path.join(os.homedir(), "Desktop")];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (/^expozi-screening-.*\.md$/.test(f)) fs.unlinkSync(path.join(dir, f));
    }
  }
  const exportT0 = Date.now();
  await page.getByRole("button", { name: /Export \.md/ }).click();
  await page.waitForTimeout(2500);
  try {
    console.log("dialog:", execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "scripts/accept-save-dialog.ps1"`, { encoding: "utf8" }).trim());
  } catch (e) {
    console.log("dialog script error:", String(e.message || e).slice(0, 200));
  }
  await page.waitForTimeout(2500);

  let exported = null;
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!/^expozi-screening-.*\.md$/.test(f)) continue;
      const p = path.join(dir, f);
      const st = fs.statSync(p);
      if (st.mtimeMs >= exportT0 - 5000 && (!exported || st.mtimeMs > exported.mtimeMs)) exported = { path: p, mtimeMs: st.mtimeMs };
    }
  }
  if (exported) {
    const md = fs.readFileSync(exported.path, "utf8");
    console.log("exported:", exported.path, `(${md.length} chars)`);
    console.log(
      "export checks — included section:",
      /## Included \(1\)/.test(md),
      "| maybe section:",
      /## Maybe \(1\)/.test(md),
      "| excluded section:",
      /## Excluded \(1\)/.test(md),
      "| note carried:",
      md.includes(NOTE),
      "| query title:",
      md.includes(`# Screening — ${QUERY}`),
    );
    console.log("export head:", JSON.stringify(md.slice(0, 200)));
  } else {
    console.log("EXPORT FAILED: no fresh expozi-screening-*.md found in Downloads/Desktop");
    const status = await page.evaluate(() => (document.body.innerText.match(/Export (failed|canceled)[^\n]*|Saved to [^\n]*/) || [])[0] || "(no status text)");
    console.log("ui export status:", status);
  }
  await shot(`${PREFIX}-02-exported`);
};

if (PHASE === "run") {
  // 0) snapshot the user's real settings
  const saved = await page.evaluate(() => localStorage.getItem("expozi-settings"));
  console.log("settings snapshot:", saved);

  // 1) hermetic lite/local REVIEW run
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem("expozi-settings") || "{}");
    raw.backend = "local";
    raw.apiModel = "";
    raw.baseURL = "";
    raw.embedBackend = "local";
    raw.embedModel = "";
    raw.depth = "lite";
    raw.workflow = "review";
    localStorage.setItem("expozi-settings", JSON.stringify(raw));
  });
  await page.reload();
  await page.waitForTimeout(2500);
  const localBtn = page.getByTitle("Use Expozi with a local model — no account needed");
  if (await localBtn.count()) {
    await localBtn.first().click();
    await page.waitForTimeout(1000);
  }
  const newBtn = page.getByRole("button", { name: "New", exact: true });
  if (await newBtn.count()) {
    await newBtn.first().click();
    await page.waitForTimeout(600);
  }

  const ta = page.locator("textarea").first();
  await ta.click();
  await ta.fill(QUERY);
  await ta.press("Enter");
  console.log("submitted (review/lite):", QUERY);

  const t0 = Date.now();
  let last = "";
  let settled = false;
  while (Date.now() - t0 < 30 * 60 * 1000) {
    await page.waitForTimeout(4000);
    const s = Math.round((Date.now() - t0) / 1000);
    const info = await probe();
    const key = `${info.stage}|${info.table}|${!!info.screenLine}`;
    if (key !== last) {
      last = key;
      console.log(`+${s}s stage:"${info.stage}" table:${info.table} screen:${info.screenLine ? "yes" : "no"}`);
    }
    if (info.failed) {
      console.log("run failed");
      break;
    }
    if (info.table) {
      await page.waitForTimeout(4000);
      settled = true;
      break;
    }
  }
  console.log("settled:", settled, "| elapsed:", Math.round((Date.now() - t0) / 1000) + "s");
  if (settled) await decideAndExport();

  // 2) restore settings (history kept on purpose), reload
  await page.evaluate((snap) => {
    if (snap) localStorage.setItem("expozi-settings", snap);
  }, saved);
  await page.reload();
  await page.waitForTimeout(1500);
  console.log("settings restored:", await page.evaluate(() => localStorage.getItem("expozi-settings")));
}

if (PHASE === "decide") {
  const info = await probe();
  if (!info.table) {
    console.log("DECIDE FAILED: no screening table on screen — open the review first");
    await browser.close();
    process.exit(0);
  }
  await decideAndExport();
}

if (PHASE === "verify") {
  const hist = await page.evaluate(() => JSON.parse(localStorage.getItem("expozi-history") || "[]"));
  const entry = hist.find((h) => h.mode === "review" && h.sessionId);
  console.log("review history entry:", JSON.stringify(entry || null));
  if (!entry) {
    console.log("VERIFY FAILED: no review entry with a sessionId in history");
    await browser.close();
    process.exit(0);
  }

  // click the saved review in the sidebar (title marks review entries)
  const item = page.locator('button[title*="systematic review"]').first();
  if ((await item.count()) === 0) {
    console.log("VERIFY FAILED: no review entry visible in the sidebar");
    await browser.close();
    process.exit(0);
  }
  await item.click();
  await page.waitForTimeout(3000);

  let info = await probe();
  for (let i = 0; i < 15 && !info.table; i++) {
    await page.waitForTimeout(1500);
    info = await probe();
  }
  console.log("reopen line:", info.reopenLine || "(none)");
  console.log("counts after restart:", info.counts, "| rows:", info.rows.length);
  console.log(
    "row decisions after restart:",
    info.rows.slice(0, 4).map((r) => `${r.active || "undecided"}${r.note ? ` (note: ${r.note})` : ""}`).join(" · "),
  );
  console.log("suggestions kept:", info.rows.filter((r) => r.suggestion).length, "/", info.rows.length);

  const expect = ["include", "maybe", "exclude"];
  const got = info.rows.slice(0, 3).map((r) => r.active);
  const noRerun = !/Searching \d+ queries|Ranking the evidence/.test(await page.evaluate(() => document.body.innerText));
  if (EXPECT === "undecided") {
    const clean = got.every((d) => d === null) && !info.rows.some((r) => r.note);
    const countsClean = /^0 included · 0 maybe · 0 excluded · \d+ undecided$/.test(info.counts);
    console.log("REOPEN CLEAN — undecided rows:", clean, "| counts zeroed:", countsClean, "| no re-run:", noRerun);
    console.log(clean && countsClean && noRerun ? "VERIFY OK: reopened clean (decisions not yet made)" : "VERIFY FAILED: expected a clean reopen");
  } else {
    const decisionsOk = expect.every((d, i) => got[i] === d);
    const noteOk = (info.rows[0]?.note || "") === NOTE;
    const countsOk = /^1 included · 1 maybe · 1 excluded · \d+ undecided$/.test(info.counts);
    console.log("PERSISTENCE — decisions:", decisionsOk, "| note:", noteOk, "| counts:", countsOk, "| no re-run:", noRerun);
    console.log(
      decisionsOk && noteOk && countsOk && noRerun
        ? "VERIFY OK: decisions and note survived the restart"
        : "VERIFY FAILED: state did not fully survive",
    );
  }
  await shot(`${PREFIX}-03-reopened`);
}

await browser.close();
process.exit(0);
