// Reader v2 — tiered full-text extraction with per-tier reporting.
//
// Tiers, tried in order per URL (PDFs go straight to Jina, which parses them):
//   1. cheerio        — local fetch (got-scraping) + article extraction
//   2. jina           — r.jina.ai reader (optional key, keyless works)
//   3. browser        — the app's built-in Chromium (hidden window render)
//   4. crawl4ai       — Python module, only when installed (never bundled)
//   5. playwright     — playwright-core + system Chrome/Edge, only when present
//
// Every tier outcome is recorded; failures carry short reasons and are never
// silent zeros. A tier that cannot run reports why (e.g. "crawl4ai not
// installed", "playwright no system Chrome/Edge").
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const MIN_TEXT = 400;
const MAX_TEXT = 12000;

// ---------------------------------------------------------------------------
// Text utilities
// ---------------------------------------------------------------------------
function cleanText(t) {
  return String(t || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// Anti-bot / JavaScript-gate pages are worse than no fetch at all: they pass
// the length checks and then poison the evidence pool with "verify you are
// human" boilerplate. Callers fall back to the abstract when this is true.
const BLOCK_STRONG =
  /recaptcha|checking your browser|verify you are (a )?human|are you a (robot|human)|unusual traffic|just a moment|ddos protection|cf-browser-verification|enable javascript and cookies/i;
const BLOCK_WEAK = /captcha|access denied|request blocked|robot check|human verification/i;

function looksBlocked(t) {
  const head = String(t || "").slice(0, 800);
  if (head.length < 40) return false;
  if (BLOCK_STRONG.test(head)) return true;
  return BLOCK_WEAK.test(head) && head.length < 2500;
}

function acceptable(text) {
  return !!text && text.length > MIN_TEXT && !looksBlocked(text);
}

function shortErr(e) {
  const m = String((e && e.message) || e || "error");
  const http = m.match(/Response code (\d+)/);
  if (http) return `HTTP ${http[1]}`;
  if (/timed out|timeout|aborted|abort/i.test(m) && !/anomaly/i.test(m)) return "timeout";
  return m.slice(0, 70);
}

// A tier that fetched something unusable reports why: a bot-block page is a
// different failure from a genuinely short document.
function unusableError(txt) {
  const len = String(txt || "").length;
  if (looksBlocked(txt)) return new Error(`blocked page (${len})`);
  return new Error(len > 0 ? `short text (${len})` : "empty");
}

// ---------------------------------------------------------------------------
// Tier 1 — cheerio (local)
// ---------------------------------------------------------------------------
let cheerioMod = null;
function cheerio() {
  if (!cheerioMod) cheerioMod = require("cheerio");
  return cheerioMod;
}

const CONTENT_SELECTORS = [
  "article",
  "main",
  "[role=main]",
  "#content",
  "#main",
  ".article-body",
  ".article__body",
  ".post-content",
  ".entry-content",
];

function extractWithCheerio(html) {
  const $ = cheerio().load(html);
  $("script,style,noscript,svg,iframe,form,button,nav,footer,header,aside").remove();
  let best = "";
  for (const sel of CONTENT_SELECTORS) {
    $(sel).each((_, el) => {
      const t = $(el).text();
      if (t.length > best.length) best = t;
    });
  }
  if (best.length < MIN_TEXT) best = $("body").text();
  return cleanText(best);
}

async function tierCheerio(url) {
  const { gotScraping } = await import("got-scraping");
  const res = await gotScraping.get(url, { timeout: { request: 25000 }, retry: { limit: 1 } });
  const txt = extractWithCheerio(res.body);
  if (acceptable(txt)) return txt.slice(0, MAX_TEXT);
  throw unusableError(txt);
}

// ---------------------------------------------------------------------------
// Tier 2 — Jina reader (keyless works; key raises limits)
// ---------------------------------------------------------------------------
async function tierJina(url, jinaKey) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch("https://r.jina.ai/" + url, {
      signal: ctrl.signal,
      headers: { Accept: "text/plain", ...(jinaKey ? { Authorization: `Bearer ${jinaKey}` } : {}) },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const md = cleanText(await res.text());
    if (acceptable(md)) return md.slice(0, MAX_TEXT);
    throw unusableError(md);
  } finally {
    clearTimeout(t);
  }
}

// ---------------------------------------------------------------------------
// Tier 3 — built-in browser (the app's own Chromium, hidden window)
// ---------------------------------------------------------------------------
// Runs inside the page; must stay self-contained.
function pageTextExtractor() {
  const sels = [
    "article",
    "main",
    "[role=main]",
    "#content",
    "#main",
    ".article-body",
    ".article__body",
    ".post-content",
    ".entry-content",
  ];
  let best = null;
  let bestLen = 0;
  for (const s of sels) {
    for (const el of document.querySelectorAll(s)) {
      const len = (el.innerText || "").length;
      if (len > bestLen) {
        best = el;
        bestLen = len;
      }
    }
  }
  const el = best || document.body;
  const clone = el ? el.cloneNode(true) : null;
  if (clone) {
    for (const bad of clone.querySelectorAll("script,style,noscript,svg,iframe,form,button,nav,footer,header,aside")) {
      bad.remove();
    }
  }
  return { title: document.title || "", text: clone ? (clone.innerText || "").trim() : "" };
}

async function tierBrowser(url) {
  const { render } = require("./browser.cjs");
  const out = await render(url, pageTextExtractor, { settle: 2000, timeout: 45000 });
  const txt = cleanText(out && out.text);
  if (acceptable(txt)) return txt.slice(0, MAX_TEXT);
  throw unusableError(txt);
}

// ---------------------------------------------------------------------------
// Tier 4 — Python-backed readers (crawl4ai, scrapy+selectolax, BeautifulSoup
// +lxml, DrissionPage). All optional: detected via import probes, never
// installed by us. `EXPOZI_PYTHON` (env) picks a specific interpreter first —
// useful for venvs/conda; otherwise `py`/`python3`/`python` are tried.
// ---------------------------------------------------------------------------
const CRAWL4AI_SCRIPT = `
import sys, asyncio
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
async def main():
    from crawl4ai import AsyncWebCrawler
    async with AsyncWebCrawler() as c:
        r = await c.arun(url=sys.argv[1])
        md = getattr(r, "markdown", None)
        if md is not None and not isinstance(md, str):
            md = getattr(md, "fit_markdown", None) or getattr(md, "raw_markdown", None) or str(md)
        out = md or getattr(r, "cleaned_html", None) or getattr(r, "html", None) or ""
        sys.stdout.write(out if isinstance(out, str) else str(out))
try:
    asyncio.run(main())
except Exception as e:
    sys.stderr.write("CRAWL4AI_FAIL: %s" % e)
    sys.exit(3)
`;

const SCRAPY_SCRIPT = `
import sys
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
import scrapy
from scrapy.crawler import CrawlerProcess
from selectolax.lexbor import LexborHTMLParser

class PageSpider(scrapy.Spider):
    name = "expozi_page"
    start_urls = [sys.argv[1]]

    def parse(self, response):
        tree = LexborHTMLParser(response.text)
        for bad in tree.css("script,style,noscript,svg,iframe,form,button,nav,footer,header,aside"):
            bad.decompose()
        node = None
        for sel in ("article", "main", "[role=main]", "#content"):
            for cand in tree.css(sel):
                if node is None or len(cand.text() or "") > len(node.text() or ""):
                    node = cand
        body = tree.body
        out = node if node is not None and len(node.text() or "") > 400 else body
        sys.stdout.write((out.text(separator="\\n") if out else "") or "")

process = CrawlerProcess(settings={
    "LOG_ENABLED": False,
    "ROBOTSTXT_OBEY": False,
    "DOWNLOAD_TIMEOUT": 25,
    "USER_AGENT": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
})
process.crawl(PageSpider)
process.start()
`;

const BS4_SCRIPT = `
import sys, urllib.request
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from bs4 import BeautifulSoup
req = urllib.request.Request(sys.argv[1], headers={
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml",
})
html = urllib.request.urlopen(req, timeout=25).read().decode("utf-8", "replace")
soup = BeautifulSoup(html, "lxml")
for bad in soup(["script", "style", "noscript", "svg", "iframe", "form", "button", "nav", "footer", "header", "aside"]):
    bad.decompose()
cands = soup.find_all(["article", "main"])
node = max(cands, key=lambda n: len(n.get_text())) if cands else None
if node is None or len(node.get_text()) <= 400:
    node = soup.body
sys.stdout.write(node.get_text("\\n") if node is not None else "")
`;

const DRISSION_SCRIPT = `
import sys, time
sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from DrissionPage import ChromiumPage, ChromiumOptions
co = ChromiumOptions().auto_port()
co.headless(True)
page = ChromiumPage(co)
try:
    page.get(sys.argv[1])
    time.sleep(2)
    body = page.ele("tag:body", timeout=10)
    sys.stdout.write(body.text if body else "")
finally:
    try:
        page.quit()
    except Exception:
        pass
`;

const PY_TTL = 10 * 60 * 1000;
const pyProbeCache = new Map(); // importCode -> { at, ok, python, reason }
let pythonPath = null; // last interpreter that worked

function pythonCandidates() {
  const list = [];
  if (process.env.EXPOZI_PYTHON) list.push(process.env.EXPOZI_PYTHON);
  if (process.platform === "win32") list.push("py", "python", "python3");
  else list.push("python3", "python");
  return list;
}

function runProcess(cmd, args, { timeout = 10000 } = {}) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd, args, { windowsHide: true });
    } catch (e) {
      resolve({ code: -1, stdout: "", stderr: String((e && e.message) || e) });
      return;
    }
    let stdout = "";
    let stderr = "";
    let done = false;
    const finish = (r) => {
      if (done) return;
      done = true;
      clearTimeout(t);
      resolve(r);
    };
    const t = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* noop */
      }
      finish({ code: -2, stdout, stderr: stderr + " (timeout)" });
    }, timeout);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (e) => finish({ code: -1, stdout, stderr: String((e && e.message) || e) }));
    child.on("close", (code) => finish({ code, stdout, stderr }));
  });
}

