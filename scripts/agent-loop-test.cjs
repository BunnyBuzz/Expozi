// Hermetic tests for the agent loop (electron/rag/agent.cjs).
// Stubs the model (promptFn) and the tool layer (registry.run) so nothing
// touches the network — validates protocol parsing, auto-fill, the playbook
// trajectory, duplicate guard, abstract fallback and the parse fallback.
//
// Run: node scripts/agent-loop-test.cjs
const assert = require("assert");
const tools = require("../electron/tools/index.cjs");
const { runAgent, parseStep } = require("../electron/rag/agent.cjs");

const realRun = tools.run;
let calls = [];
function stubRun(map) {
  calls = [];
  tools.run = async (name, input, ctx) => {
    calls.push({ name, input, hasProgress: typeof ctx.progress === "function", hasState: !!ctx.state });
    const fn = map[name];
    if (!fn) throw new Error(`unknown tool: ${name}`);
    const res = typeof fn === "function" ? fn(input, ctx) : fn;
    if (res instanceof Error) throw res;
    return res;
  };
}
const scriptedPrompt = (steps) => {
  let i = 0;
  return async () => {
    const s = steps[Math.min(i, steps.length - 1)];
    i++;
    return typeof s === "function" ? s() : s;
  };
};

const DOC_A = { url: "https://a.example/1", title: "Study A", year: 2024, quality: 5, abstract: "A findings" };
const DOC_B = { url: "https://b.example/2", title: "Study B", year: 2022, quality: 3, abstract: "B findings" };

