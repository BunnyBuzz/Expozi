function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2);
}

function buildIndex(texts) {
  const bm25 = require("wink-bm25-text-search")();
  bm25.defineConfig({ fldWeights: { text: 1 } });
  bm25.definePrepTasks([(t) => tokenize(t)]);
  texts.forEach((t, i) => bm25.addDoc({ text: t }, i));
  bm25.consolidate();
  return bm25;
}

function searchIndex(engine, query, limit = 20) {
  let res = [];
  try {
    res = engine.search(query) || [];
  } catch {
    return [];
  }
  return res.slice(0, limit).map((r) => {
    if (Array.isArray(r)) return { id: Number(r[0]), score: Number(r[1]) || 0 };
    return { id: Number(r.docid ?? r.id ?? 0), score: Number(r.score ?? 0) };
  });
}

module.exports = { buildIndex, searchIndex, tokenize };
