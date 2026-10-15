const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const path = require("path");
const rag = require("./rag/index.cjs");

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
  win.loadURL(DEV_URL).catch(() => win.loadFile(path.join(__dirname, "../dist/index.html")));

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
    rag
      .runResearch({
        query: payload.query,
        mode: payload.mode,
        maxTokens: payload.maxTokens,
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
            sender.send("rag:progress", { id, stage, message });
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
      .then((result) => {
        if (!app.isPackaged) console.log("[rag:research] done:", (result.sources || []).length, "sources");
        try {
          sender.send("rag:done", { id, text: result.answer, sources: result.sources });
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
  createWindow();
  initRag();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
