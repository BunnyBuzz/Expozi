// Sectioned report writing — adapted from STORM's `article_generation.py`:
// each section is written only from its own evidence pack (WriteSection,
// info capped ~1500 words, inline [n] citations), then abstract and
// conclusion are produced from the written body.

const SECTION_INSTRUCTION =
  "You are Expozi, a research assistant writing one section of a formal report. " +
  "Use ONLY the evidence below. Cite claims with the evidence numbers like [1], [2]. " +
  "Write 1-3 focused paragraphs. Do not repeat the section title as a sentence " +
  "and do not write other sections.";

function evidenceLines(items) {
  return (items || [])
    .map((p) => `[${p.n}] ${String(p.text || "").slice(0, 700)}`)
    .join("\n\n");
}

async function writeSection(promptFn, { query, section, evidence, maxTokens = 420, onToken }) {
  const prompt =
    `Report question: ${query}\nSection to write: ${section.title}\n\n` +
    `${SECTION_INSTRUCTION}\n\nEvidence:\n${evidenceLines(evidence)}`;
  const text = await promptFn([{ role: "user", content: prompt }], maxTokens, onToken);
  return `## ${section.title}\n${String(text || "").trim()}`;
}

function splitAbstractConclusion(text) {
  const absIdx = text.search(/##\s*Abstract/i);
  const conIdx = text.search(/##\s*Conclusion/i);
  if (absIdx >= 0 && conIdx >= 0) {
    return absIdx < conIdx
      ? { abstract: text.slice(absIdx, conIdx).trim(), conclusion: text.slice(conIdx).trim() }
      : { abstract: text.slice(absIdx).trim(), conclusion: text.slice(0, absIdx).trim() };
  }
  if (absIdx >= 0) return { abstract: text.slice(absIdx).trim(), conclusion: "" };
  if (conIdx >= 0) return { abstract: "", conclusion: text.slice(conIdx).trim() };
  return { abstract: "", conclusion: text };
}

async function writeAbstractAndConclusion(promptFn, { query, body, maxTokens = 380 }) {
  try {
    const raw = await promptFn(
      [
        {
          role: "user",
          content:
            `Report question: ${query}\n\nBelow are the written sections of a research report. ` +
            'Write two short parts:\n"## Abstract" — about 100 words summarizing the report;\n' +
            '"## Conclusion" — about 120 words stating the main takeaway and one limitation.\n' +
            'Do not use new citations. Do not use markdown other than the two "##" headings.\n\n' +
            `Report body:\n${String(body || "").slice(0, 8000)}`,
        },
      ],
      maxTokens,
    );
    return splitAbstractConclusion(String(raw || "").trim());
  } catch {
    return { abstract: "", conclusion: "" };
  }
}

function assembleReport({ outlineTitle, query, abstract, sections, conclusion, references }) {
  const parts = [`# ${outlineTitle || query || "Research report"}`];
  const abs = String(abstract || "")
    .replace(/^##\s*Abstract\s*\n?/i, "")
    .trim();
  if (abs) parts.push(`## Abstract\n${abs}`);
  for (const s of sections || []) {
    if (s && s.text && s.text.trim()) parts.push(s.text.trim());
  }
  const con = String(conclusion || "")
    .replace(/^##\s*Conclusion\s*\n?/i, "")
    .trim();
  if (con) parts.push(`## Conclusion\n${con}`);
  if (references && references.length) parts.push(`## References\n${references.join("\n")}`);
  return parts.join("\n\n");
}

// Renumber [n] citations so the references list is dense, and build the
// reference lines from the passages' parent documents.
function renumberCitations(text, { passageByNo, docOfPassage, referenceLine }) {
  const cited = new Map(); // n -> { docKey, score order }
  const re = /\[(\d{1,3})\]/g;
  let m;
  while ((m = re.exec(text))) {
    const n = Number(m[1]);
    if (!passageByNo.has(n)) continue;
    if (!cited.has(n)) cited.set(n, passageByNo.get(n));
  }
  const order = [...cited.keys()].sort((a, b) => a - b);
  const docNo = new Map();
  const refLines = [];
  const refDocs = [];
  const remap = new Map();
  for (const n of order) {
    const passage = cited.get(n);
    const doc = docOfPassage(passage);
    const key = doc ? doc.url || doc.title : `passage-${n}`;
    if (!docNo.has(key)) {
      docNo.set(key, docNo.size + 1);
      refLines.push(referenceLine(docNo.get(key), doc, passage));
      refDocs.push(doc);
    }
    remap.set(n, docNo.get(key));
  }
  const out = String(text || "").replace(re, (whole, num) => {
    const n = Number(num);
    return remap.has(n) ? `[${remap.get(n)}]` : "";
  });
  return { text: out, references: refLines, refDocs, citedCount: remap.size };
}

function referenceLineFromDoc(n, doc) {
  if (!doc) return `${n}. (unknown source)`;
  const authors = Array.isArray(doc.authors) ? doc.authors.filter(Boolean) : [];
  const authorPart = authors.length ? `${authors.slice(0, 3).join(", ")}${authors.length > 3 ? ", et al." : ""}` : "";
  const year = doc.year ? ` (${doc.year})` : "";
  const title = doc.title || "(untitled)";
  const url = doc.url || "";
  return `${n}. ${authorPart ? authorPart + " " : ""}${title}${year}.${url ? ` ${url}` : ""}`.replace(/\s+/g, " ");
}

module.exports = {
  writeSection,
  writeAbstractAndConclusion,
  assembleReport,
  renumberCitations,
  referenceLineFromDoc,
  evidenceLines,
};
