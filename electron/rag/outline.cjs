// Outline-first report structure — adapted from STORM's
// `outline_generation.py`: a draft outline is written from the topic, then
// refined against the gathered evidence (WritePageOutline ->
// WritePageOutlineFromConv). Abstract / Introduction / Conclusion /
// References are handled by the pipeline, not by the outline.

const SKIP_SECTIONS = /^(abstract|introduction|conclusion|references|summary)\b/i;
const GENERIC_TITLE = /^(section|part|chapter|body|content|main|segment)\s*[0-9:.)\-\s]*$/i;

const DEFAULT_SECTIONS = [
  "Background & context",
  "Key findings",
  "Evidence & studies",
  "Limitations & open questions",
];

function parseOutline(raw) {
  const title = [];
  const sections = [];
  for (const line of String(raw || "").split(/\r?\n/)) {
    const m = line.match(/^\s*(#{1,3})\s+(.*\S)\s*$/);
    if (!m) continue;
    const level = m[1].length;
    const text = m[2].replace(/^["']|["']$/g, "").trim();
    if (!text) continue;
    if (level === 1) title.push(text);
    else if (level === 2) sections.push({ title: text, subs: [] });
    else if (level === 3 && sections.length) sections[sections.length - 1].subs.push(text);
  }
  return { title: title[0] || "", sections };
}

function fallbackTitle(query) {
  const q = String(query || "").trim();
  return q ? q.charAt(0).toUpperCase() + q.slice(1) : "Research report";
}

function writableSections(outline, max = 8) {
  return (outline.sections || []).filter((s) => !SKIP_SECTIONS.test(s.title)).slice(0, max);
}

async function genOutline(promptFn, query, cardsText, { maxSections = 5 } = {}) {
  const fallback = () => ({
    title: fallbackTitle(query),
    sections: DEFAULT_SECTIONS.slice(0, Math.min(maxSections, DEFAULT_SECTIONS.length)).map((t) => ({
      title: t,
      subs: [],
    })),
  });

  let draft = "";
  let outline = null;
  try {
    draft = await promptFn(
      [
        {
          role: "user",
          content:
            `Write an outline for a research report that answers: "${query}".\n` +
            "Use markdown headings: \"# Title\" for the report title, \"## Section title\" for 3 to " +
            `${maxSections} thematic sections, and optional "### Subsection" titles.\n` +
            "Every section title must describe its content — never use the literal word \"Section\" as a title.\n" +
            "Do not include an Abstract, Introduction, Conclusion, Summary or References section — those are added automatically.\n" +
            "Example shape (replace with topic-specific titles):\n" +
            "# Effects of sleep on memory\n## How memory consolidation works\n### Sleep stages\n## Evidence from controlled studies\n## Disagreements and open questions\n\n" +
            "Return ONLY the outline.",
        },
      ],
      300,
    );
    const o = parseOutline(draft);
    const good = o.sections.filter((s) => !GENERIC_TITLE.test(s.title));
    if (good.length >= 2) outline = { title: o.title, sections: good };
  } catch {
    /* noop */
  }
  if (!outline) return fallback();

  if (cardsText) {
    try {
      const refined = await promptFn(
        [
          {
            role: "user",
            content:
              `Improve this report outline using the gathered evidence. Keep 2-${maxSections} strong thematic sections; ` +
              "rename, merge or add sections the evidence supports; every section title must describe its content " +
              '(never the literal word "Section"); keep the same markdown format; ' +
              "no Abstract/Introduction/Conclusion/References sections.\n\n" +
              `Outline:\n${draft}\n\nGathered evidence (titles):\n${cardsText}`,
          },
        ],
        300,
      );
      const o2 = parseOutline(refined);
      const good2 = o2.sections.filter((s) => !GENERIC_TITLE.test(s.title));
      if (good2.length >= 2) {
        outline = { title: o2.title || outline.title, sections: good2 };
      }
    } catch {
      /* keep the draft */
    }
  }

  const sections = outline.sections.slice(0, maxSections);
  return { title: outline.title || fallbackTitle(query), sections };
}

module.exports = { genOutline, parseOutline, writableSections, DEFAULT_SECTIONS };
