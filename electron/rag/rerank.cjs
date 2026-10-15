async function rerank(promptFn, query, passages, topN = 5) {
  const top = (passages || []).filter(Boolean).slice(0, 20);
  if (top.length === 0) return [];
  try {
    const list = top.map((p, i) => `[${i}] ${p.text.slice(0, 600)}`).join("\n\n");
    const raw = await promptFn(
      [
        {
          role: "user",
          content:
            `Score each passage 0-10 for relevance to "${query}". ` +
            `Return ONLY JSON like {"scores":[8,3,9]} with exactly ${top.length} numbers in order.\n\n` +
            list,
        },
      ],
      400,
    );
    const m = raw.match(/\{[\s\S]*\}/);
    const scores = JSON.parse(m ? m[0] : raw).scores;
    if (!Array.isArray(scores)) throw new Error("bad scores");
    return top
      .map((p, i) => ({ ...p, score: Number(scores[i]) || 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);
  } catch {
    return top.slice(0, topN).map((p) => ({ ...p, score: 0 }));
  }
}

module.exports = { rerank };
