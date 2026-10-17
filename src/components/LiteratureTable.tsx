import { useMemo, useState } from "react";
import { ArrowUpDown, Download, FileSpreadsheet, FileText, Star } from "lucide-react";
import type { Paper } from "../data/papers";
import { metaLine } from "../data/live";
import { exportReport } from "../rag";
import { screeningCsv, screeningMarkdown, type ScreeningEntry } from "../data/screening";

export type { ScreeningEntry };

interface Props {
  query: string;
  papers: Paper[];
  decisions: Record<string, ScreeningEntry>;
  onDecide: (url: string, decision: string | null, note: string | null) => void;
  saveError?: string | null;
  starred: Set<string>;
  onToggleStar: (id: string) => void;
  onOpenPaper: (id: string) => void;
}

type SortKey = "relevance" | "year" | "citations";

const DECISIONS = [
  {
    id: "include",
    label: "Include",
    active: "border-teal-600 bg-teal-600 text-white",
    idle: "border-gray-200 text-gray-600 hover:border-teal-300 hover:text-teal-700",
  },
  {
    id: "maybe",
    label: "Maybe",
    active: "border-amber-500 bg-amber-500 text-white",
    idle: "border-gray-200 text-gray-600 hover:border-amber-300 hover:text-amber-600",
  },
  {
    id: "exclude",
    label: "Exclude",
    active: "border-gray-500 bg-gray-500 text-white",
    idle: "border-gray-200 text-gray-600 hover:border-gray-400",
  },
] as const;

const SUGGEST_COLOR: Record<string, string> = {
  include: "text-teal-700",
  maybe: "text-amber-600",
  exclude: "text-gray-500",
};

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

