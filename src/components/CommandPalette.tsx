import { useEffect, useMemo, useState } from "react";
import {
  Search,
  FileText,
  LibraryBig,
  Clock,
  Settings,
  Code2,
  X,
  Download,
  Loader2,
  FolderOpen,
  FileUp,
  Cpu,
} from "lucide-react";
import type { HistoryItem } from "./Sidebar";
import type { Paper } from "../data/papers";
import type { HomeMode } from "./HomeView";
import { ragApi, KEY_PROVIDERS, CHAT_BACKENDS, readerStatus } from "../rag";
import type { RagStatus, ReaderStatus } from "../rag";

export interface ExpoziSettings {
  model: string;
  workflow: HomeMode;
  backend: string;
  apiModel: string;
  baseURL: string;
  embedBackend?: "local" | "api";
  embedModel?: string;
  depth?: "auto" | "lite" | "standard" | "deep";
}

interface Item {
  id: string;
  label: string;
  hint: string;
  icon: typeof Search;
  run: () => void;
}

interface Props {
  history: HistoryItem[];
  starred: Paper[];
  onClose: () => void;
  onSubmitSession: (q: string) => void;
  onGoLibrary: () => void;
  onGoHome: () => void;
  onOpenSettings: () => void;
  onOpenDevTools: () => void;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-sans text-[12px] text-gray-500">
      {children}
    </kbd>
  );
}

