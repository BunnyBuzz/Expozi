function chunkText(text, { words = 512, overlap = 100, minWords = 50, maxChunks = 20 } = {}) {
  const tokens = String(text || "")
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return [];
  if (tokens.length < minWords) return [tokens.join(" ")];
  const chunks = [];
  let start = 0;
  while (start < tokens.length && chunks.length < maxChunks) {
    const slice = tokens.slice(start, start + words);
    if (slice.length >= minWords || chunks.length === 0) chunks.push(slice.join(" "));
    if (start + words >= tokens.length) break;
    start += words - overlap;
  }
  return chunks;
}

module.exports = { chunkText };
