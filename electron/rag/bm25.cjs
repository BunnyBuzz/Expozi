function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
}

const PAD_PREFIX = 999990;

function buildIndex(texts) {
  const bm25 = require("wink-bm25-text-search")();
  bm25.defineConfig({ fldWeights: { text: 1 } });
  bm25.definePrepTasks([(t) => tokenize(t)]);
  (texts || []).forEach((t, i) => bm25.addDoc({ text: t }, i));

  // wink-bm25 requires at least 3 documents to consolidate.
  // Add sentinel padding documents if corpus < 3 so small collections never throw.
  let pad = 0;
  while ((texts || []).length + pad < 3) {
    bm25.addDoc({ text: "__expozi_pad_token__" }, PAD_PREFIX + pad);
    pad++;
  }

  try {
    bm25.consolidate();
  } catch {
    /* consolidation error safeguard */
  }
  return bm25;
}

function searchIndex(engine, query, limit = 20) {
  if (!engine) return [];
  let res = [];
  try {
    res = engine.search(query) || [];
  } catch {
    return [];
  }
  return res
    .map((r) => {
      if (Array.isArray(r)) return { id: Number(r[0]), score: Number(r[1]) || 0 };
      return { id: Number(r.docid ?? r.id ?? 0), score: Number(r.score ?? 0) };
    })
    .filter((r) => r.id < PAD_PREFIX)
    .slice(0, limit);
}

function serializeIndex(engine) {
  if (!engine || typeof engine.exportJSON !== "function") return null;
  try {
    return engine.exportJSON();
  } catch {
    return null;
  }
}

function deserializeIndex(jsonStr) {
  if (!jsonStr) return null;
  try {
    const bm25 = require("wink-bm25-text-search")();
    bm25.defineConfig({ fldWeights: { text: 1 } });
    bm25.definePrepTasks([(t) => tokenize(t)]);
    bm25.importJSON(jsonStr);
    return bm25;
  } catch {
    return null;
  }
}

module.exports = { buildIndex, searchIndex, tokenize, serializeIndex, deserializeIndex };
