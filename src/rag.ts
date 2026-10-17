export type RagLlmState = "missing" | "available" | "downloading" | "loading" | "ready" | "error";

export interface RagStatus {
  llm: RagLlmState;
  modelFile: string | null;
  download: { received: number; total: number; which?: string } | null;
  error?: string | null;
  modelName: string;
  embedding?: string | null;
  embedFile?: string | null;
  embedModelName?: string;
  embedKind?: string | null;
  embedError?: string | null;
}

export interface RagSource {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  journal: string;
  citations: number;
  url: string | null;
  doi: string | null;
  abstract: string;
  pdfUrl?: string | null;
  provenance: string;
  studyType?: string | null;
  quality?: number | null;
  retracted?: boolean;
  suggested?: string | null;
  suggestReason?: string | null;
}

export type ScreeningDecision = "include" | "exclude" | "maybe";

export interface ScreeningRow {
  url: string;
  decision: ScreeningDecision | null;
  note: string | null;
  suggested?: ScreeningDecision | null;
  reason?: string | null;
}

export interface LoadedSession {
  id: string;
  query: string;
  mode: string;
  sources: RagSource[];
  screening: ScreeningRow[];
}

export interface SessionRow {
  id: string;
  query: string;
  mode: string;
  created_at: string;
}

export interface LibraryRow {
  title: string;
  url: string;
  authors: string | null;
  year: number | null;
  journal: string | null;
  citation_count: number;
  abstract: string | null;
  doi: string | null;
  source_type: string | null;
  study_type: string | null;
  quality: number | null;
  retracted: number;
}

export interface LibraryAddPayload {
  url: string;
  title?: string;
  authors?: string;
  year?: number | null;
  journal?: string;
  citations?: number;
  abstract?: string;
  doi?: string | null;
  source_type?: string | null;
  study_type?: string | null;
  quality?: number | null;
  retracted?: boolean | number;
}

export interface RagToolPart {
  name: string;
  status: "ran" | "skipped" | "failed";
  count?: number;
  reason?: string;
}

export interface RagToolEvent {
  call: number;
  tool: string;
  status: "running" | "ran" | "skipped" | "failed";
  detail: string;
  count: number | null;
  ms: number | null;
  parts?: RagToolPart[];
}

export interface RagMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ReportExportPayload {
  format: "md" | "pdf" | "csv";
  markdown?: string;
  csv?: string;
  title: string;
  suggestedName?: string;
  meta?: string;
}

export interface ReportExportResult {
  saved: boolean;
  path?: string;
  error?: string;
}

export interface PythonStackStatus {
  name: string;
  ok: boolean;
  python?: string | null;
  reason?: string | null;
}

export interface ReaderStatus {
  browser: boolean;
  crawl4ai: boolean;
  crawl4aiReason?: string | null;
  pythonStacks?: PythonStackStatus[];
  playwright?: string | null;
  playwrightReason?: string | null;
}

