const fs = require("fs");

let SQL = null;
let db = null;
let dbFile = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sources (
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
  saved_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT
);
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
  } else {
    db = new SQL.Database();
    db.exec(SCHEMA);
  }
  save();
  return db;
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
