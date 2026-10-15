const db = require("./db.cjs");

function kvGet(key) {
  try {
    const row = db.all("SELECT value FROM kv WHERE key=?", [key])[0];
    return row ? row.value : null;
  } catch {
    return null;
  }
}

function kvSet(key, value) {
  db.run("INSERT INTO kv (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [
    key,
    value,
  ]);
}

function kvDel(key) {
  try {
    db.run("DELETE FROM kv WHERE key=?", [key]);
  } catch {
    /* noop */
  }
}

const keyOf = (provider) => `apikey:${provider}`;

function setKey(provider, key) {
  kvSet(keyOf(provider), String(key || ""));
}

function getKey(provider) {
  return kvGet(keyOf(provider)) || "";
}

function deleteKey(provider) {
  kvDel(keyOf(provider));
}

function mask(key) {
  if (!key) return "";
  if (key.length <= 8) return "••••••••";
  return "••••" + key.slice(-4);
}

module.exports = { setKey, getKey, deleteKey, mask, kvGet, kvSet };
