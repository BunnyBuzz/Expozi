function extractJsonArray(raw) {
  const a = raw.indexOf("[");
  const b = raw.lastIndexOf("]");
  if (a < 0 || b <= a) throw new Error("no JSON array");
  return JSON.parse(raw.slice(a, b + 1));
}

async function expandQuery(promptFn, query) {
  try {
    const raw = await promptFn(
      [
        {
          role: "user",
          content:
            "Turn this research question into 4 diverse web-search sub-queries (5-12 words each). " +
            'Return ONLY a JSON array of 4 strings, no other text.\n\nQuestion: ' +
            query,
        },
      ],
      200,
    );
    const arr = extractJsonArray(raw);
    const subs = arr.filter((s) => typeof s === "string" && s.trim().length > 3).slice(0, 4);
    if (subs.length > 0) return [query, ...subs];
  } catch {
    /* fall through */
  }
  return [query];
}

module.exports = { expandQuery, extractJsonArray };
