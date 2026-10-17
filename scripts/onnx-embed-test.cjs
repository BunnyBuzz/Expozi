// ONNX embedder check — the fast indexing path (stage 2.5d):
//   1. load multilingual-e5-small via transformers.js (downloads once into the app models dir)
//   2. embed 60 passages through the real embedder integration (facade +
//      embedder) and report ms/passage + dims
//   3. ranking sanity: the instructed query/passage prefixes + cosine must
//      rank the on-topic passages above distractors (mirrors index_sources),
//      for an English and a German query (cross-lingual check)
//   4. abort responsiveness: a stop request breaks between batches
// Usage: npx electron scripts/onnx-embed-test.cjs
const { app } = require("electron");
// Bare `electron <script>` defaults userData to %APPDATA%\Electron; the app
// uses its package name — target the real app dirs (download cache included).
app.setName("expozi");
app.on("window-all-closed", () => {});
const path = require("path");

function stubModule(relPath, exports) {
  const p = require.resolve(relPath);
  require.cache[p] = { id: p, filename: p, loaded: true, exports };
  return p;
}

const root = path.join(__dirname, "..");
// The embedder touches SQLite only for its cache — a stub keeps this test
// hermetic (no user DB) while the embedding path stays real.
stubModule(path.join(root, "electron/rag/db.cjs"), {
  all: () => [],
  run: () => {},
  runMany: () => {},
});

const { ragDirs } = require("../electron/rag/paths.cjs");
const embed = require("../electron/rag/embed.cjs");
const { createEmbedder } = require("../electron/rag/embedder.cjs");
const { searchVector } = require("../electron/rag/vector.cjs");

app.whenReady().then(async () => {
  const dirs = ragDirs(app);
  const cacheDir = path.join(dirs.models, "onnx");
  embed.setCacheDir(cacheDir);
  console.log("cache dir:", cacheDir);

  const t0 = Date.now();
  let lastPct = -1;
  const kind = await embed.loadEmbeddingModel(null, {
    onProgress: (p) => {
      if (p && p.status === "progress" && p.total && /\.onnx$/i.test(p.file || "")) {
        const pct = Math.round((p.loaded / p.total) * 100);
        if (pct !== lastPct && pct % 20 === 0) {
          lastPct = pct;
          console.log(`  download ${pct}%`);
        }
      }
    },
  });
  console.log(
    `loaded ${kind} in ${Date.now() - t0} ms | ready: ${embed.hasEmbedding()} | identity: ${embed.embedIdentity()}`,
  );

  const texts = Array.from(
    { length: 60 },
    (_, i) =>
      `Passage ${i}: intermittent fasting improved fasting glucose and insulin sensitivity in adults with prediabetes; body weight decreased by 2-4% over 8 weeks.`,
  );

  const emb = await createEmbedder({});
  console.log(`embedder available: ${emb.available} | localKind: ${emb.localKind}`);
  const t1 = Date.now();
  const vecs = await emb.embed(texts);
  const ms = Date.now() - t1;
  console.log(
    `embedded ${vecs.length} passages in ${ms} ms (${(ms / texts.length).toFixed(1)} ms each) | dims: ${vecs[0].length} | source: ${emb.source}`,
  );
  if (vecs[0].length !== 384) {
    console.log(`FAIL: expected 384 dims, got ${vecs[0].length}`);
    app.exit(1);
  }
  console.log("dims ok: 384");

  // Ranking sanity: via embedQuery/embedPassages (the exact wrappers
  // index_sources uses — instructed e5 prefixes), cosine order.
  const query = "Does exercise reduce symptoms of depression in older adults?";
  const passages = [
    "Twelve weeks of aerobic exercise significantly reduced depressive symptoms in adults over 65.",
    "Physical activity interventions improved mood scores in older participants with mild depression. ",
    "Strength training increased muscle mass and bone density in elderly men. ",
    "Antidepressant medication and psychotherapy are common first-line treatments for depression. ",
    "The euro exchange rate fluctuated against the dollar this quarter. ",
  ];
  if (emb.localModelLabel !== "multilingual-e5-small") {
    console.log(`FAIL: unexpected localModelLabel: ${emb.localModelLabel}`);
    app.exit(1);
  }
  const qv = (await emb.embedQuery([query]))[0];
  const pv = await emb.embedPassages(passages);
  const ranked = searchVector(qv, pv, passages.length).map((r) => r.i);
  const top2 = [...ranked.slice(0, 2)].sort((a, b) => a - b);
  const rankOk = top2[0] === 0 && top2[1] === 1;
  console.log(`ranking sanity: order ${JSON.stringify(ranked)} — ${rankOk ? "RANK OK" : "RANK FAIL"}`);
  if (!rankOk) app.exit(1);

  // Cross-lingual: the same passages must rank the same for a German query
  // (the whole point of e5).
  const qDe = "Reduziert Sport die Symptome von Depressionen bei älteren Erwachsenen?";
  const qvDe = (await emb.embedQuery([qDe]))[0];
  const rankedDe = searchVector(qvDe, pv, passages.length).map((r) => r.i);
  const top2De = [...rankedDe.slice(0, 2)].sort((a, b) => a - b);
  const deOk = top2De[0] === 0 && top2De[1] === 1;
  console.log(`cross-lingual (DE query): order ${JSON.stringify(rankedDe)} — ${deOk ? "RANK OK" : "RANK FAIL"}`);
  if (!deOk) app.exit(1);

  // Abort: shouldStop flips after the first 16-text batch.
  let done = 0;
  try {
    await embed.embedTexts(texts, {
      shouldStop: () => done >= 16,
      onProgress: (d) => {
        done = d;
      },
    });
    console.log("FAIL: abort ignored");
    app.exit(1);
  } catch (e) {
    console.log(`abort ok after ${done} of ${texts.length} texts: ${e.name}`);
    app.exit(0);
  }
});
