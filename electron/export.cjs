// Report export — Markdown and PDF.
//
// The PDF is rendered in-app with Electron's printToPDF (no external tools):
// the report markdown is converted to a styled A4 document, loaded into a
// hidden window and printed. The save location always comes from the native
// save dialog — nothing is written without the user picking a path.
const { app, BrowserWindow, dialog } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineMd(s) {
  let t = escapeHtml(s);
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  t = t.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2">$1</a>');
  return t;
}

const PAGE_CSS = `
  @page { size: A4; margin: 20mm 18mm; }
  * { box-sizing: border-box; }
  body { font: 11.5pt/1.65 "Segoe UI", -apple-system, Roboto, Helvetica, Arial, sans-serif; color: #1f2937; margin: 0; }
  .meta { font-size: 8.5pt; letter-spacing: .08em; text-transform: uppercase; color: #6b7280; margin-bottom: 10pt; }
  h1 { font-size: 21pt; line-height: 1.25; margin: 0 0 6pt; color: #0f172a; }
  .sub { font-size: 9.5pt; color: #6b7280; margin-bottom: 20pt; border-bottom: 1px solid #e5e7eb; padding-bottom: 10pt; }
  h2 { font-size: 13.5pt; margin: 19pt 0 6pt; color: #0f172a; border-bottom: 1px solid #e5e7eb; padding-bottom: 3pt; }
  h3 { font-size: 11.5pt; margin: 13pt 0 4pt; color: #111827; }
  h4 { font-size: 11pt; margin: 11pt 0 4pt; color: #111827; }
  p { margin: 0 0 8pt; }
  ul, ol { margin: 0 0 10pt; padding-left: 18pt; }
  li { margin: 0 0 4pt; }
  code { font-family: Consolas, ui-monospace, monospace; font-size: 10pt; background: #f3f4f6; padding: 1pt 3pt; border-radius: 3px; }
  a { color: #0f766e; text-decoration: none; }
  hr { border: 0; border-top: 1px solid #e5e7eb; margin: 14pt 0; }
`;

// Minimal, dependency-free markdown -> HTML for report documents.
// Placeholder headings ("# Title") that small models emit are skipped — the
// document heading uses the report's real title (or the query) instead.
const GENERIC_HEADING = /^(title|report|report title|untitled|research report)$/i;

function mdToHtml(markdown, title, meta) {
  const lines = String(markdown || "").split(/\r?\n/);
  const out = [];
  let list = null;
  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };
  let firstH1 = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      closeList();
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      closeList();
      const lvl = Math.min(h[1].length, 4);
      if (lvl === 1) {
        const txt = h[2].trim();
        if (GENERIC_HEADING.test(txt)) continue; // placeholder — replaced by the document heading
        // The first real H1 becomes the document heading (not repeated in the body).
        if (!firstH1) {
          firstH1 = txt;
          continue;
        }
      }
      out.push(`<h${lvl}>${inlineMd(h[2])}</h${lvl}>`);
      continue;
    }
    if (/^(---+|\*\*\*+)$/.test(line)) {
      closeList();
      out.push("<hr/>");
      continue;
    }
    const ul = line.match(/^[-*•]\s+(.*)$/);
    if (ul) {
      if (list !== "ul") {
        closeList();
        out.push("<ul>");
        list = "ul";
      }
      out.push(`<li>${inlineMd(ul[1])}</li>`);
      continue;
    }
    const ol = line.match(/^(\d+)[.)]\s+(.*)$/);
    if (ol) {
      if (list !== "ol") {
        closeList();
        out.push("<ol>");
        list = "ol";
      }
      out.push(`<li>${inlineMd(ol[2])}</li>`);
      continue;
    }
    closeList();
    out.push(`<p>${inlineMd(line)}</p>`);
  }
  closeList();

  const heading = firstH1 || title || "Research report";
  const date = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(heading)}</title><style>${PAGE_CSS}</style></head>
