// Built-in browser tier: renders pages in a hidden Electron window — the
// app's own Chromium, i.e. a real browser fingerprint with zero downloads.
// This is what passes bot walls (DuckDuckGo's "anomaly" page, SearXNG 429s)
// that raw HTTP scrapers cannot.
//
// Pages are serialized through one hidden window, which is destroyed after
// 90s of inactivity so idle runs cost no memory. `render()` resolves with
// whatever the page-context extractor function returns.
const electron = (() => {
  try {
    return require("electron");
  } catch {
    return null;
  }
})();

const IDLE_MS = 90_000;

let win = null;
let queue = Promise.resolve();
let idleTimer = null;

function available() {
  return !!(electron && electron.BrowserWindow && (!electron.app || electron.app.isReady()));
}

function ensureWindow() {
  if (win && !win.isDestroyed()) return win;
  const { BrowserWindow } = electron;
  win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: { sandbox: true, contextIsolation: true, javascript: true },
  });
  win.on("closed", () => {
    win = null;
  });
  return win;
}

function touchIdle() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(destroy, IDLE_MS);
  if (idleTimer.unref) idleTimer.unref();
}

function destroy() {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
  if (win && !win.isDestroyed()) win.destroy();
  win = null;
}

// Loads `url` in the hidden window and evaluates `extractor` (a self-contained
// function, no closures) inside the page. The timeout guard is armed when the
// render actually starts (renders are serialized through one queue, so arming
// it at call time would time out queued work and destroy the window under a
// running render). Rejects on timeout; a hung page is killed so the queue
// keeps moving.
function render(url, extractor, { settle = 1200, timeout = 45_000 } = {}) {
  if (!available()) {
    return Promise.reject(new Error("built-in browser unavailable (not running in Electron)"));
  }
  const run = async () => {
    const w = ensureWindow();
    touchIdle();
    let guardTimer = null;
    const guard = new Promise((_, reject) => {
      guardTimer = setTimeout(() => {
        destroy();
        reject(new Error(`built-in browser timed out after ${Math.round(timeout / 1000)}s`));
      }, timeout);
      if (guardTimer.unref) guardTimer.unref();
    });
    try {
      const task = (async () => {
        await w.loadURL(url);
        if (settle > 0) await new Promise((r) => setTimeout(r, settle));
        return await w.webContents.executeJavaScript(`(${extractor.toString()})()`, true);
      })();
      const out = await Promise.race([task, guard]);
      touchIdle();
      return out;
    } finally {
      clearTimeout(guardTimer);
    }
  };
  const task = queue.then(run, run);
  queue = task.catch(() => {});
  return task;
}

module.exports = { render, available, destroy };
