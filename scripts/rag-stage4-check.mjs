// Stage 4 UI check — history + library DB wiring, enrichment persistence, and
// reopen badges, in phases:
//
//   hydrate  Recents reads the sessions table + Library reads the library
//            table (no run) — prints IPC + sidebar state, screenshot.
//
//   agent    live lite AGENT run → open cited sources → star the first source
//            → verify the star landed in the library DB and the session in the
//            sessions table.
//
//   library  after an app restart: Library view shows the starred source with
//            its badges; Recents shows the DB session.
//
//   review   live lite REVIEW run → sources persisted with study type/quality
//            → decide one row → reopen from Recents → badges + suggestion +
//            decision restored, no re-run.
//
// Usage: node scripts/rag-stage4-check.mjs hydrate|agent|library|review [port]
import fs from "fs";
import { chromium } from "playwright";

const PHASE = process.argv[2] || "hydrate";
const PORT = Number(process.argv[3] || 9343);
const PREFIX = process.env.SHOT_PREFIX || "stage4";
const AGENT_Q = "Does creatine supplementation improve muscle strength in older adults?";
const REVIEW_Q = "What is the effect of exercise on depressive symptoms in adults?";
const BADGE = /RCT|Meta-analysis|Systematic review|Cohort|Trial|Guideline|Umbrella review|Preprint|Comment|Case report|Review|Web page|quality \d+/;
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

const enterApp = async () => {
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
};

const setMode = async (patch) => {
  await page.evaluate((p) => {
    const s = JSON.parse(localStorage.getItem("expozi-settings") || "{}");
    Object.assign(s, p);
    localStorage.setItem("expozi-settings", JSON.stringify(s));
  }, patch);
  await page.reload();
  await page.waitForTimeout(2500);
};

const probe = () =>
  page.evaluate(() => {
    const text = document.body.innerText;
    const stages = [
      ...text.matchAll(
        /(Loading the local model|Breaking down your question|Searching \d+ queries|Reading \d+ sources|Indexing the sources|Ranking the evidence|Writing answer|Screening \d+ sources)[^\n]*/g,
      ),
    ];
    const rows = [...document.querySelectorAll("[data-screening-row]")].map((r) => {
      const btns = [...r.querySelectorAll("button[data-decision]")];
      const activeBtn = btns.find((b) => /bg-teal-600|bg-amber-500|bg-gray-500/.test(b.className));
      const suggestSpan = [...r.querySelectorAll("span")].find((s) => (s.textContent || "").trim().startsWith("Suggested:"));
      const metaSpan = [...r.querySelectorAll("span.block")].pop();
      return {
        url: r.getAttribute("data-screening-row"),
        meta: metaSpan ? metaSpan.textContent.trim() : "",
        active: activeBtn ? activeBtn.getAttribute("data-decision") : null,
        suggestion: suggestSpan ? suggestSpan.textContent.trim().replace(/^Suggested:\s*/, "") : "",
      };
    });
    const hist = [...document.querySelectorAll("[data-history-query]")].map((b) => ({
      q: b.getAttribute("data-history-query"),
      mode: b.getAttribute("data-history-mode"),
    }));
    const libRows = [...document.querySelectorAll("[data-library-row]")].map((r) => ({
      url: r.getAttribute("data-library-row"),
      text: [...r.querySelectorAll("p")].map((p) => p.textContent.trim()).join(" | "),
    }));
    return {
      table: !!document.querySelector("[data-screening-table]"),
      counts: (document.querySelector("[data-screening-counts]")?.textContent || "").trim(),
      rows,
      hist,
      libRows,
      sourcesBtn: (text.match(/View \d+ cited sources/) || [])[0] || "",
      writeLine: (text.match(/wrote (agent|report) answer[^\n]*/) || [])[0] || "",
      noAnswer: /No answer was generated/.test(text),
      failed: /Research failed:/.test(text),
      reopenLine: (text.match(/Reopened saved review[^\n]*/) || [])[0] || "",
      stage: stages.length ? stages[stages.length - 1][0].slice(0, 70) : "",
    };
  });