export interface RagBridge {
  getStatus: () => Promise<RagStatus>;
  downloadModel: (which?: string) => Promise<{ started: boolean }>;
  cancelDownload: () => Promise<unknown>;
  openModelsFolder: () => Promise<unknown>;
  importModel: () => Promise<{ imported: boolean; file?: string }>;
  loadModel: () => Promise<{ ok: boolean }>;
  prompt: (messages: RagMessage[], maxTokens?: number) => Promise<{ id: string }>;
  stopPrompt: () => Promise<unknown>;
  research: (query: string, mode: string, maxTokens?: number) => Promise<{ id: string }>;
  stopResearch: () => Promise<unknown>;
  setScreening: (
    sessionId: string,
    url: string,
    decision: ScreeningDecision | null,
    note: string | null,
  ) => Promise<{ saved: boolean; error?: string }>;
  listScreening: (sessionId: string) => Promise<ScreeningRow[]>;
  loadSession: (sessionId: string) => Promise<LoadedSession | null>;
  listSessions: (limit?: number) => Promise<SessionRow[]>;
  libraryList: () => Promise<LibraryRow[]>;
  libraryAdd: (paper: LibraryAddPayload) => Promise<{ saved: boolean; error?: string }>;
  libraryRemove: (url: string) => Promise<{ saved: boolean; error?: string }>;
  onToken: (cb: (d: { id: string; token: string }) => void) => () => void;
  onDone: (cb: (d: { id: string; text?: string; error?: string; sources?: RagSource[]; sessionId?: string | null }) => void) => () => void;
  onStatus: (cb: (s: RagStatus) => void) => () => void;
  onProgress: (cb: (d: { id: string; stage: string; message: string }) => void) => () => void;
  onDownloadProgress: (cb: (p: { received: number; total: number; which?: string }) => void) => () => void;
  onTool: (cb: (d: { id: string; event: RagToolEvent }) => void) => () => void;
  setKey: (provider: string, key: string) => Promise<{ saved: boolean }>;
  getKeys: () => Promise<{ provider: string; label: string; kind: string; has: boolean; masked: string }[]>;
  deleteKey: (provider: string) => Promise<unknown>;
  testKey: (provider: string, opts?: { baseURL?: string; model?: string }) => Promise<{ ok: boolean; message: string }>;
  getBackend: () => Promise<{
    backend: string;
    apiModel: string;
    baseURL: string;
    embedBackend?: string;
    embedModel?: string;
    depth?: string;
  }>;
  setBackend: (cfg: {
    backend?: string;
    apiModel?: string;
    baseURL?: string;
    embedBackend?: string;
    embedModel?: string;
    depth?: string;
  }) => Promise<unknown>;
}

export interface KeyProvider {
  id: string;
  label: string;
  kind: string;
  needsKey: boolean;
  needsBaseUrl?: boolean;
  defaultModel?: string;
  defaultBaseUrl?: string;
}

export const CHAT_BACKENDS: KeyProvider[] = [
  { id: "local", label: "Local model (this PC)", kind: "chat", needsKey: false },
  { id: "openai", label: "OpenAI", kind: "chat", needsKey: true, defaultModel: "gpt-4o-mini" },
  { id: "openrouter", label: "OpenRouter", kind: "chat", needsKey: true, defaultModel: "openai/gpt-4o-mini" },
  { id: "anthropic", label: "Anthropic", kind: "chat", needsKey: true, defaultModel: "claude-haiku-4-5" },
  { id: "gemini", label: "Google Gemini", kind: "chat", needsKey: true, defaultModel: "gemini-3.5-flash" },
  { id: "openai-custom", label: "Custom OpenAI endpoint", kind: "chat", needsKey: false, needsBaseUrl: true, defaultModel: "" },
  { id: "ollama", label: "Ollama (local server)", kind: "chat", needsKey: false, defaultBaseUrl: "http://localhost:11434/v1" },
];

export const KEY_PROVIDERS: KeyProvider[] = [
  { id: "jina", label: "Jina reader", kind: "fetch", needsKey: true },
  { id: "tavily", label: "Tavily search", kind: "search", needsKey: true },
  { id: "openai", label: "OpenAI", kind: "chat", needsKey: true, defaultModel: "gpt-4o-mini" },
  { id: "openrouter", label: "OpenRouter", kind: "chat", needsKey: true, defaultModel: "openai/gpt-4o-mini" },
  { id: "anthropic", label: "Anthropic", kind: "chat", needsKey: true, defaultModel: "claude-haiku-4-5" },
  { id: "gemini", label: "Google Gemini", kind: "chat", needsKey: true, defaultModel: "gemini-3.5-flash" },
];

function bridge(): RagBridge {
  const r = window.expozi?.rag;
  if (!r) throw new Error("RAG bridge unavailable (not running in Expozi desktop app)");
  return r as RagBridge;
}

