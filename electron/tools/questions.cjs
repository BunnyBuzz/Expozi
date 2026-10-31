// Perspective / question generation tools (STORM's perspective-guided questioning).
const { genPerspectives, genQuestions, refineQuestions } = require("../rag/plan.cjs");
const { define } = require("./registry.cjs");

define({
  name: "gather_perspectives",
  description: "Generate the researcher perspectives (expert personas) for the topic.",
  input: { query: "string", max: "number — max perspectives (default 3)" },
  async run(input, ctx) {
    const perspectives = await genPerspectives(ctx.promptFn, input.query, input.max || 3);
    return {
      data: perspectives,
      count: perspectives.length,
      detail: perspectives.length ? `${perspectives.length} perspectives` : "no perspectives",
    };
  },
});

define({
  name: "generate_questions",
  description:
    "Generate focused research questions, one per perspective, to search in addition to the raw question.",
  input: {
    query: "string",
    perspectives: "string[]",
    asked: "string[] — questions already asked (deduped)",
    cards: "string — grounding snippet cards",
    perPerspective: "number — questions per perspective (default 2)",
  },
  async run(input, ctx) {
    const questions = await genQuestions(
      ctx.promptFn,
      input.query,
      input.perspectives || [],
      input.asked || [],
      input.cards || "",
      input.perPerspective || 2,
    );
    return {
      data: questions,
      count: questions.length,
      detail: questions.length ? `${questions.length} questions` : "no new questions",
    };
  },
});

define({
  name: "refine_questions",
  description:
    "Review what the first search round found and generate follow-up queries that fill coverage gaps (round 2 of search → refine → search).",
  input: {
    query: "string",
    cards: "string — snippet cards of what was found",
    asked: "string[] — queries already searched (deduped)",
    max: "number — max follow-up queries (default 3)",
  },
  async run(input, ctx) {
    const questions = await refineQuestions(
      ctx.promptFn,
      input.query,
      input.cards || "",
      input.asked || [],
      input.max || 3,
    );
    return {
      data: questions,
      count: questions.length,
      detail: questions.length ? `${questions.length} follow-up queries` : "no gaps found",
    };
  },
});
