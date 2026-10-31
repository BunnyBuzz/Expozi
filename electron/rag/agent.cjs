// Agent loop (agent mode) — the model itself drives the research playbook by
// calling tools, one JSON step per turn:
//
//   {"tool": "scan_topic", "args": {}}      → run the tool, append to the trace
//   {"answer": "Hi! How can I help?"}       → reply directly, no research
//
// The loop keeps the real data in `state` (docs, read sources, index) and
// re-prompts with a compact transcript, so the model sees counts and titles —
// never raw page text. Auto-fill: every tool works with empty args (the loop
// injects the query, cards, perspectives, budgets), which keeps small local
// models reliable. Depth sets the step budget (lite 8 / standard 14 / deep 20).
//
// Protocol failure (the model cannot produce a single JSON object three turns
// in a row) throws an error carrying `agentFallback` — the caller then runs
// the deterministic v2 pipeline instead.
const tools = require("../tools/index.cjs");
const { cardsFromDocs, DEFAULT_PERSPECTIVE } = require("./plan.cjs");
const { orderByQuality } = require("./quality.cjs");
const { interleaveByProvenance } = require("./sources/index.cjs");

const MAX_READ = { lite: 8, standard: 12, deep: 16 };

function checkAbort(signal) {
  if (signal && signal.aborted) {
    const e = new Error("aborted");
    e.name = "AbortError";
    throw e;
  }
}

function fallbackError(reason) {
  const e = new Error(`agent loop failed (${reason})`);
  e.agentFallback = reason;
  return e;
}

