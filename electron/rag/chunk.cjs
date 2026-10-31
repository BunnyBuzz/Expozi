// Sentence-aware and paragraph-aware chunker.
// Avoids blind word-splitting that cuts sentences in half or separates
// critical clauses (e.g. results vs limitations). Preserves clean boundaries.
function chunkText(text, { words = 350, overlap = 60, minWords = 40, maxChunks = 30 } = {}) {
  const str = String(text || "").trim();
  if (!str) return [];

  // Split on double newlines (paragraphs) and sentence-ending punctuation.
  const paragraphs = str.split(/\n\s*\n/);
  const sentences = [];
  for (const p of paragraphs) {
    const sList = p
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    sentences.push(...sList);
  }

  if (sentences.length === 0) return [];

  const chunks = [];
  let cur = [];
  let curWords = 0;

  for (const s of sentences) {
    const wCount = s.split(/\s+/).filter(Boolean).length;
    cur.push(s);
    curWords += wCount;

    if (curWords >= words) {
      chunks.push(cur.join(" "));
      if (chunks.length >= maxChunks) break;

      // Keep sentence-level overlap from the end
      const ov = [];
      let ovWords = 0;
      for (let i = cur.length - 1; i >= 0; i--) {
        const sw = cur[i].split(/\s+/).filter(Boolean).length;
        if (ovWords + sw > overlap && ov.length > 0) break;
        ov.unshift(cur[i]);
        ovWords += sw;
      }
      cur = ov;
      curWords = ovWords;
    }
  }

  if (cur.length > 0 && chunks.length < maxChunks) {
    if (chunks.length === 0 || curWords >= minWords) {
      chunks.push(cur.join(" "));
    }
  }

  return chunks;
}

module.exports = { chunkText };
