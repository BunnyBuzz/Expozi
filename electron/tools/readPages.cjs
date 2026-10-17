// Reading tool — fetch the full text of the selected sources through the
// tiered reader (cheerio → jina → built-in browser → crawl4ai → playwright)
// and drop bot-block pages so they never reach the model. The trace reports
// which tier served each source; failures carry reasons (never silent zeros).
const { readMany, looksBlocked } = require("../rag/readers.cjs");
const { define } = require("./registry.cjs");

const TIER_ORDER = ["cheerio", "jina", "browser", "crawl4ai", "scrapy", "bs4", "drissionpage", "playwright"];

define({
  name: "read_pages",
  description:
    "Read the full text of the selected sources through the tiered reader; blocked or unreadable pages fall back to the abstract. The trace reports which reader served each source.",
  input: { docs: "[{ url, abstract }]" },
  async run(input, ctx) {
    const docs = input.docs || [];
    const read = await readMany(
      docs.map((d) => d.url),
      3,
      { jinaKey: ctx.keys && ctx.keys.jina, signal: ctx.signal },
    );

    const withText = docs
      .map((d, i) => {
        const r = read[i] || {};
        const fetched = r.text && r.text.length > 200 && !looksBlocked(r.text) ? r.text : null;
        return {
          doc: d,
          text: fetched || d.abstract || "",
          via: fetched ? r.via : null,
          reason: r.reason || null,
        };
      })
      .filter((x) => x.text && x.text.length > 100);

    const viaCount = {};
    let fetchFailed = 0;
    const failedReasons = {};
    docs.forEach((d, i) => {
      const r = read[i] || {};
      if (r.text && r.text.length > 200 && !looksBlocked(r.text)) return;
      fetchFailed++;
      // Skip "tier unavailable" segments — they are not why the page failed.
      // Keep the deepest (last) real failure: the reason no reader delivered.
      const informative = String(r.reason || "")
        .split(" · ")
        .filter((s) => s && !/not installed|no system Chrome\/Edge|python not found/i.test(s));
      const reason = (informative[informative.length - 1] || "no reader available").slice(0, 48);
      failedReasons[reason] = (failedReasons[reason] || 0) + 1;
    });
    for (const x of withText) if (x.via) viaCount[x.via] = (viaCount[x.via] || 0) + 1;
    const abstractFallback = withText.filter((x) => !x.via).length;

    const seg = [`read ${withText.length}/${docs.length} sources`];
    for (const name of TIER_ORDER) {
      if (viaCount[name]) seg.push(`${name} ${viaCount[name]}`);
    }
    if (abstractFallback) seg.push(`${abstractFallback} abstract fallback`);
    if (fetchFailed) {
      const entries = Object.entries(failedReasons);
      const reasons = entries
        .slice(0, 2)
        .map(([r, n]) => (n > 1 ? `${r} ×${n}` : r))
        .join(", ");
      const more = entries.length > 2 ? `, +${entries.length - 2} more` : "";
      seg.push(`failed ${fetchFailed} (${reasons}${more})`);
    }

    return { data: withText, count: withText.length, detail: seg.join(" · ") };
  },
});