(async () => {
  // --- parseStep: fences, prose around JSON, trailing commas ----------------
  assert.deepStrictEqual(parseStep('```json\n{"tool":"scan_topic","args":{}}\n```'), { tool: "scan_topic", args: {} });
  assert.deepStrictEqual(parseStep('Sure! {"answer": "hi there, } inside"}'), { answer: "hi there, } inside" });
  assert.deepStrictEqual(parseStep('{"tool":"search_papers","args":{"queries":["a",],},}'), {
    tool: "search_papers",
    args: { queries: ["a"] },
  });
  assert.strictEqual(parseStep("no json here"), null);
  console.log("ok parseStep");

  // --- direct answer: zero tool calls --------------------------------------
  stubRun({});
  const r1 = await runAgent({
    sessionId: "s1", query: "hi", mode: "agent", depth: "standard",
    promptFn: scriptedPrompt(['{"answer": "Hello! How can I help with your research?"}']),
  });
  assert.ok(/Hello!/.test(r1.answer));
  assert.strictEqual(r1.sources.length, 0);
  assert.strictEqual(calls.length, 0);
  console.log("ok direct answer (no tools)");

  // --- parse repair: junk twice, then a valid answer ------------------------
  stubRun({});
  const r2 = await runAgent({
    sessionId: "s2", query: "hi", mode: "agent", depth: "standard",
    promptFn: scriptedPrompt(["I think the best next step is...", "oops", '{"answer": "Recovered."}']),
  });
  assert.strictEqual(r2.answer, "Recovered.");
  console.log("ok parse repair");

  // --- parse fallback: junk three times → agentFallback ---------------------
  stubRun({});
  let fell = null;
  try {
    await runAgent({
      sessionId: "s3", query: "q", mode: "agent", depth: "standard",
      promptFn: scriptedPrompt(["junk one", "junk two", "junk three", "junk four"]),
    });
  } catch (e) {
    fell = e;
  }
  assert.strictEqual(fell && fell.agentFallback, "parse");
  console.log("ok parse fallback");

  // --- full playbook with stubbed tools -------------------------------------
  stubRun({
    scan_topic: { data: [DOC_A, DOC_B], count: 2 },
    plan_queries: { data: ["q one", "q two"], count: 2 },
    gather_perspectives: { data: ["Domain expert: core facts"], count: 1 },
    generate_questions: { data: ["How big is the effect?"], count: 1 },
    search_papers: { data: [DOC_A, DOC_B], count: 2 },
    refine_questions: { data: ["gap query"], count: 1 },
    read_source: { data: [{ doc: DOC_A, text: "full text a" }, { doc: DOC_B, text: "full text b" }], count: 2, detail: "read 2/2 sources" },
    index_content: { data: { capped: [{ text: "chunk a", docIdx: 0 }, { text: "chunk b", docIdx: 1 }], bmRanked: [{ id: 0, score: 2 }], vecRanked: [], embedder: { available: false } }, count: 2, detail: "2 passages" },
    select_evidence: { data: [1, 0], count: 2 },
    synthesize: { data: "The evidence says [1][2].", count: null, detail: "wrote the cited answer" },
  });
  const steps = [
    '{"tool": "scan_topic", "args": {}}',
    '{"tool": "plan_queries", "args": {}}',
    '{"tool": "gather_perspectives", "args": {}}',
    '{"tool": "generate_questions", "args": {}}',
    '{"tool": "search_papers", "args": {}}',
    '{"tool": "refine_questions", "args": {}}',
    '{"tool": "search_papers", "args": {"queries": ["gap query"]}}',
    '{"tool": "read_source", "args": {}}',
    '{"tool": "index_content", "args": {}}',
    '{"tool": "synthesize", "args": {}}',
  ];
  const r3 = await runAgent({
    sessionId: "s4", query: "effects of caffeine", mode: "agent", depth: "standard",
    promptFn: scriptedPrompt(steps),
  });
  assert.strictEqual(r3.answer, "The evidence says [1][2].");
  const names = calls.map((c) => c.name);
  assert.deepStrictEqual(names, [
    "scan_topic", "plan_queries", "gather_perspectives", "generate_questions",
    "search_papers", "refine_questions", "search_papers", "read_source",
    "index_content", "select_evidence", "synthesize",
  ]);
  assert.ok(r3.sources.length >= 1 && r3.sources[0].url === DOC_A.url, "parents numbered by quality (best first)");
  const search1 = calls.find((c) => c.name === "search_papers");
  assert.ok(search1.input.queries.includes("effects of caffeine"), "original query always searched");
  assert.ok(search1.input.queries.includes("q one"), "planned queries auto-filled");
  const search2 = calls.filter((c) => c.name === "search_papers")[1];
  assert.ok(search2.input.queries.includes("gap query"), "refined queries auto-filled");
  const read = calls.find((c) => c.name === "read_source");
  assert.ok(read.input.docs.length === 2, "read_source defaulted to the searched docs");
  console.log("ok full playbook trajectory");

  // --- duplicate guard + abstract fallback ----------------------------------
  stubRun({
    search_papers: { data: [DOC_A], count: 1 },
    synthesize: { data: "Abstracts say [1].", count: null, detail: "wrote" },
  });
  const r4 = await runAgent({
    sessionId: "s5", query: "topic", mode: "agent", depth: "standard",
    promptFn: scriptedPrompt(['{"tool": "search_papers", "args": {"queries": ["topic"]}}']),
  });
  assert.strictEqual(r4.answer, "Abstracts say [1].");
  assert.strictEqual(calls.filter((c) => c.name === "search_papers").length, 2, "exact repeat capped");
  console.log("ok duplicate guard → abstract fallback");

  // --- abort ----------------------------------------------------------------
  stubRun({});
  const ac = new AbortController();
  ac.abort();
  let aborted = null;
  try {
    await runAgent({ sessionId: "s6", query: "q", mode: "agent", depth: "standard", signal: ac.signal, promptFn: scriptedPrompt([]) });
  } catch (e) {
    aborted = e;
  }
  assert.strictEqual(aborted && aborted.name, "AbortError");
  console.log("ok abort");

  tools.run = realRun;
  console.log("\nall agent loop tests passed");
})().catch((e) => {
  tools.run = realRun;
  console.error("FAILED:", e);
  process.exit(1);
});