// Finds an interpreter where `importCode` imports cleanly (cached 10 min).
async function findPython(importCode) {
  const hit = pyProbeCache.get(importCode);
  if (hit && Date.now() - hit.at < PY_TTL) return hit;
  const candidates = pythonPath ? [pythonPath, ...pythonCandidates()] : pythonCandidates();
  let anyPython = false;
  for (const py of candidates) {
    const r = await runProcess(py, ["-c", importCode], { timeout: 15000 });
    if (r.code === 0) {
      pythonPath = py;
      const ok = { at: Date.now(), ok: true, python: py, reason: null };
      pyProbeCache.set(importCode, ok);
      return ok;
    }
    // -1 = interpreter not found; the Windows `py` launcher can also exist
    // with a broken default install — that is not a usable interpreter.
    if (r.code !== -1 && !/Unable to create process/i.test(r.stderr || "")) anyPython = true;
  }
  const res = {
    at: Date.now(),
    ok: false,
    python: null,
    reason: anyPython ? "not installed" : "python not found",
  };
  pyProbeCache.set(importCode, res);
  return res;
}

function pythonErr(r) {
  const lines = String(r.stderr || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .filter(
      (s) =>
        !/^Version:/.test(s) && // DrissionPage prints a version banner last
        !/^File "/.test(s) &&
        !/^Traceback/.test(s) &&
        !/^\^+$/.test(s) &&
        !/^line \d+, in /.test(s),
    );
  return new Error((lines.pop() || `exit ${r.code}`).slice(0, 70));
}

async function runPythonTier(prefix, importCode, script, url, timeout = 90000) {
  const avail = await findPython(importCode);
  if (!avail.ok) throw new Error(`${prefix} ${avail.reason}`);
  const r = await runProcess(avail.python, ["-c", script, url], { timeout });
  if (r.code !== 0) throw pythonErr(r);
  const txt = cleanText(r.stdout);
  if (acceptable(txt)) return txt.slice(0, MAX_TEXT);
  throw unusableError(txt);
}

async function tierCrawl4ai(url) {
  return runPythonTier("crawl4ai", "import crawl4ai", CRAWL4AI_SCRIPT, url);
}

async function tierScrapy(url) {
  return runPythonTier("scrapy", "import scrapy, selectolax", SCRAPY_SCRIPT, url);
}

async function tierBs4(url) {
  return runPythonTier("bs4", "import bs4, lxml", BS4_SCRIPT, url);
}

async function tierDrissionPage(url) {
  return runPythonTier("drissionpage", "import DrissionPage", DRISSION_SCRIPT, url);
}

// ---------------------------------------------------------------------------
// Last tier — playwright-core + system Chrome/Edge (optional)
// ---------------------------------------------------------------------------
let playwrightCache = null;

function systemBrowserChannel() {
  if (playwrightCache) return playwrightCache;
  if (process.platform !== "win32") {
    // Other platforms: let playwright resolve the channel; failures report why.
    playwrightCache = { ok: true, channel: "chrome" };
    return playwrightCache;
  }
  const roots = [
    process.env["ProgramFiles"] || "C:\\Program Files",
    process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)",
    process.env["LOCALAPPDATA"] || "",
  ];
  const candidates = {
    chrome: roots.map((r) => path.join(r, "Google\\Chrome\\Application\\chrome.exe")),
    msedge: roots.map((r) => path.join(r, "Microsoft\\Edge\\Application\\msedge.exe")),
  };
  for (const channel of ["chrome", "msedge"]) {
    for (const p of candidates[channel]) {
      if (p && fs.existsSync(p)) {
        playwrightCache = { ok: true, channel };
        return playwrightCache;
      }
    }
  }
  playwrightCache = { ok: false, channel: null };
  return playwrightCache;
}

