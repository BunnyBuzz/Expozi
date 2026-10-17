// Verifies the sources per-session migration: an old-shape DB (url UNIQUE) is
// rebuilt by openDb with ids/data/passages preserved, the same URL can live in
// two sessions, and duplicates within one session are still ignored.
// Usage: node scripts/db-migrate-test.cjs
const fs = require("fs");
const os = require("os");
const path = require("path");

(async () => {
  const initSqlJs = require("sql.js");
  const SQL = await initSqlJs();
  const f = path.join(os.tmpdir(), `expozi-migrate-${Date.now()}.sqlite`);
  const old = new SQL.Database();
  old.exec(`
    CREATE TABLE sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT,
      title TEXT,
      url TEXT UNIQUE,
      authors TEXT,
      year INTEGER,
      journal TEXT,
      doi TEXT,
      citations INTEGER DEFAULT 0,
      source_type TEXT DEFAULT 'paper',
      abstract TEXT,
      content TEXT,
      research_question TEXT,
      methodology TEXT,
      sample_size TEXT,
      key_findings TEXT,
      limitations TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE passages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER REFERENCES sources(id) ON DELETE CASCADE,
      session_id TEXT,
      chunk_index INTEGER,
      text TEXT,
      embedding TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE sessions (
      id TEXT PRIMARY KEY,
      query TEXT,
      mode TEXT,
      project_id INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  old.run("INSERT INTO sources (session_id, title, url, authors, year) VALUES ('s1', 'Paper A', 'https://example.org/a', 'X; Y', 2024)");
  old.run("INSERT INTO passages (source_id, session_id, chunk_index, text) VALUES (1, 's1', 0, 'hello passage')");
  fs.writeFileSync(f, Buffer.from(old.export()));

  const dbm = require("../electron/rag/db.cjs");
  await dbm.openDb(f);

  const after = dbm.all("SELECT id, session_id, title, url, authors, year FROM sources");
  console.log("after open — sources:", JSON.stringify(after));
  console.log("passages intact:", JSON.stringify(dbm.all("SELECT id, source_id, text FROM passages")));

  const shape = dbm.all("SELECT sql FROM sqlite_master WHERE type='table' AND name='sources'")[0].sql;
  console.log("new shape has UNIQUE(session_id, url):", /UNIQUE\(session_id, url\)/i.test(shape), "| old UNIQUE(url) gone:", !/url\s+TEXT\s+UNIQUE/i.test(shape));

  const srcCols = dbm.all("PRAGMA table_info(sources)").map((c) => c.name);
  const libCols = dbm.all("PRAGMA table_info(library)").map((c) => c.name);
  const srcOk = ["study_type", "quality", "retracted"].every((c) => srcCols.includes(c));
  const libOk = ["doi", "source_type", "study_type", "quality", "retracted"].every((c) => libCols.includes(c));
  console.log("sources enrichment columns added:", srcOk, "| library badge columns present:", libOk);

  dbm.run("UPDATE sources SET study_type='rct', quality=61.5, retracted=0 WHERE id=1");
  const enriched = dbm.all("SELECT study_type, quality, retracted FROM sources WHERE id=1")[0];
  console.log("enrichment roundtrip:", JSON.stringify(enriched));

  dbm.run("INSERT INTO sources (session_id, title, url) VALUES ('s2', 'Paper A again', 'https://example.org/a')");
  console.log("same url in two sessions:", JSON.stringify(dbm.all("SELECT session_id, url FROM sources ORDER BY id")));

  dbm.run("INSERT OR IGNORE INTO sources (session_id, title, url) VALUES ('s2', 'dup', 'https://example.org/a')");
  const n = dbm.all("SELECT COUNT(*) AS n FROM sources")[0].n;
  console.log("dup within one session ignored:", n === 2, `(rows: ${n})`);

  const ok =
    after.length === 1 &&
    after[0].id === 1 &&
    after[0].session_id === "s1" &&
    after[0].authors === "X; Y" &&
    n === 2 &&
    /UNIQUE\(session_id, url\)/i.test(shape) &&
    srcOk &&
    libOk &&
    enriched.study_type === "rct" &&
    enriched.quality === 61.5;
  console.log(ok ? "MIGRATION OK" : "MIGRATION FAILED");
  fs.unlinkSync(f);
  process.exit(ok ? 0 : 1);
})().catch((e) => {
  console.error("migration test error:", e);
  process.exit(1);
});
