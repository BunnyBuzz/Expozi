const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const rag = require("./rag/index.cjs");
const { exportReport } = require("./export.cjs");

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

const DEV_URL = "http://localhost:1420";

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 600,
    autoHideMenuBar: true,
    backgroundColor: "#f1f5f9",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
    },
  });

  // Dev server when it's running, otherwise the packaged frontend build.
  win.loadURL(DEV_URL).catch(() => {
    if (win.isDestroyed()) return;
    win.loadFile(path.join(__dirname, "../dist/index.html")).catch(() => {
      /* window closed before the fallback load */
    });
  });

  // The renderer may load after initRag() already sent its status push; resend on every load.
  win.webContents.on("did-finish-load", () => {
    try {
      win.webContents.send("rag:status", rag.getStatus());
    } catch {
      /* noop */
    }
  });
}

ipcMain.on("expozi:open-devtools", (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (win) win.webContents.openDevTools({ mode: "detach" });
});

ipcMain.handle("expozi:export-report", async (e, payload) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!app.isPackaged) {
    console.log("[export]", (payload && payload.format) || "?", (payload && payload.title) || "");
  }
  try {
    return await exportReport(win, payload || {});
  } catch (err) {
    console.error("[export] failed:", err);
    return { saved: false, error: String((err && err.message) || err) };
  }
});

ipcMain.handle("expozi:reader-status", async () => {
  try {
    return await require("./rag/readers.cjs").readerAvailability();
  } catch (err) {
    return { browser: false, crawl4ai: false, crawl4aiReason: String((err && err.message) || err) };
  }
});

let ragDirs = null;

