function rrfFuse(lists, weights, k = 60) {
  const scores = new Map();
  lists.forEach((list, s) => {
    const w = weights[s] || 0;
    if (!w) return;
    list.forEach((idx, rank) => {
      scores.set(idx, (scores.get(idx) || 0) + w * (1 / (k + rank + 1)));
    });
  });
  return [...scores.entries()]
    .map(([idx, score]) => ({ idx, score }))
    .sort((a, b) => b.score - a.score);
}

module.exports = { rrfFuse };
