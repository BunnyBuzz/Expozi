// Source enrichment + quality scoring.
// - OpenAlex (free, no key): one batched DOI lookup fills citation counts,
//   missing years, retraction flags and coarse type hints.
// - Every doc then gets a canonical studyType and the numeric quality used
//   for ordering (newest → best) and evidence numbering.
// Enrichment is best-effort but never silent: outcomes are reported as trace
// parts (enriched count / skipped without DOIs / failed with a reason).
const { define } = require("./registry.cjs");
const { applyQuality, typeFromOpenAlex, typeFromTitle } = require("../rag/quality.cjs");

const SELECT = "doi,cited_by_count,publication_year,type,is_retracted";

function normDoi(doi) {
  return String(doi || "")
    .trim()
    .replace(/^https?:\/\/doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .toLowerCase();
}

async function openAlexByDoi(dois) {
  const out = new Map();
  const unique = [...new Set(dois.map(normDoi).filter(Boolean))];
  for (let i = 0; i < unique.length; i += 25) {
    const chunk = unique.slice(i, i + 25);
    const url =
      "https://api.openalex.org/works?filter=doi:" +
      chunk.map((d) => encodeURIComponent(d)).join("|") +
      `&per-page=50&select=${SELECT}`;
    const res = await fetch(url, {
      headers: { "user-agent": "Expozi/0.1 research-app" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`OpenAlex HTTP ${res.status}`);
    const j = await res.json();
    for (const w of j.results || []) {
      const key = normDoi(w.doi);
      if (key) out.set(key, w);
    }
  }
  return out;
}

define({
  name: "enrich_sources",
  description:
    "Enrich sources with citation counts, years and retraction flags (OpenAlex, no key) and compute the quality score used for ordering and evidence numbering.",
  input: { docs: "[{ doi, title, year, citations, provenance, studyType }]" },
  async run(input) {
    const docs = input.docs || [];
    const withDoi = docs.filter((d) => d && d.doi);
    const parts = [];
    let enriched = 0;
    let retracted = 0;

    if (withDoi.length > 0) {
      try {
        const byDoi = await openAlexByDoi(withDoi.map((d) => d.doi));
        for (const d of withDoi) {
          const hit = byDoi.get(normDoi(d.doi));
          if (!hit) continue;
          if (typeof hit.cited_by_count === "number") d.citations = hit.cited_by_count;
          if (hit.publication_year && !d.year) d.year = hit.publication_year;
          if (hit.is_retracted) {
            d.retracted = true;
            retracted++;
          }
          const weak = !d.studyType || d.studyType === "web" || d.studyType === "other";
          if (weak) {
            const t = typeFromOpenAlex(hit.type) || (d.provenance === "web" ? typeFromTitle(d.title) : null);
            if (t) d.studyType = t;
          }
          enriched++;
        }
        parts.push({ name: "openalex", status: "ran", count: enriched });
      } catch (e) {
        parts.push({ name: "openalex", status: "failed", reason: String((e && e.message) || e).slice(0, 70) });
      }
    } else {
      parts.push({ name: "openalex", status: "skipped", reason: "no DOIs" });
    }
    const noDoi = docs.length - withDoi.length;
    if (noDoi > 0) parts.push({ name: "no-doi", status: "skipped", reason: `${noDoi} docs` });

    for (const d of docs) if (d) applyQuality(d);

    return {
      data: docs,
      count: docs.length,
      detail: `${enriched} enriched (OpenAlex) · ${retracted} retracted`,
      parts,
    };
  },
});
