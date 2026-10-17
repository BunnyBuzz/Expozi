const fs = require("fs");

let SQL = null;
let db = null;
let dbFile = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  title TEXT,
  url TEXT,
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
  study_type TEXT,
  quality REAL,
  retracted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(session_id, url)
);
CREATE TABLE IF NOT EXISTS passages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER REFERENCES sources(id) ON DELETE CASCADE,
  session_id TEXT,
  chunk_index INTEGER,
  text TEXT,
  embedding TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_passages_session ON passages(session_id);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  query TEXT,
  mode TEXT,
  project_id INTEGER REFERENCES projects(id),
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS library (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT,
  url TEXT UNIQUE,
  authors TEXT,
  year INTEGER,
  journal TEXT,
  citation_count INTEGER DEFAULT 0,
  abstract TEXT,
  doi TEXT,
  source_type TEXT,
  study_type TEXT,
  quality REAL,
  retracted INTEGER DEFAULT 0,
  saved_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE TABLE IF NOT EXISTS screening (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  url TEXT,
  decision TEXT,
  note TEXT,
  suggested TEXT,
  reason TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(session_id, url)
);
CREATE INDEX IF NOT EXISTS idx_screening_session ON screening(session_id);
CREATE TABLE IF NOT EXISTS embed_cache (
  hash TEXT PRIMARY KEY,
  dim INTEGER,
  vec TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
`;

async function openDb(file) {
  if (db) return db;
  dbFile = file;
  if (!SQL) {
    const initSqlJs = require("sql.js");
    SQL = await initSqlJs();
  }
  if (fs.existsSync(file)) {
    db = new SQL.Database(fs.readFileSync(file));
    db.exec(SCHEMA);
    migrateSources(db);
  } else {
    db = new SQL.Database();
    db.exec(SCHEMA);
  }
  // Older databases predate the enrichment columns — add what's missing.
  ensureColumns(db, "sources", [
    ["study_type", "TEXT"],
    ["quality", "REAL"],
    ["retracted", "INTEGER DEFAULT 0"],
  ]);
  ensureColumns(db, "library", [
    ["doi", "TEXT"],
    ["source_type", "TEXT"],
    ["study_type", "TEXT"],
    ["quality", "REAL"],
    ["retracted", "INTEGER DEFAULT 0"],
  ]);
  save();
  return db;
}

// Add columns that a database created by an older schema is missing.
function ensureColumns(database, table, cols) {
  try {
    const info = database.exec(`PRAGMA table_info(${table})`);
    const have = new Set((info[0] ? info[0].values.map((v) => v[1]) : []).map(String));
    for (const [name, type] of cols) {
      if (!have.has(name)) database.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
    }
  } catch {
    /* a failed column add must never keep the app from opening */
  }
}

// Older databases had `url TEXT UNIQUE` on sources, so INSERT OR IGNORE dropped
// any source URL already seen in an earlier session — a later session could no
// longer list its own rows. Rebuild as per-session unique, preserving ids and
// data (passages keep their source_id references; FK enforcement is off).
function migrateSources(database) {
  try {
    const res = database.exec("SELECT sql FROM sqlite_master WHERE type='table' AND name='sources'");
    const sql = (res[0] && res[0].values[0] && res[0].values[0][0]) || "";
    if (!sql || !/url\s+TEXT\s+UNIQUE/i.test(sql)) return;
    database.exec(`
      CREATE TABLE IF NOT EXISTS sources_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        title TEXT,
        url TEXT,
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
        created_at TEXT DEFAULT (datetime('now')),
        UNIQUE(session_id, url)
      );
      INSERT OR IGNORE INTO sources_v2 (id, session_id, title, url, authors, year, journal, doi, citations, source_type, abstract, content, research_question, methodology, sample_size, key_findings, limitations, created_at)
        SELECT id, session_id, title, url, authors, year, journal, doi, citations, source_type, abstract, content, research_question, methodology, sample_size, key_findings, limitations, created_at FROM sources;
      DROP TABLE sources;
      ALTER TABLE sources_v2 RENAME TO sources;
    `);
  } catch {
    /* keep the old table if the rebuild fails for any reason */
  }
}

function save() {
  if (db && dbFile) {
    fs.writeFileSync(dbFile, Buffer.from(db.export()));
  }
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function run(sql, params = []) {
  db.run(sql, params);
  save();
  return db.getRowsModified();
}

// Run many statements of the same shape, then persist once (avoids one full
// DB export per statement).
function runMany(sql, paramsList) {
  for (const params of paramsList) db.run(sql, params);
  save();
  return db.getRowsModified();
}

module.exports = { openDb, all, run, runMany, save };
