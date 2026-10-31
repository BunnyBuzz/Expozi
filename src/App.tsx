import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen } from "lucide-react";
import Sidebar, { type HistoryItem, type NavView } from "./components/Sidebar";
import TopBar from "./components/TopBar";
import HomeView, { type HomeMode } from "./components/HomeView";
import Composer from "./components/Composer";
import ReportView, { type FollowUpItem } from "./components/ReportView";
import ReportModeView from "./components/ReportModeView";
import CriteriaModal from "./components/CriteriaModal";
import ArtifactPanel from "./components/ArtifactPanel";
import DetailPane from "./components/DetailPane";
import LibraryView from "./components/LibraryView";
import RoutinesView from "./components/RoutinesView";
import AuthView from "./components/AuthView";
import LandingView from "./components/LandingView";
import CommandPalette from "./components/CommandPalette";
import SettingsView, { type ExpoziSettings } from "./components/SettingsView";
import type { ScreeningEntry } from "./components/LiteratureTable";
import {
  ragApi,
  exportReport,
  type RagStatus,
  type RagToolEvent,
  type ScreeningDecision,
  type SessionRow,
  type ReportStepData,
  type ScreeningCriteria,
} from "./rag";
import { type Paper } from "./data/papers";
import { toPaper, reportTitle, libraryRowToPaper } from "./data/live";


export type FollowUp = FollowUpItem;