if (PHASE === "hydrate") {
  await enterApp();
  const ipc = await page.evaluate(async () => {
    const sessions = await window.expozi.rag.listSessions(30);
    const lib = await window.expozi.rag.libraryList();
    return { sessions, lib };
  });
  const info = await probe();
  console.log(
    "DB sessions:",
    ipc.sessions.length,
    "→",
    ipc.sessions.slice(0, 8).map((s) => `${s.mode}: ${s.query.slice(0, 46)}`),
  );
  console.log("sidebar Recents entries:", info.hist.length);
  const sidebarQs = new Set(info.hist.map((h) => h.q));
  const missing = ipc.sessions.filter((s) => !sidebarQs.has(s.query));
  console.log(
    missing.length === 0
      ? "HYDRATE OK: every DB session visible in Recents"
      : `HYDRATE MISSING: ${missing.map((s) => s.query).join(" | ")}`,
  );
  console.log("library rows in DB:", ipc.lib.length);
  console.log("review entries with reopen titles:", info.hist.filter((h) => h.mode === "review").length);
  await shot(`${PREFIX}-01-hydrate`);
}

if (PHASE === "agent") {
  const saved = await page.evaluate(() => localStorage.getItem("expozi-settings"));
  console.log("settings snapshot:", saved);
  await setMode({
    backend: "local",
    apiModel: "",
    baseURL: "",
    embedBackend: "local",
    embedModel: "",
    depth: "lite",
    workflow: "agent",
  });
  await enterApp();

  const ta = page.locator("textarea").first();
  await ta.click();
  await ta.fill(AGENT_Q);
  await ta.press("Enter");
  console.log("submitted (agent/lite):", AGENT_Q);

  const t0 = Date.now();
  let settled = false;
  while (Date.now() - t0 < 30 * 60 * 1000) {
    await page.waitForTimeout(4000);
    const info = await probe();
    if (info.failed) {
      console.log("run failed");
      break;
    }
    if (info.writeLine || info.noAnswer) {
      await page.waitForTimeout(6000);
      settled = true;
      break;
    }
  }
  console.log("settled:", settled, "| elapsed:", Math.round((Date.now() - t0) / 1000) + "s");

  if (settled) {
    const info = await probe();
    console.log("write line:", info.writeLine || "(none)");
    console.log("sources button:", info.sourcesBtn || "(none)");
    const srcBtn = page.locator("button", { hasText: /View \d+ cited sources/ }).first();
    if (await srcBtn.count()) {
      await srcBtn.click();
      await page.waitForTimeout(1200);
      const star = page.locator("[data-star]").first();
      const url = await star.getAttribute("data-star");
      await star.click();
      await page.waitForTimeout(1200);
      const check = await page.evaluate(async (u) => {
        const rows = await window.expozi.rag.libraryList();
        const row = rows.find((r) => r.url === u);
        return {
          count: rows.length,
          saved: !!row,
          row: row
            ? { title: String(row.title).slice(0, 60), study_type: row.study_type, quality: row.quality, year: row.year, citations: row.citation_count }
            : null,
        };
      }, url);
      console.log("starred:", url);
      console.log("library DB:", JSON.stringify(check));
      console.log(check.saved ? "LIBRARY PERSIST OK: star stored in the library DB" : "LIBRARY PERSIST FAILED");
    } else {
      console.log("LIBRARY PERSIST SKIPPED: no cited-sources button found");
    }
    const sessions = await page.evaluate(async () => (await window.expozi.rag.listSessions(30)).slice(0, 3));
    console.log("newest sessions:", sessions.map((s) => `${s.mode}: ${s.query.slice(0, 50)}`));
    const info2 = await probe();
    console.log("sidebar first entry:", JSON.stringify(info2.hist[0] || null));
    const sessionOk = sessions.some((s) => s.query === AGENT_Q && s.mode === "agent");
    const recentsOk = info2.hist.some((h) => h.q === AGENT_Q && h.mode === "agent");
    console.log(
      sessionOk && recentsOk
        ? "RECENTS OK: agent session in the DB and visible in the sidebar"
        : `RECENTS CHECK: session in DB: ${sessionOk} | visible in sidebar: ${recentsOk}`,
    );
    await shot(`${PREFIX}-02-agent-starred`);
  }
  await page.evaluate((snap) => {
    if (snap) localStorage.setItem("expozi-settings", snap);
  }, saved);
  await page.reload();
  await page.waitForTimeout(1500);
  console.log("settings restored:", await page.evaluate(() => localStorage.getItem("expozi-settings")));
}

if (PHASE === "library") {
  await enterApp();
  const info = await probe();
  console.log("sidebar entries:", info.hist.slice(0, 4).map((h) => `${h.mode || "-"}: ${h.q.slice(0, 44)}`));
  const libNav = page.getByRole("button", { name: "Library", exact: true });
  if (await libNav.count()) {
    await libNav.first().click();
    await page.waitForTimeout(1200);
  }
  const info2 = await probe();
  console.log("library rows rendered:", info2.libRows.length);
  info2.libRows.slice(0, 3).forEach((r) => console.log("  ·", r.text.slice(0, 150)));
  const withBadge = info2.libRows.filter((r) => BADGE.test(r.text)).length;
  console.log("rows with a badge:", withBadge, "/", info2.libRows.length);
  console.log(info2.libRows.length > 0 ? "LIBRARY VIEW OK: starred source survived the restart" : "LIBRARY VIEW EMPTY");
  await shot(`${PREFIX}-03-library`);
}

