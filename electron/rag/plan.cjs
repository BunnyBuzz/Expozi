// Research planning: grounded search planning (GPT-Researcher style) and
// perspective-guided question asking (STORM style).
//
// - planQueries:       GPT-Researcher `generate_search_queries_prompt` — queries
//                      planned from a first quick scan instead of blindly.
// - genPerspectives:   STORM `persona_generator.py` (GenPersona) — lenses that
//                      together cover the topic.
// - genQuestions:      STORM `knowledge_curation.py` (AskQuestionWithPersona) —
//                      questions asked per perspective, grounded in what is
//                      already known, deduped against earlier rounds.

const DEFAULT_PERSPECTIVE =
  "General fact writer: broadly covers the basic facts about the topic.";

function extractJsonArray(raw) {
  const a = raw.indexOf("[");
  const b = raw.lastIndexOf("]");
  if (a < 0 || b <= a) throw new Error("no JSON array");
  return JSON.parse(raw.slice(a, b + 1));
}

function cleanListItem(s) {
  return String(s || "")
    .trim()
    .replace(/^\s*(?:\d+[.)]\s*|[-*•]\s*)/, "")
    .replace(/^["']|["']$/g, "")
    .replace(/,$/, "")
    .trim();
}

// Tolerant list parser: JSON arrays first, then numbered/bulleted lines —
// small local models rarely return clean JSON.
function parseList(raw, limit = 8) {
  const out = [];
  const push = (s) => {
    const t = cleanListItem(s);
    if (t.length > 3) out.push(t);
  };
  try {
    const arr = extractJsonArray(raw);
    if (Array.isArray(arr)) arr.forEach(push);
  } catch {
    /* fall through */
  }
  if (out.length === 0) {
    String(raw || "")
      .split(/\r?\n/)
      .forEach((line) => push(line));
  }
  return out.slice(0, limit);
}

function cardsFromDocs(docs, { chars = 200, limit = 8 } = {}) {
  return (docs || [])
    .slice(0, limit)
    .map((d, i) => {
      const snippet = String(d.abstract || d.snippet || "")
        .replace(/\s+/g, " ")
        .slice(0, chars);
      return `${i + 1}. ${d.title || "(untitled)"}${d.year ? ` (${d.year})` : ""}${snippet ? ` — ${snippet}` : ""}`;
    })
    .join("\n");
}

function tokensOf(s) {
  return new Set(
    String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3),
  );
}

function overlap(a, b) {
  let inter = 0;
  for (const t of b) if (a.has(t)) inter++;
  return inter / Math.max(1, Math.min(a.size, b.size));
}

function dedupeQuestions(list, asked = []) {
  const prior = asked.map(tokensOf);
  const out = [];
  for (const q of list) {
    const toks = tokensOf(q);
    if (toks.size === 0) continue;
    if (prior.some((p) => overlap(p, toks) > 0.6)) continue;
    prior.push(toks);
    out.push(q);
  }
  return out;
}

async function planQueries(promptFn, query, cardsText, n = 5) {
  try {
    const raw = await promptFn(
      [
        {
          role: "user",
          content:
            `You are a research assistant planning a literature search for the task: "${query}".\n` +
            (cardsText ? `A quick first scan already found:\n${cardsText}\n\nUse those results to target the gaps.\n` : "") +
            `Write ${n} search queries to research this task.\n` +
            "Rules: plain natural-language phrases; no search operators (site:, OR, quotes); " +
            "each query must target a different aspect or sub-topic.\n" +
            `Return ONLY a JSON array of ${n} strings.`,
        },
      ],
      300,
    );
    const list = parseList(raw, n + 2).filter((q) => q.length > 6).slice(0, n);
    if (list.length > 0) return list;
  } catch (err) {
    if (err && String(err.message || err).match(/HTTP|API|401|403|404|unauthorized|invalid key|not found/i)) {
      throw err;
    }
  }
  return [query];
}

async function genPerspectives(promptFn, query, max = 3) {
  try {
    const raw = await promptFn(
      [
        {
          role: "user",
          content:
            `You are planning a balanced research briefing on: "${query}".\n` +
            `List ${max} researcher perspectives (each a different lens, role or speciality) that together would cover this topic well — ` +
            "for example a domain expert, a methodologist, a practitioner or a critic.\n" +
            'Format each as "Label: what this perspective focuses on". One per line. No other text.',
        },
      ],
      220,
    );
    const list = parseList(raw, max).filter((p) => p.length > 5).slice(0, max);
    if (list.length > 0) return list;
  } catch (err) {
    if (err && String(err.message || err).match(/HTTP|API|401|403|404|unauthorized|invalid key|not found/i)) {
      throw err;
    }
  }
  return [];
}

async function genQuestions(promptFn, query, perspectives, asked = [], cardsText = "", perPerspective = 2) {
  const perspText = perspectives.map((p, i) => `${i + 1}. ${p}`).join("\n");
  const askedText = asked.length ? asked.map((q) => `- ${q}`).join("\n") : "(none)";
  const n = Math.max(1, perspectives.length * perPerspective);
  try {
    const raw = await promptFn(
      [
        {
          role: "user",
          content:
            `You are preparing research questions for the topic: "${query}".\n` +
            `Perspectives:\n${perspText}\n\n` +
            (cardsText ? `What is already known from a first scan:\n${cardsText}\n\n` : "") +
            `Questions already asked:\n${askedText}\n\n` +
            `Write ${perPerspective} new, specific, answerable research question(s) per perspective (${n} total). ` +
            "They must not duplicate any question already asked, must be answerable from documents, and must stay on the topic " +
            "of the task — do not introduce new populations, conditions or treatments the task does not mention.\n" +
            `Return ONLY a JSON array of ${n} strings.`,
        },
      ],
      340,
    );
    const list = parseList(raw, n + 3).filter((q) => q.length > 10).slice(0, n);
    return dedupeQuestions(list, asked);
  } catch {
    /* fall through */
  }
  return [];
}

// Review the results of the first search round and propose follow-up queries
// that fill the coverage gaps (round 2 of the search → refine → search loop).
async function refineQuestions(promptFn, query, cardsText, asked = [], n = 3) {
  const askedText = asked.length ? asked.map((q) => `- ${q}`).join("\n") : "(none)";
  try {
    const raw = await promptFn(
      [
        {
          role: "user",
          content:
            `You are reviewing the first search round for the task: "${query}".\n` +
            (cardsText ? `What the search found so far:\n${cardsText}\n\n` : "") +
            `Queries already searched:\n${askedText}\n\n` +
            `Identify up to ${n} coverage gaps (aspects, populations, methods or outcomes that the results barely cover) ` +
            "and write one new search query per gap.\n" +
            "Rules: plain natural-language phrases; no search operators (site:, OR, quotes); " +
            "must not repeat an already-searched query; must stay on the topic of the task.\n" +
            `Return ONLY a JSON array of ${n} strings.`,
        },
      ],
      300,
    );
    const list = parseList(raw, n + 2).filter((q) => q.length > 6).slice(0, n);
    return dedupeQuestions(list, asked);
  } catch (err) {
    if (err && String(err.message || err).match(/HTTP|API|401|403|404|unauthorized|invalid key|not found/i)) {
      throw err;
    }
  }
  return [];
}

module.exports = {
  DEFAULT_PERSPECTIVE,
  extractJsonArray,
  parseList,
  cardsFromDocs,
  dedupeQuestions,
  planQueries,
  genPerspectives,
  genQuestions,
  refineQuestions,
};
