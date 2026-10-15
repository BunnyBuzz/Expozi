import { useEffect, useMemo, useRef, useState } from "react";
import Sidebar, { type HistoryItem, type NavView } from "./components/Sidebar";
import TopBar from "./components/TopBar";
import HomeView, { type HomeMode } from "./components/HomeView";
import Composer from "./components/Composer";
import ReportView, { type FollowUpItem } from "./components/ReportView";
import DetailPane from "./components/DetailPane";
import LibraryView from "./components/LibraryView";
import RoutinesView from "./components/RoutinesView";
import AuthView from "./components/AuthView";
import LandingView from "./components/LandingView";
import CommandPalette, { type ExpoziSettings, SettingsModal } from "./components/CommandPalette";
import { ragApi, type RagStatus } from "./rag";
import { type Paper } from "./data/papers";
import { toPaper } from "./data/live";


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
  const [mode, setMode] = useState<HomeMode>("agent");
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
  const [stages, setStages] = useState<{ stage: string; message: string }[]>([]);
  const [runError, setRunError] = useState<string | null>(null);
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

  const recordHistory = (q: string, count: number) => {
    setHistory((h) => {
      const filtered = h.filter((x) => x.query !== q);
      const updated = [{ query: q, count }, ...filtered].slice(0, 20);
      try {
        localStorage.setItem("expozi-history", JSON.stringify(updated));
      } catch {
        /* noop */
      }
      return updated;
    });
  };

  const results = useMemo(() => liveSources ?? [], [liveSources]);
  const selected = results.find((p) => p.id === selectedId) ?? null;

  const submit = (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setQuery(trimmed);
    setAnswer(null);
    setStreaming(false);
    setStages([]);
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
    setThreadMode(mode);
    setThreadKind(mode === "review" ? "Systematic review" : "Report");
    setSelectedId(null);
    setView("workspace");
    setPaletteOpen(false);
    setThinking(null);
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
      void runLiveResearch(trimmed, mode);
    }, 500);
  };

  const askFollowUp = (q: string) => {
    if (!query) return;
    const trimmed = q.trim();
    if (!trimmed) return;
    if (thinkTimer.current) window.clearTimeout(thinkTimer.current);

    setThinking(trimmed);
    setFollowUps((f) => [...f, { q: trimmed, a: "", error: null }]);

    if (ragReady) {
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

  const runLiveResearch = async (q: string, m: HomeMode) => {
    setStreaming(true);
    let acc = "";
    try {
      const res = await ragApi.research(q, m, {
        onStage: (stage, message) => setStages((s) => [...s, { stage, message }]),
        onToken: (t) => {
          acc += t;
          setAnswer((a) => (a ?? "") + t);
        },
      });
      const sources = res.sources;
      if (res.answer && res.answer.trim().length > 0) {
        // The pipeline can return a better-ordered final text (e.g. the
        // assembled report with abstract first) — prefer it over the stream.
        acc = res.answer;
        setAnswer(res.answer);
      }
      setLiveSources(sources.map(toPaper));
      setVersion((v) => v + 1);
      recordHistory(q, sources.length);
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

  const toggleStar = (id: string) =>
    setStarred((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

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

  const starredPapers = results.filter((p) => starred.has(p.id));

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
        history={history}
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
          setView("home");
        }}
        onSelectHistory={submit}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {view === "home" && (
          <HomeView
            onSubmit={submit}
            history={history}
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
          <>
            <TopBar title={query} versions={version} onShare={share} />
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
                error={runError}
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
          </>
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
          history={history}
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
        <SettingsModal
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
    </div>
  );
}