export default function CommandPalette({
  history,
  starred,
  onClose,
  onSubmitSession,
  onGoLibrary,
  onGoHome,
  onOpenSettings,
  onOpenDevTools,
}: Props) {
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);

  const sessions = useMemo(() => history.slice(0, 6), [history]);
  void starred;

  const q = text.trim().toLowerCase();
  const sess: Item[] = sessions
    .filter((s) => !q || s.query.toLowerCase().includes(q))
    .map((s, i) => ({
      id: `s-${i}`,
      label: s.query,
      hint: "Session",
      icon: FileText,
      run: () => onSubmitSession(s.query),
    }));
  const cmds: Item[] = (
    [
      { id: "lib", label: "Go to Library", icon: LibraryBig, run: onGoLibrary },
      { id: "home", label: "Go to Recent sessions", icon: Clock, run: onGoHome },
      { id: "set", label: "Go to Settings", icon: Settings, run: onOpenSettings },
      { id: "dev", label: "Go to Developer", icon: Code2, run: onOpenDevTools },
    ] as Item[]
  ).filter((c) => !q || c.label.toLowerCase().includes(q));

  const items = [...sess, ...cmds];
  useEffect(() => setActive(0), [text]);

  const row = (item: Item, index: number) => (
    <button
      key={item.id}
      onMouseEnter={() => setActive(index)}
      onClick={() => item.run()}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ${
        active === index ? "bg-gray-100" : ""
      }`}
    >
      <item.icon size={18} className="shrink-0 text-gray-500" />
      <span className="min-w-0 flex-1 truncate text-[16px] text-gray-900">{item.label}</span>
      {item.hint && <span className="shrink-0 text-sm text-gray-400">{item.hint}</span>}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-6 pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[880px] overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-gray-200 px-5 py-4">
          <Search size={20} className="shrink-0 text-gray-400" />
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, items.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                const it = items[active];
                if (it) it.run();
                else if (text.trim()) onSubmitSession(text.trim());
              } else if (e.key === "Escape") {
                onClose();
              }
            }}
            placeholder="Search sessions, library, or type a command…"
            className="flex-1 bg-transparent text-[17px] text-gray-900 outline-none placeholder:text-gray-400"
          />
        </div>

        <div className="slim-scroll max-h-[46vh] overflow-y-auto p-2">
          {sess.length > 0 && (
            <p className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-gray-400">Recent</p>
          )}
          {sess.map((s, i) => row(s, i))}
          {cmds.length > 0 && (
            <p className="px-3 pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-gray-400">Go to</p>
          )}
          {cmds.map((c, j) => row(c, sess.length + j))}
          {items.length === 0 && text.trim() && (
            <button
              onClick={() => onSubmitSession(text.trim())}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-gray-100"
            >
              <Search size={18} className="shrink-0 text-gray-500" />
              <span className="text-[16px] text-gray-900">Research “{text.trim()}”</span>
            </button>
          )}
          {items.length === 0 && !text.trim() && (
            <p className="px-4 py-6 text-center text-sm text-gray-400">No sessions yet.</p>
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-gray-200 px-5 py-3 text-[13px] text-gray-500">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigate
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↵</Kbd> open
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>esc</Kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}

const WORKFLOWS: { id: HomeMode; label: string }[] = [
  { id: "agent", label: "Research agent" },
  { id: "report", label: "Report" },
  { id: "review", label: "Systematic review" },
];

const MODELS = ["Smart", "Balanced", "Deep research"];

function KeyManager() {
  const [rows, setRows] = useState<{ provider: string; label: string; kind: string; has: boolean; masked: string }[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, { ok: boolean; message: string }>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const load = async () => {
    try {
      setRows(await ragApi.getKeys());
    } catch {
      /* bridge unavailable */
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const save = async (provider: string) => {
    const v = (drafts[provider] || "").trim();
    if (!v) return;
    setBusy((b) => ({ ...b, [provider]: true }));
    try {
      await ragApi.setKey(provider, v);
      setDrafts((d) => ({ ...d, [provider]: "" }));
      await load();
    } finally {
      setBusy((b) => ({ ...b, [provider]: false }));
    }
  };
  const test = async (provider: string) => {
    setBusy((b) => ({ ...b, [provider + ":t"]: true }));
    try {
      const r = await ragApi.testKey(provider);
      setResults((m) => ({ ...m, [provider]: r }));
    } catch (e) {
      setResults((m) => ({ ...m, [provider]: { ok: false, message: String(e) } }));
    } finally {
      setBusy((b) => ({ ...b, [provider + ":t"]: false }));
    }
  };
  const del = async (provider: string) => {
    await ragApi.deleteKey(provider);
    setResults((m) => {
      const n = { ...m };
      delete n[provider];
      return n;
    });
    await load();
  };
  return (
    <div className="mt-5">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-400">API keys</p>
      <div className="mt-2 space-y-2">
        {KEY_PROVIDERS.map((p) => {
          const row = rows.find((r) => r.provider === p.id);
          const res = results[p.id];
          return (
            <div key={p.id} className="rounded-xl border border-gray-200 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-800">
                  {p.label} <span className="ml-1 text-xs font-normal text-gray-400">{p.kind}</span>
                </span>
                {row?.has ? (
                  <span className="text-xs text-teal-700">● saved {row.masked}</span>
                ) : (
                  <span className="text-xs text-gray-400">no key</span>
                )}
              </div>
              <div className="mt-2 flex gap-1.5">
                <input
                  type="password"
                  value={drafts[p.id] || ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [p.id]: e.target.value }))}
                  placeholder={row?.has ? "Replace key…" : "Paste key…"}
                  className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-teal-600"
                />
                <button
                  onClick={() => save(p.id)}
                  disabled={busy[p.id] || !(drafts[p.id] || "").trim()}
                  className="rounded-lg bg-gray-800 px-3 py-1.5 text-sm text-white disabled:opacity-40"
                >
                  Save
                </button>
                <button
                  onClick={() => test(p.id)}
                  disabled={!!busy[p.id + ":t"]}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
                >
                  Test
                </button>
                {row?.has && (
                  <button onClick={() => del(p.id)} className="rounded-lg px-2 py-1.5 text-sm text-red-600 hover:bg-red-50">
                    Delete
                  </button>
                )}
              </div>
              {res && (
                <p className={`mt-1.5 text-xs ${res.ok ? "text-teal-700" : "text-red-600"}`}>
                  {res.ok ? "✓ " : ""}
                  {res.message}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LocalModelCard({
  status,
  onDownloadChat,
  onDownloadEmbedding,
  onCancelDownload,
  onOpenFolder,
  onImport,
  onLoadModel,
}: {
  status?: RagStatus | null;
  onDownloadChat: () => void;
  onDownloadEmbedding: () => void;
  onCancelDownload: () => void;
  onOpenFolder: () => void;
  onImport: () => void;
  onLoadModel: () => void;
}) {
  const llm = status?.llm || "missing";
  const emb = status?.embedding || "missing";
  const embKind = status?.embedKind || null;
  const dl = status?.download || null;
  const pct = dl && dl.total > 0 ? Math.min(100, Math.round((dl.received / dl.total) * 100)) : 0;
  const dlChat = dl && dl.which !== "embedding" ? dl : null;
  const dlEmb = dl && dl.which === "embedding" ? dl : null;
  const chip =
    llm === "ready"
      ? { text: "Loaded", cls: "bg-teal-50 text-teal-700" }
      : llm === "available"
        ? { text: "Installed", cls: "bg-gray-100 text-gray-600" }
        : llm === "downloading"
          ? { text: dlEmb ? "Installed" : "Downloading…", cls: dlEmb ? "bg-gray-100 text-gray-600" : "bg-amber-50 text-amber-700" }
          : llm === "loading"
            ? { text: "Loading…", cls: "bg-amber-50 text-amber-700" }
            : llm === "error"
              ? { text: "Error", cls: "bg-red-50 text-red-600" }
              : { text: "Not installed", cls: "bg-gray-100 text-gray-500" };

  return (
    <div className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3.5">
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-medium text-gray-800">On-device model</p>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${chip.cls}`}>{chip.text}</span>
      </div>
      <p className="mt-1 text-xs text-gray-500">
        Runs privately on this PC, no keys needed. It loads into memory only when a run starts —
        never at app startup.
      </p>

      {llm === "downloading" && dlChat && (
        <div className="mt-2.5">
          <div className="flex items-center justify-between text-[11px] text-gray-500">
            <span>Downloading model… {pct}%</span>
            <button onClick={onCancelDownload} className="text-gray-400 hover:underline">
              Cancel
            </button>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
            <div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {llm === "loading" && (
        <p className="mt-2.5 flex items-center gap-2 text-xs text-gray-500">
          <Loader2 size={14} className="animate-spin" /> Loading into memory…
        </p>
      )}

      {(llm === "missing" || llm === "error") && (
        <button
          onClick={onDownloadChat}
          className="mt-2.5 flex items-center gap-2 rounded-lg bg-teal-700 px-3 py-2 text-xs font-medium text-white hover:bg-teal-800"
        >
          <Download size={14} /> Download model
        </button>
      )}

      {llm === "available" && (
        <button
          onClick={onLoadModel}
          className="mt-2.5 flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100"
        >
          <Cpu size={14} /> Load now
        </button>
      )}

      {llm === "error" && status?.error && <p className="mt-2 text-xs text-red-600">{status.error}</p>}

      <div className="mt-2.5 flex flex-wrap gap-2">
        <button
          onClick={onOpenFolder}
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-gray-600 hover:bg-gray-100"
        >
          <FolderOpen size={13} /> Models folder
        </button>
        <button
          onClick={onImport}
          className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-[11px] font-medium text-gray-600 hover:bg-gray-100"
        >
          <FileUp size={13} /> Use my own file
        </button>
      </div>

      <div className="mt-3 border-t border-gray-200 pt-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">
            Embedding model:{" "}
            {embKind === "onnx"
              ? `multilingual-e5-small ONNX — ${
                  emb === "ready"
                    ? "ready"
                    : emb === "loading"
                      ? "preparing…"
                      : emb === "error"
                        ? "error"
                        : "fast local"
                }`
              : emb === "ready"
                ? "loaded"
                : emb === "available"
                  ? "installed"
                  : emb === "downloading"
                    ? `downloading ${pct}%`
                    : emb === "loading"
                      ? "loading…"
                      : "not installed"}
          </span>
          {embKind !== "onnx" && (emb === "missing" || emb === "error") && llm !== "downloading" && (
            <button onClick={onDownloadEmbedding} className="text-[11px] font-medium text-teal-700 hover:underline">
              Download
            </button>
          )}
          {emb === "downloading" && dlEmb && (
            <button onClick={onCancelDownload} className="text-[11px] text-gray-400 hover:underline">
              Cancel
            </button>
          )}
        </div>
        {emb === "downloading" && dlEmb && (
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-200">
            <div className="h-full rounded-full bg-teal-600 transition-all" style={{ width: `${pct}%` }} />
          </div>
        )}
        {embKind === "onnx" ? (
          <p className="mt-1 text-[11px] text-gray-400">
            Fast local embeddings on CPU (~140 MB, downloaded once on first run). Falls back to keyword
            ranking if it cannot load.
          </p>
        ) : (
          (emb === "missing" || emb === "error") && (
            <p className="mt-1 text-[11px] text-gray-400">
              Optional — without it, search falls back to keyword ranking.
            </p>
          )
        )}
        {emb === "error" && status?.embedError && (
          <p className="mt-1 text-[11px] text-red-500">{status.embedError}</p>
        )}
      </div>
    </div>
  );
}

