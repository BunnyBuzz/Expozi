// Checks the public SearXNG instance pool (searx.space #online) and which
// instances actually allow the JSON search API — the candidate pool for the
// web-search fallback tier.
// Usage: node scripts/searx-check.mjs
const RES = await fetch("https://searx.space/data/instances.json", {
  headers: { "user-agent": "Expozi/0.1 research-app" },
  signal: AbortSignal.timeout(60000),
});
if (!RES.ok) {
  console.log("instances.json fetch failed:", RES.status);
  process.exit(1);
}
const data = await RES.json();
const all = Object.entries(data.instances || {});
const online = all
  .map(([url, i]) => ({
    url,
    status: i?.http?.status_code,
    mean: i?.timing?.initial?.all?.mean,
    tls: i?.tls?.grade,
    ver: i?.version,
  }))
  .filter((x) => x.status === 200)
  .sort((a, b) => (a.mean ?? 9999) - (b.mean ?? 9999));
console.log(`total ${all.length} · online ${online.length} · testing top 12 for format=json`);
const top = online.slice(0, 12);
const rows = await Promise.all(
  top.map(async (x) => {
    const t0 = Date.now();
    let verdict;
    try {
      const r = await fetch(`${x.url.replace(/\/$/, "")}/search?q=electronic+health+records&format=json`, {
        headers: { "user-agent": "Expozi/0.1 research-app", accept: "application/json" },
        signal: AbortSignal.timeout(9000),
      });
      const body = r.ok ? await r.text() : "";
      let n = 0;
      try {
        n = (JSON.parse(body).results || []).length;
      } catch {
        /* not json */
      }
      verdict = r.ok && Array.isArray(JSON.parse(body || "{}").results) ? `json ok (${n} results)` : `HTTP ${r.status}`;
    } catch (e) {
      verdict = `err ${String(e.message || e).slice(0, 40)}`;
    }
    return { url: x.url, mean: Math.round(x.mean ?? -1), ver: x.ver || "?", ms: Date.now() - t0, verdict };
  }),
);
for (const r of rows) {
  console.log(`${String(r.mean).padStart(5)}ms  ${r.url.padEnd(38)} v${String(r.ver).padEnd(8)} ${r.verdict}`);
}