async function tierPlaywright(url) {
  const sys = systemBrowserChannel();
  if (!sys.ok) throw new Error("playwright no system Chrome/Edge");
  const { chromium } = require("playwright-core");
  let browser = null;
  try {
    browser = await chromium.launch({ channel: sys.channel, headless: true });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2000);
    const out = await page.evaluate(pageTextExtractor);
    const txt = cleanText(out && out.text);
    if (acceptable(txt)) return txt.slice(0, MAX_TEXT);
    throw unusableError(txt);
  } finally {
    if (browser) {
      try {
        await browser.close();
      } catch {
        /* noop */
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------
function tierList(isPdf, only) {
  if (isPdf) return [["jina", (url, opts) => tierJina(url, opts.jinaKey)]];
  const all = [
    ["cheerio", (url) => tierCheerio(url)],
    ["jina", (url, opts) => tierJina(url, opts.jinaKey)],
    ["browser", (url) => tierBrowser(url)],
    ["crawl4ai", (url) => tierCrawl4ai(url)],
    ["scrapy", (url) => tierScrapy(url)],
    ["bs4", (url) => tierBs4(url)],
    ["drissionpage", (url) => tierDrissionPage(url)],
    ["playwright", (url) => tierPlaywright(url)],
  ];
  // `only` (debug/test aid): run a specific tier list, e.g. only: ["scrapy"].
  return only && only.length ? all.filter(([name]) => only.includes(name)) : all;
}

async function readOne(url, opts = {}) {
  if (!url) return { text: null, via: null, reason: "no url" };
  const isPdf = /\.pdf(\?|#|$)/i.test(url);
  const failures = [];
  for (const [name, fn] of tierList(isPdf, opts.only)) {
    if (opts.signal && opts.signal.aborted) {
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    }
    try {
      const text = await fn(url, opts);
      return { text, via: name, reason: null, failures };
    } catch (e) {
      if (e && e.name === "AbortError") throw e;
      failures.push(`${name}: ${shortErr(e)}`);
    }
  }
  return {
    text: null,
    via: null,
    reason: (failures.length ? failures.join(" · ") : "no reader") + (isPdf ? " [pdf]" : ""),
    failures,
  };
}

async function readMany(urls, limit = 3, opts = {}) {
  const out = new Array(urls.length).fill(null);
  let i = 0;
  const workers = new Array(Math.min(limit, urls.length)).fill(null).map(async () => {
    while (i < urls.length) {
      const j = i++;
      out[j] = await readOne(urls[j], opts);
    }
  });
  await Promise.all(workers);
  return out;
}

// Short display form of an interpreter path (e.g. "expozi-pyenv\Scripts\python.exe").
function shortPy(py) {
  if (!py) return null;
  const segs = String(py).split(/[\\/]/).filter(Boolean);
  if (segs.length <= 1) return segs[0] || py;
  const last = segs[segs.length - 1];
  const dir = segs[segs.length - 2];
  const parent = segs[segs.length - 3];
  if ((dir === "Scripts" || dir === "bin") && parent) return `${parent}\\${dir}\\${last}`;
  return `${dir}\\${last}`;
}

// Availability summary for Settings and dev logs. `browser` is the app's own
// Chromium (always ready); the rest are optional and reported honestly.
async function readerAvailability() {
  const { available } = require("./browser.cjs");
  const sys = systemBrowserChannel();
  const crawl = await findPython("import crawl4ai");
  const dp = await findPython("import DrissionPage");
  const stacks = await Promise.all([
    findPython("import scrapy, selectolax").then((r) => ({
      name: "scrapy+selectolax",
      ok: r.ok,
      python: shortPy(r.python),
      reason: r.reason,
    })),
    findPython("import bs4, lxml").then((r) => ({
      name: "BeautifulSoup+lxml",
      ok: r.ok,
      python: shortPy(r.python),
      reason: r.reason,
    })),
    // DrissionPage drives a system Chrome/Edge — without one it cannot run.
    Promise.resolve({
      name: "DrissionPage",
      ok: dp.ok && sys.ok,
      python: shortPy(dp.python),
      reason: dp.ok && !sys.ok ? "no system Chrome/Edge" : dp.reason,
    }),
  ]);
  return {
    browser: available(),
    crawl4ai: crawl.ok,
    crawl4aiReason: crawl.reason || null,
    pythonStacks: stacks,
    playwright: sys.ok ? `system ${sys.channel}` : null,
    playwrightReason: sys.ok ? null : "no system Chrome/Edge",
  };
}

module.exports = {
  readOne,
  readMany,
  readerAvailability,
  cleanText,
  looksBlocked,
  MIN_TEXT,
  MAX_TEXT,
};
