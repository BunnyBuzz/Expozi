// Report writing tools — outline-first, sectioned writing, then assembly with
// renumbered citations and a reference list.
const { genOutline, writableSections } = require("../rag/outline.cjs");
const {
  writeSection,
  writeAbstractAndConclusion,
  assembleReport,
  renumberCitations,
  referenceLineFromDoc,
} = require("../rag/write.cjs");
const { define } = require("./registry.cjs");

define({
  name: "build_outline",
  description: "Build the report outline from the question and source cards, and pick the writable sections.",
  input: { query: "string", cards: "string — source cards", maxSections: "number (default 5)" },
  async run(input, ctx) {
    const maxSections = input.maxSections || 5;
    const outline = await genOutline(ctx.promptFn, input.query, input.cards || "", { maxSections });
    const sections = writableSections(outline, maxSections);
    return {
      data: { outline, sections },
      count: sections.length,
      detail: sections.length
        ? `${sections.length} sections · ${sections.map((s) => s.title).join(" · ")}`
        : "outline empty — using default sections",
    };
  },
});

define({
  name: "write_section",
  description: "Write one report section from its evidence passages.",
  input: {
    query: "string",
    section: "{ title, subs? }",
    evidence: "[{ n, text }] — numbered passages for this section",
    maxTokens: "number (default 420)",
    progress: "string — e.g. '2/4' for the trace",
  },
  async run(input, ctx) {
    const evidence = input.evidence || [];
    const text = await writeSection(ctx.promptFn, {
      query: input.query,
      section: input.section,
      evidence,
      maxTokens: input.maxTokens == null ? 420 : input.maxTokens,
      onToken: ctx.onToken,
    });
    const title = input.section && input.section.title ? input.section.title : "section";
    return {
      data: text,
      count: evidence.length,
      detail: `${input.progress ? `section ${input.progress}: ` : ""}${title} · ${evidence.length} passages`,
    };
  },
});

define({
  name: "assemble_report",
  description:
    "Write the abstract + conclusion, assemble the report, renumber citations and build the reference list.",
  input: {
    outlineTitle: "string",
    query: "string",
    sections: "[{ title, text }] — written sections",
    passageByNo: "Map<number, passage>",
    docOfPassage: "fn(passage) => doc",
  },
  async run(input, ctx) {
    const bodyText = (input.sections || []).map((w) => w.text).join("\n\n");
    const { abstract, conclusion, error } = await writeAbstractAndConclusion(ctx.promptFn, {
      query: input.query,
      body: bodyText,
    });
    const rawFull = assembleReport({
      outlineTitle: input.outlineTitle,
      query: input.query,
      abstract,
      sections: input.sections,
      conclusion,
      references: [],
    });
    const { text, references, refDocs } = renumberCitations(rawFull, {
      passageByNo: input.passageByNo,
      docOfPassage: input.docOfPassage,
      referenceLine: referenceLineFromDoc,
    });
    const answer = references.length ? `${text}\n\n## References\n${references.join("\n")}` : text;
    // Report honestly what the summary step actually produced — an empty
    // abstract/conclusion must be visible in the trace, not claimed.
    const bits = [];
    if (abstract && conclusion) bits.push("abstract + conclusion");
    else if (abstract) bits.push("abstract only · conclusion empty");
    else if (conclusion) bits.push("conclusion only · abstract empty");
    else bits.push("no abstract/conclusion");
    if (error) bits.push(`summary step failed (${String(error).slice(0, 120)})`);
    bits.push(`${references.length} references`);
    return {
      data: { answer, references, refDocs },
      count: references.length,
      detail: `assembled · ${bits.join(" · ")}`,
    };
  },
});
