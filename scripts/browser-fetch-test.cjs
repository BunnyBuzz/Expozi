// Probe: can a hidden Electron window (built-in Chromium) fetch DuckDuckGo
// results that the raw scraper couldn't? Usage: npx electron scripts/browser-fetch-test.cjs
const { app, BrowserWindow } = require("electron");

app.on("window-all-closed", () => {});

const CHROME_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: { sandbox: true, contextIsolation: true, javascript: true },
  });

  const urls = [
    ["html.duckduckgo.com (default UA)", "https://html.duckduckgo.com/html/?q=systematic+review+intermittent+fasting", true],
    ["html.duckduckgo.com (chrome UA)", "https://html.duckduckgo.com/html/?q=systematic+review+intermittent+fasting", false],
    ["duckduckgo.com html page", "https://duckduckgo.com/?q=systematic+review+intermittent+fasting&ia=web", false],
  ];

  for (const [label, url, useDefaultUa] of urls) {
    try {
      await win.loadURL(url, useDefaultUa ? {} : { userAgent: CHROME_UA });
      await new Promise((r) => setTimeout(r, 2200));
      const out = await win.webContents.executeJavaScript(`(() => {
        const sel = 'a.result__a, article a[data-testid="result-title-a"], a[data-testid="result-title-a"], #links .result__a';
        const items = [...document.querySelectorAll(sel)].slice(0, 6).map((x) => ({
          t: (x.textContent || "").replace(/\\s+/g, " ").trim().slice(0, 90),
          u: x.href,
        }));
        const bodyHead = (document.body ? document.body.innerText : "").replace(/\\s+/g, " ").slice(0, 140);
        return { title: document.title, n: items.length, items, bodyHead };
      })()`);
      console.log(`\n== ${label} ==`);
      console.log(JSON.stringify(out, null, 1));
    } catch (e) {
      console.log(`\n== ${label} == FAILED: ${e.message}`);
    }
  }
  win.destroy();
  app.exit(0);
});