function registerRagIpc() {
  ipcMain.handle("rag:get-status", () => rag.getStatus());
  ipcMain.handle("rag:download-model", async (e, payload) => {
    const sender = e.sender;
    const which = (payload && payload.which) || "chat";
    rag.startDownload((ch, data) => {
      try {
        sender.send(ch, data);
      } catch {
        /* window gone */
      }
    }, which);
    return { started: true };
  });
  ipcMain.handle("rag:cancel-download", () => {
    rag.cancelDl();
    return { stopped: true };
  });
  ipcMain.handle("rag:open-models-folder", async () => {
    if (ragDirs) await shell.openPath(ragDirs.models);
    return { opened: true };
  });
  ipcMain.handle("rag:import-model", async (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    const picked = await dialog.showOpenDialog(win, {
      title: "Choose a GGUF model file",
      filters: [{ name: "GGUF models", extensions: ["gguf"] }],
      properties: ["openFile"],
    });
    if (picked.canceled || picked.filePaths.length === 0) return { imported: false };
    const file = await rag.importModelFile(ragDirs, picked.filePaths[0]);
    return { imported: true, file };
  });
  ipcMain.handle("rag:load-model", async (e) => {
    const sender = e.sender;
    const ok = await rag.ensureLlm((ch, data) => {
      try {
        sender.send(ch, data);
      } catch {
        /* noop */
      }
    });
    return { ok };
  });
  ipcMain.handle("rag:prompt", async (e, payload) => {
    const id = Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    const sender = e.sender;
    rag
      .runPrompt({
        messages: payload.messages,
        maxTokens: payload.maxTokens,
        send: (ch, data) => {
          try {
            sender.send(ch, data);
          } catch {
            /* noop */
          }
        },
        onToken: (token) => {
          try {
            sender.send("rag:token", { id, token });
          } catch {
            /* noop */
          }
        },
      })
      .then((text) => {
        try {
          sender.send("rag:done", { id, text });
        } catch {
          /* noop */
        }
      })
      .catch((err) => {
        try {
          sender.send("rag:done", { id, error: String((err && err.message) || err) });
        } catch {
          /* noop */
        }
      });
    return { id };
  });
  ipcMain.handle("rag:stop-prompt", () => {
    rag.stopPrompt();
    return { stopped: true };
  });
  ipcMain.handle("rag:research", async (e, payload) => {
    const id = Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    const sender = e.sender;
    // One shared sequence over stages + tool events so the renderer can merge
    // them into a single chronological trace (agent mode).
    const seq = { n: 0 };
    rag
      .runResearch({
        query: payload.query,
        mode: payload.mode,
        maxTokens: payload.maxTokens,
        template: payload.template,
        depth: payload.depth,
        criteria: payload.criteria,
        send: (ch, data) => {
          try {
            sender.send(ch, data);
          } catch {
            /* noop */
          }
        },
        onStage: (stage, message) => {
          if (!app.isPackaged) {
            const rss = Math.round(process.memoryUsage().rss / 1048576);
            console.log("[rag:stage]", stage, "-", message, `(rss ${rss} MB)`);
          }
          try {
            sender.send("rag:progress", { id, stage, message, seq: seq.n++ });
          } catch {
            /* noop */
          }
        },
        onToken: (token) => {
          try {
            sender.send("rag:token", { id, token });
          } catch {
            /* noop */
          }
        },
        onTool: (event) => {
          if (!app.isPackaged) {
            console.log("[rag:tool]", event.tool, event.status, event.detail || "");
          }
          try {
            sender.send("rag:tool", { id, event: { ...event, seq: seq.n++ } });
          } catch {
            /* noop */
          }
        },
      })
      .then((result) => {
        if (!app.isPackaged) console.log("[rag:research] done:", (result.sources || []).length, "sources");
        try {
          sender.send("rag:done", {
            id,
            text: result.answer,
            sources: result.sources,
            sessionId: result.sessionId || null,
            stepData: result.stepData || null,
          });
        } catch {
          /* noop */
        }
      })
      .catch((err) => {
        if (!app.isPackaged) console.log("[rag:research] error:", String((err && err.message) || err));
        try {
          sender.send("rag:done", { id, error: String((err && err.message) || err) });
        } catch {
          /* noop */
        }
      });
    return { id };
  });
  ipcMain.handle("rag:stop-research", () => {
    rag.stopResearch();
    return { stopped: true };
  });
  ipcMain.handle("rag:session-memory-check", async (_e, payload) => rag.checkPastSession((payload || {}).query));
  ipcMain.handle("rag:follow-up", async (e, payload) => {
    const p = payload || {};
    const id = p.id || randomUUID();
    const sender = e.sender;
    const seq = { n: 1 };
    rag.runAgentFollowUp({
      sessionId: p.sessionId,
      query: p.query,
      maxTokens: p.maxTokens,
      onToken: (token) => {
        try { sender.send("rag:token", { id, token }); } catch {}
      },
      onTool: (event) => {
        try { sender.send("rag:tool", { id, event: { ...event, seq: seq.n++ } }); } catch {}
      },
      send: (ch, data) => {
        try { sender.send(ch, data); } catch {}
      },
    })
      .then((result) => {
        try {
          sender.send("rag:done", {
            id,
            text: result.answer,
            sources: result.sources || [],
            sessionId: result.sessionId,
          });
        } catch {}
      })
      .catch((err) => {
        try {
          sender.send("rag:done", { id, error: String((err && err.message) || err) });
        } catch {}
      });
    return { id };
  });
  ipcMain.handle("rag:report-qa", async (e, payload) => {
    const p = payload || {};
    const id = p.id || randomUUID();
    const sender = e.sender;
    rag.runReportQA({
      sessionId: p.sessionId,
      query: p.query,
      followUpQuery: p.followUpQuery,
      extractionMatrix: p.extractionMatrix,
      reportText: p.reportText,
      onToken: (token) => {
        try { sender.send("rag:token", { id, token }); } catch {}
      },
    })
      .then((answer) => {
        try { sender.send("rag:done", { id, text: answer }); } catch {}
      })
      .catch((err) => {
        try { sender.send("rag:done", { id, error: String((err && err.message) || err) }); } catch {}
      });
    return { id };
  });
  ipcMain.handle("rag:report-versions", async (_e, payload) => rag.getReportVersions((payload || {}).sessionId));
  ipcMain.handle("rag:report-extractions", async (_e, payload) => rag.getReportExtractions((payload || {}).sessionId));
  // Screening workspace (stage 3): decisions persist per (session, url); a
  // saved session can be reopened from Recents without re-running.
  ipcMain.handle("rag:screening-set", (_e, payload) => rag.setScreening(payload || {}));
  ipcMain.handle("rag:screening-list", (_e, payload) => rag.listScreening((payload || {}).sessionId));
  ipcMain.handle("rag:session-load", (_e, payload) => rag.loadSession((payload || {}).sessionId));
  // History + library (stage 4): Recents reads the sessions table, the library
  // stores starred sources.
  ipcMain.handle("rag:sessions-list", (_e, payload) => rag.listSessions((payload || {}).limit));
  ipcMain.handle("rag:library-list", () => rag.libraryList());
  ipcMain.handle("rag:library-add", (_e, payload) => rag.libraryAdd(payload || {}));
  ipcMain.handle("rag:library-remove", (_e, payload) => rag.libraryRemove((payload || {}).url));
  ipcMain.handle("rag:set-key", async (_e, payload) => {
    const { setKey } = require("./rag/keys.cjs");
    setKey(payload.provider, payload.key || "");
    return { saved: true };
  });
  ipcMain.handle("rag:get-keys", () => rag.listKeys());
  ipcMain.handle("rag:delete-key", async (_e, payload) => {
    const { deleteKey } = require("./rag/keys.cjs");
    deleteKey(payload.provider);
    return { deleted: true };
  });
  ipcMain.handle("rag:test-key", async (_e, payload) => rag.testKeyP(payload.provider, payload || {}));
  ipcMain.handle("rag:get-backend", () => rag.getBackend());
  ipcMain.handle("rag:set-backend", async (_e, payload) => rag.setBackend(payload || {}));
}

async function initRag() {
  try {
    const r = await rag.initRag(app);
    ragDirs = r.dirs;
  } catch (e) {
    console.error("RAG init failed:", e);
  }
  const win = BrowserWindow.getAllWindows()[0];
  if (win) win.webContents.send("rag:status", rag.getStatus());
}

registerRagIpc();

app.whenReady().then(() => {
  if (!app.isPackaged) {
    try {
      const tools = require("./tools/index.cjs");
      console.log("[tools] registered:", tools.names().join(", "));
    } catch (e) {
      console.error("[tools] registration failed:", e);
    }
  }
  createWindow();
  initRag();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