export default function App() {
  const [view, setView] = useState<NavView>("home");
  const [entry, setEntry] = useState<"landing" | "signin" | "signup">("landing");
  const [query, setQuery] = useState<string | null>(null);
  const [version, setVersion] = useState(1);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [starred, setStarred] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState(false);
  const [routines, setRoutines] = useState<string[]>([]);
  // The saved default workflow applies to the home composer on launch —
  // previously a saved "report"/"review" default was ignored until it was
  // changed again in Settings (mode state always started as "agent").
  const [mode, setMode] = useState<HomeMode>(() => {
    try {
      const raw = localStorage.getItem("expozi-settings");
      if (raw) {
        const w = JSON.parse(raw).workflow;
        if (w === "report" || w === "review") return w;
      }
    } catch {
      /* noop */
    }
    return "agent";
  });
  const [threadKind, setThreadKind] = useState("Report");
  const [threadMode, setThreadMode] = useState<HomeMode>("agent");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [uploaded, setUploaded] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [thinking, setThinking] = useState<string | null>(null);
  const thinkTimer = useRef<number | null>(null);
  const [ragStatus, setRagStatus] = useState<RagStatus | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [liveSources, setLiveSources] = useState<Paper[] | null>(null);
  const [liveSessionId, setLiveSessionId] = useState<string | null>(null);
  const [screenDecisions, setScreenDecisions] = useState<Record<string, ScreeningEntry>>({});
  const [screenSaveError, setScreenSaveError] = useState<string | null>(null);
  const [pendingResume, setPendingResume] = useState<{
    sessionId: string;
    topic: string;
    timeAgo: string;
    query: string;
    mode: HomeMode;
  } | null>(null);
  const [reportStepData, setReportStepData] = useState<ReportStepData | null>(null);
  const [pendingCriteria, setPendingCriteria] = useState<{
    query: string;
    template?: string;
    depth?: string;
  } | null>(null);
  // History + library hydrate from the library DB (stage 4): Recents reads the
  // sessions table, stars persist in the library table.
  const [dbSessions, setDbSessions] = useState<SessionRow[]>([]);
  const [libraryPapers, setLibraryPapers] = useState<Paper[]>([]);
  const [stages, setStages] = useState<{ stage: string; message: string; seq?: number }[]>([]);
  const [toolEvents, setToolEvents] = useState<RagToolEvent[]>([]);
  const [runError, setRunError] = useState<string | null>(null);
  const [artifactOpen, setArtifactOpen] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exporting, setExporting] = useState<"md" | "pdf" | null>(null);
  const exportTimer = useRef<number | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<ExpoziSettings>(() => {
    try {
      const raw = localStorage.getItem("expozi-settings");
      if (raw) {
        const parsed = JSON.parse(raw);
        // "chat" mode was removed — migrate saved settings to the research agent.
        if (parsed.workflow === "chat") parsed.workflow = "agent";
        return {
          model: "Smart",
          workflow: "agent",
          backend: "local",
          apiModel: "",
          baseURL: "",
          embedBackend: "local",
          embedModel: "",
          depth: "auto",
          ...parsed,
        } as ExpoziSettings;
      }
    } catch {
      /* noop */
    }
    return {
      model: "Smart",
      workflow: "agent",
      backend: "local",
      apiModel: "",
      baseURL: "",
      embedBackend: "local",
      embedModel: "",
      depth: "auto",
    } as ExpoziSettings;
  });
  const [user, setUser] = useState<{ name: string; email: string } | null>(() => {
    try {
      const raw = localStorage.getItem("expozi-user");
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const signIn = (name: string, email: string) => {
    const u = { name: name.trim() || email.split("@")[0], email };
    setUser(u);
    try {
      localStorage.setItem("expozi-user", JSON.stringify(u));
    } catch {
      /* noop */
    }
  };

  const signOut = () => {
    setUser(null);
    try {
      localStorage.removeItem("expozi-user");
    } catch {
      /* noop */
    }
    setQuery(null);
    setFollowUps([]);
    setSelectedId(null);
    setEntry("landing");
    setView("home");
  };
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try {
      const raw = localStorage.getItem("expozi-history");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const recordHistory = (q: string, count: number, sessionId?: string | null, mode?: string | null) => {
    setHistory((h) => {
      const filtered = h.filter((x) => x.query !== q);
      const updated = [{ query: q, count, sessionId: sessionId ?? null, mode: mode ?? null }, ...filtered].slice(0, 20);
      try {
        localStorage.setItem("expozi-history", JSON.stringify(updated));
      } catch {
        /* noop */
      }
      return updated;
    });
  };

  const refreshSessions = () => {
    void ragApi
      .listSessions(30)
      .then((s) => setDbSessions(Array.isArray(s) ? s : []))
      .catch(() => {});
  };

  // Hydrate Recents + Library from the library DB on launch. localStorage
  // entries from before the DB wiring stay visible as re-run shortcuts.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [sessions, lib] = await Promise.all([ragApi.listSessions(30), ragApi.libraryList()]);
        if (cancelled) return;
        setDbSessions(Array.isArray(sessions) ? sessions : []);
        const papers = (Array.isArray(lib) ? lib : []).map(libraryRowToPaper);
        setLibraryPapers(papers);
        setStarred(new Set(papers.map((p) => p.id)));
      } catch {
        /* bridge absent (web preview) — localStorage-only history */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Recents = DB sessions (newest first, reopenable) + pre-DB localStorage
  // entries (re-run shortcuts), deduped by query.
  const historyMerged = useMemo(() => {
    const seen = new Set<string>();
    const out: HistoryItem[] = [];
    for (const s of dbSessions) {
      if (!s.query || seen.has(s.query)) continue;
      seen.add(s.query);
      out.push({ query: s.query, count: 0, sessionId: s.id, mode: s.mode });
    }
    for (const h of history) {
      if (seen.has(h.query)) continue;
      seen.add(h.query);
      out.push(h);
    }
    return out.slice(0, 30);
  }, [dbSessions, history]);

  const results = useMemo(() => liveSources ?? [], [liveSources]);
  const selected =
    results.find((p) => p.id === selectedId) ?? libraryPapers.find((p) => p.id === selectedId) ?? null;

  const executeSearch = (
    trimmed: string,
    targetMode: HomeMode,
    opts?: { template?: string; depth?: string; criteria?: ScreeningCriteria },
  ) => {
    setPendingResume(null);
    setPendingCriteria(null);
    setReportStepData(null);
    setQuery(trimmed);
    setAnswer(null);
    setStreaming(false);
    setStages([]);
    setToolEvents([]);
    setRunError(null);
    try {
      void ragApi.stopResearch();
      void ragApi.stopPrompt();
    } catch {
      /* noop */
    }
    setFollowUps([]);
    setSuggestions([]);
    setVersion(1);
    setArtifactOpen(false);
    setExportStatus(null);
    setThreadMode(targetMode);
    setThreadKind(
      targetMode === "review" ? "Systematic review" : targetMode === "agent" ? "Research Agent" : "Report"
    );
    setSelectedId(null);
    setView("workspace");
    setPaletteOpen(false);
    setThinking(null);
    setLiveSessionId(null);
    setScreenDecisions({});
    setScreenSaveError(null);
    if (thinkTimer.current) window.clearTimeout(thinkTimer.current);

    if (!ragReady) {
      setLiveSources([]);
      setRunError(
        "No AI backend is configured — choose the on-device model or an API provider in Settings."
      );
      setSettingsOpen(true);
      recordHistory(trimmed, 0);
      return;
    }

    setLiveSources([]);
    setLoading(true);
    window.setTimeout(() => {
      setLoading(false);
      void runLiveResearch(trimmed, targetMode, opts);
    }, 500);
  };

  const submit = async (
    q: string,
    opts?: { template?: string; depth?: string; criteria?: ScreeningCriteria },
  ) => {
    const trimmed = q.trim();
    if (!trimmed) return;

    if (ragReady && window.expozi?.rag?.checkPastSession) {
      try {
        const mem = await ragApi.checkPastSession(trimmed);
        if (mem && mem.shouldSuggest && (mem.similarity ?? 0) >= 0.7 && mem.sessionId) {
          setPendingResume({
            sessionId: mem.sessionId,
            topic: mem.title || mem.query || trimmed,
            timeAgo: mem.timeAgo || "earlier",
            query: trimmed,
            mode,
          });
          setQuery(trimmed);
          setThreadMode(mode);
          setThreadKind(
            mode === "review" ? "Systematic review" : mode === "agent" ? "Research Agent" : "Report"
          );
          setView("workspace");
          return;
        }
      } catch {
        /* proceed normally */
      }
    }

    // In Report mode, if criteria not yet confirmed, show criteria confirmation dialog (Step 2)
    if (mode === "report" && !opts?.criteria) {
      setPendingCriteria({
        query: trimmed,
        template: opts?.template,
        depth: opts?.depth,
      });
      return;
    }

    executeSearch(trimmed, mode, opts);
  };

  const askFollowUp = (q: string) => {
    if (!query) return;
    const trimmed = q.trim();
    if (!trimmed) return;
    if (thinkTimer.current) window.clearTimeout(thinkTimer.current);

    setThinking(trimmed);
    setFollowUps((f) => [...f, { q: trimmed, a: "", error: null }]);

    if (ragReady) {
      if (threadMode === "agent" && liveSessionId) {
        ragApi
          .followUp(liveSessionId, trimmed, {
            onToken: (t) =>
              setFollowUps((f) => {
                const n = [...f];
                const last = n[n.length - 1];
                if (last && last.q === trimmed) n[n.length - 1] = { ...last, a: last.a + t };
                return n;
              }),
            onTool: (ev) => {
              setToolEvents((te) => [...te, ev]);
            },
          })
          .then((res) => {
            if (res.sources && res.sources.length > 0) {
              setLiveSources((s) => {
                const existing = new Set((s || []).map((x) => x.id));
                const merged = [...(s || [])];
                for (const src of res.sources) {
                  const paper = toPaper(src);
                  if (!existing.has(paper.id)) {
                    merged.push(paper);
                    existing.add(paper.id);
                  }
                }
                return merged;
              });
            }
            setVersion((v) => v + 1);
            setThinking(null);
          })
          .catch((err) => {
            const msg = String(err?.message || err || "Failed to generate answer");
            setFollowUps((f) => {
              const n = [...f];
              const last = n[n.length - 1];
              if (last && last.q === trimmed) n[n.length - 1] = { ...last, error: msg };
              return n;
            });
            setThinking(null);
          });
        return;
      }

      const prior = followUps.filter((f) => f.a && f.a.trim().length > 0);
      const messages: { role: "user" | "assistant" | "system"; content: string }[] = [
        {
          role: "user",
          content:
            "You are Expozi, a research assistant. Answer ONLY from the sources below, citing like [1], [2]. Be concise.\n\n" +
            `Initial Research Question: ${query}\n\n` +
            `Sources:\n${sourcesBlock(results)}`,
        },
        ...(answer ? [{ role: "assistant" as const, content: answer }] : []),
        ...prior.flatMap((f) => [
          { role: "user" as const, content: f.q },
          { role: "assistant" as const, content: f.a },
        ]),
        {
          role: "user" as const,
          content: trimmed,
        },
      ];

      ragApi
        .promptOnce(
          messages,
          350,
          (t) =>
            setFollowUps((f) => {
              const n = [...f];
              const last = n[n.length - 1];
              if (last && last.q === trimmed) n[n.length - 1] = { ...last, a: last.a + t };
              return n;
            }),
        )
        .then(() => {
          setVersion((v) => v + 1);
          setThinking(null);
        })
        .catch((err) => {
          const msg = String(err?.message || err || "Failed to generate answer");
          setFollowUps((f) => {
            const n = [...f];
            const last = n[n.length - 1];
            if (last && last.q === trimmed) n[n.length - 1] = { ...last, error: msg };
            return n;
          });
          setThinking(null);
        });
      return;
    }

    thinkTimer.current = window.setTimeout(() => {
      setFollowUps((f) => {
        const n = [...f];
        const last = n[n.length - 1];
        if (last && last.q === trimmed) {
          n[n.length - 1] = {
            ...last,
            error:
              "No AI backend is configured — open Settings to choose the on-device model or an API provider.",
          };
        }
        return n;
      });
      setThinking(null);
    }, 400);
  };

  const stopThinking = () => {
    if (thinkTimer.current) window.clearTimeout(thinkTimer.current);
    try {
      void ragApi.stopPrompt();
    } catch {
      /* bridge may be absent */
    }
    try {
      void ragApi.stopResearch();
    } catch {
      /* bridge may be absent */
    }
    setThinking(null);
    setStreaming(false);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const s = await ragApi.getStatus();
        if (alive) setRagStatus(s);
        try {
          const raw = localStorage.getItem("expozi-settings");
          if (raw) {
            const st = JSON.parse(raw);
            await ragApi.setBackend({
              backend: st.backend || "local",
              apiModel: st.apiModel || "",
              baseURL: st.baseURL || "",
              embedBackend: st.embedBackend || "local",
              embedModel: st.embedModel || "",
              depth: st.depth || "auto",
            });
          }
        } catch {
          /* noop */
        }
      } catch {
        if (alive)
          setRagStatus({ llm: "error", modelFile: null, download: null, error: "bridge unavailable", modelName: "" });
      }
    })();
    const off1 = ragApi.onStatus((s) => {
      if (alive) setRagStatus(s);
    });
    const off2 = ragApi.onDownloadProgress((p) => {
      if (alive) setRagStatus((s) => (s ? { ...s, download: p } : s));
    });
    return () => {
      alive = false;
      off1();
      off2();
    };
  }, []);

  const apiBackend = settings.backend !== "local";
  // "available" means the model file exists but isn't loaded yet — it loads
  // on first use, so the app is fully usable right away.
  const ragReady =
    ragStatus?.llm === "ready" || ragStatus?.llm === "available" || ragStatus?.llm === "loading" || apiBackend;

  // While the local model is still loading, poll status so the UI never gets stuck
  // on a missed startup push from the main process.
  useEffect(() => {
    if (ragStatus !== null && ragStatus.llm !== "loading" && ragStatus.llm !== "downloading") return;
    const t = window.setInterval(() => {
      void ragApi
        .getStatus()
        .then((s) => setRagStatus(s))
        .catch(() => {});
    }, 4000);
    return () => window.clearInterval(t);
  }, [ragStatus]);

  function sourcesBlock(papers: Paper[]): string {
    return papers
      .slice(0, 8)
      .map(
        (p, i) =>
          `[${i + 1}] ${p.title} — ${p.authors.join(", ") || "unknown authors"} (${p.year ?? "n.d."}). ` +
          (p.summary || p.abstract || "").slice(0, 400),
      )
      .join("\n");
  }

  const runLiveResearch = async (
    q: string,
    m: HomeMode,
    opts?: { template?: string; depth?: string; criteria?: ScreeningCriteria },
  ) => {
    setStreaming(true);
    let acc = "";
    try {
      const res = await ragApi.research(
        q,
        m,
        {
          onStage: (stage, message, seq) =>
            setStages((s) => {
              // Same stage key again (e.g. embed progress) updates the last line
              // in place instead of piling up duplicates in the trace.
              const last = s[s.length - 1];
              if (last && last.stage === stage) {
                const next = s.slice(0, -1);
                next.push({ stage, message, seq });
                return next;
              }
              return [...s, { stage, message, seq }];
            }),
          onTool: (ev) =>
            setToolEvents((prev) => {
              const i = prev.findIndex((e) => e.call === ev.call);
              if (i === -1) return [...prev, ev];
              const next = [...prev];
              next[i] = ev;
              return next;
            }),
          onToken: (t) => {
            acc += t;
            setAnswer((a) => (a ?? "") + t);
          },
          onStepData: (data) => {
            setReportStepData((prev) => ({ ...(prev || {}), ...data }));
          },
        },
        opts,
      );
      const sources = res.sources;
      if (res.answer && res.answer.trim().length > 0) {
        // The pipeline can return a better-ordered final text (e.g. the
        // assembled report with abstract first) — prefer it over the stream.
        acc = res.answer;
        setAnswer(res.answer);
      }
      if (res.stepData) {
        setReportStepData(res.stepData);
      }
      setLiveSources(sources.map(toPaper));
      setLiveSessionId(res.sessionId || null);
      setVersion((v) => v + 1);
      recordHistory(q, sources.length, res.sessionId, m);
      refreshSessions();
      if (m !== "review" && acc.trim().length > 0) void generateSuggestions(q, acc);
    } catch (e) {
      const msg = String((e as Error)?.message || e);
      if (!/abort/i.test(msg)) {
        setRunError(msg);
        // Nudge to settings when the local model needs attention.
        if (/local model/i.test(msg)) setSettingsOpen(true);
      }
    } finally {
      setStreaming(false);
    }
  };

  // Screening decisions (review mode) — optimistic UI, persisted per session
  // in the library DB so they survive restarts and reopen from Recents.
  const decideScreening = (url: string, decision: string | null, note: string | null) => {
    setScreenDecisions((prev) => ({ ...prev, [url]: { decision, note } }));
    setScreenSaveError(null);
    if (!liveSessionId) {
      setScreenSaveError("no saved session for this table");
      return;
    }
    ragApi
      .setScreening(liveSessionId, url, decision as ScreeningDecision | null, note)
      .then((r) => {
        if (r && r.saved === false) setScreenSaveError(r.error || "unknown error");
      })
      .catch((e) => setScreenSaveError(String((e as Error)?.message || e)));
  };

  // Reopen a saved review from Recents — sources + decisions from the DB,
  // no re-run (the answer text is not stored for reviews; there is none).
  const openSession = async (sessionId: string) => {
    try {
      const s = await ragApi.loadSession(sessionId);
      if (!s) {
        setRunError("That saved session is not in the library database.");
        return;
      }
      const byUrl = new Map((s.screening || []).map((row) => [row.url, row]));
      const papers = s.sources.map((r) => {
        const row = r.url ? byUrl.get(r.url) : undefined;
        return toPaper(row ? { ...r, suggested: row.suggested ?? null, suggestReason: row.reason ?? null } : r);
      });
      const decisions: Record<string, ScreeningEntry> = {};
      for (const row of s.screening || []) decisions[row.url] = { decision: row.decision ?? null, note: row.note ?? null };
      const targetMode = (s.mode as HomeMode) || "agent";
      setQuery(s.query);
      setThreadMode(targetMode);
      setThreadKind(
        targetMode === "review" ? "Systematic review" : targetMode === "agent" ? "Research Agent" : "Report"
      );
      setAnswer(s.answer || null);
      setStreaming(false);
      setStages([
        {
          stage: "reopen",
          message: `Reopened saved ${targetMode} — ${papers.length} sources restored`,
        },
      ]);
      setToolEvents([]);
      setRunError(null);
      setFollowUps([]);
      setSuggestions([]);
      setVersion(1);
      setArtifactOpen(false);
      setExportStatus(null);
      setSelectedId(null);
      setLiveSources(papers);
      setLiveSessionId(s.id);
      setScreenDecisions(decisions);
      setScreenSaveError(null);
      setPendingResume(null);
      setView("workspace");
    } catch (e) {
      setRunError(`Could not reopen the saved session: ${String((e as Error)?.message || e)}`);
    }
  };

  // Report export: main process shows the native save dialog and writes the
  // file (.md directly, .pdf via printToPDF). Status is reported inline.
  const exportAnswer = async (format: "md" | "pdf") => {
    if (streaming || !answer || !answer.trim() || exporting) return;
    const title = reportTitle(answer, query ?? "");
    setExporting(format);
    setExportStatus(`Exporting ${format === "pdf" ? "PDF" : "Markdown"}…`);
    if (exportTimer.current) window.clearTimeout(exportTimer.current);
    try {
      const res = await exportReport({ format, markdown: answer, title });
      if (res.saved) setExportStatus(`Saved to ${res.path}`);
      else if (res.error) setExportStatus(`Export failed: ${res.error}`);
      else setExportStatus("Export canceled");
    } catch (e) {
      setExportStatus(`Export failed: ${String((e as Error)?.message || e)}`);
    } finally {
      setExporting(null);
      exportTimer.current = window.setTimeout(() => setExportStatus(null), 10000);
    }
  };

  const generateSuggestions = async (q: string, context: string) => {
    try {
      const raw = await ragApi.promptOnce(
        [
          {
            role: "user",
            content:
              `Suggest exactly 3 short follow-up questions a researcher would ask next about: "${q}". ` +
              `Context: ${context.slice(0, 600)}. Return ONLY the 3 questions, one per line, no numbering or bullets.`,
          },
        ],
        120,
      );
      const lines = raw
        .split("\n")
        .map((l) => l.replace(/^[-*\d.)\s]+/, "").trim())
        .filter((l) => l.length > 10)
        .slice(0, 3);
      if (lines.length > 0) setSuggestions(lines);
    } catch {
      /* noop */
    }
  };

  const toggleStar = (id: string) => {
    const paper = results.find((p) => p.id === id) || libraryPapers.find((p) => p.id === id);
    const isStarred = starred.has(id);
    setStarred((prev) => {
      const next = new Set(prev);
      if (isStarred) next.delete(id);
      else next.add(id);
      return next;
    });
    if (isStarred) {
      setLibraryPapers((prev) => prev.filter((p) => p.id !== id));
      void ragApi
        .libraryRemove(id)
        .then((r) => {
          // A failed save must not leave a star that looks persisted.
          if (r && r.saved === false) {
            if (paper) setLibraryPapers((prev) => (prev.some((p) => p.id === id) ? prev : [paper, ...prev]));
            setStarred((prev) => new Set(prev).add(id));
          }
        })
        .catch(() => {});
    } else if (paper) {
      setLibraryPapers((prev) => (prev.some((p) => p.id === id) ? prev : [paper, ...prev]));
      void ragApi
        .libraryAdd({
          url: paper.url || paper.id,
          title: paper.title,
          authors: (paper.authors || []).join("; "),
          year: paper.year,
          journal: paper.journal,
          citations: paper.citations,
          abstract: paper.abstract,
          doi: paper.doi ?? null,
          source_type: paper.provenance ?? null,
          study_type: paper.studyType ?? null,
          quality: paper.quality ?? null,
          retracted: paper.retracted ? 1 : 0,
        })
        .then((r) => {
          if (r && r.saved === false) {
            setLibraryPapers((prev) => prev.filter((p) => p.id !== id));
            setStarred((prev) => {
              const next = new Set(prev);
              next.delete(id);
              return next;
            });
          }
        })
        .catch(() => {});
    }
  };

  const updateSettings = (s: ExpoziSettings) => {
    setSettings(s);
    setMode(s.workflow);
    try {
      localStorage.setItem("expozi-settings", JSON.stringify(s));
    } catch {
      /* noop */
    }
    try {
      void ragApi.setBackend({
        backend: s.backend,
        apiModel: s.apiModel,
        baseURL: s.baseURL,
        embedBackend: s.embedBackend || "local",
        embedModel: s.embedModel || "",
        depth: s.depth || "auto",
      });
    } catch {
      /* bridge may be absent */
    }
  };

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
    } catch {
      /* noop */
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const starredPapers = libraryPapers;

  if (!user) {
    if (entry === "landing") {
      return <LandingView onLocal={() => signIn("Local User", "local@device")} onSignUp={() => setEntry("signup")} />;
    }
    return <AuthView initialMode={entry} onBack={() => setEntry("landing")} onAuth={signIn} />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-white">
      <Sidebar
        view={view}
        history={historyMerged}
        userName={user.name}
        userEmail={user.email}
        onSignOut={signOut}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        onNavigate={setView}
        onOpenSearch={() => setPaletteOpen(true)}
        onNew={() => {
          setQuery(null);
          setFollowUps([]);
          setSelectedId(null);
          setArtifactOpen(false);
          setExportStatus(null);
          setLiveSessionId(null);
          setScreenDecisions({});
          setScreenSaveError(null);
          setView("home");
        }}
        onSelectHistory={(item) => {
          if (item.sessionId) void openSession(item.sessionId);
          else void submit(item.query);
        }}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {view === "home" && (
          <HomeView
            onSubmit={submit}
            history={historyMerged}
            mode={mode}
            model={settings.model}
            onModeChange={setMode}
            onAddToProject={(t) => setRoutines((all) => (all.includes(t) ? all : [t, ...all]))}
          />
        )}

        {view === "workspace" && query && loading && (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 bg-white">
            <span className="h-10 w-10 animate-spin rounded-full border-[3px] border-gray-200 border-t-teal-600" />
            <p className="text-[17px] text-gray-900">Loading workspace</p>
          </div>
        )}

        {view === "workspace" && query && !loading && (
          threadMode === "report" ? (
            <div className="flex min-h-0 flex-1 flex-col">
              <TopBar title={query} versions={version} onShare={share} />
              <ReportModeView
                query={query}
                reportAnswer={answer}
                streaming={streaming}
                stepData={reportStepData}
                sessionId={liveSessionId}
                papers={results}
                onOpenPaper={setSelectedId}
                onRetry={() =>
                  executeSearch(query, "report", {
                    template: reportStepData?.template,
                    depth: reportStepData?.depth,
                    criteria: reportStepData?.criteria,
                  })
                }
              />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1">
              {/* conversation column */}
              <div className="flex min-w-0 flex-1 flex-col">
                <TopBar title={query} versions={version} onShare={share} />
                {pendingResume && (
                  <div className="mx-auto w-full max-w-[860px] px-6 pt-4">
                    <div className="flex items-center justify-between rounded-xl border border-teal-200 bg-teal-50/80 p-4 text-teal-950 shadow-xs">
                      <div className="flex items-center gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-600 text-white">
                          <BookOpen size={18} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">
                            Resume previous research on "{pendingResume.topic}"?
                          </p>
                          <p className="text-xs text-teal-700">
                            Found past research from {pendingResume.timeAgo}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            const sid = pendingResume.sessionId;
                            setPendingResume(null);
                            void openSession(sid);
                          }}
                          className="rounded-lg bg-teal-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-teal-700 transition-colors cursor-pointer"
                        >
                          Resume
                        </button>
                        <button
                          onClick={() => {
                            const { query: q, mode: m } = pendingResume;
                            setPendingResume(null);
                            executeSearch(q, m);
                          }}
                          className="rounded-lg border border-teal-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-teal-50 transition-colors cursor-pointer"
                        >
                          New search
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                <div className="slim-scroll min-h-0 flex-1 overflow-y-auto">
                  <ReportView
                    query={query}
                    papers={results}
                    starred={starred}
                    onToggleStar={toggleStar}
                    onOpenPaper={setSelectedId}
                    onFollowUp={askFollowUp}
                    followUpBlocks={followUps}
                    version={version}
                    kindLabel={threadKind}
                    thinking={thinking}
                    answer={answer}
                    streaming={streaming}
                    mode={threadMode}
                    suggestions={suggestions}
                    stages={stages}
                    toolEvents={toolEvents}
                    error={runError}
                    artifactOpen={artifactOpen}
                    onOpenArtifact={() => setArtifactOpen(true)}
                    onExport={(f) => void exportAnswer(f)}
                    decisions={screenDecisions}
                    onDecide={decideScreening}
                    screenSaveError={screenSaveError}
                  />
                </div>
                <div className="shrink-0 border-t border-gray-100 bg-white px-6 py-4">
                  <div className="mx-auto w-full max-w-[860px]">
                    <Composer
                      onSubmit={askFollowUp}
                      model={settings.model}
                      thinking={thinking !== null || streaming}
                      onStop={stopThinking}
                    />
                  </div>
                </div>
              </div>

              {/* report viewer (opens from the artifact card) */}
              {artifactOpen && (answer ?? "").trim().length > 0 && (
                <ArtifactPanel
                  title={reportTitle(answer ?? "", query)}
                  subtitle={`${threadKind} · V${version}`}
                  markdown={answer ?? ""}
                  exportStatus={exportStatus}
                  exporting={exporting}
                  onExport={(f) => void exportAnswer(f)}
                  onClose={() => setArtifactOpen(false)}
                />
              )}
            </div>
          )
        )}

        {view === "library" && (
          <LibraryView
            starred={starredPapers}
            uploaded={uploaded}
            onUpload={(names) => setUploaded((u) => [...u, ...names.filter((n) => !u.includes(n))])}
            onRemoveUpload={(i) => setUploaded((u) => u.filter((_, j) => j !== i))}
            onOpenPaper={setSelectedId}
            onToggleStar={toggleStar}
            onAction={submit}
          />
        )}

        {view === "routines" && (
          <RoutinesView routines={routines} onAdd={(r) => setRoutines((all) => [r, ...all])} />
        )}
      </div>

      {selected && <DetailPane paper={selected} onClose={() => setSelectedId(null)} />}
      {paletteOpen && (
        <CommandPalette
          history={historyMerged}
          starred={starredPapers}
          onClose={() => setPaletteOpen(false)}
          onSubmitSession={submit}
          onGoLibrary={() => {
            setPaletteOpen(false);
            setView("library");
          }}
          onGoHome={() => {
            setPaletteOpen(false);
            setQuery(null);
            setFollowUps([]);
            setSelectedId(null);
            setView("home");
          }}
          onOpenSettings={() => {
            setPaletteOpen(false);
            setSettingsOpen(true);
          }}
          onOpenDevTools={() => {
            setPaletteOpen(false);
            window.expozi?.openDevTools();
          }}
        />
      )}
      {settingsOpen && (
        <SettingsView
          settings={settings}
          onChange={updateSettings}
          onClose={() => setSettingsOpen(false)}
          ragStatus={ragStatus}
          onDownloadChat={() => void ragApi.downloadModel("chat")}
          onDownloadEmbedding={() => void ragApi.downloadModel("embedding")}
          onCancelDownload={() => void ragApi.cancelDownload()}
          onOpenFolder={() => void ragApi.openModelsFolder()}
          onImport={async () => {
            await ragApi.importModel();
            try {
              setRagStatus(await ragApi.getStatus());
            } catch {
              /* noop */
            }
          }}
          onLoadModel={() => void ragApi.loadModel()}
        />
      )}
      {pendingCriteria && (
        <CriteriaModal
          query={pendingCriteria.query}
          onConfirm={(criteria) => {
            const { query: q, template, depth } = pendingCriteria;
            setPendingCriteria(null);
            executeSearch(q, "report", { template, depth, criteria });
          }}
          onCancel={() => setPendingCriteria(null)}
        />
      )}
    </div>
  );
}
