// Minimal Electron window probe — is the machine able to host a window at all?
const { app, BrowserWindow } = require("electron");
console.log("[min] boot");
app.whenReady().then(() => {
  console.log("[min] ready");
  const win = new BrowserWindow({ width: 480, height: 320 });
  console.log("[min] window created, destroyed:", win.isDestroyed());
  win.on("closed", () => console.log("[min] window closed event"));
  win.webContents.on("destroyed", () => console.log("[min] webContents destroyed"));
  win.loadURL("data:text/html,<h1>min</h1>").then(
    () => console.log("[min] load ok"),
    (e) => console.log("[min] load rejected:", String(e)),
  );
  setTimeout(() => {
    console.log("[min] +8s destroyed:", win.isDestroyed(), "| windows:", BrowserWindow.getAllWindows().length);
  }, 8000);
  setTimeout(() => {
    console.log("[min] +20s destroyed:", win.isDestroyed());
    app.quit();
  }, 20000);
});
app.on("window-all-closed", () => console.log("[min] window-all-closed"));
