import { ListOrdered, BookOpen, Copy, Check, Download, Star, FileText, FlaskConical, Maximize2, Minus, X, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Paper } from "../data/papers";
import type { RagToolEvent } from "../rag";
import { metaLine, reportTitle } from "../data/live";
import AnswerBody from "./AnswerBody";
import LiteratureTable, { type ScreeningEntry } from "./LiteratureTable";
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
  stages?: { stage: string; message: string; seq?: number }[];
  toolEvents?: RagToolEvent[];
  error?: string | null;
  artifactOpen?: boolean;
  onOpenArtifact?: () => void;
  onExport?: (format: "md" | "pdf") => void;
  decisions?: Record<string, ScreeningEntry>;
  onDecide?: (url: string, decision: string | null, note: string | null) => void;
  screenSaveError?: string | null;
}

export default function ReportView({ query, papers, starred, onToggleStar, onOpenPaper, onFollowUp, followUpBlocks, version, kindLabel, thinking, answer, streaming, mode, suggestions = [], stages = [], toolEvents = [], error, artifactOpen = false, onOpenArtifact, onExport, decisions = {}, onDecide, screenSaveError = null }: Props) {
  const [sourcesOpen, setSourcesOpen] = useState(mode === "agent");
  const [traceOpen, setTraceOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [followUpBlocks.length, thinking, streaming]);

  useEffect(() => {
    if (!streaming && (answer ?? "").length > 0) {
      setTraceOpen(false);
    }
  }, [streaming, answer]);

  const copyAnswer = async () => {
    try {
      await navigator.clipboard.writeText(answer ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  };

  const toolIcon = (t: RagToolEvent) =>
    t.status === "running" || t.status === "progress" ? (
      <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-gray-200 border-t-teal-600" />
    ) : t.status === "ran" ? (
      <Check size={14} className="shrink-0 text-teal-600" />
    ) : t.status === "skipped" ? (
      <Minus size={14} className="shrink-0 text-gray-400" />
    ) : (
      <X size={14} className="shrink-0 text-red-500" />
    );

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

      {/* TOP: pipeline + tools — collapsible trace in agent mode */}
      {mode === "agent" && (stages.length > 0 || toolEvents.length > 0) && (
        <div className="mt-3 rounded-xl border border-gray-200 bg-white px-4 py-3 shadow-xs">
          <button
            onClick={() => setTraceOpen((o) => !o)}
            className="flex w-full items-center justify-between text-left"
          >
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                Agent trace
              </span>
              {!streaming && (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                  Completed
                </span>
              )}
            </div>
            {traceOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
          </button>
          {traceOpen && (
            <div className="mt-2.5 space-y-1.5 border-t border-gray-100 pt-2.5">
              {[
                ...stages.map((s, i) => ({ kind: "stage" as const, key: `s-${i}`, seq: s.seq ?? -1, stage: s })),
                ...toolEvents.map((t) => ({ kind: "tool" as const, key: `t-${t.call}`, seq: t.seq ?? -1, tool: t })),
              ]
                .sort((a, b) => a.seq - b.seq)
                .map((item, idx, arr) =>
                  item.kind === "stage" ? (
                    <p key={item.key} className="flex items-center gap-2 text-[13px] text-gray-600">
                      {streaming && idx === arr.length - 1 ? (
                        <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-gray-200 border-t-teal-600" />
                      ) : (
                        <Check size={14} className="shrink-0 text-teal-600" />
                      )}
                      {item.stage.message}
                    </p>
                  ) : (
                    <p key={item.key} className="flex items-center gap-2 text-[13px] text-gray-600">
                      {toolIcon(item.tool)}
                      <span className="shrink-0 font-mono text-[12px] text-gray-800">{item.tool.tool}</span>
                      <span className="min-w-0 break-words text-gray-400">
                        {item.tool.detail}
                        {item.tool.status !== "running" && item.tool.ms != null ? ` · ${item.tool.ms} ms` : ""}
                      </span>
                    </p>
                  ),
                )}
            </div>
          )}
        </div>
      )}

      {mode !== "agent" && stages.length > 0 && (
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

      {mode !== "agent" && toolEvents.length > 0 && (
        <div className="mt-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Tools</p>
          <div className="mt-2 space-y-1.5">
            {toolEvents.map((t) => (
              <p key={t.call} className="flex items-center gap-2 text-[13px] text-gray-600">
                {toolIcon(t)}
                <span className="shrink-0 font-mono text-[12px] text-gray-800">{t.tool}</span>
                <span className="min-w-0 break-words text-gray-400">
                  {t.detail}
                  {t.status !== "running" && t.ms != null ? ` · ${t.ms} ms` : ""}
                </span>
              </p>
            ))}
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] leading-relaxed text-red-700">
          Research failed: {error}
        </div>
      )}

      {mode === "review" && papers.length > 0 && (
        <LiteratureTable
          query={query}
          papers={papers}
          decisions={decisions}
          onDecide={onDecide ?? (() => {})}
          saveError={screenSaveError}
          starred={starred}
          onToggleStar={onToggleStar}
          onOpenPaper={onOpenPaper}
        />
      )}

      {mode === "review" && !streaming && papers.length === 0 && !error && (
        <p className="mt-5 text-[14px] text-gray-500">No sources were found for this review.</p>
      )}

      {/* artifact card (report mode produces a file) — opens the right-side viewer.
          Shown only when the run has settled (no streaming / error) so a partial
          mid-run answer can never be exported as "the report". */}
      {mode === "report" && !streaming && !error && (answer ?? "").trim().length > 0 && (
        <div
          data-artifact-card="true"
          onClick={() => onOpenArtifact?.()}
          className={`group mt-4 cursor-pointer rounded-2xl border bg-white p-4 transition ${
            artifactOpen
              ? "border-teal-500 ring-1 ring-teal-500/30"
              : "border-gray-200 hover:border-gray-300 hover:shadow-sm"
          }`}
        >
          <div className="flex items-center gap-4">
            <div className="grid h-[84px] w-[120px] shrink-0 place-items-center rounded-lg border border-gray-100 bg-gray-50">
              <FileText size={34} strokeWidth={1.2} className="text-teal-700/70" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold leading-snug text-gray-900">
                {reportTitle(answer ?? "", query)}
              </p>
              <p className="mt-1 text-[13px] text-gray-500">
                {kindLabel} · V{version}
              </p>
            </div>
            <div
              className={`flex shrink-0 items-center gap-1 transition ${
                artifactOpen ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              }`}
            >
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onExport?.("pdf");
                }}
                title="Download PDF"
                className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              >
                <Download size={16} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onExport?.("md");
                }}
                title="Download Markdown (.md)"
                className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              >
                <FileText size={16} />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenArtifact?.();
                }}
                title="Open in viewer"
                className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              >
                <Maximize2 size={16} />
              </button>
            </div>
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
          {mode === "agent" ? "The agent is working through its steps…" : "Searching, reading and ranking sources…"}
        </p>
      ) : (
        !error && <p className="mt-5 text-[14px] text-gray-400">No answer was generated.</p>
      )}

      {/* cited sources */}
      {papers.length > 0 && (
        <>
          <div className="mt-6 flex items-center justify-between border-t border-gray-100 pt-5">
            <button
              onClick={() => setSourcesOpen((o) => !o)}
              className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-800 shadow-2xs hover:bg-gray-50"
            >
              <BookOpen size={16} className="text-teal-600" />
              <span>Cited sources ({papers.length})</span>
              {sourcesOpen ? <ChevronUp size={15} className="text-gray-400" /> : <ChevronDown size={15} className="text-gray-400" />}
            </button>
            <div className="flex items-center gap-1.5">
              <button onClick={copyAnswer} className="rounded-full p-2 text-gray-500 hover:bg-gray-100" title="Copy answer">
                {copied ? <Check size={16} className="text-teal-600" /> : <Copy size={16} />}
              </button>
              <button
                onClick={() => onExport?.("pdf")}
                className="rounded-full p-2 text-gray-500 hover:bg-gray-100"
                title="Download PDF"
              >
                <Download size={16} />
              </button>
            </div>
          </div>

          {sourcesOpen && (
            <div className="mt-3.5 space-y-3">
              {papers.map((p, i) => {
                const passageIndex = p.passageNo || i + 1;
                const snippet = p.usedSnippet || p.summary || p.abstract;
                return (
                  <div
                    key={p.id || i}
                    className="rounded-xl border border-gray-200/90 bg-white p-4 shadow-2xs transition-all hover:border-teal-200"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-50 text-xs font-bold text-teal-700">
                          {passageIndex}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <a
                              href={p.url || "#"}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => {
                                if (!p.url) {
                                  e.preventDefault();
                                  onOpenPaper(p.id);
                                }
                              }}
                              className="text-[14px] font-semibold text-gray-900 hover:text-teal-700 hover:underline inline-flex items-center gap-1.5"
                            >
                              {p.title}
                              {p.url && <ExternalLink size={13} className="shrink-0 text-gray-400" />}
                            </a>
                          </div>

                          {/* Authors · Year · Citations */}
                          <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
                            {p.authors && p.authors.length > 0 && (
                              <span className="font-medium text-gray-700">
                                {p.authors.slice(0, 3).join(", ")}{p.authors.length > 3 ? " et al." : ""}
                              </span>
                            )}
                            {p.year && <span>· {p.year}</span>}
                            {p.citations > 0 && <span>· Cited by {p.citations.toLocaleString()}</span>}
                            {p.journal && p.journal !== "Source" && <span className="truncate max-w-[200px]">· {p.journal}</span>}
                          </div>

                          {/* Badges: Source badge + PDF available / Abstract only */}
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {p.sourceBadge && (
                              <span className="rounded-md bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700 border border-gray-200">
                                {p.sourceBadge}
                              </span>
                            )}
                            {p.hasPdf ? (
                              <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 border border-emerald-200">
                                PDF available
                              </span>
                            ) : (
                              <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 border border-amber-200">
                                Abstract only
                              </span>
                            )}
                          </div>

                          {/* Snippet of the passage used */}
                          {snippet && (
                            <div className="mt-2.5 rounded-lg bg-gray-50/80 p-2.5 text-xs text-gray-600 border border-gray-100 leading-relaxed font-sans">
                              <span className="font-semibold text-gray-500 text-[10px] block mb-1 uppercase tracking-wider">
                                Passage snippet
                              </span>
                              "{snippet}"
                            </div>
                          )}
                        </div>
                      </div>

                      <button
                        data-star={p.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleStar(p.id);
                        }}
                        className={`p-1.5 rounded-lg border transition-colors shrink-0 ${
                          starred.has(p.id)
                            ? "border-amber-200 bg-amber-50 text-amber-500"
                            : "border-gray-200 text-gray-300 hover:text-amber-500 hover:bg-amber-50"
                        }`}
                        title={starred.has(p.id) ? "In library" : "Save to library"}
                      >
                        <Star size={15} fill={starred.has(p.id) ? "currentColor" : "none"} />
                      </button>
                    </div>
                  </div>
                );
              })}
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
