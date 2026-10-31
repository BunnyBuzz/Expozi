// Session Hybrid Index — separate from persistent index.
// Lives in-memory for the active session, accumulates chunks across follow-up
// questions without re-searching, and performs RRF-fused BM25 + vector search.
const { buildIndex, searchIndex } = require("./bm25.cjs");
const { searchVector } = require("./vector.cjs");
const { rrfFuse } = require("./rrf.cjs");

class SessionIndex {
  constructor(sessionId) {
    this.sessionId = sessionId;
    this.chunks = []; // Array of { id, text, vec, docIdx, doc, chunkIdx }
    this.sources = []; // Unique docs read in this session
    this.bm25 = null;
    this.createdAt = Date.now();
  }

  hasContent() {
    return this.chunks.length > 0;
  }

  addDocsAndChunks({ docs = [], chunks = [] }) {
    const existingUrls = new Set(this.sources.map((d) => d.url));
    for (const d of docs) {
      if (d && d.url && !existingUrls.has(d.url)) {
        existingUrls.add(d.url);
        this.sources.push(d);
      }
    }

    const startIdx = this.chunks.length;
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      this.chunks.push({
        id: startIdx + i,
        text: c.text,
        vec: c.vec || null,
        docIdx: c.docIdx,
        doc: c.doc || this.sources[c.docIdx] || null,
        chunkIdx: c.chunkIdx,
      });
    }

    // Rebuild in-memory BM25 index over accumulated chunks
    this.bm25 = buildIndex(this.chunks.map((c) => c.text));
  }

  async retrievePassages(query, embedder, topK = 20) {
    if (this.chunks.length === 0) return [];

    // 1. Lexical retrieval via BM25
    const bmResults = searchIndex(this.bm25, query, Math.min(topK * 2, this.chunks.length));
    const bmIds = bmResults.map((r) => r.id);

    // 2. Dense retrieval via Vector embeddings (when available)
    let vecIds = [];
    let qVec = null;
    const hasVectors = this.chunks.some((c) => Array.isArray(c.vec));

    if (embedder && embedder.available && hasVectors) {
      try {
        const qVecs = await embedder.embedQuery([query]);
        qVec = qVecs && qVecs[0];
        if (qVec) {
          const vecs = this.chunks.map((c) => c.vec);
          const vResults = searchVector(qVec, vecs, Math.min(topK * 2, this.chunks.length));
          vecIds = vResults.map((r) => r.i);
        }
      } catch {
        vecIds = [];
      }
    }

    // 3. RRF Fusion: 0.35 BM25 + 0.65 Vector
    let order = [];
    if (vecIds.length > 0 && bmIds.length > 0) {
      const fused = rrfFuse([bmIds, vecIds], [0.35, 0.65]);
      order = fused.map((f) => f.idx);
    } else if (vecIds.length > 0) {
      order = vecIds;
    } else {
      order = bmIds;
    }

    // Keep top K passages
    const topIndices = order.slice(0, topK);
    return topIndices.map((i) => this.chunks[i]).filter(Boolean);
  }
}

// Global active session index registry
const activeSessions = new Map();

function getSessionIndex(sessionId) {
  if (!sessionId) return null;
  return activeSessions.get(sessionId) || null;
}

function getOrCreateSessionIndex(sessionId) {
  if (!sessionId) return new SessionIndex("transient");
  let idx = activeSessions.get(sessionId);
  if (!idx) {
    idx = new SessionIndex(sessionId);
    activeSessions.set(sessionId, idx);
  }
  return idx;
}

function clearSessionIndex(sessionId) {
  if (sessionId) activeSessions.delete(sessionId);
}

module.exports = {
  SessionIndex,
  getSessionIndex,
  getOrCreateSessionIndex,
  clearSessionIndex,
};
