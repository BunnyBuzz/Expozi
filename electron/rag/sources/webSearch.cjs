// Web search source (no API keys). Three tiers, tried in order, each outcome
// reported in the trace — never a silent zero:
//   1. duck-duck-scrape     — fast raw scraper (can hit DDG's bot wall)
//   2. built-in browser     — hidden Electron window on the plain-HTML DDG
//                             endpoint, passes the wall the scraper can't
//   3. SearXNG pool         — fastest online instances from searx.space
//                             (JSON API first, rendered HTML as a last try)
// Web results are a marked supplement (`provenance: "web"`): they rank after
// peer-reviewed sources and are capped per run upstream.
const dds = require("duck-duck-scrape");
const { render, available } = require("../browser.cjs");
const { typeFromTitle } = require("../quality.cjs");

// Social/aggregator hosts that are noise in a research run.
const DROP_HOSTS = /(^|\.)(pinterest|facebook|instagram|tiktok|x|twitter)\./i;

function decodeEntities(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&hellip;/g, "…")
    .replace(/&#x2F;/g, "/");
}

function clean(s, max = 600) {
  return decodeEntities(String(s || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

// Trace-friendly failure reasons: the raw messages are long and push the
// successful tier out of view in the Tools panel.
function shortReason(e) {
  const m = String((e && e.message) || e || "error");
  if (/anomaly/i.test(m)) return "DDG bot wall";
  if (/VQD/i.test(m)) return "DDG bot wall (VQD)";
  if (/timed out/i.test(m)) return "timeout";
  return m.slice(0, 100);
}

// DDG wraps outbound links as /l/?uddg=<encoded> — unwrap wherever seen.
function unwrapDdg(url) {
  try {
    const x = new URL(url);
    if (/(^|\.)duckduckgo\.com$/.test(x.hostname)) {
      const g = x.searchParams.get("uddg");
      if (g) return decodeURIComponent(g);
    }
    return url;
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------------
// Tier 1 — raw scraper (fast path)
// ---------------------------------------------------------------------------
async function searchDdgScraper(query, limit) {
  const res = await dds.search(query, { safeSearch: dds.SafeSearchType.MODERATE });
  if (res.noResults) return [];
  return (res.results || [])
    .map((r) => ({ title: clean(r.title, 300), url: r.url, snippet: clean(r.description) }))
    .filter((r) => r.title && /^https?:/i.test(r.url || ""))
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Tier 2 — built-in browser on the no-JS endpoint
// ---------------------------------------------------------------------------
// Runs inside the page; must stay self-contained.
function ddgExtractor() {
  const dec = (u) => {
    try {
      const x = new URL(u, location.origin);
      const g = x.searchParams.get("uddg");
      return g ? decodeURIComponent(g) : u;
    } catch {
      return u;
    }
  };
  const out = [];
  for (const r of document.querySelectorAll("div.result, div.web-result")) {
    const a = r.querySelector("a.result__a");
    if (!a) continue;
    const sn = r.querySelector(".result__snippet");
    out.push({
      title: (a.textContent || "").replace(/\s+/g, " ").trim(),
      url: dec(a.href),
      snippet: sn ? (sn.textContent || "").replace(/\s+/g, " ").trim() : "",
    });
  }
  return out;
}

async function searchBrowserDdg(query, limit) {
  const items = await render(
    `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
    ddgExtractor,
  );
  return (items || [])
    .map((r) => ({ title: clean(r.title, 300), url: r.url, snippet: clean(r.snippet) }))
    .filter((r) => r.title && /^https?:/i.test(r.url || ""))
    .slice(0, limit);
}

// ---------------------------------------------------------------------------
// Tier 3 — SearXNG public-instance pool (searx.space "online" list)
// ---------------------------------------------------------------------------
let poolCache = null; // { at, instances: string[] }
const POOL_TTL = 6 * 3600 * 1000;

async function searxPool() {
  if (poolCache && Date.now() - poolCache.at < POOL_TTL) return poolCache.instances;
  try {
    const res = await fetch("https://searx.space/data/instances.json", {
      headers: { "user-agent": "Expozi/0.1 research-app" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`instances.json HTTP ${res.status}`);
    const j = await res.json();
    const instances = Object.entries(j.instances || {})
      .map(([url, i]) => ({
        url,
        status: i && i.http ? i.http.status_code : null,
        mean:
          (i && i.timing && i.timing.search && i.timing.search.all && i.timing.search.all.mean) ||
          (i && i.timing && i.timing.initial && i.timing.initial.all && i.timing.initial.all.mean) ||
          9999,
      }))
      .filter((x) => x.status === 200 && /^https:\/\//.test(x.url))
      .sort((a, b) => a.mean - b.mean)
      .map((x) => x.url.replace(/\/$/, ""));
    poolCache = { at: Date.now(), instances };
  } catch {
    if (!poolCache) poolCache = { at: Date.now(), instances: [] };
  }
  return poolCache.instances;
}

async function searxJson(base, query, limit) {
  const res = await fetch(
    `${base}/search?q=${encodeURIComponent(query)}&format=json&safesearch=1`,
    {
      headers: { "user-agent": "Expozi/0.1 research-app", accept: "application/json" },
      signal: AbortSignal.timeout(9000),
    },
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  return (j.results || [])
    .map((r) => ({ title: clean(r.title, 300), url: r.url, snippet: clean(r.content) }))
    .filter((r) => r.title && /^https?:/i.test(r.url || ""))
    .slice(0, limit);
}

// Runs inside the page; must stay self-contained.
function searxExtractor() {
  const out = [];
  for (const r of document.querySelectorAll("article.result, .result")) {
    const a = r.querySelector("h3 a, a.url_wrapper, a[href]");
    if (!a) continue;
    const title = (a.textContent || "").replace(/\s+/g, " ").trim();
    if (title.length < 3) continue;
    const p = r.querySelector("p.content, .content");
    out.push({
      title,
      url: a.href,
      snippet: p ? (p.textContent || "").replace(/\s+/g, " ").trim() : "",
    });
  }
  return out;
}

async function searxBrowser(base, query, limit) {
  const items = await render(`${base}/search?q=${encodeURIComponent(query)}&safesearch=1`, searxExtractor);
  return (items || [])
    .map((r) => ({ title: clean(r.title, 300), url: r.url, snippet: clean(r.snippet) }))
    .filter((r) => r.title && /^https?:/i.test(r.url || ""))
    .slice(0, limit);
}

async function searchSearxng(query, limit) {
  const pool = await searxPool();
  if (!pool.length) throw new Error("no online instance found on searx.space");
  let lastErr = null;
  for (const base of pool.slice(0, 3)) {
    const host = hostOf(base);
    try {
      const docs = await searxJson(base, query, limit);
      if (docs.length) return { docs, via: `searxng:${host}` };
      lastErr = new Error(`empty result @ ${host}`);
    } catch (e) {
      lastErr = new Error(`${String((e && e.message) || e).slice(0, 80)} @ ${host}`);
    }
  }
  // Some instances rate-limit the JSON API but serve the HTML page to a real
  // browser — one rendered attempt on the fastest instance.
  if (available()) {
    const base = pool[0];
    const host = hostOf(base);
    try {
      const docs = await searxBrowser(base, query, limit);
      if (docs.length) return { docs, via: `searxng:${host}` };
      lastErr = new Error(`empty html result @ ${host}`);
    } catch (e) {
      lastErr = new Error(`${String((e && e.message) || e).slice(0, 80)} @ html ${host}`);
    }
  }
  throw lastErr || new Error("all instances failed");
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------
function finalize(items) {
  const out = [];
  const seen = new Set();
  for (const it of items || []) {
    const url = unwrapDdg(String(it.url || ""));
    if (!it.title || !/^https?:/i.test(url)) continue;
    const host = hostOf(url);
    if (!host || DROP_HOSTS.test(host)) continue;
    const key = url.replace(/#.*$/, "").toLowerCase().replace(/\/$/, "");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      title: String(it.title),
      authors: [],
      year: null,
      journal: host,
      citations: 0,
      url,
      doi: null,
      abstract: it.snippet || "",
      pdfUrl: null,
      provenance: "web",
      // Web pages usually carry no metadata — the title is the only signal
      // (\"... a systematic review\" stays a review, everything else is web).
      studyType: typeFromTitle(it.title) || "web",
    });
  }
  return out;
}

async function searchWebDetailed(query, limit = 6) {
  const q = String(query || "").trim();
  if (!q) return { docs: [], parts: [] };
  const parts = [];

  try {
    const raw = await searchDdgScraper(q, limit);
    const docs = finalize(raw);
    if (docs.length) {
      parts.push({ name: "web:duckduckgo", status: "ran", count: docs.length });
      return { docs, parts };
    }
    parts.push({ name: "web:duckduckgo", status: "failed", reason: "no results" });
  } catch (e) {
    parts.push({ name: "web:duckduckgo", status: "failed", reason: shortReason(e) });
  }

  try {
    const raw = await searchBrowserDdg(q, limit);
    const docs = finalize(raw);
    if (docs.length) {
      parts.push({ name: "web:builtin-browser", status: "ran", count: docs.length });
      return { docs, parts };
    }
    parts.push({ name: "web:builtin-browser", status: "failed", reason: "no results" });
  } catch (e) {
    parts.push({ name: "web:builtin-browser", status: "failed", reason: shortReason(e) });
  }

  try {
    const { docs, via } = await searchSearxng(q, limit);
    parts.push({ name: `web:${via}`, status: "ran", count: docs.length });
    return { docs: finalize(docs), parts };
  } catch (e) {
    parts.push({ name: "web:searxng", status: "failed", reason: shortReason(e) });
  }

  return { docs: [], parts };
}

module.exports = { searchWebDetailed };