if (PHASE === "review") {
  const saved = await page.evaluate(() => localStorage.getItem("expozi-settings"));
  console.log("settings snapshot:", saved);
  await setMode({
    backend: "local",
    apiModel: "",
    baseURL: "",
    embedBackend: "local",
    embedModel: "",
    depth: "lite",
    workflow: "review",
  });
  await enterApp();

  const ta = page.locator("textarea").first();
  await ta.click();
  await ta.fill(REVIEW_Q);
  await ta.press("Enter");
  console.log("submitted (review/lite):", REVIEW_Q);

  const t0 = Date.now();
  let settled = false;
  while (Date.now() - t0 < 30 * 60 * 1000) {
    await page.waitForTimeout(4000);
    const info = await probe();
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

  if (settled) {
    const info = await probe();
    console.log("counts:", info.counts, "| rows:", info.rows.length);
    console.log("suggestions:", info.rows.filter((r) => r.suggestion).length, "/", info.rows.length);

    // enrichment columns persisted for this session?
    const sid = await page.evaluate(() => {
      const hist = JSON.parse(localStorage.getItem("expozi-history") || "[]");
      const entry = hist.find((h) => h.mode === "review" && h.sessionId);
      return entry ? entry.sessionId : null;
    });
    const loaded = await page.evaluate(async (s) => {
      const ls = await window.expozi.rag.loadSession(s);
      if (!ls) return null;
      return {
        sources: ls.sources.length,
        withStudyType: ls.sources.filter((x) => x.studyType).length,
        withQuality: ls.sources.filter((x) => typeof x.quality === "number").length,
        sample: ls.sources.slice(0, 3).map((x) => ({ st: x.studyType, q: x.quality, r: x.retracted })),
      };
    }, sid);
    console.log("loadSession enrichment:", JSON.stringify(loaded));
    console.log(
      loaded && loaded.withStudyType > 0 && loaded.withQuality > 0
        ? "ENRICHMENT PERSIST OK: study types + quality stored with the session"
        : "ENRICHMENT PERSIST CHECK: some sources lack badges",
    );

    // decide the first row, then reopen from Recents.
    await page.locator("[data-screening-row]").first().locator('button[data-decision="include"]').click();
    await page.waitForTimeout(800);
    await shot(`${PREFIX}-04-review-run`);

    const item = page.locator('[data-history-mode="review"]').first();
    if ((await item.count()) === 0) {
      console.log("REOPEN FAILED: no review entry in the sidebar");
    } else {
      await item.click();
      await page.waitForTimeout(3000);
      let info2 = await probe();
      for (let i = 0; i < 15 && !info2.table; i++) {
        await page.waitForTimeout(1500);
        info2 = await probe();
      }
      console.log("reopen line:", info2.reopenLine || "(none)");
      console.log("badges on reopened rows:");
      info2.rows.slice(0, 4).forEach((r, i) => console.log(`  ${i + 1}. ${r.meta.slice(0, 110)}`));
      const withBadge = info2.rows.filter((r) => BADGE.test(r.meta)).length;
      console.log("rows with a badge:", withBadge, "/", info2.rows.length);
      console.log("decision restored on row 1:", info2.rows[0]?.active);
      console.log("suggestions kept:", info2.rows.filter((r) => r.suggestion).length, "/", info2.rows.length);
      const noRerun = !/Searching \d+ queries|Ranking the evidence/.test(await page.evaluate(() => document.body.innerText));
      console.log("no re-run:", noRerun);
      console.log(
        withBadge > 0 && info2.rows[0]?.active === "include" && noRerun
          ? "REOPEN OK: badges + decision restored from the DB"
          : "REOPEN CHECK FAILED",
      );
      await shot(`${PREFIX}-05-reopened`);
    }
  }
  await page.evaluate((snap) => {
    if (snap) localStorage.setItem("expozi-settings", snap);
  }, saved);
  await page.reload();
  await page.waitForTimeout(1500);
  console.log("settings restored:", await page.evaluate(() => localStorage.getItem("expozi-settings")));
}

await browser.close();
process.exit(0);
