// Answer writing — grounded synthesis from the numbered evidence passages.
// Agent answers are concise and cited; report-style answers use the formal
// report headings (used as the report fallback and by the lite flow).
const { define } = require("./registry.cjs");

const AGENT_PROMPT =
  "You are Expozi, a research assistant. Answer ONLY from the evidence below. " +
  "Cite claims with the passage numbers like [1], [2]. Be concise and specific. " +
  "Prefer strong evidence (meta-analyses, systematic reviews, randomized trials) over weak " +
  "designs or web pages, and use exact figures from the evidence only — never invent numbers. " +
  "Start directly with the answer; do not repeat or rephrase the question. " +
  "If the evidence covers the task only partially, answer what it supports and state the gap.";

const REPORT_PROMPT =
  "Write a formal research report answering the question below. Use ONLY the provided evidence. Format as:\n" +
  "# Title\n## Abstract (about 120 words)\n## Introduction\n## Key Findings (subsections per theme)\n" +
  "## Conflicting evidence (only when sources disagree: state the disagreement and which side has the stronger designs)\n" +
  "## Conclusion\n## References\n" +
  "Cite sources as [1], [2] etc. Prefer meta-analyses, systematic reviews and randomized trials; treat web sources as a marked supplement. " +
  "Use exact figures from the evidence only; never invent or round vague claims into numbers. Return plain text with these headings, no JSON.";

const AGENT_TAIL =
  "\n\nAnswer the question above from this evidence. Give specific findings (effects, directions, magnitudes) with exact figures where the evidence provides them, and cite them as [n].";

define({
  name: "write_answer",
  description:
    "Write the grounded answer from the numbered evidence passages (agent style: concise + cited; report style: formal headings).",
  input: {
    query: "string",
    evidence: "string — numbered passages ('[n] text' blocks joined)",
    style: "'agent' | 'report'",
    tail: "boolean — append the agent output instruction (default true for agent)",
    maxTokens: "number",
  },
  async run(input, ctx) {
    const style = input.style === "report" ? "report" : "agent";
    const head = style === "report" ? REPORT_PROMPT : AGENT_PROMPT;
    let prompt = head + "\n\nQuestion: " + input.query + "\n\nEvidence:\n" + (input.evidence || "");
    if (input.tail !== false && style === "agent") prompt += AGENT_TAIL;
    const answer = await ctx.promptFn(
      [{ role: "user", content: prompt }],
      input.maxTokens || 500,
      ctx.onToken,
    );
    const text = String(answer || "");
    return {
      data: text,
      count: null,
      detail: `wrote ${style} answer (${text.length} chars)`,
    };
  },
});

define({
  name: "synthesize",
  description:
    "Write the final grounded answer from the numbered evidence passages, streamed with [1][2] citations. The agent loop assembles the evidence automatically — pass no args.",
  input: {
    query: "string — optional, defaults to the original task",
    evidence: "string — numbered passages (assembled by the agent loop)",
    maxTokens: "number",
  },
  async run(input, ctx) {
    if (!input.evidence || !String(input.evidence).trim()) {
      throw new Error("no evidence available yet — read sources and index content first");
    }
    const prompt = AGENT_PROMPT + "\n\nQuestion: " + input.query + "\n\nEvidence:\n" + input.evidence + AGENT_TAIL;
    const answer = await ctx.promptFn(
      [{ role: "user", content: prompt }],
      input.maxTokens || 500,
      ctx.onToken,
    );
    const text = String(answer || "");
    return {
      data: text,
      count: null,
      detail: `wrote the cited answer (${text.length} chars)`,
    };
  },
});

module.exports = { AGENT_PROMPT, REPORT_PROMPT };
