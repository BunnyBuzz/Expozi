// Session Memory — checks past research queries in SQLite using token/BM25 similarity.
// If similarity > 0.7 with a previous session, suggests resuming past research.
const db = require("./db.cjs");
const { tokenize, buildIndex, searchIndex } = require("./bm25.cjs");

function timeAgo(dateStr) {
  if (!dateStr) return "recently";
  try {
    const diffMs = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 60) return `${Math.max(1, mins)}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return "yesterday";
    return `${days} days ago`;
  } catch {
    return "recently";
  }
}

function tokenSimilarity(a, b) {
  const setA = new Set(tokenize(a));
  const setB = new Set(tokenize(b));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const t of setA) {
    if (setB.has(t)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

async function findSimilarPastSession(query) {
  const q = String(query || "").trim();
  if (!q) return null;

  let pastSessions = [];
  try {
    pastSessions = db.all(
      "SELECT id, query, mode, answer, created_at FROM sessions WHERE answer IS NOT NULL AND TRIM(answer) != '' ORDER BY created_at DESC LIMIT 60",
    );
  } catch {
    return null;
  }

  if (!pastSessions || pastSessions.length === 0) return null;

  let bestSession = null;
  let highestSim = 0;

  for (const s of pastSessions) {
    if (!s.query) continue;
    const sim = tokenSimilarity(q, s.query);
    if (sim > highestSim) {
      highestSim = sim;
      bestSession = s;
    }
  }

  if (bestSession && highestSim >= 0.7) {
    let sourceCount = 0;
    try {
      const srcRows = db.all("SELECT count(*) AS c FROM sources WHERE session_id=?", [bestSession.id]);
      sourceCount = (srcRows[0] && srcRows[0].c) || 0;
    } catch {
      /* ignore */
    }

    return {
      shouldSuggest: true,
      similarity: Math.round(highestSim * 100) / 100,
      sessionId: bestSession.id,
      query: bestSession.query,
      answer: bestSession.answer,
      timeAgo: timeAgo(bestSession.created_at),
      sourceCount,
    };
  }

  return null;
}

module.exports = { findSimilarPastSession, tokenSimilarity, timeAgo };
