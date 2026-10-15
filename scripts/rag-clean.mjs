// Remove the junk sourcing test session produced by the buggy arXiv query.
import { createRequire } from "module";
import os from "os";
import path from "path";

const require = createRequire(import.meta.url);
const db = require("../electron/rag/db.cjs");
const file = path.join(os.homedir(), "AppData", "Roaming", "expozi", "rag", "data", "expozi.sqlite");
await db.openDb(file);

const rows = db.all("SELECT id, created_at, query FROM sessions WHERE created_at >= '2026-10-15 12:50' AND query LIKE 'How does intermittent%'");
for (const r of rows) {
  db.run("DELETE FROM passages WHERE session_id=?", [r.id]);
  db.run("DELETE FROM sources WHERE session_id=?", [r.id]);
  db.run("DELETE FROM sessions WHERE id=?", [r.id]);
  console.log("deleted test session", r.created_at, JSON.stringify(r.query));
}
db.save();
console.log("remaining sessions:", db.all("SELECT created_at, query FROM sessions ORDER BY created_at DESC LIMIT 5").map((r) => `${r.created_at} ${r.query}`));
process.exit(0);
