// Comprehensive unit tests for Research Agent Flow (Step 0 through Step 9)
const assert = require("assert");
const {
  isSmallTalk,
  isAmbiguous,
  runResearchAgent,
} = require("../electron/rag/agentFlow.cjs");

(async () => {
  console.log("== Testing Research Agent Complete Flow ==");

  // 1. Test Smalltalk Detection
  assert.strictEqual(isSmallTalk("hi"), true);
  assert.strictEqual(isSmallTalk("hello there!"), true);
  assert.strictEqual(isSmallTalk("thanks"), true);
  assert.strictEqual(isSmallTalk("what are the effects of caffeine on sleep?"), false);
  console.log("✔ Step 0 Smalltalk classification verified");

  // 2. Test Ambiguity Detection
  assert.strictEqual(isAmbiguous("cancer"), true);
  assert.strictEqual(isAmbiguous("sleep"), true);
  assert.strictEqual(isAmbiguous("how does sleep affect memory?"), false);
  assert.strictEqual(isAmbiguous("effects of caffeine on sleep duration"), false);
  console.log("✔ Step 0 Ambiguity classification verified");

  // 3. Test Greeting Execution (zero tool calls)
  const toolEvents = [];
  const rGreeting = await runResearchAgent({
    query: "hi",
    promptFn: async () => "Hello! How can I assist with your research today?",
    onTool: (e) => toolEvents.push(e),
  });
  assert.strictEqual(rGreeting.isDirect, true);
  assert.strictEqual(toolEvents.length, 0);
  console.log("✔ Step 0 Greeting returned directly with zero tool calls");

  // 4. Test Ambiguity Clarification
  const rClarify = await runResearchAgent({
    query: "cancer",
    promptFn: async () => "Are you interested in immunotherapy, early detection, or specific cancer types?",
    onTool: (e) => toolEvents.push(e),
  });
  assert.strictEqual(rClarify.isClarification, true);
  console.log("✔ Step 0 Ambiguous query triggered clarification question");

  // 5. Test Full Agent Flow with Mocked LLM
  console.log("\nTesting Full Flow (Step 1 -> 8)...");
  const traces = [];
  const mockPromptFn = async (messages) => {
    const text = messages.map((m) => m.content).join("\n");
    if (/expert research planner/i.test(text)) {
      return JSON.stringify({
        core_question: "effects of caffeine on memory",
        angles: ["cellular", "clinical"],
        queries: ["caffeine cognitive performance", "caffeine memory retention"],
        depth: "standard",
      });
    }
    if (/reviewing search results/i.test(text)) {
      return JSON.stringify({
        coverage: "good",
        gaps: [],
        refined_queries: [],
      });
    }
    if (/Rate relevance/i.test(text)) {
      return JSON.stringify({ score: 9 });
    }
    if (/research assistant/i.test(text)) {
      return "Caffeine significantly improves memory retention and cognitive alertness in clinical trials [1][2].";
    }
    return "ok";
  };

  const result = await runResearchAgent({
    sessionId: "test-sess-1",
    query: "effects of caffeine on memory",
    promptFn: mockPromptFn,
    onTool: (e) => traces.push(e),
    onToken: () => {},
  });

  console.log("Trace events recorded:", traces.map((t) => `${t.tool} (${t.status})`).join(" -> "));
  assert.ok(result.answer.includes("[1]"), "Answer should contain citations");
  assert.ok(result.sources.length > 0, "Should return source cards");
  console.log("✔ Full research agent flow completed successfully with cited answer and sources");

  // 6. Test Step 9 Follow-up (same session index)
  console.log("\nTesting Follow-up Query in same session...");
  const followUpTraces = [];
  const followUpResult = await runResearchAgent({
    sessionId: "test-sess-1",
    query: "What about dosage levels?",
    isFollowUp: true,
    promptFn: mockPromptFn,
    onTool: (e) => followUpTraces.push(e),
  });

  console.log("Follow-up trace events:", followUpTraces.map((t) => `${t.tool} (${t.status})`).join(" -> "));
  assert.ok(followUpTraces.some((t) => t.tool === "retrieve_passages"), "Should retrieve from existing session index");
  assert.ok(!followUpTraces.some((t) => t.tool === "search_papers"), "Should NOT re-run search for standard follow-up");
  console.log("✔ Step 9 Follow-up successfully reused session index without re-searching");

  console.log("\nAll Research Agent Flow unit tests passed 100%!");
})();
