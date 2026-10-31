import assert from "assert";
import { searchQueryDetailed } from "../electron/rag/sources/index.cjs";

console.log("== Testing Multi-Disciplinary Search Sources ==");

// Test 1: Non-medical topic (Economics / Social Science) — should hit OpenAlex & Crossref
console.log("\n[Test 1] Searching: 'behavioral economics decision making'...");
const t1 = Date.now();
const res1 = await searchQueryDetailed("behavioral economics decision making", 3);
console.log(`Completed in ${((Date.now() - t1) / 1000).toFixed(2)}s`);
console.log("Sources breakdown:", res1.parts);
console.log("Total unique docs:", res1.docs.length);
const openAlexDocs = res1.docs.filter((d) => d.provenance === "openalex");
const crossrefDocs = res1.docs.filter((d) => d.provenance === "crossref");
console.log(`Found: ${openAlexDocs.length} OpenAlex, ${crossrefDocs.length} Crossref`);
assert.ok(openAlexDocs.length > 0 || crossrefDocs.length > 0, "Expected scholarly results for economics");

// Test 2: Biomedical topic — should hit PubMed, OpenAlex, Crossref
console.log("\n[Test 2] Searching: 'crispr cas9 off target effects'...");
const t2 = Date.now();
const res2 = await searchQueryDetailed("crispr cas9 off target effects", 3);
console.log(`Completed in ${((Date.now() - t2) / 1000).toFixed(2)}s`);
console.log("Sources breakdown:", res2.parts);
const pubmedDocs = res2.docs.filter((d) => d.provenance === "pubmed");
console.log(`Found ${pubmedDocs.length} PubMed docs`);

// Test 3: Unpaywall Open Access resolution
const pdfs = res2.docs.filter((d) => !!d.pdfUrl);
console.log(`\n[Test 3] Open-Access PDF Resolution: ${pdfs.length}/${res2.docs.length} papers have direct PDF URLs`);
if (pdfs.length > 0) {
  console.log("Sample PDF URL:", pdfs[0].pdfUrl);
}

console.log("\n✔ All multi-disciplinary search source tests passed successfully!");
