const { contextBridge, ipcRenderer } = require("electron");

// Minimal bridge — renderer stays sandboxed, native APIs get added here later.
contextBridge.exposeInMainWorld("expozi", {
  platform: process.platform,
  version: "0.1.0",
  openDevTools: () => ipcRenderer.send("expozi:open-devtools"),
  exportReport: (payload) => ipcRenderer.invoke("expozi:export-report", payload),
  readerStatus: () => ipcRenderer.invoke("expozi:reader-status"),
  rag: {
    getStatus: () => ipcRenderer.invoke("rag:get-status"),
    downloadModel: (which) => ipcRenderer.invoke("rag:download-model", { which: which || "chat" }),
    cancelDownload: () => ipcRenderer.invoke("rag:cancel-download"),
    openModelsFolder: () => ipcRenderer.invoke("rag:open-models-folder"),
    importModel: () => ipcRenderer.invoke("rag:import-model"),
    loadModel: () => ipcRenderer.invoke("rag:load-model"),
    prompt: (messages, maxTokens) => ipcRenderer.invoke("rag:prompt", { messages, maxTokens }),
    stopPrompt: () => ipcRenderer.invoke("rag:stop-prompt"),
    research: (query, mode, maxTokens, opts) =>
      ipcRenderer.invoke("rag:research", { query, mode, maxTokens, ...(opts || {}) }),
    stopResearch: () => ipcRenderer.invoke("rag:stop-research"),
    checkPastSession: (query) => ipcRenderer.invoke("rag:session-memory-check", { query }),
    followUp: (sessionId, query, maxTokens) => ipcRenderer.invoke("rag:follow-up", { sessionId, query, maxTokens }),
    reportQA: (sessionId, query, followUpQuery, extractionMatrix, reportText) =>
      ipcRenderer.invoke("rag:report-qa", { sessionId, query, followUpQuery, extractionMatrix, reportText }),
    getReportVersions: (sessionId) => ipcRenderer.invoke("rag:report-versions", { sessionId }),
    getReportExtractions: (sessionId) => ipcRenderer.invoke("rag:report-extractions", { sessionId }),
    setScreening: (sessionId, url, decision, note) =>
      ipcRenderer.invoke("rag:screening-set", { sessionId, url, decision, note }),
    listScreening: (sessionId) => ipcRenderer.invoke("rag:screening-list", { sessionId }),
    loadSession: (sessionId) => ipcRenderer.invoke("rag:session-load", { sessionId }),
    listSessions: (limit) => ipcRenderer.invoke("rag:sessions-list", { limit }),
    libraryList: () => ipcRenderer.invoke("rag:library-list"),
    libraryAdd: (paper) => ipcRenderer.invoke("rag:library-add", paper),
    libraryRemove: (url) => ipcRenderer.invoke("rag:library-remove", { url }),
    setKey: (provider, key) => ipcRenderer.invoke("rag:set-key", { provider, key }),
    getKeys: () => ipcRenderer.invoke("rag:get-keys"),
    deleteKey: (provider) => ipcRenderer.invoke("rag:delete-key", { provider }),
    testKey: (provider, opts) => ipcRenderer.invoke("rag:test-key", { provider, ...(opts || {}) }),
    getBackend: () => ipcRenderer.invoke("rag:get-backend"),
    setBackend: (cfg) => ipcRenderer.invoke("rag:set-backend", cfg || {}),
    onToken: (cb) => {
      const l = (_e, d) => cb(d);
      ipcRenderer.on("rag:token", l);
      return () => ipcRenderer.removeListener("rag:token", l);
    },
    onDone: (cb) => {
      const l = (_e, d) => cb(d);
      ipcRenderer.on("rag:done", l);
      return () => ipcRenderer.removeListener("rag:done", l);
    },
    onStatus: (cb) => {
      const l = (_e, d) => cb(d);
      ipcRenderer.on("rag:status", l);
      return () => ipcRenderer.removeListener("rag:status", l);
    },
    onProgress: (cb) => {
      const l = (_e, d) => cb(d);
      ipcRenderer.on("rag:progress", l);
      return () => ipcRenderer.removeListener("rag:progress", l);
    },
    onDownloadProgress: (cb) => {
      const l = (_e, d) => cb(d);
      ipcRenderer.on("rag:download-progress", l);
      return () => ipcRenderer.removeListener("rag:download-progress", l);
    },
    onTool: (cb) => {
      const l = (_e, d) => cb(d);
      ipcRenderer.on("rag:tool", l);
      return () => ipcRenderer.removeListener("rag:tool", l);
    },
    onReportStepData: (cb) => {
      const l = (_e, d) => cb(d);
      ipcRenderer.on("rag:report-step-data", l);
      return () => ipcRenderer.removeListener("rag:report-step-data", l);
    },
  },
});
