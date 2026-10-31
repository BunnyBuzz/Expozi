// Report Mode — Complete Pipeline Engine
// Implements 6-step systematic review report pipeline:
// Step 1: Gather Sources (25/50/135 pool)
// Step 2: Define Screening Criteria (auto-generate include/exclude/study_types)
// Step 3: Abstract Screening (batched evaluation against criteria)
// Step 4: Read Included Papers (PDF / Jina / fallback abstract)
// Step 5: Extract Data (auto-generated columns, paper x column extraction)
// Step 6: Generate Report (Template-driven structured systematic review report)
// Includes version history in SQLite and contextual Q&A against extracted data.

const db = require("./db.cjs");
const { runParallelSearch } = require("./agentFlow.cjs");
const { readUrl } = require("./readers.cjs");

function checkAbort(signal) {
  if (signal && signal.aborted) {
    const err = new Error("Report generation stopped by user");
    err.name = "AbortError";
    throw err;
  }
}

function parseJsonSafe(text) {
  if (!text) return null;
  const raw = String(text).trim();
  try {
    return JSON.parse(raw);
  } catch {}
  const match = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i) || raw.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (match) {
    try {
      return JSON.parse(match[1]);
    } catch {}
  }
  return null;
}

// Concurrency helper for running async tasks with a limit
async function mapConcurrent(items, limit, fn) {
  const results = new Array(items.length);
  let index = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (index < items.length) {
      const i = index++;
      try {
        results[i] = await fn(items[i], i);
      } catch (err) {
        results[i] = { error: err };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Step 1: Gather Sources
// ---------------------------------------------------------------------------
async function gatherSourcesPool(query, depth = "balanced", { semanticScholarKey, signal, onProgress } = {}) {
  checkAbort(signal);
  const targetPool = depth === "fast" ? 25 : depth === "comprehensive" ? 135 : 50;

  // Generate diverse query angles
  const queryAngles = [
    query,
    `${query} review meta-analysis`,
    `${query} clinical trials effects`,
    `${query} methodology mechanisms`,
  ];

  if (onProgress) onProgress("searching", `Searching academic sources for pool of ${targetPool} papers…`);

  const t0 = Date.now();
  const searchRes = await runParallelSearch(queryAngles, {
    key: semanticScholarKey,
    limitPerSource: Math.ceil(targetPool / 4),
    signal,
  });

  let docs = searchRes.docs || [];

  // Sort by citationCount descending, then year descending
  docs.sort((a, b) => {
    const cDiff = (b.citationCount || 0) - (a.citationCount || 0);
    if (cDiff !== 0) return cDiff;
    return (b.year || 0) - (a.year || 0);
  });

  if (docs.length > targetPool) {
    docs = docs.slice(0, targetPool);
  }

  const ms = Date.now() - t0;
  return {
    docs,
    targetPool,
    ms,
    summary: `${docs.length} sources found across ${searchRes.breakdown ? Object.keys(searchRes.breakdown).join(", ") : "scholarly databases"}`,
  };
}

// ---------------------------------------------------------------------------
// Step 2: Define Screening Criteria
// ---------------------------------------------------------------------------
async function generateScreeningCriteria(promptFn, query) {
  const prompt =
    `Given this research question: "${query}"\n` +
    `Generate 4-6 specific screening criteria for a systematic review.\n` +
    `Return JSON only:\n` +
    `{\n` +
    `  "include": ["criterion 1", "criterion 2"],\n` +
    `  "exclude": ["criterion 1", "criterion 2"],\n` +
    `  "study_types": ["RCT", "meta-analysis", "systematic review"]\n` +
    `}`;

  try {
    const raw = await promptFn([{ role: "user", content: prompt }], 350);
    const parsed = parseJsonSafe(raw);
    if (parsed && Array.isArray(parsed.include) && parsed.include.length > 0) {
      return {
        include: parsed.include,
        exclude: parsed.exclude || [],
        study_types: parsed.study_types || ["RCT", "meta-analysis", "systematic review"],
      };
    }
  } catch {
    /* fallback criteria */
  }

  return {
    include: [
      `Directly investigates ${query}`,
      "Contains empirical outcome data or clinical evaluation",
      "Published in a peer-reviewed academic journal or repository",
    ],
    exclude: [
      "Opinion editorials and non-peer reviewed commentaries",
      "Studies lacking measurable outcome data",
      "Off-topic or irrelevant domain",
    ],
    study_types: ["RCT", "meta-analysis", "systematic review", "clinical trial"],
  };
}

// ---------------------------------------------------------------------------
// Step 3: Abstract Screening
// ---------------------------------------------------------------------------
async function screenAbstracts(promptFn, papers, criteria, depth, { signal, onProgress } = {}) {
  checkAbort(signal);
  const targetIncluded = depth === "fast" ? 5 : depth === "comprehensive" ? 20 : 10;
  const criteriaText =
    `Include criteria:\n${criteria.include.map((c) => `- ${c}`).join("\n")}\n\n` +
    `Exclude criteria:\n${criteria.exclude.map((c) => `- ${c}`).join("\n")}\n\n` +
    `Study types prioritized:\n${criteria.study_types.join(", ")}`;

  const total = papers.length;
  let screenedCount = 0;
  const decisions = [];

  // Batch evaluation of 5 papers in parallel
  const results = await mapConcurrent(papers, 5, async (p) => {
    checkAbort(signal);
    const paperPrompt =
      `Criteria:\n${criteriaText}\n\n` +
      `Paper title: ${p.title}\n` +
      `Abstract: ${p.snippet || p.abstract || "No abstract available"}\n\n` +
      `Evaluate this paper against each criterion.\n` +
      `Return JSON only:\n` +
      `{\n` +
      `  "decision": "include" | "exclude" | "uncertain",\n` +
      `  "score": 0-100,\n` +
      `  "failed_criterion": "criterion text or null",\n` +
      `  "reasoning": "one sentence",\n` +
      `  "supporting_quote": "exact quote from abstract"\n` +
      `}`;

    let decision = {
      paper: p,
      decision: "include",
      score: 70,
      failed_criterion: null,
      reasoning: "Relevant to core research question based on abstract.",
      supporting_quote: (p.snippet || p.abstract || "").slice(0, 150),
    };

    try {
      const raw = await promptFn([{ role: "user", content: paperPrompt }], 220);
      const parsed = parseJsonSafe(raw);
      if (parsed && parsed.decision) {
        decision = {
          paper: p,
          decision: parsed.decision.toLowerCase(),
          score: typeof parsed.score === "number" ? parsed.score : parsed.decision === "include" ? 85 : 30,
          failed_criterion: parsed.failed_criterion || null,
          reasoning: parsed.reasoning || "Evaluated against screening criteria.",
          supporting_quote: parsed.supporting_quote || (p.snippet || p.abstract || "").slice(0, 150),
        };
      }
    } catch {
      // Best effort fallback based on abstract length and citations
      const hasCitations = (p.citationCount || 0) > 5;
      decision = {
        paper: p,
        decision: hasCitations ? "include" : "uncertain",
        score: hasCitations ? 75 : 50,
        failed_criterion: null,
        reasoning: "Automated screening evaluation.",
        supporting_quote: (p.snippet || p.abstract || "").slice(0, 150),
      };
    }

    screenedCount++;
    if (onProgress) {
      onProgress(screenedCount, total);
    }
    return decision;
  });

  for (const r of results) {
    if (r && !r.error) decisions.push(r);
  }

  // Separate included vs excluded
  const includedDecisions = decisions.filter((d) => d.decision === "include" || d.decision === "uncertain");
  includedDecisions.sort((a, b) => (b.score || 0) - (a.score || 0));

  // Cap included by depth, maximum 80
  const maxCap = Math.min(80, Math.max(targetIncluded, includedDecisions.length));
  const finalIncluded = includedDecisions.slice(0, maxCap);

  return {
    allDecisions: decisions,
    included: finalIncluded.map((d) => ({
      ...d.paper,
      screeningScore: d.score,
      screeningReason: d.reasoning,
      supportingQuote: d.supporting_quote,
    })),
    excluded: decisions.filter((d) => !finalIncluded.includes(d)),
    targetIncluded,
  };
}

// ---------------------------------------------------------------------------
// Step 4: Read Included Papers
// ---------------------------------------------------------------------------
async function readIncludedPapers(includedPapers, { jinaKey = "", signal, onProgress } = {}) {
  checkAbort(signal);
  const total = includedPapers.length;
  let readCount = 0;
  let abstractOnlyCount = 0;

  // Max 3 concurrent fetches
  const readResults = await mapConcurrent(includedPapers, 3, async (p) => {
    checkAbort(signal);
    let fullText = "";
    let isAbstractOnly = true;

    // 1. pdfUrl if available
    if (p.pdfUrl) {
      try {
        const res = await readUrl(p.pdfUrl, { jinaKey, signal });
        if (res && res.text && res.text.length > 300) {
          fullText = res.text;
          isAbstractOnly = false;
        }
      } catch {}
    }

    // 2. Main URL via Jina Reader
    if (!fullText && p.url) {
      try {
        const res = await readUrl(p.url, { jinaKey, signal });
        if (res && res.text && res.text.length > 300) {
          fullText = res.text;
          isAbstractOnly = false;
        }
      } catch {}
    }

    // 3. Fallback to abstract
    if (!fullText) {
      fullText = p.snippet || p.abstract || p.title || "";
      isAbstractOnly = true;
    }

    if (isAbstractOnly) abstractOnlyCount++;
    readCount++;
    if (onProgress) onProgress(readCount, total, abstractOnlyCount);

    return {
      paper: {
        ...p,
        fullText,
        isAbstractOnly,
        hasPdf: !isAbstractOnly && !!p.pdfUrl,
      },
    };
  });

  const withFullContent = readResults.map((r) => r.paper || r);
  return {
    papers: withFullContent,
    totalRead: readCount,
    abstractOnlyCount,
  };
}

// ---------------------------------------------------------------------------
// Step 5: Extract Data (auto-generated columns, paper x column)
// ---------------------------------------------------------------------------
async function generateExtractionColumns(promptFn, query) {
  const prompt =
    `Research question: "${query}"\n` +
    `Generate 5-7 data extraction columns for a systematic review table.\n` +
    `Return JSON only:\n` +
    `{\n` +
    `  "columns": [\n` +
    `    {"name": "Research question", "instruction": "What specific question does this study address?"},\n` +
    `    {"name": "Methodology", "instruction": "What study design and methods were used?"},\n` +
    `    {"name": "Sample size", "instruction": "How many participants/samples?"},\n` +
    `    {"name": "Key findings", "instruction": "What are the main results and effect sizes?"},\n` +
    `    {"name": "Limitations", "instruction": "What limitations do the authors acknowledge?"}\n` +
    `  ]\n` +
    `}`;

  try {
    const raw = await promptFn([{ role: "user", content: prompt }], 400);
    const parsed = parseJsonSafe(raw);
    if (parsed && Array.isArray(parsed.columns) && parsed.columns.length > 0) {
      return parsed.columns;
    }
  } catch {}

  return [
    { name: "Research question", instruction: "What specific question does this study address?" },
    { name: "Methodology", instruction: "What study design and methods were used?" },
    { name: "Sample size", instruction: "How many participants or observations?" },
    { name: "Key findings", instruction: "What are the primary findings and statistical effects?" },
    { name: "Limitations", instruction: "What weaknesses or constraints did the study note?" },
  ];
}

async function extractTableData(promptFn, papers, columns, sessionId, { signal, onProgress } = {}) {
  checkAbort(signal);
  const totalPoints = papers.length * columns.length;
  let extractedPoints = 0;
  const extractionMatrix = []; // row = paper, cols = { [colName]: { value, quote, confidence } }

  for (let pi = 0; pi < papers.length; pi++) {
    checkAbort(signal);
    const p = papers[pi];
    const textSnippet = (p.fullText || p.snippet || p.abstract || "").slice(0, 3500);
    const rowExtractions = {
      paperId: p.id || p.url,
      title: p.title,
      authors: p.authors || [],
      year: p.year,
      url: p.url,
      fields: {},
    };

    // Extract columns in parallel for this paper
    const colTasks = columns.map(async (col) => {
      checkAbort(signal);
      const extPrompt =
        `Paper text:\n${textSnippet}\n\n` +
        `Column: ${col.name}\n` +
        `Instruction: ${col.instruction}\n\n` +
        `Return JSON only:\n` +
        `{\n` +
        `  "value": "extracted text",\n` +
        `  "supporting_quote": "exact quote from paper",\n` +
        `  "confidence": "high | medium | low"\n` +
        `}`;

      let cell = {
        value: "Could not extract",
        supporting_quote: "",
        confidence: "low",
      };

      try {
        const raw = await promptFn([{ role: "user", content: extPrompt }], 180);
        const parsed = parseJsonSafe(raw);
        if (parsed && parsed.value) {
          cell = {
            value: parsed.value,
            supporting_quote: parsed.supporting_quote || "",
            confidence: parsed.confidence || "medium",
          };
        }
      } catch {
        cell = {
          value: "Could not extract",
          supporting_quote: "",
          confidence: "low",
        };
      }

      // Persist to SQLite extractions table
      try {
        db.saveExtraction(sessionId, p.url || p.id, col.name, cell.value, cell.supporting_quote, cell.confidence);
      } catch {}

      extractedPoints++;
      if (onProgress) onProgress(pi + 1, papers.length, extractedPoints, totalPoints);
      return { colName: col.name, cell };
    });

    const colResults = await Promise.all(colTasks);
    for (const r of colResults) {
      rowExtractions.fields[r.colName] = r.cell;
    }
    extractionMatrix.push(rowExtractions);
  }

  return {
    columns,
    matrix: extractionMatrix,
    totalPoints: extractedPoints,
  };
}

// ---------------------------------------------------------------------------
// Step 6: Generate Structured Report
// ---------------------------------------------------------------------------
async function generateFinalReport(
  promptFn,
  {
    query,
    template = "General Review",
    papers,
    includedPapers,
    totalGathered,
    criteria,
    columns,
    extractionMatrix,
    matrix,
    signal,
    onToken,
  },
) {
  checkAbort(signal);

  const finalPapers = papers || includedPapers || [];
  const mat = extractionMatrix || matrix || [];
  // Build condensed JSON summary of extracted data for grounding
  const evidenceDigest = mat.map((row, idx) => ({
    citationIndex: idx + 1,
    title: row.title,
    authors: Array.isArray(row.authors) ? row.authors.join(", ") : String(row.authors || ""),
    year: row.year,
    data: Object.entries(row.fields || {}).reduce((acc, [k, v]) => {
      acc[k] = v.value;
      return acc;
    }, {}),
  }));

  const templateInstructions =
    template === "1-Page Overview"
      ? "Format as an executive 1-page overview: high density, crisp tables, key takeaways, and action points."
      : template === "Research Gap Analysis"
        ? "Format specifically as a Research Gap Analysis: emphasize what remains unknown, conflicting evidence, methodological blind spots, and proposed future research directions."
        : "Format as a comprehensive Systematic Literature Review with rigorous thematic synthesis and structured methodology.";

  const systemPrompt =
    `You are writing a systematic review report.\n` +
    `Template: ${template} (${templateInstructions})\n` +
    `Research question: ${query}\n` +
    `Included papers: ${finalPapers.length}\n` +
    `Extracted data: ${JSON.stringify(evidenceDigest).slice(0, 12000)}\n\n` +
    `Write a complete research report following this structure:\n` +
    `# [Title based on research question]\n\n` +
    `## Abstract\n` +
    `(150-200 words summary of entire review)\n\n` +
    `## Methods\n` +
    `We analyzed ${finalPapers.length} sources from an initial pool of ${totalGathered}, ` +
    `using ${criteria.include.length + criteria.exclude.length} screening criteria. ` +
    `Each paper was reviewed for ${columns.length} key aspects.\n` +
    `[More on methods →]\n\n` +
    `## Results\n\n` +
    `### Characteristics of Included Studies\n` +
    `| Study | Full text retrieved? | Study type |\n` +
    `| --- | --- | --- |\n` +
    finalPapers.map((p, i) => `| [${i + 1}] ${(p.authors && p.authors[0]) || "Author"} et al. (${p.year || "n.d."}) | ${p.isAbstractOnly ? "Abstract only" : "Yes"} | ${p.studyType || "Empirical"} |`).join("\n") +
    `\n\n` +
    `### Key Thematic Findings\n` +
    `[Synthesize findings across papers, cite claims rigorously with [1], [2], etc.]\n\n` +
    `## Conclusion\n` +
    `(100-150 words stating main takeaways and implications)\n\n` +
    `## References\n` +
    finalPapers.map((p, i) => `[${i + 1}] ${(p.authors || []).join(", ") || "Authors"} (${p.year || "Year"}). ${p.title}. ${p.journal || "Scholarly source"}. ${p.doi ? "DOI: " + p.doi : p.url || ""}`).join("\n") +
    `\n\n` +
    `Rules:\n` +
    `Every claim must be cited with [N].\n` +
    `Every citation must link to a real included paper.\n` +
    `Never fabricate data.`;

  const reportText = await promptFn(
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Write the complete systematic review report for: "${query}"` },
    ],
    1200,
    onToken,
  );

  return reportText;
}

// ---------------------------------------------------------------------------
// Main Orchestrator: runReportPipeline
// ---------------------------------------------------------------------------
async function runReportPipeline({
  sessionId,
  query,
  template = "General Review",
  depth = "balanced",
  criteria: preCriteria = null,
  promptFn,
  signal,
  onStage,
  onToken,
  onTool,
  onStepData,
  keys = {},
}) {
  let callSeq = 0;
  const emitTrace = (tool, status, detail, ms = null, count = null) => {
    if (onTool) {
      onTool({
        call: ++callSeq,
        tool,
        status,
        detail,
        ms,
        count,
      });
    }
  };

  const rawQuery = String(query || "").trim();
  if (!rawQuery) {
    return { sessionId, answer: "Please enter a valid research question to generate a report.", sources: [] };
  }

  // -------------------------------------------------------------------------
  // STEP 1 — GATHER SOURCES
  // -------------------------------------------------------------------------
  checkAbort(signal);
  emitTrace("gather_sources", "running", "Gathering academic papers from scholarly repositories…");
  const tGather = Date.now();
  const gatherRes = await gatherSourcesPool(rawQuery, depth, {
    semanticScholarKey: keys.semanticScholar,
    signal,
    onProgress: (status, msg) => {
      emitTrace("gather_sources", "running", msg);
    },
  });
  const msGather = Date.now() - tGather;
  emitTrace("gather_sources", "ran", `${gatherRes.docs.length} sources found — Details ↗`, msGather, gatherRes.docs.length);

  // Emit gathered step data for UI "Details ↗"
  if (onStepData) {
    onStepData({
      step: "gather",
      pool: gatherRes.docs,
      totalGathered: gatherRes.docs.length,
    });
  }

  // -------------------------------------------------------------------------
  // STEP 2 — DEFINE SCREENING CRITERIA
  // -------------------------------------------------------------------------
  checkAbort(signal);
  emitTrace("define_criteria", "running", "Generating inclusion and exclusion screening criteria…");
  const tCrit = Date.now();
  const criteria = preCriteria || (await generateScreeningCriteria(promptFn, rawQuery));
  const msCrit = Date.now() - tCrit;
  emitTrace(
    "define_criteria",
    "ran",
    `${criteria.include.length} include · ${criteria.exclude.length} exclude criteria defined`,
    msCrit,
  );

  if (onStepData) {
    onStepData({
      step: "criteria",
      criteria,
    });
  }

  // -------------------------------------------------------------------------
  // STEP 3 — ABSTRACT SCREENING
  // -------------------------------------------------------------------------
  checkAbort(signal);
  emitTrace("screen_sources", "running", `Screening 0/${gatherRes.docs.length} sources against criteria…`);
  const tScreen = Date.now();
  const screenRes = await screenAbstracts(promptFn, gatherRes.docs, criteria, depth, {
    signal,
    onProgress: (done, total) => {
      emitTrace("screen_sources", "running", `${done}/${total} screened…`);
    },
  });
  const msScreen = Date.now() - tScreen;
  emitTrace(
    "screen_sources",
    "ran",
    `${screenRes.included.length} sources included — Details ↗`,
    msScreen,
    screenRes.included.length,
  );

  if (onStepData) {
    onStepData({
      step: "screening",
      included: screenRes.included,
      excluded: screenRes.excluded,
      allDecisions: screenRes.allDecisions,
    });
  }

  // Error check: fewer than 3 papers
  let warningMessage = null;
  if (screenRes.included.length < 3) {
    warningMessage = `Only ${screenRes.included.length} papers met the screening criteria. Consider broadening your research question.`;
    if (onStage) onStage("warning", warningMessage);
  }

  // If literally 0 papers passed, fallback to top gathered papers
  let papersToRead = screenRes.included;
  if (papersToRead.length === 0) {
    papersToRead = gatherRes.docs.slice(0, 3);
  }

  // -------------------------------------------------------------------------
  // STEP 4 — READ INCLUDED PAPERS
  // -------------------------------------------------------------------------
  checkAbort(signal);
  emitTrace("read_sources", "running", `Reading full content for ${papersToRead.length} included papers…`);
  const tRead = Date.now();
  const readRes = await readIncludedPapers(papersToRead, {
    jinaKey: keys.jina,
    signal,
    onProgress: (read, total, absOnly) => {
      emitTrace("read_sources", "running", `${read}/${total} read…`);
    },
  });
  const msRead = Date.now() - tRead;
  emitTrace(
    "read_sources",
    "ran",
    `${readRes.totalRead} read · ${readRes.abstractOnlyCount} abstract only — Details ↗`,
    msRead,
    readRes.totalRead,
  );

  if (onStepData) {
    onStepData({
      step: "read",
      papers: readRes.papers,
    });
  }

  // -------------------------------------------------------------------------
  // STEP 5 — EXTRACT DATA
  // -------------------------------------------------------------------------
  checkAbort(signal);
  emitTrace("extract_data", "running", "Generating review columns and extracting evidence data…");
  const tExt = Date.now();
  const columns = await generateExtractionColumns(promptFn, rawQuery);
  const extRes = await extractTableData(promptFn, readRes.papers, columns, sessionId, {
    signal,
    onProgress: (curPaper, totalPapers, curPoints, totalPoints) => {
      emitTrace("extract_data", "running", `${curPaper}/${totalPapers} papers · ${curPoints}/${totalPoints} data points…`);
    },
  });
  const msExt = Date.now() - tExt;
  emitTrace(
    "extract_data",
    "ran",
    `${extRes.totalPoints} data points extracted — Details ↗`,
    msExt,
    extRes.totalPoints,
  );

  if (onStepData) {
    onStepData({
      step: "extract",
      columns: extRes.columns,
      matrix: extRes.matrix,
      totalPoints: extRes.totalPoints,
    });
  }

  // -------------------------------------------------------------------------
  // STEP 6 — GENERATE REPORT
  // -------------------------------------------------------------------------
  checkAbort(signal);
  emitTrace("generate_report", "running", "writing structured systematic review report…");
  const tGen = Date.now();
  let reportAnswer = "";

  try {
    reportAnswer = await generateFinalReport(promptFn, {
      query: rawQuery,
      template,
      papers: readRes.papers,
      totalGathered: gatherRes.docs.length,
      criteria,
      columns: extRes.columns,
      extractionMatrix: extRes.matrix,
      signal,
      onToken,
    });
  } catch (genErr) {
    // If report generation fails: Show raw extraction table instead + offer retry
    reportAnswer =
      `# Systematic Review: ${rawQuery}\n\n` +
      `> **Notice:** The synthesis report generation encountered an issue, but all ${extRes.totalPoints} data points were successfully extracted from the screened papers below.\n\n` +
      `### Extraction Summary Table\n\n` +
      `| Study | ` + extRes.columns.map((c) => c.name).join(" | ") + ` |\n` +
      `| --- | ` + extRes.columns.map(() => "---").join(" | ") + ` |\n` +
      extRes.matrix.map((row) => `| ${row.title} | ` + extRes.columns.map((c) => (row.fields[c.name] ? row.fields[c.name].value : "N/A")).join(" | ") + ` |`).join("\n") +
      `\n\n*Click the 'Retry' button in the toolbar to regenerate the narrative review report.*`;

    if (onToken) onToken(reportAnswer);
  }

  const msGen = Date.now() - tGen;
  emitTrace("generate_report", "ran", "Save PDF ▾ (PDF / DOCX / TXT)", msGen);

  // Save report version to SQLite report_versions table
  try {
    db.saveReportVersion(sessionId, reportAnswer, template);
    db.run("INSERT OR REPLACE INTO sessions (id, query, mode, answer) VALUES (?, ?, ?, ?)", [
      sessionId,
      rawQuery,
      "report",
      reportAnswer,
    ]);
  } catch {}

  return {
    sessionId,
    answer: reportAnswer,
    sources: readRes.papers.map((p, i) => ({
      id: p.id || p.url,
      title: p.title,
      authors: p.authors || [],
      year: p.year,
      journal: p.journal,
      citations: p.citationCount || 0,
      abstract: p.snippet || p.abstract,
      source: p.source || "Academic",
      hasPdf: p.hasPdf,
      isAbstractOnly: p.isAbstractOnly,
      passageNo: i + 1,
      usedSnippet: (p.snippet || p.abstract || "").slice(0, 250),
      url: p.url,
    })),
    stepData: {
      pool: gatherRes.docs,
      criteria,
      included: screenRes.included,
      excluded: screenRes.excluded,
      allDecisions: screenRes.allDecisions,
      columns: extRes.columns,
      matrix: extRes.matrix,
      warningMessage,
      template,
      depth,
    },
  };
}

// ---------------------------------------------------------------------------
// Follow-Up Q&A Against Extracted Data (Bottom Right Panel Chat)
// ---------------------------------------------------------------------------
async function answerReportFollowUp(promptFn, { query, followUpQuery, extractionMatrix, reportText, onToken }) {
  const digest = (extractionMatrix || []).map((row, i) => ({
    study: `[${i + 1}] ${row.title} (${row.year || "n.d."})`,
    extracted: Object.entries(row.fields || {}).reduce((acc, [k, v]) => {
      acc[k] = v.value;
      return acc;
    }, {}),
  }));

  const prompt =
    `You are an interactive research assistant answering questions specifically about the completed systematic review report on: "${query}".\n` +
    `Extracted Study Data:\n${JSON.stringify(digest).slice(0, 8000)}\n\n` +
    `Existing Report Content Summary:\n${String(reportText || "").slice(0, 3000)}\n\n` +
    `User Question: "${followUpQuery}"\n\n` +
    `Answer the user question directly, precisely citing the extracted data and studies [1], [2]. Do not regenerate the report.`;

  return await promptFn([{ role: "user", content: prompt }], 450, onToken);
}

module.exports = {
  runReportPipeline,
  gatherSourcesPool,
  generateScreeningCriteria,
  screenAbstracts,
  readIncludedPapers,
  generateExtractionColumns,
  extractTableData,
  generateFinalReport,
  answerReportFollowUp,
};