<body>
<div class="meta">${escapeHtml(meta || "Expozi · Research report")}</div>
<h1>${inlineMd(heading)}</h1>
<div class="sub">Generated ${escapeHtml(date)}</div>
${out.join("\n")}
</body></html>`;
}

// Renders the HTML in a window via a temp file (data: URLs are blocked for
// top-level navigation) and removes the temp file afterwards.
async function loadHtml(win, html) {
  const tmp = path.join(os.tmpdir(), `expozi-report-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  fs.writeFileSync(tmp, html, "utf8");
  try {
    await win.loadFile(tmp);
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* best effort */
    }
  }
}

async function writePdf({ markdown, title, outPath, meta }) {
  const win = new BrowserWindow({
    show: false,
    width: 794,
    height: 1123,
    backgroundColor: "#ffffff",
    webPreferences: { sandbox: true },
  });
  try {
    const html = mdToHtml(markdown, title, meta);
    await loadHtml(win, html);
    const pdf = await win.webContents.printToPDF({
      pageSize: "A4",
      printBackground: true,
      preferCSSPageSize: true,
    });
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, pdf);
    return outPath;
  } finally {
    if (!win.isDestroyed()) win.destroy();
  }
}

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

async function writeDocx({ markdown, title, outPath }) {
  const { Document, Packer, Paragraph, HeadingLevel } = require("docx");
  const lines = String(markdown || "").split(/\r?\n/);
  const children = [];
  if (title) {
    children.push(
      new Paragraph({
        text: title,
        heading: HeadingLevel.TITLE,
        spacing: { after: 300 },
      }),
    );
  }
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      children.push(new Paragraph({ text: "" }));
      continue;
    }
    if (trimmed.startsWith("# ")) {
      children.push(
        new Paragraph({
          text: trimmed.slice(2),
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 240, after: 120 },
        }),
      );
    } else if (trimmed.startsWith("## ")) {
      children.push(
        new Paragraph({
          text: trimmed.slice(3),
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 },
        }),
      );
    } else if (trimmed.startsWith("### ")) {
      children.push(
        new Paragraph({
          text: trimmed.slice(4),
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 160, after: 80 },
        }),
      );
    } else if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      children.push(new Paragraph({ text: trimmed.slice(2), bullet: { level: 0 } }));
    } else {
      children.push(new Paragraph({ text: trimmed, spacing: { after: 120 } }));
    }
  }
  const doc = new Document({ sections: [{ properties: {}, children }] });
  const buffer = await Packer.toBuffer(doc);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buffer);
}

// Shows the native save dialog, then writes the export in the chosen format:
// .md / .pdf / .docx / .txt for reports, .csv for screening sets and extraction tables.
// Returns { saved: false } when the user cancels, { saved: true, path } on file.
async function exportReport(parentWin, { format, markdown, csv, title, suggestedName, meta } = {}) {
  const ext =
    format === "pdf"
      ? "pdf"
      : format === "docx"
        ? "docx"
        : format === "txt"
          ? "txt"
          : format === "csv"
            ? "csv"
            : "md";
  const name = (suggestedName || `expozi-${slugify(title) || "report"}`) + "." + ext;
  const filterList = [
    { name: "PDF document", extensions: ["pdf"] },
    { name: "Word document (.docx)", extensions: ["docx"] },
    { name: "Text document (.txt)", extensions: ["txt"] },
    { name: "Markdown document (.md)", extensions: ["md"] },
    { name: "CSV spreadsheet (.csv)", extensions: ["csv"] },
  ];
  const activeFilter = filterList.find((f) => f.extensions[0] === ext) || filterList[0];
  const { canceled, filePath } = await dialog.showSaveDialog(parentWin || undefined, {
    title: "Export",
    defaultPath: path.join(app.getPath("downloads"), name),
    filters: [activeFilter, ...filterList.filter((f) => f !== activeFilter)],
  });
  if (canceled || !filePath) return { saved: false };

  const outPath = new RegExp(`\\.${ext}$`, "i").test(filePath) ? filePath : `${filePath}.${ext}`;
  if (ext === "pdf") {
    await writePdf({ markdown, title, outPath, meta });
  } else if (ext === "docx") {
    await writeDocx({ markdown, title, outPath });
  } else if (ext === "csv") {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, String(csv || ""), "utf8");
  } else {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, String(markdown || ""), "utf8");
  }
  return { saved: true, path: outPath };
}

module.exports = { exportReport, mdToHtml, writePdf, writeDocx, loadHtml, slugify };
