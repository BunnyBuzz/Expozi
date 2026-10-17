// Indexing tool — chunk the read sources, build the BM25 index, embed the
// chunks and rank them against the question. Passages are persisted for the
// session so history stays traceable.
const { chunkText } = require("../rag/chunk.cjs");
const { createEmbedder } = require("../rag/embedder.cjs");
const { buildIndex, searchIndex } = require("../rag/bm25.cjs");
const { searchVector } = require("../rag/vector.cjs");
const db = require("../rag/db.cjs");
const { define, throwIfAborted, isAbortError } = require("./registry.cjs");

function persistPassages(sessionId, withText, capped) {
  try {
    const srcIds = {};
    for (const x of withText) {
      const row = db.all("SELECT id FROM sources WHERE session_id=? AND url=?", [sessionId, x.doc.url])[0];
      srcIds[x.doc.url] = row ? row.id : null;
    }
    capped.forEach((c, i) => {
      const url = withText[c.docIdx].doc.url;
      db.run("INSERT INTO passages (source_id, session_id, chunk_index, text, embedding) VALUES (?,?,?,?,?)", [
        srcIds[url] || null,
        sessionId,
        i,
        c.text,
        c.vec ? JSON.stringify(c.vec) : null,
      ]);
    });
  } catch {
    /* never break the pipeline on DB errors */
  }
}

define({
  name: "index_sources",
  description:
    "Chunk the read sources, build the BM25 index, embed the chunks (when an embedding model is available) and rank them against the question.",
  input: {
    sessionId: "string",
    query: "string",
    withText: "[{ doc, text }] — output of read_pages",
  },
  async run(input, ctx) {
    if (ctx.onStage) ctx.onStage("embed", "Indexing the sources…");
    throwIfAborted(ctx.signal);
    const withText = input.withText || [];
    const capped = [];
    withText.forEach((x, di) => {
      chunkText(x.text).forEach((c, ci) => capped.push({ docIdx: di, chunkIdx: ci, text: c }));
    });
    const limited = capped.slice(0, 250);

    const bm = buildIndex(limited.map((c) => c.text));
    const bmRanked = searchIndex(bm, input.query, 40);

    let vecRanked = [];
    const embedder = await createEmbedder({
      onProgress: (done, total, note) =>
        ctx.onStage && ctx.onStage("embed", note || `Indexing the sources… ${done}/${total}`),
      shouldStop: () => !!(ctx.signal && ctx.signal.aborted),
    });
    if (embedder.available) {
      try {
        const qv = (await embedder.embedQuery([input.query]))[0];
        const vecs = await embedder.embedPassages(limited.map((c) => c.text));
        limited.forEach((c, i) => {
          c.vec = vecs[i];
        });
        throwIfAborted(ctx.signal);
        if (qv) vecRanked = searchVector(qv, vecs, limited.length);
      } catch (e) {
        if (isAbortError(e)) throw e;
        vecRanked = [];
      }
    }

    persistPassages(input.sessionId, withText, limited);

    const embedded = limited.filter((c) => c.vec).length;
    const label =
      embedder.source === "api"
        ? "API"
        : embedder.localKind === "onnx"
          ? `ONNX ${embedder.localModelLabel || ""}`.trim()
          : embedder.localKind === "gguf"
            ? "GGUF model"
            : "";
    const embedNote = embedder.available
      ? `${embedded}/${limited.length} embedded${label ? ` · ${label}` : ""}`
      : "embeddings unavailable";
    return {
      data: { capped: limited, bmRanked, vecRanked, embedder },
      count: limited.length,
      detail: `${limited.length} passages · ${embedNote}`,
    };
  },
});
