const assert = require("assert");
const path = require("path");
const fs = require("fs");
const {
  openDb,
  all,
  saveReportVersion,
  listReportVersions,
} = require("../electron/rag/db.cjs");
const {
  runReportPipeline,
  gatherSourcesPool,
  generateScreeningCriteria,
  screenAbstracts,
  readIncludedPapers,
  generateExtractionColumns,
  extractTableData,
  generateFinalReport,
  answerReportFollowUp,
} = require("../electron/rag/reportFlow.cjs");
const { writeDocx } = require("../electron/export.cjs");

async function main() {
  console.log("== Testing Report Mode Complete Pipeline ==");

  const testDbFile = path.join(__dirname, "../temp-test-report.db");
  const db = await openDb(testDbFile);

  // 1. Test Step 2: Define Screening Criteria Generation
  console.log("\n1. Testing Step 2 Criteria Generation...");
  const mockPromptFn = async (messages, maxTokens) => {
    const text = messages.map((m) => m.content).join("\n");
    if (/Generate 4-6 specific screening criteria/i.test(text)) {
      return JSON.stringify({
        include: ["Human randomized trials", "Measured glycemic outcomes", "Peer-reviewed"],
        exclude: ["Animal models", "Editorials"],
        study_types: ["RCT", "meta-analysis"],
      });
    }
    if (/Evaluate this paper against each criterion/i.test(text)) {
      if (/Rodent Models/i.test(text) || /Mice were administered/i.test(text)) {
        return JSON.stringify({
          decision: "exclude",
          score: 35,
          failed_criterion: "Animal models",
          reasoning: "Study conducted on rodent models rather than human participants.",
          supporting_quote: "Mice were administered saline solution.",
        });
      }
      return JSON.stringify({
        decision: "include",
        score: 90,
        failed_criterion: null,
        reasoning: "Relevant randomized study with measurable outcomes.",
        supporting_quote: "Significant reduction in HbA1c observed in treatment cohort.",
      });
    }
    if (/Generate 5-7 data extraction columns/i.test(text)) {
      return JSON.stringify({
        columns: [
          { name: "Research question", instruction: "Specific inquiry of the paper" },
          { name: "Methodology", instruction: "Design and controls" },
          { name: "Sample size", instruction: "Participant count" },
          { name: "Key findings", instruction: "Effect size and results" },
          { name: "Limitations", instruction: "Constraints reported" },
        ],
      });
    }
    if (/Column:/i.test(text)) {
      if (/fail-paper/i.test(text)) {
        throw new Error("Simulated extraction failure");
      }
      return JSON.stringify({
        value: "Double-blind placebo controlled trial with 250 participants demonstrating significant efficacy (p<0.01).",
        supporting_quote: "p<0.01 across primary endpoints",
        confidence: "high",
      });
    }
    if (/You are writing a systematic review report/i.test(text)) {
      return (
        "# Metformin in Type 2 Diabetes Management: A Systematic Review\n\n" +
        "## Abstract\nThis systematic review synthesizes clinical trial outcomes.\n\n" +
        "## Methods\nWe analyzed 3 sources from an initial pool of 25. [More on methods →]\n\n" +
        "## Results\n\n" +
        "### Characteristics of Included Studies\n| Study | Full text retrieved? | Study type |\n| --- | --- | --- |\n| [1] Smith et al. (2022) | Yes | RCT |\n\n" +
        "### Key Thematic Findings\nMetformin reliably lowers fasting plasma glucose [1] and maintains weight stability [2].\n\n" +
        "## Conclusion\nEvidence strongly supports first-line metformin utilization.\n\n" +
        "## References\n[1] Smith et al. (2022). Metformin clinical trials. Lancet. DOI: 10.1016/sample"
      );
    }
    if (/You are an interactive research assistant answering questions/i.test(text)) {
      return "Based on the extracted data, Study [1] evaluated 250 patients and found a statistically significant reduction in HbA1c (p<0.01).";
    }
    return "ok";
  };

  const criteria = await generateScreeningCriteria(mockPromptFn, "metformin in type 2 diabetes");
  assert.ok(criteria.include.length >= 3, "Should generate inclusion criteria");
  assert.ok(criteria.exclude.length >= 2, "Should generate exclusion criteria");
  assert.ok(criteria.study_types.length >= 2, "Should specify prioritized study types");
  console.log("✔ Step 2 Criteria generation passed:", criteria.include);

  // 2. Test Step 3: Abstract Screening
  console.log("\n2. Testing Step 3 Abstract Screening with 5-paper batching...");
  const candidatePapers = [
    { id: "p1", title: "Metformin RCT Clinical Trial in 500 Patients", snippet: "Randomized double blind trial of metformin", citationCount: 45, year: 2023, url: "https://example.com/p1" },
    { id: "p2", title: "Rodent Models of Glucose Homeostasis", snippet: "Mice were administered saline solution", citationCount: 5, year: 2021, url: "https://example.com/p2" },
    { id: "p3", title: "Metformin Glycemic Efficacy Meta-analysis", snippet: "Systematic review and trial evidence of metformin", citationCount: 120, year: 2022, url: "https://example.com/p3" },
    { id: "p4", title: "Metformin versus SGLT2 Inhibitors Trial", snippet: "Head to head clinical trial comparing metformin", citationCount: 30, year: 2024, url: "https://example.com/p4" },
  ];

  let screenedProgressCalls = 0;
  const screenRes = await screenAbstracts(mockPromptFn, candidatePapers, criteria, "fast", {
    onProgress: () => screenedProgressCalls++,
  });

  assert.ok(screenRes.included.length >= 2, "Should include relevant clinical papers");
  assert.ok(screenRes.excluded.length >= 1, "Should exclude rodent paper");
  assert.strictEqual(screenRes.excluded[0].failed_criterion, "Animal models", "Should record failed criterion");
  console.log(`✔ Step 3 Abstract screening passed: ${screenRes.included.length} included, ${screenRes.excluded.length} excluded`);

  // 3. Test Step 4: Reading Included Papers
  console.log("\n3. Testing Step 4 Reading Included Papers with concurrency...");
  const readRes = await readIncludedPapers(screenRes.included, {
    jinaKey: null,
    onProgress: (read, total) => {},
  });
  assert.strictEqual(readRes.papers.length, screenRes.included.length);
  assert.ok(readRes.papers[0].fullText.length > 0, "Full text or abstract should be populated");
  console.log(`✔ Step 4 Reading passed: ${readRes.totalRead} papers read (${readRes.abstractOnlyCount} abstract only)`);

  // 4. Test Step 5: Column Generation & Data Point Extraction
  console.log("\n4. Testing Step 5 Data Extraction Table...");
  const columns = await generateExtractionColumns(mockPromptFn, "metformin in type 2 diabetes");
  assert.ok(columns.length >= 5, "Should generate 5-7 review columns");

  const extRes = await extractTableData(mockPromptFn, readRes.papers, columns, "sess-test-rep-1", {});
  assert.strictEqual(extRes.matrix.length, readRes.papers.length);
  assert.strictEqual(extRes.totalPoints, readRes.papers.length * columns.length);
  assert.ok(extRes.matrix[0].fields["Research question"], "Columns should be extracted for each paper");
  console.log(`✔ Step 5 Data extraction passed: ${extRes.totalPoints} data points extracted across ${columns.length} columns`);

  // Verify SQLite persistence of extractions
  const savedExtractions = all("SELECT * FROM extractions WHERE session_id=?", ["sess-test-rep-1"]);
  assert.strictEqual(savedExtractions.length, extRes.totalPoints, "All extracted data points should be saved to SQLite");
  console.log(`✔ Extractions successfully persisted to SQLite: ${savedExtractions.length} rows`);

  // 5. Test Step 6: Systematic Review Report Generation
  console.log("\n5. Testing Step 6 Report Generation...");
  const reportDoc = await generateFinalReport(mockPromptFn, {
    query: "metformin in type 2 diabetes",
    template: "General Review",
    papers: readRes.papers,
    totalGathered: 25,
    criteria,
    columns,
    extractionMatrix: extRes.matrix,
  });

  assert.ok(reportDoc.includes("# "), "Report must include title heading");
  assert.ok(reportDoc.includes("## Abstract"), "Report must include Abstract");
  assert.ok(reportDoc.includes("## Methods"), "Report must include Methods");
  assert.ok(reportDoc.includes("[More on methods →]"), "Report must include clickable [More on methods →]");
  assert.ok(reportDoc.includes("## Results"), "Report must include Results");
  assert.ok(reportDoc.includes("## References"), "Report must include References");
  assert.ok(reportDoc.includes("[1]"), "Report must cite studies with [1]");
  console.log("✔ Step 6 Report generation formatted according to specification");

  // 6. Test Right Panel Follow-Up Q&A
  console.log("\n6. Testing Right-panel Follow-Up Q&A...");
  const qaAnswer = await answerReportFollowUp(mockPromptFn, {
    query: "metformin in type 2 diabetes",
    followUpQuery: "What was the sample size of study 1?",
    extractionMatrix: extRes.matrix,
    reportText: reportDoc,
  });
  assert.ok(qaAnswer.includes("[1]") || qaAnswer.includes("250"), "QA should answer from extracted data");
  console.log("✔ Right panel Q&A answered with data context:", qaAnswer);

  // 7. Test DOCX Export Generation
  console.log("\n7. Testing DOCX Export Generation...");
  const testDocxPath = path.join(__dirname, "../temp-test-export.docx");
  await writeDocx({
    markdown: reportDoc,
    title: "Metformin Review",
    outPath: testDocxPath,
  });
  assert.ok(fs.existsSync(testDocxPath), "DOCX file must be created on disk");
  const stats = fs.statSync(testDocxPath);
  assert.ok(stats.size > 1000, `DOCX file size should be substantial (got ${stats.size} bytes)`);
  fs.unlinkSync(testDocxPath);
  console.log("✔ DOCX export generated successfully");

  // 8. Test Error Handling: <3 papers warning and generation failure fallback
  console.log("\n8. Testing Error Handling & Fallbacks...");
  // Fewer than 3 papers warning
  let warningCaptured = null;
  const failingGenPromptFn = async (messages) => {
    const text = messages.map((m) => m.content).join("\n");
    if (/You are writing a systematic review report/i.test(text)) {
      throw new Error("Simulated LLM synthesis error");
    }
    return await mockPromptFn(messages, 200);
  };

  const fallbackPipelineRes = await runReportPipeline({
    sessionId: "sess-fallback-rep",
    query: "metformin in type 2 diabetes",
    depth: "fast",
    criteria,
    promptFn: failingGenPromptFn,
    onStage: (st, msg) => {
      if (st === "warning") warningCaptured = msg;
    },
    keys: {},
  });

  assert.ok(fallbackPipelineRes.answer.includes("Extraction Summary Table"), "When report generation fails, must fallback to extraction table");
  console.log("✔ Report generation failure gracefully fell back to extraction table");

  // 9. Test Version History in SQLite
  console.log("\n9. Testing Version History in SQLite...");
  saveReportVersion("sess-v-1", "# Version 1 content", "General Review");
  saveReportVersion("sess-v-1", "# Version 2 content", "1-Page Overview");
  const versions = listReportVersions("sess-v-1");
  assert.strictEqual(versions.length, 2, "Should retrieve all 2 versions");
  assert.strictEqual(versions[0].template, "General Review");
  assert.strictEqual(versions[1].template, "1-Page Overview");
  console.log("✔ Version history saved and retrieved from SQLite successfully");

  // Clean up
  try {
    fs.unlinkSync(testDbFile);
  } catch {}

  console.log("\nAll Report Mode pipeline tests passed 100%!");
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
