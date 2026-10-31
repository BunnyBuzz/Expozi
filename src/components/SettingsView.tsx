import { useEffect, useState } from "react";
import {
  Settings as SettingsIcon,
  SlidersHorizontal,
  Bot,
  Cpu,
  KeyRound,
  Globe,
  X,
  Download,
  Loader2,
  FolderOpen,
  FileUp,
} from "lucide-react";
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

const WORKFLOWS: { id: HomeMode; label: string }[] = [
  { id: "agent", label: "Research agent" },
  { id: "report", label: "Report" },
  { id: "review", label: "Systematic review" },
];

const MODELS = ["Smart", "Balanced", "Deep research"];

const labelCls = "text-xs font-medium uppercase tracking-wide text-gray-400";
const chipCls = (on: boolean) =>
  `rounded-xl border px-2 py-2.5 text-sm font-medium ${
    on ? "border-teal-600 bg-teal-50 text-teal-800" : "border-gray-200 text-gray-600 hover:bg-gray-50"
  }`;

type SectionId = "general" | "backend" | "device" | "keys" | "crawling";

const SECTIONS: { id: SectionId; label: string; icon: typeof SettingsIcon; blurb: string }[] = [
  { id: "general", label: "General", icon: SlidersHorizontal, blurb: "Defaults for new research runs." },
  { id: "backend", label: "AI backend", icon: Bot, blurb: "Which model does the thinking — a cloud provider or this PC." },
  {
    id: "device",
    label: "On-device model",
    icon: Cpu,
    blurb: "The private model that runs on this PC. No keys, nothing leaves the machine.",
  },
  {
    id: "keys",
    label: "API keys",
    icon: KeyRound,
    blurb: "Provider keys are stored only on this device. Paste one, save, then hit Test.",
  },
  { id: "crawling", label: "Crawling", icon: Globe, blurb: "How pages are fetched and read while researching." },
];

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
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3.5">
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
    <div className="space-y-2">
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
  );
}

