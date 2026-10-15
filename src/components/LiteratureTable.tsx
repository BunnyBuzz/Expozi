import { useMemo, useState } from "react";
import { Star, ArrowUpDown } from "lucide-react";
import type { Paper } from "../data/papers";

interface Props {
  papers: Paper[];
  starred: Set<string>;
  onToggleStar: (id: string) => void;
  onOpenPaper: (id: string) => void;
}

type SortKey = "relevance" | "year" | "citations";

export default function LiteratureTable({ papers, starred, onToggleStar, onOpenPaper }: Props) {
  const [sort, setSort] = useState<SortKey>("relevance");
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [yearMin, setYearMin] = useState("");
  const [yearMax, setYearMax] = useState("");
  const [minCites, setMinCites] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const rows = useMemo(() => {
    const ymin = yearMin.trim() === "" ? -Infinity : Number(yearMin);
    const ymax = yearMax.trim() === "" ? Infinity : Number(yearMax);
    const mc = minCites.trim() === "" ? 0 : Number(minCites);
    const filtered = papers.filter((p) => (p.year ?? 0) >= ymin && (p.year ?? 0) <= ymax && p.citations >= mc);
    if (sort === "year") return [...filtered].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    if (sort === "citations") return [...filtered].sort((a, b) => b.citations - a.citations);
    return filtered;
  }, [papers, sort, yearMin, yearMax, minCites]);

  const included = rows.filter((p) => !excluded.has(p.id)).length;

  const toggleExclude = (id: string) =>
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const hasFilters = yearMin.trim() !== "" || yearMax.trim() !== "" || minCites.trim() !== "";

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-gray-200 bg-white px-3 py-2.5">
        <span className="text-[13px] font-medium text-gray-700">
          {included} of {rows.length} included
        </span>
        <span className="h-4 w-px bg-gray-200" />
        <label className="flex items-center gap-1.5 text-[13px] text-gray-500">
          <ArrowUpDown size={13} />
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-md border border-gray-200 bg-white px-1.5 py-1 text-[13px] text-gray-700 outline-none"
          >
            <option value="relevance">Most relevant</option>
            <option value="year">Newest</option>
            <option value="citations">Most cited</option>
          </select>
        </label>
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
            }}
            className="text-[13px] font-medium text-teal-700 hover:underline"
          >
            Clear
          </button>
        )}
      </div>

      <div className="mt-3 overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="grid grid-cols-[28px_minmax(0,1fr)_52px_64px_28px] items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
          <span />
          <span>Title</span>
          <span className="text-right">Year</span>
          <span className="text-right">Cited</span>
          <span />
        </div>
        {rows.map((p) => {
          const out = excluded.has(p.id);
          return (
            <div key={p.id} className={`border-b border-gray-100 last:border-0 ${out ? "opacity-45" : ""}`}>
              <div className="grid grid-cols-[28px_minmax(0,1fr)_52px_64px_28px] items-center gap-2 px-3 py-2.5">
                <button
                  onClick={() => toggleExclude(p.id)}
                  title={out ? "Include" : "Exclude"}
                  className={`grid h-5 w-5 place-items-center rounded-md border text-[13px] font-bold ${
                    out ? "border-gray-300 text-gray-300" : "border-teal-600 bg-teal-600 text-white"
                  }`}
                >
                  ✓
                </button>
                <button onClick={() => setExpanded((x) => (x === p.id ? null : p.id))} className="min-w-0 text-left">
                  <span className="block truncate text-[14px] font-medium text-gray-900">{p.title}</span>
                  <span className="block truncate text-xs text-gray-500">
                    {[p.authors.join(", "), p.journal].filter(Boolean).join(" · ")}
                  </span>
                </button>
                <span className="text-right text-[13px] text-gray-600">{p.year ?? "—"}</span>
                <span className="text-right text-[13px] text-gray-600">{p.citations}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleStar(p.id);
                  }}
                  className={starred.has(p.id) ? "text-amber-400" : "text-gray-300 hover:text-amber-400"}
                  title="Save to library"
                >
                  <Star size={16} fill={starred.has(p.id) ? "currentColor" : "none"} />
                </button>
              </div>
              {expanded === p.id && (
                <div className="bg-gray-50/60 px-3 py-3 pl-[52px]">
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
          <p className="px-4 py-8 text-center text-sm text-gray-400">No papers match these filters.</p>
        )}
      </div>
    </div>
  );
}
