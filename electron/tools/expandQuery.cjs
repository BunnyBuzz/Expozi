// Query expansion — the lite flow's first step.
const { expandQuery } = require("../rag/expand.cjs");
const { define } = require("./registry.cjs");

define({
  name: "expand_query",
  description: "Break the user's question into a few focused sub-queries for searching.",
  input: { query: "string" },
  async run(input, ctx) {
    const subs = await expandQuery(ctx.promptFn, input.query);
    return {
      data: subs,
      count: subs.length,
      detail: subs.length ? `${subs.length} sub-queries` : "no sub-queries",
    };
  },
});