export function SettingsModal({
  settings,
  onChange,
  onClose,
  ragStatus,
  onDownloadChat,
  onDownloadEmbedding,
  onCancelDownload,
  onOpenFolder,
  onImport,
  onLoadModel,
}: {
  settings: ExpoziSettings;
  onChange: (s: ExpoziSettings) => void;
  onClose: () => void;
  ragStatus?: RagStatus | null;
  onDownloadChat: () => void;
  onDownloadEmbedding: () => void;
  onCancelDownload: () => void;
  onOpenFolder: () => void;
  onImport: () => void;
  onLoadModel: () => void;
}) {
  const [readers, setReaders] = useState<ReaderStatus | null>(null);
  useEffect(() => {
    let alive = true;
    readerStatus()
      .then((s) => {
        if (alive) setReaders(s);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[560px] rounded-2xl bg-white p-6 shadow-2xl">
      <div className="slim-scroll max-h-[82vh] overflow-y-auto pr-1">
        <div className="flex items-center justify-between">
          <h2 className="text-[19px] font-semibold text-gray-900">Settings</h2>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100" title="Close">
            <X size={17} />
          </button>
        </div>

        <p className="mt-5 text-xs font-medium uppercase tracking-wide text-gray-400">Default workflow</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {WORKFLOWS.map((w) => (
            <button
              key={w.id}
              onClick={() => onChange({ ...settings, workflow: w.id })}
              className={`rounded-xl border px-2 py-2.5 text-sm font-medium ${
                settings.workflow === w.id
                  ? "border-teal-600 bg-teal-50 text-teal-800"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>

        <p className="mt-5 text-xs font-medium uppercase tracking-wide text-gray-400">Default model</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {MODELS.map((m) => (
            <button
              key={m}
              onClick={() => onChange({ ...settings, model: m })}
              className={`rounded-xl border px-2 py-2.5 text-sm font-medium ${
                settings.model === m
                  ? "border-teal-600 bg-teal-50 text-teal-800"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {m}
            </button>
          ))}
        </div>

        <p className="mt-5 text-xs font-medium uppercase tracking-wide text-gray-400">Chat backend</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {CHAT_BACKENDS.map((b) => (
            <button
              key={b.id}
              onClick={() =>
                onChange({
                  ...settings,
                  backend: b.id,
                  apiModel: settings.apiModel || b.defaultModel || "",
                  baseURL: b.id === "ollama" ? b.defaultBaseUrl || "" : settings.baseURL,
                })
              }
              className={`rounded-xl border px-2 py-2.5 text-sm font-medium ${
                settings.backend === b.id
                  ? "border-teal-600 bg-teal-50 text-teal-800"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
        {settings.backend !== "local" && (
          <div className="mt-2 space-y-2">
            <input
              value={settings.apiModel}
              onChange={(e) => onChange({ ...settings, apiModel: e.target.value })}
              placeholder="Model name (e.g. openai/gpt-4o-mini)"
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-teal-600"
            />
            {(settings.backend === "openai-custom" || settings.backend === "ollama") && (
              <input
                value={settings.baseURL}
                onChange={(e) => onChange({ ...settings, baseURL: e.target.value })}
                placeholder="Base URL (e.g. http://localhost:11434/v1)"
                className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-teal-600"
              />
            )}
            <p className="text-xs text-gray-400">
              Pipeline questions, reranking and answers will use this provider. Embeddings are
              configured below.
            </p>
          </div>
        )}
        {settings.backend === "local" && (
          <LocalModelCard
            status={ragStatus}
            onDownloadChat={onDownloadChat}
            onDownloadEmbedding={onDownloadEmbedding}
            onCancelDownload={onCancelDownload}
            onOpenFolder={onOpenFolder}
            onImport={onImport}
            onLoadModel={onLoadModel}
          />
        )}

        <p className="mt-5 text-xs font-medium uppercase tracking-wide text-gray-400">Embeddings</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {(
            [
              { id: "local", label: "Local model (this PC)" },
              { id: "api", label: "Same provider as chat" },
            ] as const
          ).map((b) => (
            <button
              key={b.id}
              onClick={() => onChange({ ...settings, embedBackend: b.id })}
              className={`rounded-xl border px-2 py-2.5 text-sm font-medium ${
                (settings.embedBackend || "local") === b.id
                  ? "border-teal-600 bg-teal-50 text-teal-800"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
        {(settings.embedBackend || "local") === "api" && (
          <div className="mt-2 space-y-2">
            <input
              value={settings.embedModel || ""}
              onChange={(e) => onChange({ ...settings, embedModel: e.target.value })}
              placeholder={`Embedding model (default: ${
                settings.backend === "gemini"
                  ? "text-embedding-004"
                  : settings.backend === "ollama"
                    ? "nomic-embed-text"
                    : settings.backend === "openai"
                      ? "text-embedding-3-small"
                      : "provider default"
              })`}
              className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:border-teal-600"
            />
            <p className="text-xs text-gray-400">
              {settings.backend === "local"
                ? "Pick an API chat provider above first — embeddings reuse its key and endpoint."
                : ["openai", "openai-custom", "ollama", "gemini"].includes(settings.backend)
                  ? "Chunks are embedded remotely (fast). Falls back to the local model if the call fails."
                  : "This provider has no embeddings API — the local model will be used instead."}
            </p>
          </div>
        )}
        {(settings.embedBackend || "local") === "local" && (
          <p className="mt-2 text-xs text-gray-400">
            Chunks are embedded on this device with the local model. Embeddings are cached, so repeat
            research is much faster.
          </p>
        )}

        <p className="mt-5 text-xs font-medium uppercase tracking-wide text-gray-400">Pipeline depth</p>
        <div className="mt-2 grid grid-cols-4 gap-2">
          {(
            [
              { id: "auto", label: "Auto" },
              { id: "lite", label: "Lite" },
              { id: "standard", label: "Standard" },
              { id: "deep", label: "Deep" },
            ] as const
          ).map((d) => (
            <button
              key={d.id}
              onClick={() => onChange({ ...settings, depth: d.id })}
              className={`rounded-xl border px-2 py-2.5 text-sm font-medium ${
                (settings.depth || "auto") === d.id
                  ? "border-teal-600 bg-teal-50 text-teal-800"
                  : "border-gray-200 text-gray-600 hover:bg-gray-50"
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-gray-400">
          {(settings.depth || "auto") === "auto"
            ? "Standard on the local model; Deep automatically when an API provider is selected."
            : settings.depth === "lite"
              ? "Fastest: one search pass, one ranking, one answer."
              : settings.depth === "standard"
                ? "Grounded search planning, perspectives and per-question evidence — CPU friendly."
                : "Adds extra question rounds, usefulness scoring and longer sectioned reports. Best with an API provider."}
        </p>

        <p className="mt-5 text-xs font-medium uppercase tracking-wide text-gray-400">Crawling</p>
        <div className="mt-2 space-y-1.5 text-[13px] text-gray-600">
          <p className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${readers?.browser ? "bg-teal-500" : "bg-gray-300"}`} />
            Built-in browser — {readers ? (readers.browser ? "ready (the app's own Chromium)" : "unavailable") : "checking…"}
          </p>
          <p className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${readers?.crawl4ai ? "bg-teal-500" : "bg-gray-300"}`} />
            crawl4ai — {readers ? (readers.crawl4ai ? "installed (Python)" : readers.crawl4aiReason || "not installed") : "checking…"}
            {readers && !readers.crawl4ai ? " · optional: pip install crawl4ai" : ""}
          </p>
          <p className="flex items-start gap-2">
            <span
              className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${
                (readers?.pythonStacks || []).some((s) => s.ok) ? "bg-teal-500" : "bg-gray-300"
              }`}
            />
            <span>
              Python stacks —{" "}
              {!readers
                ? "checking…"
                : (readers.pythonStacks || []).some((s) => s.ok)
                  ? readers.pythonStacks!
                      .map((s) =>
                        s.ok
                          ? `✓ ${s.name}${s.python ? ` (${s.python})` : ""}`
                          : `— ${s.name}${s.reason && s.reason !== "not installed" ? ` (${s.reason})` : ""}`,
                      )
                      .join(" · ")
                  : "none installed · optional: pip install scrapy selectolax beautifulsoup4 lxml DrissionPage"}
            </span>
          </p>
          <p className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${readers?.playwright ? "bg-teal-500" : "bg-gray-300"}`} />
            System Chrome/Edge — {readers ? (readers.playwright ? `found (${readers.playwright})` : readers.playwrightReason || "not found") : "checking…"}
          </p>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          Sources are read in order: cheerio → Jina → built-in browser → crawl4ai → Python stacks (scrapy/BS4/DrissionPage)
          → Playwright. Optional tiers are skipped with a reason when absent.
        </p>

        <KeyManager />

        <p className="mt-5 text-xs text-gray-400">Stored locally on this device.</p>
      </div>
    </div>
    </div>
  );
}
