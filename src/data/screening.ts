// The screening set's export builders — pure functions used by the review
// workspace's .md / .pdf / .csv buttons. Kept outside the component so the
// CSV can be exercised directly from node scripts (no rendering needed).
import type { Paper } from "./papers";

export interface ScreeningEntry {
  decision?: string | null;
  note?: string | null;
}

// Markdown for the screened set — exported through the same native-dialog
// pipeline as reports (.md direct, .pdf via printToPDF).
export function screeningMarkdown(query: string, papers: Paper[], decisions: Record<string, ScreeningEntry>): string {
  const group = (d: string | null) => papers.filter((p) => (decisions[p.id]?.decision ?? null) === d);
  const included = group("include");
  const maybe = group("maybe");
  const excluded = group("exclude");
  const undecided = group(null);
  const date = new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });

  const entry = (p: Paper, i: number) => {
    const meta = [p.authors.join(", "), p.year ? `(${p.year})` : "", p.journal].filter(Boolean).join(" ");
    const badges = [p.retracted ? "RETRACTED" : "", p.citations > 0 ? `cited by ${p.citations}` : ""]
      .filter(Boolean)
      .join(" · ");
    const lines = [`${i + 1}. **${p.title}**${meta ? ` — ${meta}` : ""}${badges ? `. ${badges}.` : ""}`];
    const note = decisions[p.id]?.note;
    if (note) lines.push(`   - Note: ${note}`);
    if (p.doi) lines.push(`   - https://doi.org/${p.doi}`);
    else if (p.url) lines.push(`   - ${p.url}`);
    return lines.join("\n");
  };

  const section = (title: string, list: Paper[]) =>
    list.length ? `## ${title} (${list.length})\n\n${list.map(entry).join("\n\n")}` : `## ${title} (0)\n\n_None._`;

  return [
    `# Screening — ${query}`,
    "",
    `Screened ${papers.length} sources on ${date}: ${included.length} included · ${maybe.length} maybe · ${excluded.length} excluded · ${undecided.length} undecided.`,
    "",
    section("Included", included),
    "",
    section("Maybe", maybe),
    "",
    section("Excluded", excluded),
    "",
    section("Undecided", undecided),
    "",
  ].join("\n");
}

// RFC 4180 CSV of the screened set — one row per source, grouped in the same
// order as the Markdown export (include → maybe → exclude → undecided) with
// the decision and note on every row. The leading BOM keeps Excel from
// mangling UTF-8 titles; fields are quoted only when they need it.
const CSV_COLUMNS = [
  "Decision",
  "Note",
  "Title",
  "Authors",
  "Year",
  "Journal",
  "Citations",
  "Study type",
  "Quality",
  "Retracted",
  "DOI",
  "URL",
];

function csvField(value: unknown): string {
  const s = value == null ? "" : String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function screeningCsv(papers: Paper[], decisions: Record<string, ScreeningEntry>): string {
  const order: Array<{ label: string; decision: string | null }> = [
    { label: "include", decision: "include" },
    { label: "maybe", decision: "maybe" },
    { label: "exclude", decision: "exclude" },
    { label: "undecided", decision: null },
  ];
  const lines = [CSV_COLUMNS.join(",")];
  for (const { label, decision } of order) {
    for (const p of papers) {
      if ((decisions[p.id]?.decision ?? null) !== decision) continue;
      lines.push(
        [
          label,
          decisions[p.id]?.note ?? "",
          p.title,
          p.authors.join(", "),
          p.year ?? "",
          p.journal,
          p.citations,
          p.studyType ?? "",
          p.quality ?? "",
          p.retracted ? "yes" : "",
          p.doi ?? "",
          p.url ?? "",
        ]
          .map(csvField)
          .join(","),
      );
    }
  }
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}
