// Test for Local Library Search integration
const assert = require("assert");
const db = require("../electron/rag/db.cjs");
const { searchLibrary } = require("../electron/rag/sources/library.cjs");

(async () => {
  console.log("== Testing Local Library Search ==");

  // Initialize DB in-memory for testing
  await db.openDb();

  // Insert a test paper into library
  const testPaper = {
    title: "Groundbreaking Research on Attention Mechanisms and Transformers",
    url: "https://example.org/attention-is-all-you-need",
    authors: "Vaswani A; Shazeer N; Parmar N",
    year: 2017,
    journal: "NeurIPS",
    citation_count: 95000,
    abstract: "The dominant sequence transduction models are based on complex recurrent or convolutional neural networks. We propose the Transformer.",
    doi: "10.48550/arXiv.1706.03762",
    source_type: "paper",
    study_type: "article",
    quality: 95.0,
    retracted: 0,
  };

  db.run("DELETE FROM library WHERE url=?", [testPaper.url]);
  db.run(
    "INSERT INTO library (title, url, authors, year, journal, citation_count, abstract, doi, source_type, study_type, quality, retracted) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
    [
      testPaper.title,
      testPaper.url,
      testPaper.authors,
      testPaper.year,
      testPaper.journal,
      testPaper.citation_count,
      testPaper.abstract,
      testPaper.doi,
      testPaper.source_type,
      testPaper.study_type,
      testPaper.quality,
      testPaper.retracted,
    ],
  );

  // Search for "transformer attention mechanisms"
  const matches = await searchLibrary("transformer attention mechanisms", 5);
  console.log(`Found ${matches.length} library matches for 'transformer attention mechanisms':`);
  if (matches.length > 0) {
    console.log("Matched title:", matches[0].title);
    console.log("Provenance:", matches[0].provenance);
    console.log("Match score:", matches[0]._matchScore);
    console.log("Quality:", matches[0].quality);
  }

  assert.ok(matches.length > 0, "Expected to find the starred transformer paper in library");
  assert.strictEqual(matches[0].provenance, "library");
  assert.strictEqual(matches[0].url, testPaper.url);

  // Cleanup test paper
  db.run("DELETE FROM library WHERE url=?", [testPaper.url]);
  console.log("✔ Local Library search test passed successfully!");
})();
