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

function htmlToText(html) {
  let t = String(html || "");
  t = t.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
  t = t.replace(/<\/(p|div|h[1-6]|li|tr|br)>/gi, "\n").replace(/<[^>]+>/g, " ");
  t = t
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  return cleanText(t);
}

async function fetchText(url, jinaKey = "") {
  if (!url || /\.pdf(\?|#|$)/i.test(url)) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 25000);
    const res = await fetch("https://r.jina.ai/" + url, {
      signal: ctrl.signal,
      headers: { Accept: "text/plain", ...(jinaKey ? { Authorization: `Bearer ${jinaKey}` } : {}) },
    });
    clearTimeout(t);
    if (res.ok) {
      const md = cleanText(await res.text());
      if (md.length > 400 && !looksBlocked(md)) return md.slice(0, 12000);
    }
  } catch {
    /* fall through to scraping fallback */
  }
  try {
    const { gotScraping } = await import("got-scraping");
    const res = await gotScraping.get(url, { timeout: { request: 25000 }, retry: { limit: 1 } });
    const txt = htmlToText(res.body);
    return txt.length > 400 && !looksBlocked(txt) ? txt.slice(0, 12000) : null;
  } catch {
    return null;
  }
}

async function fetchMany(urls, limit = 3, jinaKey = "") {
  const out = new Array(urls.length).fill(null);
  let i = 0;
  const workers = new Array(Math.min(limit, urls.length)).fill(null).map(async () => {
    while (i < urls.length) {
      const j = i++;
      try {
        out[j] = await fetchText(urls[j], jinaKey);
      } catch {
        out[j] = null;
      }
    }
  });
  await Promise.all(workers);
  return out;
}

module.exports = { fetchText, fetchMany, htmlToText, cleanText, looksBlocked };
