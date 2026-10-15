const path = require("path");

function ragDirs(app) {
  const base = app.getPath("userData");
  const rag = path.join(base, "rag");
  return {
    base,
    rag,
    models: path.join(rag, "models"),
    data: path.join(rag, "data"),
    dbFile: path.join(rag, "data", "expozi.sqlite"),
    embedCache: path.join(rag, "embed-cache"),
  };
}

function ensureDirs(fs, dirs) {
  for (const d of [dirs.rag, dirs.models, dirs.data, dirs.embedCache]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

module.exports = { ragDirs, ensureDirs };
