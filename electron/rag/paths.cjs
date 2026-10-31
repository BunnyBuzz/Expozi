const fs = require("fs");
const path = require("path");

// Optional relocation pointer, kept in the DEFAULT userData folder so the app
// can always find it:  %APPDATA%\expozi\rag-location.json
//   { "ragDir": "D:\\Expozi\\data" }
// When set, ALL rag storage (models, DB, cache) lives inside that folder
// instead — dev app and installed app alike. If the folder cannot be read or
// created, the default userData location is used.
function overrideRoot(app) {
  try {
    const cfgFile = path.join(app.getPath("appData"), "expozi", "rag-location.json");
    const cfg = JSON.parse(fs.readFileSync(cfgFile, "utf8"));
    const dir =
      cfg && typeof cfg.ragDir === "string" && cfg.ragDir.trim() ? path.resolve(cfg.ragDir.trim()) : null;
    if (!dir) return null;
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  } catch {
    return null;
  }
}

function ragDirs(app) {
  const base = overrideRoot(app) || path.join(app.getPath("userData"), "rag");
  return {
    base,
    rag: base,
    models: path.join(base, "models"),
    data: path.join(base, "data"),
    dbFile: path.join(base, "data", "expozi.sqlite"),
    embedCache: path.join(base, "embed-cache"),
  };
}

function ensureDirs(fs, dirs) {
  for (const d of [dirs.rag, dirs.models, dirs.data, dirs.embedCache]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

module.exports = { ragDirs, ensureDirs };
