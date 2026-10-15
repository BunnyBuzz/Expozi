import { ListOrdered, BookOpen, Copy, Check, Download, Star, FileText, FlaskConical } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Paper } from "../data/papers";
import { metaLine } from "../data/live";
import LiteratureTable from "./LiteratureTable";
import type { HomeMode } from "./HomeView";

export interface FollowUpItem {
  q: string;
  a: string;
  error?: string | null;
}

interface Props {
  query: string;
  papers: Paper[];
  starred: Set<string>;
  onToggleStar: (id: string) => void;
  onOpenPaper: (id: string) => void;
  onFollowUp?: (q: string) => void;
  followUpBlocks: FollowUpItem[];
  version: number;
  kindLabel: string;
  thinking: string | null;
  answer: string | null;
  streaming: boolean;
  mode: HomeMode;
  suggestions?: string[];
  stages?: { stage: string; message: string }[];
  error?: string | null;
}

type Block = { kind: "h1" | "h2" | "h3" | "p" | "li"; text: string; marker?: string };

function parseAnswer(text: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) {
      blocks.push({ kind: "p", text: para.join(" ").trim() });
      para = [];
    }
  };
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      flush();
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      flush();
      blocks.push({ kind: h[1].length === 1 ? "h1" : h[1].length === 2 ? "h2" : "h3", text: h[2] });
      continue;
    }
    const li = line.match(/^([-*•]|\d+\.)\s+(.*)$/);
    if (li) {
      flush();
      blocks.push({ kind: "li", text: li[2], marker: /^\d/.test(li[1]) ? li[1] : "•" });
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks;
}

function AnswerBody({ text, streaming }: { text: string; streaming: boolean }) {
  const blocks = parseAnswer(text);
  return (
    <div className="mt-5 text-[14px] leading-[1.7] text-gray-800">
      {blocks.map((b, i) =>
        b.kind === "h1" ? (
          <h1 key={i} className="mt-6 text-[20px] font-semibold leading-snug text-gray-900 first:mt-0">
            {b.text}
          </h1>
        ) : b.kind === "h2" ? (
          <h2 key={i} className="mt-5 text-[17px] font-semibold leading-snug text-gray-900">
            {b.text}
          </h2>
        ) : b.kind === "h3" ? (
          <h3 key={i} className="mt-4 text-[15px] font-semibold text-gray-900">
            {b.text}
          </h3>
        ) : b.kind === "li" ? (
          <div key={i} className="mt-1 flex gap-2">
            <span className="select-none text-gray-400">{b.marker ?? "•"}</span>
            <span>{b.text}</span>
          </div>
        ) : (
          <p key={i} className="mt-2.5">
            {b.text}
          </p>
        ),
      )}
      {streaming && <span className="ml-1 inline-block h-4 w-[2px] animate-pulse bg-teal-600" />}
    </div>
  );
}

