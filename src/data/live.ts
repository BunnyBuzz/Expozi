import type { RagSource } from "../rag";
import type { Paper } from "./papers";

const PROVENANCE_LABEL: Record<string, string> = {
  scholar: "Semantic Scholar",
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
    id: s.id || s.url || s.title,
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
  };
}

export function metaLine(p: Paper): string {
  return [
    p.authors.join(", "),
    p.journal,
    p.year ? String(p.year) : "",
    p.citations > 0 ? `cited by ${p.citations}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
