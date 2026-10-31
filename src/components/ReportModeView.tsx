import { useState, useEffect, useRef } from "react";
import {
  Check,
  Download,
  ExternalLink,
  ChevronDown,
  X,
  FileSpreadsheet,
  AlertTriangle,
  Send,
  Loader2,
  FileText,
  Copy,
  ChevronRight,
  Database,
  Filter,
  Layers,
  Sparkles,
} from "lucide-react";
import type { Paper } from "../data/papers";
import type {
  ReportStepData,
  ScreeningCriteria,
  ReportVersion,
  ScreeningPaperDecision,
  ExtractionRow,
} from "../rag";
import { ragApi, exportReport } from "../rag";
import AnswerBody from "./AnswerBody";

interface Props {
  query: string;
  reportAnswer: string | null;
  streaming: boolean;
  stepData?: ReportStepData | null;
  sessionId?: string | null;
  papers: Paper[];
  onOpenPaper: (id: string) => void;
  onRetry?: () => void;
}

export default function ReportModeView({
  query,
  reportAnswer,
  streaming,
  stepData,
  sessionId,
  papers,
  onOpenPaper,
  onRetry,
}: Props) {
  // Details Modal State
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"gather" | "screen" | "extract">("gather");
  const [selectedCell, setSelectedCell] = useState<{
    paperTitle: string;
    colName: string;
    value: string;
    quote: string;
    confidence: string;
  } | null>(null);

  // Methodology modal
  const [methodsOpen, setMethodsOpen] = useState(false);

  // Export dropdown
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  // Versions
  const [versions, setVersions] = useState<ReportVersion[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<number | null>(null);
  const [currentText, setCurrentText] = useState<string>(reportAnswer || "");

  // Right Panel Follow-up Q&A
  const [qaMessages, setQaMessages] = useState<{ q: string; a: string; streaming?: boolean }[]>([]);
  const [qaInput, setQaInput] = useState("");
  const [qaLoading, setQaLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  // Update current text when reportAnswer changes
  useEffect(() => {
    if (reportAnswer) {
      setCurrentText(reportAnswer);
    }
  }, [reportAnswer]);

  // Load versions if sessionId is present
  useEffect(() => {
    if (sessionId && ragApi.getReportVersions) {
      ragApi
        .getReportVersions(sessionId)
        .then((vList) => {
          if (Array.isArray(vList) && vList.length > 0) {
            setVersions(vList);
            setSelectedVersionId(vList[vList.length - 1].id);
          }
        })
        .catch(() => {});
    }
  }, [sessionId, streaming]);

  // Auto-scroll chat
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [qaMessages, qaLoading]);

  // Handle Export (PDF, DOCX, TXT, MD)
  const handleExport = async (format: "pdf" | "docx" | "txt" | "md") => {
    setExportOpen(false);
    if (!currentText || exporting) return;
    setExporting(format);
    setExportStatus(`Exporting ${format.toUpperCase()}…`);
    try {
      const res = await exportReport({
        format,
        markdown: currentText,
        title: query,
        suggestedName: `expozi-review-${query.slice(0, 30).replace(/[^a-zA-Z0-9]/g, "-")}`,
        meta: `Systematic Review on: ${query}`,
      });
      if (res.saved) {
        setExportStatus(`Saved ${format.toUpperCase()} successfully.`);
      } else {
        setExportStatus(null);
      }
    } catch (err: any) {
      setExportStatus(`Export failed: ${err?.message || err}`);
    } finally {
      setExporting(null);
      setTimeout(() => setExportStatus(null), 3500);
    }
  };

  // Export Step CSVs
  const exportStepCsv = async (step: "gather" | "screen" | "extract") => {
    try {
      let csvContent = "";
      let filename = `expozi-${step}-${query.slice(0, 25).replace(/[^a-zA-Z0-9]/g, "-")}.csv`;

      if (step === "gather") {
        const pool = stepData?.pool || [];
        csvContent =
          "Title,Authors,Year,Journal,Citations,Source,URL\n" +
          pool
            .map((p) =>
              [
                `"${(p.title || "").replace(/"/g, '""')}"`,
                `"${((p.authors || []).join("; ") || "").replace(/"/g, '""')}"`,
                p.year || "",
                `"${(p.journal || "").replace(/"/g, '""')}"`,
                p.citations || 0,
                `"${p.source || "Academic"}"`,
                `"${p.url || ""}"`,
              ].join(","),
            )
            .join("\n");
      } else if (step === "screen") {
        const decisions = stepData?.allDecisions || [];
        csvContent =
          "Title,Decision,Score,FailedCriterion,Reasoning,SupportingQuote,URL\n" +
          decisions
            .map((d) =>
              [
                `"${((d.paper && d.paper.title) || "").replace(/"/g, '""')}"`,
                d.decision,
                d.score,
                `"${(d.failed_criterion || "").replace(/"/g, '""')}"`,
                `"${(d.reasoning || "").replace(/"/g, '""')}"`,
                `"${(d.supporting_quote || "").replace(/"/g, '""')}"`,
                `"${((d.paper && d.paper.url) || "").replace(/"/g, '""')}"`,
              ].join(","),
            )
            .join("\n");
      } else if (step === "extract") {
        const cols = stepData?.columns || [];
        const matrix = stepData?.matrix || [];
        csvContent =
          "Study," +
          cols.map((c) => `"${c.name.replace(/"/g, '""')}"`).join(",") +
          "\n" +
          matrix
            .map((row) =>
              [
                `"${(row.title || "").replace(/"/g, '""')}"`,
                ...cols.map((c) => `"${((row.fields[c.name] && row.fields[c.name].value) || "").replace(/"/g, '""')}"`),
              ].join(","),
            )
            .join("\n");
      }

      await exportReport({
        format: "csv",
        csv: csvContent,
        title: `${step}-data`,
        suggestedName: filename.replace(/\.csv$/, ""),
      });
    } catch (e: any) {
      alert(`Could not export CSV: ${e?.message || e}`);
    }
  };

  // Submit Q&A in right panel
  const handleQaSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const q = qaInput.trim();
    if (!q || qaLoading) return;

    setQaInput("");
    setQaLoading(true);
    setQaMessages((prev) => [...prev, { q, a: "", streaming: true }]);

    try {
      let accumulated = "";
      await ragApi.reportQA(
        sessionId || "report-sess",
        query,
        q,
        stepData?.matrix || [],
        currentText,
        (token) => {
          accumulated += token;
          setQaMessages((prev) => {
            const next = [...prev];
            next[next.length - 1] = { q, a: accumulated, streaming: true };
            return next;
          });
        },
      );
      setQaMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = { q, a: accumulated, streaming: false };
        return next;
      });
    } catch (err: any) {
      setQaMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          q,
          a: `Error answering question: ${err?.message || err}`,
          streaming: false,
        };
        return next;
      });
    } finally {
      setQaLoading(false);
    }
  };

  // Switch versions
  const handleSelectVersion = (versionId: number) => {
    setSelectedVersionId(versionId);
    const v = versions.find((item) => item.id === versionId);
    if (v) {
      setCurrentText(v.content);
    }
  };

  // Transform markdown to intercept [More on methods ->]
  const renderableText = currentText.replace(
    /\[More on methods\s*→?\]/gi,
    `<span data-methods-link="true" class="inline-flex items-center gap-1 font-semibold text-teal-700 underline cursor-pointer hover:text-teal-900 bg-teal-50 px-2 py-0.5 rounded-md">More on methods →</span>`,
  );

  return (
    <div className="flex h-full w-full min-h-0 min-w-0 flex-1 overflow-hidden bg-gray-50">
      {/* ================================================================= */}
      {/* MAIN PANEL: Formatted Markdown Systematic Review Document         */}
      {/* ================================================================= */}
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto px-6 py-8 slim-scroll">
        <div className="mx-auto w-full max-w-[840px] rounded-2xl border border-gray-200/80 bg-white p-8 md:p-12 shadow-xs transition-all">
          {/* Top Title & Metadata */}
          <div className="border-b border-gray-100 pb-5">
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-semibold text-teal-800 border border-teal-200">
                <Sparkles size={13} className="text-teal-600" />
                Systematic Review Report
              </span>
              {stepData?.template && (
                <span className="text-xs font-medium text-gray-500">
                  Template: <strong className="text-gray-700">{stepData.template}</strong>
                </span>
              )}
            </div>
            <h1 className="mt-3 text-2xl md:text-3xl font-bold tracking-tight text-gray-900 leading-snug">
              {query}
            </h1>
            <p className="mt-2 text-xs text-gray-500 flex flex-wrap items-center gap-2">
              <span>{papers.length} included papers</span>
              <span>•</span>
              <span>{stepData?.totalGathered || papers.length} pool gathered</span>
              <span>•</span>
              <span>{stepData?.totalPoints || 0} extracted evidence data points</span>
            </p>
          </div>

          {/* Warning banner if <3 papers */}
          {stepData?.warningMessage && (
            <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs text-amber-900">
              <AlertTriangle size={16} className="text-amber-600 shrink-0" />
              <span>{stepData.warningMessage}</span>
            </div>
          )}

          {/* Report Body */}
          <div
            className="mt-6 prose prose-slate max-w-none prose-headings:font-bold prose-headings:text-gray-900 prose-p:leading-relaxed prose-a:text-teal-600 prose-table:text-xs"
            onClick={(e) => {
              const target = e.target as HTMLElement;
              if (target && target.closest('[data-methods-link="true"]')) {
                setMethodsOpen(true);
              }
            }}
          >
            {currentText ? (
              <AnswerBody text={renderableText} streaming={streaming} />
            ) : streaming ? (
              <div className="flex items-center gap-3 py-12 text-sm text-gray-500 justify-center">
                <Loader2 size={18} className="animate-spin text-teal-600" />
                <span>The systematic review report is writing…</span>
              </div>
            ) : (
              <div className="py-12 text-center text-sm text-gray-400">
                No report has been generated yet.
              </div>
            )}
          </div>

          {/* Fallback Retry button if generation had issue */}
          {onRetry && currentText.includes("Click the 'Retry' button") && (
            <div className="mt-6 flex justify-center">
              <button
                onClick={onRetry}
                className="rounded-xl bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-teal-800 transition-colors"
              >
                Retry Report Generation
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ================================================================= */}
      {/* RIGHT PANEL: Status Steps + Details + Follow-up Chat              */}
      {/* ================================================================= */}
      <div className="flex w-[380px] min-w-[340px] max-w-[420px] shrink-0 flex-col border-l border-gray-200 bg-white">
        {/* Top Header & Version Selector */}
        <div className="flex h-[60px] shrink-0 items-center justify-between border-b border-gray-100 px-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Pipeline Status</span>
            {versions.length > 1 && (
              <select
                value={selectedVersionId || undefined}
                onChange={(e) => handleSelectVersion(Number(e.target.value))}
                className="rounded-md border border-gray-200 bg-white px-2 py-0.5 text-xs font-semibold text-gray-700 shadow-2xs outline-none"
              >
                {versions.map((v, i) => (
                  <option key={v.id} value={v.id}>
                    Version {i + 1}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Export Dropdown */}
          <div className="relative">
            <button
              onClick={() => setExportOpen((o) => !o)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs hover:bg-gray-50 transition-colors"
            >
              {exporting ? (
                <Loader2 size={13} className="animate-spin text-teal-600" />
              ) : (
                <Download size={13} className="text-gray-500" />
              )}
              <span>Save PDF ▾</span>
            </button>

            {exportOpen && (
              <div className="absolute right-0 top-full z-40 mt-1 w-44 rounded-xl border border-gray-200 bg-white p-1.5 shadow-xl">
                <button
                  onClick={() => handleExport("pdf")}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-gray-700 hover:bg-teal-50 hover:text-teal-900"
                >
                  <FileText size={14} className="text-rose-500" />
                  Save as PDF
                </button>
                <button
                  onClick={() => handleExport("docx")}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-gray-700 hover:bg-teal-50 hover:text-teal-900"
                >
                  <FileText size={14} className="text-blue-500" />
                  Save as DOCX
                </button>
                <button
                  onClick={() => handleExport("txt")}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-gray-700 hover:bg-teal-50 hover:text-teal-900"
                >
                  <FileText size={14} className="text-gray-500" />
                  Save as TXT
                </button>
                <button
                  onClick={() => handleExport("md")}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-xs font-medium text-gray-700 hover:bg-teal-50 hover:text-teal-900"
                >
                  <Copy size={14} className="text-purple-500" />
                  Save as Markdown (.md)
                </button>
              </div>
            )}
          </div>
        </div>

        {exportStatus && (
          <div className="bg-teal-50 px-4 py-1.5 text-xs text-teal-800 border-b border-teal-100 flex items-center justify-between">
            <span>{exportStatus}</span>
          </div>
        )}

        {/* Status Steps Section */}
        <div className="border-b border-gray-100 p-4 space-y-3">
          {/* Step 1: Gather Sources */}
          <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/70 p-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <Check size={12} strokeWidth={3} />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-900">Gather sources</p>
                <p className="text-[11px] text-gray-500 truncate">
                  {stepData?.totalGathered || papers.length} sources found
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setActiveTab("gather");
                setDetailsOpen(true);
              }}
              className="text-xs font-semibold text-teal-700 hover:underline hover:text-teal-900 flex items-center gap-0.5"
            >
              Details ↗
            </button>
          </div>

          {/* Step 2: Screen Sources */}
          <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/70 p-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <Check size={12} strokeWidth={3} />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-900">Screen sources</p>
                <p className="text-[11px] text-gray-500 truncate">
                  {papers.length} sources included
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setActiveTab("screen");
                setDetailsOpen(true);
              }}
              className="text-xs font-semibold text-teal-700 hover:underline hover:text-teal-900 flex items-center gap-0.5"
            >
              Details ↗
            </button>
          </div>

          {/* Step 3: Extract Data */}
          <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/70 p-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <Check size={12} strokeWidth={3} />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-900">Extract data</p>
                <p className="text-[11px] text-gray-500 truncate">
                  {stepData?.totalPoints || papers.length * 5} data points extracted
                </p>
              </div>
            </div>
            <button
              onClick={() => {
                setActiveTab("extract");
                setDetailsOpen(true);
              }}
              className="text-xs font-semibold text-teal-700 hover:underline hover:text-teal-900 flex items-center gap-0.5"
            >
              Details ↗
            </button>
          </div>

          {/* Step 4: Generate Report */}
          <div className="flex items-center justify-between rounded-xl border border-gray-100 bg-gray-50/70 p-3">
            <div className="flex items-center gap-2.5 min-w-0">
              {streaming ? (
                <Loader2 size={15} className="animate-spin text-teal-600 shrink-0" />
              ) : (
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <Check size={12} strokeWidth={3} />
                </span>
              )}
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-900">Generate report</p>
                <p className="text-[11px] text-gray-500">
                  {streaming ? "writing…" : "Complete"}
                </p>
              </div>
            </div>
            <button
              onClick={() => handleExport("pdf")}
              className="text-xs font-semibold text-teal-700 hover:underline hover:text-teal-900"
            >
              Save PDF
            </button>
          </div>
        </div>

        {/* =============================================================== */}
        {/* BOTTOM RIGHT: Chat box "Ask anything about the results"         */}
        {/* =============================================================== */}
        <div className="flex min-h-0 flex-1 flex-col justify-between bg-white">
          <div className="flex-1 overflow-y-auto p-4 space-y-3 slim-scroll">
            <div className="rounded-xl bg-gray-50 p-3 text-xs text-gray-600 border border-gray-100">
              <p className="font-semibold text-gray-800">Ask anything about the results</p>
              <p className="mt-1 text-[11px] text-gray-500">
                Ask specific questions about the extracted data points, effect sizes, study comparisons, or methodologies.
              </p>
            </div>

            {/* Q&A Thread */}
            {qaMessages.map((m, idx) => (
              <div key={idx} className="space-y-2">
                <div className="flex justify-end">
                  <div className="max-w-[85%] rounded-2xl rounded-br-md bg-teal-700 px-3 py-2 text-xs text-white">
                    {m.q}
                  </div>
                </div>
                <div className="flex justify-start">
                  <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-gray-100 p-3 text-xs text-gray-900 leading-relaxed">
                    <AnswerBody text={m.a || "Thinking…"} streaming={!!m.streaming} />
                  </div>
                </div>
              </div>
            ))}
            <div ref={chatBottomRef} />
          </div>

          {/* Chat Composer Input */}
          <form onSubmit={handleQaSubmit} className="border-t border-gray-100 p-3 bg-white">
            <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-1.5 focus-within:border-teal-600 focus-within:bg-white transition-all shadow-2xs">
              <input
                type="text"
                value={qaInput}
                onChange={(e) => setQaInput(e.target.value)}
                placeholder="Ask about the extracted data…"
                disabled={qaLoading}
                className="w-full bg-transparent text-xs text-gray-900 outline-none placeholder:text-gray-400"
              />
              <button
                type="submit"
                disabled={!qaInput.trim() || qaLoading}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-40 transition-colors"
              >
                {qaLoading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ================================================================= */}
      {/* DETAILS MODAL (Details ↗ for Gather, Screen, Extract)              */}
      {/* ================================================================= */}
      {detailsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-6">
          <div className="flex h-[88vh] w-full max-w-[1100px] flex-col rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden">
            {/* Modal Header */}
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-gray-100 px-6">
              <div className="flex items-center gap-4">
                <span className="text-sm font-bold text-gray-900">Review Pipeline Details</span>
                {/* Tabs */}
                <div className="flex rounded-lg bg-gray-100 p-1">
                  <button
                    onClick={() => setActiveTab("gather")}
                    className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                      activeTab === "gather" ? "bg-white text-gray-900 shadow-2xs" : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    1. Gathered ({stepData?.totalGathered || papers.length})
                  </button>
                  <button
                    onClick={() => setActiveTab("screen")}
                    className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                      activeTab === "screen" ? "bg-white text-gray-900 shadow-2xs" : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    2. Screened ({papers.length} in)
                  </button>
                  <button
                    onClick={() => setActiveTab("extract")}
                    className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                      activeTab === "extract" ? "bg-white text-gray-900 shadow-2xs" : "text-gray-600 hover:text-gray-900"
                    }`}
                  >
                    3. Extraction Table
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => exportStepCsv(activeTab)}
                  className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 shadow-2xs hover:bg-gray-50 transition-colors"
                >
                  <FileSpreadsheet size={13} className="text-emerald-600" />
                  <span>Export CSV</span>
                </button>
                <button
                  onClick={() => setDetailsOpen(false)}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 slim-scroll">
              {/* TAB 1: GATHERED PAPERS */}
              {activeTab === "gather" && (
                <div className="space-y-3">
                  <p className="text-xs text-gray-500">
                    Full candidate pool gathered across academic sources (Semantic Scholar, arXiv, PubMed, OpenAlex) sorted by citations and recency.
                  </p>
                  <div className="overflow-hidden rounded-xl border border-gray-200">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-200">
                        <tr>
                          <th className="p-3">#</th>
                          <th className="p-3">Title</th>
                          <th className="p-3">Authors & Year</th>
                          <th className="p-3">Citations</th>
                          <th className="p-3">Source</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {(stepData?.pool || papers).map((p, idx) => (
                          <tr key={p.id || idx} className="hover:bg-gray-50">
                            <td className="p-3 font-semibold text-gray-400">{idx + 1}</td>
                            <td className="p-3">
                              <a
                                href={p.url || "#"}
                                target="_blank"
                                rel="noreferrer"
                                className="font-semibold text-gray-900 hover:text-teal-700 hover:underline"
                              >
                                {p.title}
                              </a>
                            </td>
                            <td className="p-3 text-gray-500">
                              {(p.authors || []).slice(0, 2).join(", ")}
                              {(p.authors || []).length > 2 ? " et al." : ""} · {p.year || "n.d."}
                            </td>
                            <td className="p-3 text-gray-700 font-medium">
                              {(p.citations || (p as any).citationCount || 0).toLocaleString()}
                            </td>
                            <td className="p-3">
                              <span className="rounded bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-700">
                                {(p as any).source || (p as any).sourceBadge || "Academic"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 2: SCREENING DECISIONS */}
              {activeTab === "screen" && (
                <div className="space-y-4">
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1.5 font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
                      <Check size={13} /> {papers.length} Included
                    </span>
                    <span className="flex items-center gap-1.5 font-semibold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-md border border-rose-200">
                      <X size={13} /> {(stepData?.excluded || []).length} Excluded
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {(stepData?.allDecisions || []).map((dec, idx) => {
                      const isInc = dec.decision === "include" || dec.decision === "uncertain";
                      return (
                        <div
                          key={idx}
                          className="rounded-xl border border-gray-200 bg-white p-4 shadow-2xs hover:border-gray-300 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-3 min-w-0 flex-1">
                              <span
                                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                  isInc ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                                }`}
                              >
                                {isInc ? "✓" : "✕"}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-semibold text-gray-900">
                                  {dec.paper?.title || "Untitled Paper"}
                                </p>
                                <p className="mt-1 text-xs text-gray-600">
                                  <strong>Reasoning:</strong> {dec.reasoning}
                                </p>
                                {dec.failed_criterion && (
                                  <p className="mt-1 text-xs text-rose-700">
                                    <strong>Failed criterion:</strong> {dec.failed_criterion}
                                  </p>
                                )}
                                {dec.supporting_quote && (
                                  <blockquote className="mt-2 rounded-lg bg-gray-50 p-2.5 text-xs text-gray-600 border-l-2 border-teal-600 italic">
                                    "{dec.supporting_quote}"
                                  </blockquote>
                                )}
                              </div>
                            </div>
                            <span className="text-xs font-bold text-gray-500">
                              Score: {dec.score}/100
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* TAB 3: EXTRACTION TABLE */}
              {activeTab === "extract" && (
                <div className="space-y-3">
                  <p className="text-xs text-gray-500">
                    Matrix of extracted data points per paper. Click any cell to inspect the verbatim supporting quote and extraction confidence.
                  </p>
                  <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-2xs">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-gray-50 text-gray-700 font-semibold border-b border-gray-200">
                        <tr>
                          <th className="p-3 min-w-[220px]">Study</th>
                          {(stepData?.columns || []).map((col) => (
                            <th key={col.name} className="p-3 min-w-[180px]">
                              {col.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {(stepData?.matrix || []).map((row, rIdx) => (
                          <tr key={row.paperId || rIdx} className="hover:bg-gray-50/70">
                            <td className="p-3 font-semibold text-gray-900">
                              {row.title}
                              <span className="block text-[11px] font-normal text-gray-500">
                                {row.authors.slice(0, 2).join(", ")} ({row.year || "n.d."})
                              </span>
                            </td>
                            {(stepData?.columns || []).map((col) => {
                              const cell = row.fields[col.name];
                              const isMissing = !cell || cell.value === "Could not extract";
                              return (
                                <td
                                  key={col.name}
                                  onClick={() =>
                                    setSelectedCell({
                                      paperTitle: row.title,
                                      colName: col.name,
                                      value: cell?.value || "N/A",
                                      quote: cell?.supporting_quote || "",
                                      confidence: cell?.confidence || "low",
                                    })
                                  }
                                  className="p-3 cursor-pointer hover:bg-teal-50/50 transition-colors"
                                >
                                  {isMissing ? (
                                    <span className="inline-flex rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 border border-amber-200">
                                      Could not extract
                                    </span>
                                  ) : (
                                    <span className="line-clamp-2 text-gray-800">
                                      {cell.value}
                                    </span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* CELL DETAIL POPOVER / MODAL                                       */}
      {/* ================================================================= */}
      {selectedCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-[500px] rounded-2xl bg-white p-6 shadow-2xl border border-gray-200">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-teal-700">
                  {selectedCell.colName}
                </span>
                <p className="text-sm font-semibold text-gray-900 truncate max-w-[380px]">
                  {selectedCell.paperTitle}
                </p>
              </div>
              <button
                onClick={() => setSelectedCell(null)}
                className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div>
                <label className="text-[11px] font-bold uppercase text-gray-400 block mb-1">
                  Extracted Value
                </label>
                <p className="text-sm text-gray-900 bg-gray-50 p-3 rounded-xl border border-gray-100 font-medium leading-relaxed">
                  {selectedCell.value}
                </p>
              </div>

              {selectedCell.quote && (
                <div>
                  <label className="text-[11px] font-bold uppercase text-gray-400 block mb-1">
                    Verbatim Supporting Quote
                  </label>
                  <blockquote className="text-xs text-gray-700 bg-teal-50/50 p-3 rounded-xl border-l-2 border-teal-600 italic leading-relaxed">
                    "{selectedCell.quote}"
                  </blockquote>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-gray-500">Extraction Confidence:</span>
                <span
                  className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                    selectedCell.confidence === "high"
                      ? "bg-emerald-100 text-emerald-800"
                      : selectedCell.confidence === "low"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-blue-100 text-blue-800"
                  }`}
                >
                  {selectedCell.confidence.toUpperCase()}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* METHODOLOGY DETAIL MODAL [More on methods ->]                      */}
      {/* ================================================================= */}
      {methodsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-6">
          <div className="flex h-[80vh] w-full max-w-[800px] flex-col rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden">
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-gray-100 px-6">
              <span className="text-base font-bold text-gray-900">Review Methodology & Criteria</span>
              <button
                onClick={() => setMethodsOpen(false)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 slim-scroll text-xs leading-relaxed text-gray-700">
              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-2">Search & Retrieval Pool</h3>
                <p>
                  Initial search pool of <strong>{stepData?.totalGathered || papers.length} papers</strong> retrieved across Semantic Scholar, arXiv, PubMed, and OpenAlex. Deduplication executed by canonical DOI and URL.
                </p>
              </div>

              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-2">Inclusion Criteria</h3>
                <ul className="list-disc pl-5 space-y-1">
                  {(stepData?.criteria?.include || ["Directly answers core research question"]).map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-2">Exclusion Criteria</h3>
                <ul className="list-disc pl-5 space-y-1">
                  {(stepData?.criteria?.exclude || ["Opinion commentaries", "Irrelevant context"]).map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-bold text-gray-900 mb-2">Data Extraction Dimensions</h3>
                <div className="space-y-2">
                  {(stepData?.columns || []).map((col) => (
                    <div key={col.name} className="rounded-lg bg-gray-50 p-2.5 border border-gray-100">
                      <span className="font-semibold text-gray-900">{col.name}:</span> {col.instruction}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
