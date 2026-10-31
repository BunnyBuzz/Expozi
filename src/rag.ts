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
  source?: string;
  hasPdf?: boolean;
  isAbstractOnly?: boolean;
  usedSnippet?: string;
  passageNo?: number;
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
  answer?: string;
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
  status: "running" | "progress" | "ran" | "skipped" | "failed";
  detail: string;
  count: number | null;
  ms: number | null;
  parts?: RagToolPart[];
  seq?: number;
}

export interface RagMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ReportExportPayload {
  format: "md" | "pdf" | "csv" | "docx" | "txt";
  markdown?: string;
  csv?: string;
  title: string;
  suggestedName?: string;
  meta?: string;
}

export interface ScreeningCriteria {
  include: string[];
  exclude: string[];
  study_types: string[];
}

export interface ExtractionColumn {
  name: string;
  instruction: string;
}

export interface ExtractionCell {
  value: string;
  supporting_quote: string;
  confidence: "high" | "medium" | "low";
}

export interface ExtractionRow {
  paperId: string;
  title: string;
  authors: string[];
  year: number | null;
  url?: string;
  fields: Record<string, ExtractionCell>;
}

export interface ScreeningPaperDecision {
  paper: RagSource;
  decision: "include" | "exclude" | "uncertain";
  score: number;
  failed_criterion: string | null;
  reasoning: string;
  supporting_quote: string;
}

export interface ReportStepData {
  pool?: RagSource[];
  totalGathered?: number;
  criteria?: ScreeningCriteria;
  included?: RagSource[];
  excluded?: ScreeningPaperDecision[];
  allDecisions?: ScreeningPaperDecision[];
  columns?: ExtractionColumn[];
  matrix?: ExtractionRow[];
  totalPoints?: number;
  warningMessage?: string | null;
  template?: string;
  depth?: string;
}

export interface ReportVersion {
  id: number;
  session_id: string;
  content: string;
  template: string;
  created_at: string;
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
  research: (
    query: string,
    mode: string,
    maxTokens?: number,
    opts?: { template?: string; depth?: string; criteria?: ScreeningCriteria },
  ) => Promise<{ id: string }>;
  stopResearch: () => Promise<unknown>;
  checkPastSession: (query: string) => Promise<{
    shouldSuggest: boolean;
    sessionId?: string;
    similarity?: number;
    title?: string;
    query?: string;
    timeAgo?: string;
  }>;
  followUp: (sessionId: string, query: string, maxTokens?: number) => Promise<{ id: string }>;
  reportQA: (
    sessionId: string,
    query: string,
    followUpQuery: string,
    extractionMatrix?: any,
    reportText?: string,
  ) => Promise<{ id: string }>;
  getReportVersions: (sessionId: string) => Promise<ReportVersion[]>;
  getReportExtractions: (sessionId: string) => Promise<any[]>;
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
  onProgress: (cb: (d: { id: string; stage: string; message: string; seq?: number }) => void) => () => void;
  onDownloadProgress: (cb: (p: { received: number; total: number; which?: string }) => void) => () => void;
  onTool: (cb: (d: { id: string; event: RagToolEvent }) => void) => () => void;
  onReportStepData: (cb: (d: { id: string; data: ReportStepData }) => void) => () => void;
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
  { id: "groq", label: "Groq", kind: "chat", needsKey: true, defaultModel: "openai/gpt-oss-120b" },
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
  { id: "groq", label: "Groq", kind: "chat", needsKey: true, defaultModel: "openai/gpt-oss-120b" },
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
      onStage?: (stage: string, message: string, seq?: number) => void;
      onToken?: (t: string) => void;
      onTool?: (ev: RagToolEvent) => void;
      onStepData?: (data: ReportStepData) => void;
    } = {},
    opts?: { template?: string; depth?: string; criteria?: ScreeningCriteria },
  ) =>
    new Promise<{ sessionId: string | null; sources: RagSource[]; answer: string; stepData?: ReportStepData }>((resolve, reject) => {
      const b = bridge();
      let id = "";
      const offToken = b.onToken((d) => {
        if (d.id === id && cbs.onToken) cbs.onToken(d.token);
      });
      const offProg = b.onProgress((d) => {
        if (d.id === id && cbs.onStage) cbs.onStage(d.stage, d.message, d.seq);
      });
      const offTool = b.onTool((d) => {
        if (d.id === id && cbs.onTool) cbs.onTool(d.event);
      });
      const offStepData = b.onReportStepData ? b.onReportStepData((d) => {
        if (cbs.onStepData) cbs.onStepData(d.data);
      }) : () => {};
      const offDone = b.onDone((d: any) => {
        if (d.id !== id) return;
        offToken();
        offDone();
        offProg();
        offTool();
        offStepData();
        if (d.error) reject(new Error(d.error));
        else resolve({ sessionId: d.sessionId ?? null, sources: d.sources ?? [], answer: d.text ?? "", stepData: d.stepData });
      });
      b.research(query, mode, undefined, opts)
        .then((r) => {
          id = r.id;
        })
        .catch((e) => {
          offToken();
          offDone();
          offProg();
          offTool();
          offStepData();
          reject(e);
        });
    }),
  checkPastSession: (query: string) => bridge().checkPastSession(query),
  getReportVersions: (sessionId: string) => bridge().getReportVersions(sessionId),
  getReportExtractions: (sessionId: string) => bridge().getReportExtractions(sessionId),
  reportQA: (
    sessionId: string,
    query: string,
    followUpQuery: string,
    extractionMatrix: any,
    reportText: string,
    onToken?: (t: string) => void,
  ) =>
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
      b.reportQA(sessionId, query, followUpQuery, extractionMatrix, reportText)
        .then((r) => {
          id = r.id;
        })
        .catch((e) => {
          offToken();
          offDone();
          reject(e);
        });
    }),
  followUp: (
    sessionId: string,
    query: string,
    cbs: {
      onStage?: (stage: string, message: string, seq?: number) => void;
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
        if (d.id === id && cbs.onStage) cbs.onStage(d.stage, d.message, d.seq);
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
      b.followUp(sessionId, query)
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
