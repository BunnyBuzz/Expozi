import type { RagSource, LibraryRow } from "../rag";
import type { Paper } from "./papers";

const PROVENANCE_LABEL: Record<string, string> = {
  arxiv: "arXiv",
  pubmed: "PubMed",
  web: "Web",
};

function summarizes(text: string, max = 220): string {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("? "), cut.lastIndexOf("! "));
  if (end > 80) return cut.slice(0, end + 1);
  return t.length > max ? cut + "…" : cut;
}

/** Map a pipeline source (electron/rag) onto the Paper shape the UI renders. */
export function toPaper(s: RagSource): Paper {
  const abstract = String(s.abstract || "").replace(/\s+/g, " ").trim();
  return {
    // The canonical DB key is the raw source URL (screening decisions, the
    // library and passages all key on it); s.id is a normalized duplicate.
    id: s.url || s.id || s.title,
    title: s.title || "Untitled source",
    authors: s.authors || [],
    year: s.year ?? null,
    journal: s.journal || PROVENANCE_LABEL[s.provenance] || "Source",
    citations: s.citations || 0,
    sample: "",
    abstract,
    summary: summarizes(abstract),
    methods: "",
    findings: [],
    doi: s.doi || null,
    url: s.url ?? undefined,
    provenance: s.provenance,
    studyType: s.studyType ?? null,
    quality: s.quality ?? null,
    retracted: !!s.retracted,
    suggested: s.suggested ?? null,
    suggestReason: s.suggestReason ?? null,
  };
}

// Canonical study-type labels for the source badges. Plain web pages and
// unclassified sources get no label.
const STUDY_LABEL: Record<string, string> = {
  umbrella: "Umbrella review",
  "meta-analysis": "Meta-analysis",
  "systematic-review": "Systematic review",
  guideline: "Guideline",
  rct: "RCT",
  trial: "Trial",
  cohort: "Cohort study",
  review: "Review",
  preprint: "Preprint",
  "case-report": "Case report",
  comment: "Comment",
};

export function metaLine(p: Paper): string {
  const venue = p.provenance === "web" && p.journal ? `Web · ${p.journal}` : p.journal;
  return [
    p.authors.join(", "),
    venue,
    p.year ? String(p.year) : "",
    STUDY_LABEL[p.studyType || ""] || "",
    p.citations > 0 ? `cited by ${p.citations}` : "",
    p.retracted ? "RETRACTED" : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Map a persisted library row (DB) onto the Paper shape the UI renders. */
export function libraryRowToPaper(r: LibraryRow): Paper {
  const abstract = String(r.abstract || "").replace(/\s+/g, " ").trim();
  return {
    id: r.url,
    title: r.title || "Untitled source",
    authors: String(r.authors || "").split("; ").filter(Boolean),
    year: r.year ?? null,
    journal: r.journal || (r.source_type === "web" ? "Web" : "Source"),
    citations: r.citation_count || 0,
    sample: "",
    abstract,
    summary: summarizes(abstract),
    methods: "",
    findings: [],
    doi: r.doi ?? null,
    url: r.url,
    provenance: r.source_type || "web",
    studyType: r.study_type ?? null,
    quality: r.quality ?? null,
    retracted: !!r.retracted,
  };
}

/** The report's own title (first markdown heading) when present, else the query.
 *  Models sometimes emit a placeholder heading ("# Title") — that is not a
 *  title, so fall back to the query for card labels and file names. */
const GENERIC_TITLE = /^(title|report|report title|untitled|research report)$/i;

export function reportTitle(answer: string, query: string): string {
  const m = String(answer || "").match(/^#\s+(.+)$/m);
  const t = m ? m[1].trim() : "";
  if (t && !GENERIC_TITLE.test(t)) return t;
  return query || "Research report";
}
