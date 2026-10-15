import { useState } from "react";
import { X, ExternalLink, Copy, Check, Users, Calendar, BookOpen, FlaskConical, ListChecks, AlignLeft } from "lucide-react";
import type { Paper } from "../data/papers";

interface Props {
  paper: Paper;
  onClose: () => void;
}

type Tab = "summary" | "methods" | "findings";

const TABS: { id: Tab; label: string; icon: typeof AlignLeft }[] = [
  { id: "summary", label: "Summary", icon: AlignLeft },
  { id: "methods", label: "Methods", icon: FlaskConical },
  { id: "findings", label: "Findings", icon: ListChecks },
];

export default function DetailPane({ paper, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("summary");
  const [copied, setCopied] = useState(false);

  const link = paper.doi ? `https://doi.org/${paper.doi}` : paper.url || null;
  const citation = [
    paper.authors.join(", ") || "Unknown authors",
    paper.year ? `(${paper.year})` : "",
    `${paper.title}.`,
    paper.journal || "",
    link || "",
  ]
    .filter(Boolean)
    .join(" ");

  const copyCitation = async () => {
    try {
      await navigator.clipboard.writeText(citation);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-[400px] max-w-[92vw] flex-col border-l border-gray-200 bg-white shadow-[-16px_0_48px_rgba(0,0,0,0.10)]">
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-[14px] font-semibold leading-snug text-gray-900">{paper.title}</h3>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100" title="Close">
            <X size={16} />
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
          {paper.authors.length > 0 && (
            <span className="flex items-center gap-1">
              <Users size={12} /> {paper.authors.join(", ")}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Calendar size={12} /> {paper.year ?? "n.d."}
          </span>
          <span className="flex items-center gap-1">
            <BookOpen size={12} /> {paper.journal}
          </span>
        </div>
        <div className="mt-1 text-xs text-gray-500">
          Cited by {paper.citations}
          {paper.sample ? ` · Sample ${paper.sample}` : ""}
        </div>

        <div className="mt-3 flex gap-1 rounded-lg bg-gray-100 p-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium ${
                tab === t.id ? "bg-white text-teal-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              <t.icon size={13} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="slim-scroll min-h-0 flex-1 overflow-y-auto p-4 text-sm leading-relaxed text-gray-700">
        {tab === "summary" && (
          <>
            {paper.summary && <p className="rounded-lg bg-teal-50 p-3 font-medium text-teal-900">{paper.summary}</p>}
            <p className="mt-3 font-semibold text-gray-900">Abstract</p>
            <p className="mt-1">{paper.abstract || "No abstract available for this source."}</p>
          </>
        )}
        {tab === "methods" && (
          <p>{paper.methods || "No methods were extracted for this source."}</p>
        )}
        {tab === "findings" && (
          paper.findings.length > 0 ? (
            <ul className="list-disc space-y-2 pl-5">
              {paper.findings.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          ) : (
            <p>No findings were extracted for this source.</p>
          )
        )}
      </div>

      <div className="border-t border-gray-200 p-3">
        <p className="truncate text-xs text-gray-400" title={citation}>
          {citation}
        </p>
        <div className="mt-2 flex gap-2">
          <button
            onClick={copyCitation}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-gray-300 px-2 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy citation"}
          </button>
          {link && (
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-teal-700 px-2 py-1.5 text-xs font-medium text-white hover:bg-teal-800"
            >
              <ExternalLink size={13} /> Open paper
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
