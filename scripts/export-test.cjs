// Export module test (runs under Electron):
//   npx electron scripts/export-test.cjs
// Renders a sample report through electron/export.cjs -> .md + .pdf, and
// captures a PNG of the styled page for visual inspection.
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");
const { writePdf, mdToHtml, loadHtml } = require("../electron/export.cjs");

const OUT = path.join(__dirname, "shots", "export");

// Keep the app alive between windows (default behavior quits on last close).
app.on("window-all-closed", () => {});

const SAMPLE = `# Intermittent fasting and metabolic health

## Abstract
Intermittent fasting (IF) improved glucose control in most cohorts [1], though randomized evidence remains mixed [2]. This report reviews fasting windows and their effects on insulin sensitivity and body-composition markers.

## Introduction
Time-restricted eating (TRE) concentrates intake into 6-10 hour windows. Its metabolic effects depend on **energy balance**, *circadian alignment*, and adherence [1].

## Key findings

### Glucose and insulin
- Fasting windows reduced fasting glucose in several cohorts [1].
- Effects on HOMA-IR were smaller than expected in randomized trials [2].
- Early TRE (eating before 3 pm) showed larger improvements than late TRE [3].

### Body composition
1. Weight loss was comparable to continuous energy restriction [1].
2. Fat-free mass was slightly lower in some TRE arms [2].

## Conclusion
TRE is a viable strategy for glucose control; long-term randomized evidence is still limited [1][2][3].

## References
[1] Intermittent fasting strategies and their effects on body weight and other cardiometabolic markers. PubMed, 2025.
[2] Effects of intermittent fasting on body composition and clinical health markers. PubMed, 2015.
[3] Effect of Intermittent Fasting on Reproductive Hormone Levels. PubMed, 2022.
`;

app.whenReady().then(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const mdPath = path.join(OUT, "sample-report.md");
  const pdfPath = path.join(OUT, "sample-report.pdf");
  const pngPath = path.join(OUT, "sample-report-page.png");

  fs.writeFileSync(mdPath, SAMPLE, "utf8");
  await writePdf({ markdown: SAMPLE, title: "Intermittent fasting and metabolic health", outPath: pdfPath });

  // Render the styled page visibly to capture a PNG of it.
  const win = new BrowserWindow({
    x: 40,
    y: 40,
    width: 794,
    height: 1123,
    show: true,
    skipTaskbar: true,
    autoHideMenuBar: true,
    webPreferences: { sandbox: true },
  });
  await loadHtml(win, mdToHtml(SAMPLE, "Intermittent fasting and metabolic health"));
  await new Promise((r) => setTimeout(r, 600));
  const img = await win.webContents.capturePage();
  fs.writeFileSync(pngPath, img.toPNG());
  win.destroy();

  const md = fs.readFileSync(mdPath, "utf8");
  const pdf = fs.readFileSync(pdfPath);
  console.log("md bytes:", md.length, "| starts with title:", md.trimStart().startsWith("#"));
  console.log("pdf bytes:", pdf.length, "| magic:", pdf.slice(0, 5).toString("latin1"));
  console.log("png bytes:", fs.statSync(pngPath).size);

  // placeholder "# Title" must not become the document heading
  const probe = mdToHtml("# Title\n\nReal body text.", "Caffeine and sleep quality");
  const headingOk =
    probe.includes("<h1>Caffeine and sleep quality</h1>") && !/<h1[^>]*>Title<\/h1>/.test(probe);
  console.log("generic heading guard:", headingOk ? "OK" : "FAIL");
  console.log("out dir:", OUT);
  app.exit(0);
});