export default function SettingsView({
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
  const [section, setSection] = useState<SectionId>("general");
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const sec = SECTIONS.find((s) => s.id === section) || SECTIONS[0];
  const embMode = settings.embedBackend || "local";
  const chatLabel = CHAT_BACKENDS.find((b) => b.id === settings.backend)?.label || settings.backend;

  return (
    <div className="fixed inset-0 z-50 flex bg-white">
      <aside className="flex w-[248px] shrink-0 flex-col border-r border-gray-200 bg-gray-50">
        <div className="flex items-center gap-2.5 px-5 pb-4 pt-6">
          <SettingsIcon size={17} className="text-gray-400" />
          <h2 className="text-[16px] font-semibold text-gray-900">Settings</h2>
        </div>
        <nav className="flex-1 space-y-0.5 px-3">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => setSection(s.id)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13.5px] font-medium ${
                section === s.id ? "bg-teal-50 text-teal-800" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <s.icon size={15} className={`shrink-0 ${section === s.id ? "text-teal-700" : "text-gray-400"}`} />
              {s.label}
            </button>
          ))}
        </nav>
        <p className="px-5 py-4 text-[11px] leading-relaxed text-gray-400">
          Stored locally on this device. Settings are saved as you change them.
        </p>
      </aside>

      <main className="slim-scroll relative flex-1 overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute right-5 top-5 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100"
          title="Close (Esc)"
        >
          <X size={18} />
        </button>
        <div className="mx-auto max-w-[620px] px-10 py-10">
          <h3 className="text-[21px] font-semibold text-gray-900">{sec.label}</h3>
          <p className="mt-1 text-sm text-gray-500">{sec.blurb}</p>

          <div className="mt-7">
            {section === "general" && (
              <>
                <p className={labelCls}>Default workflow</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {WORKFLOWS.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => onChange({ ...settings, workflow: w.id })}
                      className={chipCls(settings.workflow === w.id)}
                    >
                      {w.label}
                    </button>
                  ))}
                </div>

                <p className={`mt-6 ${labelCls}`}>Default model</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {MODELS.map((m) => (
                    <button
                      key={m}
                      onClick={() => onChange({ ...settings, model: m })}
                      className={chipCls(settings.model === m)}
                    >
                      {m}
                    </button>
                  ))}
                </div>

                <p className={`mt-6 ${labelCls}`}>Pipeline depth</p>
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
                      className={chipCls((settings.depth || "auto") === d.id)}
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
              </>
            )}

            {section === "backend" && (
              <>
                <p className={labelCls}>Chat backend</p>
                <div className="mt-2 grid grid-cols-3 gap-2">
                  {CHAT_BACKENDS.map((b) => (
                    <button
                      key={b.id}
                      onClick={() => {
                        if (b.id === settings.backend) return;
                        const prev = CHAT_BACKENDS.find((x) => x.id === settings.backend);
                        const keepModel =
                          settings.apiModel.trim() !== "" && settings.apiModel !== (prev?.defaultModel || "");
                        onChange({
                          ...settings,
                          backend: b.id,
                          apiModel: keepModel ? settings.apiModel : b.defaultModel || "",
                          baseURL:
                            b.id === "ollama"
                              ? b.defaultBaseUrl || ""
                              : b.id === "openai-custom"
                                ? prev?.needsBaseUrl
                                  ? settings.baseURL
                                  : ""
                                : "",
                        });
                      }}
                      className={chipCls(settings.backend === b.id)}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
                {settings.backend === "local" ? (
                  <p className="mt-2 text-xs text-gray-400">
                    The model runs on this PC — manage it under “On-device model” on the left.
                  </p>
                ) : (
                  <div className="mt-2 space-y-2">
                    <input
                      value={settings.apiModel}
                      onChange={(e) => onChange({ ...settings, apiModel: e.target.value })}
                      placeholder="Model name (e.g. openai/gpt-oss-120b on Groq, gpt-4o-mini on OpenAI)"
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
                      {settings.backend === "groq"
                        ? "Groq serves fast open models (default: openai/gpt-oss-120b). Paste your gsk-… key under “API keys” on the left, then hit Test."
                        : settings.backend === "ollama"
                          ? "Runs against your local Ollama server — no key needed. Embeddings are configured below."
                          : settings.backend === "openai-custom"
                            ? "Any OpenAI-compatible endpoint works — a LAN server, proxy or gateway."
                            : "Pipeline questions, ranking and answers will use this provider. Its key belongs under “API keys” on the left."}
                    </p>
                  </div>
                )}

                <p className={`mt-6 ${labelCls}`}>Embeddings</p>
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
                      className={chipCls(embMode === b.id)}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
                {embMode === "api" && (
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
                {embMode === "local" && (
                  <p className="mt-2 text-xs text-gray-400">
                    Chunks are embedded on this device with the local model. Embeddings are cached, so repeat
                    research is much faster.
                  </p>
                )}
              </>
            )}

            {section === "device" && (
              <>
                {settings.backend !== "local" && (
                  <p className="mb-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
                    The chat backend is currently “{chatLabel}”. This model is used when the backend is set to
                    “Local model (this PC)” under “AI backend”.
                  </p>
                )}
                <LocalModelCard
                  status={ragStatus}
                  onDownloadChat={onDownloadChat}
                  onDownloadEmbedding={onDownloadEmbedding}
                  onCancelDownload={onCancelDownload}
                  onOpenFolder={onOpenFolder}
                  onImport={onImport}
                  onLoadModel={onLoadModel}
                />
              </>
            )}

            {section === "keys" && (
              <>
                <KeyManager />
                <p className="mt-3 text-xs text-gray-400">
                  Jina and Tavily keys power page reading and web search. Chat keys connect the AI backend.
                  All keys stay in the local database — they are only sent to the provider they belong to.
                </p>
              </>
            )}

            {section === "crawling" && (
              <>
                <div className="space-y-1.5 text-[13px] text-gray-600">
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
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