export default function LiteratureTable({ query, papers, decisions, onDecide, saveError, starred, onToggleStar, onOpenPaper }: Props) {
  const [sort, setSort] = useState<SortKey>("relevance");
  const [yearMin, setYearMin] = useState("");
  const [yearMax, setYearMax] = useState("");
  const [minCites, setMinCites] = useState("");
  const [onlyUndecided, setOnlyUndecided] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [exporting, setExporting] = useState<"md" | "pdf" | "csv" | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const rows = useMemo(() => {
    const ymin = yearMin.trim() === "" ? -Infinity : Number(yearMin);
    const ymax = yearMax.trim() === "" ? Infinity : Number(yearMax);
    const mc = minCites.trim() === "" ? 0 : Number(minCites);
    let filtered = papers.filter((p) => (p.year ?? 0) >= ymin && (p.year ?? 0) <= ymax && p.citations >= mc);
    if (onlyUndecided) filtered = filtered.filter((p) => !decisions[p.id]?.decision);
    if (sort === "year") return [...filtered].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    if (sort === "citations") return [...filtered].sort((a, b) => b.citations - a.citations);
    return filtered;
  }, [papers, decisions, sort, yearMin, yearMax, minCites, onlyUndecided]);

  const counts = useMemo(() => {
    const c = { include: 0, maybe: 0, exclude: 0, undecided: 0 };
    for (const p of papers) {
      const d = decisions[p.id]?.decision;
      if (d === "include" || d === "maybe" || d === "exclude") c[d]++;
      else c.undecided++;
    }
    return c;
  }, [papers, decisions]);

  const setDecision = (p: Paper, decision: string) => {
    const current = decisions[p.id]?.decision ?? null;
    onDecide(p.id, current === decision ? null : decision, decisions[p.id]?.note ?? null);
  };

  const saveNote = (p: Paper) => {
    const note = noteDraft.trim();
    if ((decisions[p.id]?.note ?? "") === note) {
      setNoteOpen(null);
      return;
    }
    onDecide(p.id, decisions[p.id]?.decision ?? null, note || null);
    setNoteOpen(null);
  };

  const doExport = async (format: "md" | "pdf" | "csv") => {
    if (exporting) return;
    setExporting(format);
    setExportStatus(`Exporting ${format === "pdf" ? "PDF" : format === "csv" ? "CSV" : "Markdown"}…`);
    try {
      const common = {
        title: `Screening — ${query}`,
        suggestedName: `expozi-screening-${slugify(query)}`,
        meta: "Expozi · Systematic review — screening",
      };
      const res = await exportReport(
        format === "csv"
          ? { format, csv: screeningCsv(papers, decisions), ...common }
          : { format, markdown: screeningMarkdown(query, papers, decisions), ...common },
      );
      if (res.saved) setExportStatus(`Saved to ${res.path}`);
      else if (res.error) setExportStatus(`Export failed: ${res.error}`);
      else setExportStatus("Export canceled");
    } catch (e) {
      setExportStatus(`Export failed: ${String((e as Error)?.message || e)}`);
    } finally {
      setExporting(null);
      window.setTimeout(() => setExportStatus(null), 10000);
    }
  };

  const hasFilters = yearMin.trim() !== "" || yearMax.trim() !== "" || minCites.trim() !== "" || onlyUndecided;

  return (
    <div className="mt-4" data-screening-table="true">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5">
        <span className="text-[13px] font-medium text-gray-700" data-screening-counts="true">
          {counts.include} included · {counts.maybe} maybe · {counts.exclude} excluded · {counts.undecided} undecided
        </span>
        <span className="text-[12px] text-gray-400">of {papers.length}</span>
        <span className="h-4 w-px bg-gray-200" />
        <label className="flex items-center gap-1.5 text-[13px] text-gray-500">
          <ArrowUpDown size={13} />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-md border border-gray-200 bg-white px-1.5 py-1 text-[13px] text-gray-700 outline-none"
          >
            <option value="relevance">Suggested order</option>
            <option value="year">Newest</option>
            <option value="citations">Most cited</option>
          </select>
        </label>
        <button
          onClick={() => setOnlyUndecided((v) => !v)}
          className={`rounded-md border px-2 py-1 text-[13px] ${
            onlyUndecided ? "border-teal-600 bg-teal-50 text-teal-800" : "border-gray-200 text-gray-600 hover:bg-gray-50"
          }`}
        >
          Undecided only
        </button>
        <label className="flex items-center gap-1 text-[13px] text-gray-500">
          Year
          <input
            value={yearMin}
            onChange={(e) => setYearMin(e.target.value)}
            placeholder="from"
            inputMode="numeric"
            className="w-14 rounded-md border border-gray-200 px-1.5 py-1 text-[13px] outline-none"
          />
          –
          <input
            value={yearMax}
            onChange={(e) => setYearMax(e.target.value)}
            placeholder="to"
            inputMode="numeric"
            className="w-14 rounded-md border border-gray-200 px-1.5 py-1 text-[13px] outline-none"
          />
        </label>
        <label className="flex items-center gap-1 text-[13px] text-gray-500">
          Min cites
          <input
            value={minCites}
            onChange={(e) => setMinCites(e.target.value)}
            placeholder="0"
            inputMode="numeric"
            className="w-14 rounded-md border border-gray-200 px-1.5 py-1 text-[13px] outline-none"
          />
        </label>
        {hasFilters && (
          <button
            onClick={() => {
              setYearMin("");
              setYearMax("");
              setMinCites("");
              setOnlyUndecided(false);
            }}
            className="text-[13px] font-medium text-teal-700 hover:underline"
          >
            Clear
          </button>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          <button
            onClick={() => void doExport("md")}
            disabled={!!exporting}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            title="Export the screened set as Markdown"
          >
            <FileText size={13} /> Export .md
          </button>
          <button
            onClick={() => void doExport("csv")}
            disabled={!!exporting}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            title="Export the screened set as CSV (decision + notes)"
          >
            <FileSpreadsheet size={13} /> CSV
          </button>
          <button
            onClick={() => void doExport("pdf")}
            disabled={!!exporting}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-[12px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            title="Export the screened set as PDF"
          >
            <Download size={13} /> PDF
          </button>
        </span>
      </div>

      {saveError && <p className="mt-1.5 text-[12px] text-red-600">Could not save decision: {saveError}</p>}
      {exportStatus && <p className="mt-1.5 text-[12px] text-gray-500">{exportStatus}</p>}

      <div className="mt-3 overflow-hidden rounded-xl border border-gray-200 bg-white">
        {rows.map((p) => {
          const entry = decisions[p.id] || {};
          const out = entry.decision === "exclude";
          const suggestion = p.suggested || null;
          return (
            <div key={p.id} data-screening-row={p.id} className={`border-b border-gray-100 last:border-0 ${out ? "opacity-55" : ""}`}>
              <div className="flex items-start gap-3 px-3 py-2.5">
                <div className="flex shrink-0 gap-1 pt-0.5">
                  {DECISIONS.map((d) => (
                    <button
                      key={d.id}
                      data-decision={d.id}
                      onClick={() => setDecision(p, d.id)}
                      title={entry.decision === d.id ? "Clear decision" : d.label}
                      className={`rounded-md border px-2 py-1 text-[11px] font-medium ${
                        entry.decision === d.id ? d.active : d.idle
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
                <button onClick={() => setExpanded((x) => (x === p.id ? null : p.id))} className="min-w-0 flex-1 text-left">
                  <span className="block truncate text-[14px] font-medium text-gray-900">{p.title}</span>
                  <span className="block truncate text-xs text-gray-500">{metaLine(p)}</span>
                  {suggestion && (
                    <span className="block truncate text-[11px] text-gray-400">
                      Suggested: <span className={SUGGEST_COLOR[suggestion] || ""}>{suggestion}</span>
                      {p.suggestReason ? ` — ${p.suggestReason}` : ""}
                    </span>
                  )}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleStar(p.id);
                  }}
                  className={starred.has(p.id) ? "shrink-0 text-amber-400" : "shrink-0 text-gray-300 hover:text-amber-400"}
                  title="Save to library"
                >
                  <Star size={16} fill={starred.has(p.id) ? "currentColor" : "none"} />
                </button>
              </div>

              {noteOpen === p.id ? (
                <div className="px-3 pb-2.5 pl-[168px]">
                  <input
                    autoFocus
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    onBlur={() => saveNote(p)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveNote(p);
                      if (e.key === "Escape") setNoteOpen(null);
                    }}
                    placeholder="Why this decision? (saved with the source)"
                    className="w-full rounded-lg border border-gray-300 px-2.5 py-1.5 text-[13px] outline-none focus:border-teal-500"
                  />
                </div>
              ) : entry.note ? (
                <button
                  onClick={() => {
                    setNoteOpen(p.id);
                    setNoteDraft(entry.note || "");
                  }}
                  className="block px-3 pb-2 pl-[168px] text-left text-[12px] text-gray-500 hover:text-gray-700"
                >
                  Note: {entry.note}
                </button>
              ) : (
                <button
                  onClick={() => {
                    setNoteOpen(p.id);
                    setNoteDraft("");
                  }}
                  className="block px-3 pb-2 pl-[168px] text-left text-[12px] text-gray-300 hover:text-gray-500"
                >
                  + Add note
                </button>
              )}

              {expanded === p.id && (
                <div className="bg-gray-50/60 px-3 py-3 pl-[168px]">
                  <p className="text-[13px] leading-relaxed text-gray-700">{p.abstract}</p>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => onOpenPaper(p.id)}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-white"
                    >
                      Open details
                    </button>
                    {(p.doi || p.url) && (
                      <a
                        href={p.doi ? `https://doi.org/${p.doi}` : p.url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-white"
                      >
                        {p.doi ? "DOI" : "Source"}
                      </a>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {rows.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-gray-400">
            {papers.length === 0 ? "No sources were found for this review." : "No sources match these filters."}
          </p>
        )}
      </div>
    </div>
  );
}
