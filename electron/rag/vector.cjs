function dot(a, b) {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

function cosine(a, b) {
  const d = Math.sqrt(dot(a, a)) * Math.sqrt(dot(b, b));
  return d > 0 ? dot(a, b) / d : 0;
}

function searchVector(queryVec, vecs, limit = 20) {
  return vecs
    .map((v, i) => ({ i, score: v ? cosine(queryVec, v) : -Infinity }))
    .filter((r) => r.score > -Infinity)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit);
}

module.exports = { cosine, searchVector };