function clamp(n, lo, hi) {
  n = Number(n);
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

function truncate(s, n) {
  s = String(s || "").replace(/\s+/g, " ").trim();
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

// One JSON object per turn: strip code fences, take the first balanced {...},
// retry once after removing trailing commas (small models' favourite sin).
function parseStep(raw) {
  let s = String(raw || "").trim();
  s = s.replace(/```[a-z]*/gi, "").trim();
  const start = s.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let end = -1;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end < 0) return null;
  const body = s.slice(start, end + 1);
  for (const candidate of [body, body.replace(/,\s*([}\]])/g, "$1")]) {
    try {
      const obj = JSON.parse(candidate);
      if (obj && typeof obj === "object" && !Array.isArray(obj)) return obj;
    } catch {
      /* try the repaired body */
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const TOOL_SPEC = [
  "- scan_topic — quick grounding scan across the sources. args: {}",
  "- plan_queries — plan 4-6 angled search queries from the scan. args: {}",
  "- gather_perspectives — researcher perspectives for the topic. args: {}",
  "- generate_questions — focused sub-questions per perspective. args: {}",
  "- search_papers — search + merge + dedupe. args: {\"queries\": [\"...\"]} (the ORIGINAL message must be the first query)",
  "- refine_questions — review what round 1 found, write round-2 gap queries. args: {}",
  "- search_papers (again) — search the refined queries. args: {\"queries\": [\"...\"]}",
  "- read_source — read the full text of the best sources. args: {\"urls\": [\"...\"]} — urls from the search results; if omitted, the top sources are read",
  "- index_content — chunk + embed + rank everything read. args: {}",
  "- synthesize — write the final cited answer from the indexed evidence. args: {}",
].join("\n");

function systemPrompt({ depth, maxSteps }) {
  return (
    "You are Expozi's research agent. You complete the user's message by calling ONE tool per turn.\n\n" +
    "Reply with EXACTLY ONE JSON object — no prose, no markdown, nothing else:\n" +
    '  {"tool": "<name>", "args": {...}}   to run a tool\n' +
    '  {"answer": "..."}                   to reply directly (no research)\n\n' +
    "If the message is a greeting, thanks, a question about you, or small talk: reply " +
    '{"answer": "..."} immediately. NEVER use tools for those.\n\n' +
    "For research questions, follow this playbook (skip a step only when the results make it pointless):\n" +
    "1 scan_topic · 2 plan_queries · 3 gather_perspectives · 4 generate_questions · 5 search_papers · " +
    "6 refine_questions · 7 search_papers (refined queries) · 8 read_source · 9 index_content · 10 synthesize\n\n" +
    "Tools (args may be omitted — sensible defaults are filled in):\n" +
    TOOL_SPEC +
    "\n\nRules:\n" +
    "- Use exact titles, urls and figures from tool results only. Never invent sources or numbers.\n" +
    "- For search_papers pass explicit \"queries\", with the user's original message first.\n" +
    "- After index_content the next and last step is synthesize.\n" +
    `- Depth: ${depth} — at most ${maxSteps} tool steps.\n`
  );
}

function summarize(name, res) {
  const data = res && res.data;
  const count = res && res.count != null ? res.count : null;
  switch (name) {
    case "scan_topic":
    case "search_papers": {
      const list = (data || [])
        .slice(0, 6)
        .map((d) => `"${truncate(d.title, 70)}" — ${truncate(d.url, 80)}`)
        .join("\n  ");
      return `${count == null ? (data || []).length : count} results:\n  ${list || "(none)"}`;
    }
    case "plan_queries":
    case "refine_questions":
    case "generate_questions":
      return (data || []).map((q) => `"${truncate(q, 90)}"`).join("; ") || "(none)";
    case "gather_perspectives":
      return (data || []).map((p) => truncate(p, 80)).join("; ") || "(none)";
    case "read_source":
      return res.detail || `read ${count == null ? 0 : count} sources`;
    case "index_content":
      return res.detail || `${count == null ? 0 : count} passages indexed`;
    case "synthesize":
      return `answer written (${String(data || "").length} chars)`;
    default:
      return res.detail || `${count == null ? "done" : `${count} results`}`;
  }
}

function nextHint(state) {
  if (state.searchRounds === 0) {
    if (state.grounding.length === 0) return "scan_topic";
    if (state.planned.length === 0) return "plan_queries";
    if (state.perspectives.length === 0) return "gather_perspectives";
    if (state.questions.length === 0) return "generate_questions";
    return "search_papers";
  }
  if (state.searchRounds === 1 && state.refined.length === 0) return "refine_questions";
  if (state.searchRounds === 1) return "search_papers (args.queries = the refined queries)";
  if (state.withText.length === 0) return "read_source";
  if (!state.index) return "index_content";
  return "synthesize";
}

function buildPrompt({ query, depth, maxSteps, transcript, state }) {
  let tail = [];
  let chars = 0;
  for (let i = transcript.length - 1; i >= 0 && tail.length < 12; i--) {
    chars += transcript[i].length + 1;
    if (chars > 5200) break;
    tail.unshift(transcript[i]);
  }
  return (
    systemPrompt({ depth, maxSteps }) +
    `\nUSER MESSAGE:\n${query}\n\n` +
    `STEPS SO FAR:\n${tail.length ? tail.join("\n") : "(none)"}\n\n` +
    `NEXT STEP (JSON only) — playbook suggests: ${nextHint(state)}\n`
  );
}

// ---------------------------------------------------------------------------
// Args auto-fill — the model may send empty args; the loop completes them.
// ---------------------------------------------------------------------------

function autofill(name, args, { state, query, depth, sessionId }) {
  switch (name) {
    case "scan_topic":
      args.query = args.query || query;
      args.perSource = clamp(args.perSource || 5, 3, 10);
      break;
    case "plan_queries":
      args.query = args.query || query;
      args.cards = args.cards || cardsFromDocs(state.grounding, { chars: 160, limit: 6 });
      args.max = clamp(args.max || (depth === "deep" ? 6 : 4), 2, 8);
      break;
    case "gather_perspectives":
      args.query = args.query || query;
      args.max = clamp(args.max || 3, 1, 4);
      break;
    case "generate_questions":
      args.query = args.query || query;
      if (!Array.isArray(args.perspectives) || args.perspectives.length === 0) {
        args.perspectives = state.perspectives.length ? state.perspectives : [DEFAULT_PERSPECTIVE];
      }
      if (!Array.isArray(args.asked) || args.asked.length === 0) args.asked = state.asked;
      args.cards = args.cards || cardsFromDocs(state.docs.length ? state.docs : state.grounding, { chars: 160, limit: 6 });
      args.perPerspective = clamp(args.perPerspective || 2, 1, 3);
      break;
    case "search_papers": {
      if (!Array.isArray(args.queries) || args.queries.length === 0) {
        args.queries =
          state.searchRounds === 0
            ? [query, ...state.planned, ...state.questions]
            : [query, ...(state.refined.length ? state.refined : state.planned)];
      }
      args.queries = args.queries.map(String).filter((q) => q.trim()).slice(0, 12);
      if (!args.queries.includes(query)) args.queries.unshift(query);
      args.cap = clamp(args.cap || (depth === "deep" ? 70 : depth === "lite" ? 30 : 50), 10, 120);
      args.maxQueries = clamp(args.maxQueries || 8, 1, 12);
      break;
    }
    case "refine_questions":
      args.query = args.query || query;
      args.cards = args.cards || cardsFromDocs(state.docs, { chars: 180, limit: 8 });
      if (!Array.isArray(args.asked) || args.asked.length === 0) args.asked = state.asked;
      args.max = clamp(args.max || 3, 1, 5);
      break;
    case "read_source":
      if (Array.isArray(args.urls) && args.urls.length) {
        args.docs = args.urls.map((u) => state.docs.find((d) => d.url === u) || { url: String(u) });
        delete args.urls;
      }
      if (!Array.isArray(args.docs) || args.docs.length === 0) {
        args.docs = interleaveByProvenance(state.docs).slice(0, MAX_READ[depth] || 12);
      }
      args.docs = args.docs.slice(0, 24);
      delete args.url;
      break;
    case "index_content":
      args.sessionId = sessionId;
      args.query = args.query || query;
      break;
    case "synthesize":
      break;
    default:
      break;
  }
  return args;
}

// ---------------------------------------------------------------------------
// Evidence assembly for synthesize (same numbering rules as the v2 pipeline:
// [1] is the strongest source, not whichever passage BM25 ranked first).
// ---------------------------------------------------------------------------

async function assembleEvidence(state, query, ctx, { maxPerDoc, budgetChars }) {
  const idx = state.index;
  if (idx && idx.capped && idx.capped.length) {
    const pool = (
      await tools.run(
        "select_evidence",
        { capped: idx.capped, vecRanked: idx.vecRanked, bmRanked: idx.bmRanked, maxPerDoc, budgetChars },
        ctx,
      )
    ).data;
    const qualityOf = (i) => {
      const p = idx.capped[i];
      const w = p && state.withText[p.docIdx];
      return (w && w.doc && Number(w.doc.quality)) || 0;
    };
    const sorted = [...pool].sort((a, b) => qualityOf(b) - qualityOf(a) || a - b);
    const parents = [];
    const seen = new Set();
    const lines = sorted.map((i, n) => {
      const p = idx.capped[i];
      const w = state.withText[p.docIdx];
      const d = w && w.doc;
      if (d && d.url && !seen.has(d.url)) {
        seen.add(d.url);
        parents.push(d);
      }
      return `[${n + 1}] ${String(p.text).replace(/\s+/g, " ").slice(0, 700)}`;
    });
    return { evidence: lines.join("\n\n"), parents };
  }
  // No index yet but sources were read: index them now (visible in the trace).
  if (state.withText.length) {
    const indexed = (await tools.run("index_content", { sessionId: ctx.sessionId, query }, ctx)).data;
    state.index = indexed;
    return assembleEvidence(state, query, ctx, { maxPerDoc, budgetChars });
  }
  // Nothing read: fall back to the abstracts of what search found (honest:
  // the trace shows no read/index happened, and the writer is told).
  const docs = orderByQuality(state.docs).slice(0, 8);
  if (docs.length) {
    const lines = docs.map(
      (d, i) =>
        `[${i + 1}] ${d.title || "(untitled)"}${d.year ? ` (${d.year})` : ""} — ` +
        truncate(d.abstract || d.snippet, 500),
    );
    return { evidence: lines.join("\n\n"), parents: docs, fromAbstracts: true };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------

async function runAgent({ sessionId, query, mode, promptFn, signal, onStage, onToken, onTool, maxTokens, keys, depth = "standard" }) {
  const maxSteps = depth === "deep" ? 20 : depth === "lite" ? 8 : 14;
  const ctxBase = { sessionId, query, promptFn, keys, signal, onStage, onToken, emit: onTool };
  const state = {
    grounding: [],
    planned: [],
    perspectives: [],
    questions: [],
    refined: [],
    docs: [],
    withText: [],
    index: null,
    asked: [],
    searchRounds: 0,
    lastHash: "",
    repeats: 0,
    stuck: 0,
  };
  const transcript = [];
  let parseFails = 0;

  const finishDirect = (text) => {
    const answer = String(text || "").trim();
    if (onToken) onToken(answer);
    return { sessionId, sources: [], answer };
  };

  const synthesizeNow = async () => {
    const deep = depth === "deep";
    const ev = await assembleEvidence(state, query, { ...ctxBase, state }, {
      maxPerDoc: deep ? 4 : 3,
      budgetChars: deep ? 16000 : 12000,
    });
    if (!ev) return null;
    if (ev.fromAbstracts && onStage) onStage("synthesize", "Writing the answer from the abstracts (no full text was read)…");
    const res = await tools.run(
      "synthesize",
      { query, evidence: ev.evidence, maxTokens: maxTokens || (deep ? 900 : 500) },
      { ...ctxBase, state },
    );
    return { sessionId, sources: ev.parents, answer: String(res.data || "") };
  };

  for (let step = 1; step <= maxSteps; step++) {
    checkAbort(signal);
    const prompt = buildPrompt({ query, depth, maxSteps, transcript, state });
    let raw;
    try {
      raw = await promptFn([{ role: "user", content: prompt }], 220);
    } catch (e) {
      if (e && e.name === "AbortError") throw e;
      // A model/backend failure is not a protocol failure — fall back.
      throw fallbackError(String((e && e.message) || e).slice(0, 80));
    }

    const parsed = parseStep(raw);
    if (!parsed) {
      parseFails++;
      if (parseFails >= 3) throw fallbackError("parse");
      transcript.push(`(#${step} your reply was not a single JSON object — reply ONLY with {"tool": ...} or {"answer": ...})`);
      continue;
    }
    parseFails = 0;

    if (typeof parsed.answer === "string" && parsed.answer.trim()) {
      return finishDirect(parsed.answer);
    }

    const name = typeof parsed.tool === "string" ? parsed.tool.trim() : "";
    if (!name) {
      transcript.push(`(#${step} missing "tool" — reply {"tool": "<name>", "args": {...}} or {"answer": "..."})`);
      continue;
    }
    const args = parsed.args && typeof parsed.args === "object" && !Array.isArray(parsed.args) ? { ...parsed.args } : {};

    const hash = `${name}|${JSON.stringify(args)}`;
    if (hash === state.lastHash) state.repeats++;
    else {
      state.repeats = 0;
      state.lastHash = hash;
    }
    if (state.repeats >= 2) {
      state.stuck++;
      transcript.push(`(#${step} ${name} — you already ran this exact call; use its results)`);
      if (state.stuck >= 2) {
        const done = await synthesizeNow();
        if (done) return done;
        throw fallbackError("stuck");
      }
      continue;
    }

    autofill(name, args, { state, query, depth, sessionId });

    // synthesize is special: the loop assembles the numbered evidence from the
    // run state (search → read → index) and streams the final answer.
    if (name === "synthesize") {
      const done = await synthesizeNow();
      if (done) return done;
      transcript.push(`(#${step} synthesize → ERROR: nothing indexed yet — run read_source and index_content first)`);
      continue;
    }

    let res = null;
    let err = null;
    try {
      res = await tools.run(name, args, { ...ctxBase, state });
    } catch (e) {
      if (e && e.name === "AbortError") throw e;
      err = e;
    }

    if (err) {
      transcript.push(`(#${step} ${name} → ERROR: ${truncate((err && err.message) || err, 140)})`);
      continue;
    }

    // Merge results into the state the next prompt summarises.
    const data = res.data;
    switch (name) {
      case "scan_topic":
        state.grounding = data || [];
        break;
      case "plan_queries":
        state.planned = data || [];
        break;
      case "gather_perspectives":
        state.perspectives = (data || []).length ? data : [DEFAULT_PERSPECTIVE];
        break;
      case "generate_questions":
        state.questions = data || [];
        for (const q of state.questions) state.asked.push(q);
        break;
      case "refine_questions":
        state.refined = data || [];
        break;
      case "search_papers": {
        const seen = new Set(state.docs.map((d) => d.url));
        for (const d of data || []) {
          if (d && d.url && !seen.has(d.url)) {
            seen.add(d.url);
            state.docs.push(d);
          }
        }
        for (const q of args.queries || []) state.asked.push(q);
        state.searchRounds++;
        break;
      }
      case "read_source": {
        const seen = new Set(state.withText.map((x) => x.doc && x.doc.url));
        for (const x of data || []) {
          const url = x && x.doc && x.doc.url;
          if (url && !seen.has(url)) {
            seen.add(url);
            state.withText.push(x);
          }
        }
        break;
      }
      case "index_content":
        state.index = data;
        break;
      default:
        break;
    }
    transcript.push(`#${step} ${name} → ${summarize(name, res)}`);
  }

  // Step budget exhausted: synthesize from whatever was gathered.
  const done = await synthesizeNow();
  if (done) return done;
  throw fallbackError("step limit");
}

module.exports = { runAgent, parseStep, systemPrompt, autofill };
