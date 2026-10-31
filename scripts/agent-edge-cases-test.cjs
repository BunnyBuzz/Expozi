const assert = require("assert");
const { runResearchAgent } = require("../electron/rag/agentFlow.cjs");
const { findSimilarPastSession } = require("../electron/rag/sessionMemory.cjs");
const { getOrCreateSessionIndex } = require("../electron/rag/sessionIndex.cjs");
const { openDb } = require("../electron/rag/db.cjs");
const path = require("path");

async function main() {
  console.log("== Testing Research Agent Edge Cases & Error Handling ==");

  // Setup test DB
  const testDbFile = path.join(__dirname, "../temp-test-edge-cases.db");
  const db = await openDb(testDbFile);

  // 1. Test Synthesis Failure Fallback
  console.log("\n1. Testing LLM synthesis failure fallback...");
  let synthFailTraces = [];
  const mockFailingPromptFn = async (messages, maxTokens) => {
    const text = messages.map((m) => m.content).join("\n");
    if (/expert research planner/i.test(text)) {
      return JSON.stringify({
        core_question: "test error handling",
        angles: ["testing"],
        queries: ["caffeine cognitive function"],
        depth: "shallow",
      });
    }
    if (/research assistant/i.test(text)) {
      throw new Error("Simulated LLM API rate-limit/timeout during synthesis");
    }
    return "ok";
  };

  const synthFailRes = await runResearchAgent({
    sessionId: "test-synth-fail",
    query: "What are the cognitive effects of caffeine on human memory?",
    promptFn: mockFailingPromptFn,
    onTool: (e) => synthFailTraces.push(e),
  });

  assert.ok(synthFailRes.answer.includes("The synthesis step encountered an error"), "Should explain synthesis error gracefully");
  assert.ok(synthFailRes.sources.length > 0, "Should still return raw scholarly sources when synthesis fails");
  console.log("✔ Synthesis failure gracefully fell back to raw passages with sources");

  // 2. Test Embedding Unavailable Fallback
  console.log("\n2. Testing Embedding unavailable (BM25 only) fallback...");
  const sIdx = getOrCreateSessionIndex("test-bm25-only");
  sIdx.addDocsAndChunks({
    docs: [
      { id: "p1", title: "Caffeine and Attention Study", url: "https://example.com/p1" },
      { id: "p2", title: "Dietary Studies", url: "https://example.com/p2" },
      { id: "p3", title: "Molecular Biology", url: "https://example.com/p3" },
    ],
    chunks: [
      {
        text: "Clinical trial showing caffeine significantly improves sustained attention and working memory in healthy adults.",
        doc: { id: "p1", title: "Caffeine and Attention Study", url: "https://example.com/p1" },
      },
      {
        text: "Long term dietary habits and neurological outcomes across adult demographics.",
        doc: { id: "p2", title: "Dietary Studies", url: "https://example.com/p2" },
      },
      {
        text: "Molecular mechanisms of adenosine receptor antagonism by methylxanthines.",
        doc: { id: "p3", title: "Molecular Biology", url: "https://example.com/p3" },
      },
    ],
  });

  // Mock embedder with available = false
  const unavailableEmbedder = {
    available: false,
    embed: async () => null,
  };

  const retrieved = await sIdx.retrievePassages("caffeine attention", unavailableEmbedder, 5);
  assert.ok(retrieved.length > 0, "Should retrieve passages using BM25 only");
  assert.ok(retrieved[0].text.includes("attention"), "Top retrieved passage should match query via keyword BM25");
  console.log("✔ Fallback to BM25 keyword search verified when embedding model unavailable");

  // 3. Test Session Memory Similarity Check
  console.log("\n3. Testing Session Memory similarity check (>0.7)...");
  db.run("INSERT OR REPLACE INTO sessions (id, query, mode, answer) VALUES (?, ?, ?, ?)", [
    "sess-mem-1",
    "Effects of intermittent fasting on insulin sensitivity in diabetic patients",
    "agent",
    "Intermittent fasting improves insulin sensitivity.",
  ]);

  const memMatch = await findSimilarPastSession("Effects of intermittent fasting on insulin sensitivity in patients");
  assert.ok(memMatch !== null, "Should find matching past session");
  assert.ok(memMatch.similarity >= 0.7, `Similarity should be >= 0.7 (got ${memMatch.similarity})`);
  assert.strictEqual(memMatch.shouldSuggest, true, "Should suggest resume");
  assert.strictEqual(memMatch.sessionId, "sess-mem-1");
  console.log(`✔ Session memory detected past session with ${Math.round(memMatch.similarity * 100)}% similarity`);

  console.log("\nAll Research Agent Edge Case & Error Handling tests passed 100%!");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
