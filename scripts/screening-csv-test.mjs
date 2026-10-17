// Unit test for the screening-set exports (src/data/screening.ts): CSV column
// shape, RFC 4180 escaping, decision grouping, and the markdown sections.
// Runs straight from source — Node strips the TypeScript types.
//
// Usage: node scripts/screening-csv-test.mjs
import { screeningCsv, screeningMarkdown } from "../src/data/screening.ts";

let total = 0;
let passed = 0;
const ok = (cond, name) => {
  total++;
  if (cond) {
    passed++;
    console.log("ok -", name);
  } else {
    console.log("FAIL -", name);
    process.exitCode = 1;
  }
};

const base = { sample: "", abstract: "", summary: "", methods: "", findings: [] };
const papers = [
  {
    ...base,
    id: "a1",
    title: 'Effects of "exercise", dose-response',
    authors: ["Ada Lovelace", "Alan Turing"],
    year: 2025,
    journal: "Journal of Testing",
    citations: 12,
    doi: "10.1000/xyz",
    url: "https://example.org/a",
    studyType: "Meta-analysis",
    quality: 83.2,
    retracted: false,
  },
  {
    ...base,
    id: "b2",
    title: "Retracted trial, with commas",
    authors: ["Grace Hopper"],
    year: 2019,
    journal: "Retraction Watch",
    citations: 3,
    studyType: "RCT",
    quality: 41,
    retracted: true,
    url: "https://example.org/b",
  },
  {
    ...base,
    id: "c3",
    title: "Undecided web page",
    authors: [],
    year: null,
    journal: "",
    citations: 0,
    url: "https://example.org/c",
  },
  {
    ...base,
    id: "d4",
    title: "Excluded cohort",
    authors: ["Katherine Johnson"],
    year: 2021,
    journal: "Journal of Cohorts",
    citations: 7,
    url: "https://example.org/d",
  },
];
const decisions = {
  a1: { decision: "include", note: 'Keep: "strong", RCT\nsecond line' },
  b2: { decision: "maybe", note: null },
  d4: { decision: "exclude", note: "Off-topic" },
};

const csv = screeningCsv(papers, decisions);
ok(csv.startsWith("\uFEFF"), "CSV starts with the UTF-8 BOM");
const lines = csv.slice(1).split("\r\n");
ok(
  lines[0] === "Decision,Note,Title,Authors,Year,Journal,Citations,Study type,Quality,Retracted,DOI,URL",
  "header row has the full column set",
);
ok(lines[lines.length - 1] === "", "file ends with a trailing CRLF");
const rows = lines.slice(1, -1);
ok(rows.length === 4, "one row per source (4)");
ok(rows[0].startsWith("include,"), "include row first");
ok(rows[1].startsWith("maybe,"), "maybe row second");
ok(rows[2].startsWith("exclude,"), "exclude row third");
ok(rows[3].startsWith("undecided,"), "undecided row last (no decision key)");
ok(rows[0].includes('"Keep: ""strong"", RCT\nsecond line"'), "note with commas/quotes/newline quoted and doubled");
ok(rows[1].includes('"Retracted trial, with commas"'), "title with commas quoted");
ok(rows[1].includes(",RCT,41,yes,"), "study type, quality and retracted flag rendered");
ok(rows[1].endsWith(",https://example.org/b"), "URL column last");
ok(rows[3].includes(",0,"), "zero citations kept as 0");
ok(rows[0].includes(",83.2,"), "quality kept as number");
ok(rows[0].includes(",10.1000/xyz,"), "DOI plain (no URL prefix)");

const md = screeningMarkdown("test query", papers, decisions);
ok(
  md.includes("## Included (1)") && md.includes("## Maybe (1)") && md.includes("## Excluded (1)") && md.includes("## Undecided (1)"),
  "markdown sections grouped and counted",
);
ok(md.includes('Note: Keep: "strong", RCT'), "markdown keeps decision notes");

console.log(`\n[screening-csv] ${passed}/${total} green`);
process.exit(process.exitCode || 0);
