// Verifies that a running local embedding batch honors a stop request
// (AbortError) instead of finishing every passage first — the bug found by
// the Stage 2.5c check: stop during "Indexing the sources…" was ignored.
//   npx electron scripts/embedder-abort-test.cjs
const { app } = require("electron");
app.on("window-all-closed", () => {});
const path = require("path");

function stubModule(relPath, exports) {
  const p = require.resolve(relPath);
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
  return p;
}

const root = path.join(__dirname, "..");
stubModule(path.join(root, "electron/rag/embed.cjs"), {
  hasEmbedding: () => true,
  embedIdentity: () => "test-model",
  embedKind: () => "onnx",
  embedTexts: async (texts, { shouldStop, onProgress } = {}) => {
    const out = [];
    for (let i = 0; i < texts.length; i++) {
      if (shouldStop && shouldStop()) {
        const e = new Error("aborted");
        e.name = "AbortError";
        throw e;
      }
      out.push([0.1, 0.2, 0.3]);
      if (onProgress) onProgress(i + 1, texts.length);
    }
    return out;
  },
});
stubModule(path.join(root, "electron/rag/db.cjs"), {
  all: () => [],
  run: () => {},
  runMany: () => {},
});

const { createEmbedder } = require("../electron/rag/embedder.cjs");

app.whenReady().then(async () => {
  let done = 0;
  let aborted = false;
  const emb = await createEmbedder({
    shouldStop: () => aborted,
    onProgress: () => {
      done++;
      if (done >= 2) aborted = true; // user hits Stop after 2 passages
    },
  });
  try {
    await emb.embed(["a", "b", "c", "d", "e", "f"]);
    console.log("FAIL: embed completed despite the stop request");
    app.exit(1);
  } catch (e) {
    console.log(`aborted after ${done} of 6 texts with ${e.name}: ${e.message}`);
    app.exit(e.name === "AbortError" ? 0 : 1);
  }
});