export const ragApi = {
  getStatus: () => bridge().getStatus(),
  downloadModel: (which?: string) => bridge().downloadModel(which),
  cancelDownload: () => bridge().cancelDownload(),
  openModelsFolder: () => bridge().openModelsFolder(),
  importModel: () => bridge().importModel(),
  loadModel: () => bridge().loadModel(),
  stopPrompt: () => bridge().stopPrompt(),
  stopResearch: () => bridge().stopResearch(),
  setScreening: (sessionId: string, url: string, decision: ScreeningDecision | null, note: string | null) =>
    bridge().setScreening(sessionId, url, decision, note),
  listScreening: (sessionId: string) => bridge().listScreening(sessionId),
  loadSession: (sessionId: string) => bridge().loadSession(sessionId),
  listSessions: (limit?: number) => bridge().listSessions(limit),
  libraryList: () => bridge().libraryList(),
  libraryAdd: (paper: LibraryAddPayload) => bridge().libraryAdd(paper),
  libraryRemove: (url: string) => bridge().libraryRemove(url),
  onStatus: (cb: (s: RagStatus) => void) => bridge().onStatus(cb),
  onDownloadProgress: (cb: (p: { received: number; total: number; which?: string }) => void) =>
    bridge().onDownloadProgress(cb),
  setKey: (provider: string, key: string) => bridge().setKey(provider, key),
  getKeys: () => bridge().getKeys(),
  deleteKey: (provider: string) => bridge().deleteKey(provider),
  testKey: (provider: string, opts?: { baseURL?: string; model?: string }) => bridge().testKey(provider, opts),
  getBackend: () => bridge().getBackend(),
  setBackend: (cfg: {
    backend?: string;
    apiModel?: string;
    baseURL?: string;
    embedBackend?: string;
    embedModel?: string;
    depth?: string;
  }) => bridge().setBackend(cfg),
  promptOnce: (messages: RagMessage[], maxTokens: number, onToken?: (t: string) => void) =>
    new Promise<string>((resolve, reject) => {
      const b = bridge();
      let id = "";
      const offToken = b.onToken((d) => {
        if (d.id === id && onToken) onToken(d.token);
      });
      const offDone = b.onDone((d) => {
        if (d.id !== id) return;
        offToken();
        offDone();
        if (d.error) reject(new Error(d.error));
        else resolve(d.text ?? "");
      });
      b.prompt(messages, maxTokens)
        .then((r) => {
          id = r.id;
        })
        .catch((e) => {
          offToken();
          offDone();
          reject(e);
        });
    }),
  research: (
    query: string,
    mode: string,
    cbs: {
      onStage?: (stage: string, message: string) => void;
      onToken?: (t: string) => void;
      onTool?: (ev: RagToolEvent) => void;
    } = {},
  ) =>
    new Promise<{ sessionId: string | null; sources: RagSource[]; answer: string }>((resolve, reject) => {
      const b = bridge();
      let id = "";
      const offToken = b.onToken((d) => {
        if (d.id === id && cbs.onToken) cbs.onToken(d.token);
      });
      const offProg = b.onProgress((d) => {
        if (d.id === id && cbs.onStage) cbs.onStage(d.stage, d.message);
      });
      const offTool = b.onTool((d) => {
        if (d.id === id && cbs.onTool) cbs.onTool(d.event);
      });
      const offDone = b.onDone((d) => {
        if (d.id !== id) return;
        offToken();
        offDone();
        offProg();
        offTool();
        if (d.error) reject(new Error(d.error));
        else resolve({ sessionId: d.sessionId ?? null, sources: d.sources ?? [], answer: d.text ?? "" });
      });
      b.research(query, mode)
        .then((r) => {
          id = r.id;
        })
        .catch((e) => {
          offToken();
          offDone();
          offProg();
          offTool();
          reject(e);
        });
    }),
};

// Report export runs in the main process (native save dialog + printToPDF).
export const exportReport = (payload: ReportExportPayload): Promise<ReportExportResult> => {
  const e = window.expozi;
  if (!e?.exportReport) throw new Error("Export bridge unavailable (not running in Expozi desktop app)");
  return e.exportReport(payload);
};

// Reader availability: built-in browser (always, in the desktop app) plus the
// optional crawl4ai / system Chrome-Edge tiers, each with an honest reason.
export const readerStatus = (): Promise<ReaderStatus> => {
  const e = window.expozi;
  if (!e?.readerStatus) {
    return Promise.resolve({ browser: false, crawl4ai: false, crawl4aiReason: "desktop app required" });
  }
  return e.readerStatus();
};