export default function ReportView({ query, papers, starred, onToggleStar, onOpenPaper, onFollowUp, followUpBlocks, version, kindLabel, thinking, answer, streaming, mode, suggestions = [], stages = [], error }: Props) {
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [followUpBlocks.length, thinking, streaming]);

  const copyAnswer = async () => {
    try {
      await navigator.clipboard.writeText(answer ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  };

  return (
    <div className="mx-auto w-full max-w-[860px] px-6 pb-10 pt-6">
      {/* user question */}
      <div className="mt-4 flex justify-end">
        <span className="max-w-[80%] rounded-2xl rounded-br-md bg-gray-100 px-4 py-2.5 text-[14px] text-gray-900">
          {query}
        </span>
      </div>

      {/* reasoning-steps toggle */}
      {papers.length > 0 && (
        <button className="mt-4 flex items-center gap-2 text-[14px] text-gray-500 hover:text-gray-700">
          <ListOrdered size={16} />
          {mode === "review"
            ? `Screened ${papers.length} sources · table V${version}`
            : `Reviewed ${papers.length} sources · ${mode === "report" ? "generated report" : "generated answer"} V${version}`}
        </button>
      )}

      {stages.length > 0 && (
        <div className="mt-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Pipeline</p>
          <div className="mt-2 space-y-1.5">
            {stages.map((s, i) => {
              const running = streaming && i === stages.length - 1;
              return (
                <p key={`${s.stage}-${i}`} className="flex items-center gap-2 text-[13px] text-gray-600">
                  {running ? (
                    <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-gray-200 border-t-teal-600" />
                  ) : (
                    <Check size={14} className="shrink-0 text-teal-600" />
                  )}
                  {s.message}
                </p>
              );
            })}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] leading-relaxed text-red-700">
          Research failed: {error}
        </div>
      )}

      {mode === "review" && papers.length > 0 && (
        <LiteratureTable papers={papers} starred={starred} onToggleStar={onToggleStar} onOpenPaper={onOpenPaper} />
      )}

      {mode === "review" && !streaming && papers.length === 0 && !error && (
        <p className="mt-5 text-[14px] text-gray-500">No sources were found for this review.</p>
      )}

      {/* artifact card (report mode produces a file) */}
      {mode === "report" && (
      <div className="mt-4 flex gap-5 rounded-2xl border border-gray-200 bg-white p-5">
        <div className="grid h-[100px] w-[150px] shrink-0 place-items-center rounded-xl bg-gray-100">
          <FileText size={40} strokeWidth={1.2} className="text-gray-400" />
        </div>
        <div className="min-w-0 py-1">
          <p className="text-[16px] font-semibold leading-snug text-gray-900">
            {query.length > 80 ? query.slice(0, 80) + "…" : query} — {kindLabel === "Report" ? "English Report" : kindLabel}
          </p>
          <p className="mt-1.5 text-sm text-gray-500">{kindLabel} · V{version}</p>
        </div>
      </div>
      )}

      {/* answer */}
      {mode !== "review" && (
        <>
      {(answer ?? "").length > 0 ? (
        <AnswerBody text={answer ?? ""} streaming={streaming} />
      ) : streaming ? (
        <p className="mt-5 flex items-center gap-2 text-[14px] text-gray-500">
          <span className="h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-gray-200 border-t-teal-600" />
          Searching, reading and ranking sources…
        </p>
      ) : (
        !error && <p className="mt-5 text-[14px] text-gray-400">No answer was generated.</p>
      )}

      {/* cited sources */}
      {papers.length > 0 && (
        <>
          <div className="mt-4 flex items-center gap-1.5">
            <button
              onClick={() => setSourcesOpen((o) => !o)}
              className="flex items-center gap-2 rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              <BookOpen size={16} />
              View {papers.length} cited sources
            </button>
            <button onClick={copyAnswer} className="rounded-full p-2.5 text-gray-500 hover:bg-gray-100" title="Copy">
              {copied ? <Check size={17} /> : <Copy size={17} />}
            </button>
            <button className="rounded-full p-2.5 text-gray-500 hover:bg-gray-100" title="Download">
              <Download size={17} />
            </button>
          </div>

          {sourcesOpen && (
            <div className="mt-3 overflow-hidden rounded-xl border border-gray-200">
              {papers.map((p, i) => (
                <div
                  key={p.id}
                  className="flex cursor-pointer items-start gap-3 border-b border-gray-100 bg-white px-4 py-3 last:border-0 hover:bg-gray-50"
                  onClick={() => onOpenPaper(p.id)}
                >
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-50 text-xs font-semibold text-teal-700">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium leading-snug text-gray-900">{p.title}</p>
                    <p className="mt-0.5 truncate text-xs text-gray-500">{metaLine(p)}</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleStar(p.id);
                    }}
                    className={starred.has(p.id) ? "text-amber-400" : "text-gray-300 hover:text-amber-400"}
                  >
                    <Star size={16} fill={starred.has(p.id) ? "currentColor" : "none"} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
        </>
      )}

      {/* follow-up conversation thread */}
      {followUpBlocks.map((b, i) => {
        const isCurrentThinking = thinking === b.q;
        return (
          <div key={i} className="mt-8 border-t border-gray-100 pt-6">
            <div className="flex justify-end">
              <span className="max-w-[80%] rounded-2xl rounded-br-md bg-gray-100 px-4 py-2.5 text-[14px] text-gray-900">
                {b.q}
              </span>
            </div>

            {b.a ? (
              <AnswerBody text={b.a} streaming={isCurrentThinking} />
            ) : isCurrentThinking ? (
              <p className="mt-4 flex items-center gap-2 text-[14px] text-gray-700">
                <FlaskConical size={15} className="text-gray-500" />
                Thinking
                <span className="thinking-dots">
                  <span>.</span>
                  <span>.</span>
                  <span>.</span>
                </span>
              </p>
            ) : b.error ? (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] leading-relaxed text-red-700">
                {b.error}
              </div>
            ) : null}
          </div>
        );
      })}

      {/* dynamic follow-up suggestions: appear from real conversation */}
      {suggestions && suggestions.length > 0 && !streaming && !thinking && (
        <div className="mt-6 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <p className="border-b border-gray-100 bg-gray-50/70 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">
            Suggested Follow-ups
          </p>
          {suggestions.map((s) => (
            <button
              key={s}
              onClick={() => onFollowUp?.(s)}
              className="block w-full border-b border-gray-100 px-4 py-3 text-left text-[14px] text-gray-700 transition hover:bg-teal-50/70 hover:text-teal-900 last:border-0"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div ref={bottomRef} />
    </div>
  );
}
