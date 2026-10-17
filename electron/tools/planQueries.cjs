// Planning tool — grounded search-query planning from snippet cards (STORM/GPTR style).
const { planQueries } = require("../rag/plan.cjs");
const { define } = require("./registry.cjs");

define({
  name: "plan_queries",
  description:
    "Plan focused search queries for the task using the grounding snippet cards (searched alongside the raw question).",
  input: { query: "string", cards: "string — grounding snippet cards", max: "number — max queries (default 4)" },
  async run(input, ctx) {
    const queries = await planQueries(ctx.promptFn, input.query, input.cards || "", input.max || 4);
    return {
      data: queries,
      count: queries.length,
      detail: queries.length ? `${queries.length} queries` : "no queries planned",
    };
  },
});
