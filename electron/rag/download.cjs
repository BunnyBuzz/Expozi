const fs = require("fs");
const path = require("path");

const MODELS = {
  chat: {
    url: "https://huggingface.co/Qwen/Qwen2.5-3B-Instruct-GGUF/resolve/main/qwen2.5-3b-instruct-q4_k_m.gguf",
    name: "qwen2.5-3b-instruct-q4_k_m.gguf",
    bytes: 2000000000,
    label: "Qwen 2.5 3B Instruct (Q4)",
  },
  embedding: {
    url: "https://huggingface.co/Qwen/Qwen3-Embedding-0.6B-GGUF/resolve/main/Qwen3-Embedding-0.6B-Q8_0.gguf",
    name: "Qwen3-Embedding-0.6B-Q8_0.gguf",
    bytes: 669000000,
    label: "Qwen 3 Embedding 0.6B (Q8)",
  },
};

const MODEL_URL = MODELS.chat.url;
const MODEL_NAME = MODELS.chat.name;
const MODEL_BYTES = MODELS.chat.bytes;

let aborter = null;

async function downloadModel(destDir, onProgress) {
  return downloadModelFile("chat", destDir, onProgress);
}

async function downloadModelFile(kind, destDir, onProgress) {
  const spec = MODELS[kind] || MODELS.chat;
  const finalPath = path.join(destDir, spec.name);
  const partPath = finalPath + ".part";
  try {
    fs.rmSync(partPath, { force: true });
  } catch {
    /* noop */
  }
  aborter = new AbortController();
  const res = await fetch(spec.url, { signal: aborter.signal });
  if (!res.ok || !res.body) {
    throw new Error("Model download failed: HTTP " + res.status);
  }
  const total = Number(res.headers.get("content-length")) || spec.bytes;
  const out = fs.createWriteStream(partPath);
  let received = 0;
  try {
    for await (const chunk of res.body) {
      out.write(chunk);
      received += chunk.length;
      onProgress({ received, total });
    }
  } catch (e) {
    try {
      out.destroy();
    } catch {
      /* noop */
    }
    try {
      fs.rmSync(partPath, { force: true });
    } catch {
      /* noop */
    }
    throw e;
  }
  await new Promise((resolve, reject) => {
    out.end(() => resolve());
    out.on("error", reject);
  });
  fs.renameSync(partPath, finalPath);
  return finalPath;
}

function cancelDownload() {
  if (aborter) {
    try {
      aborter.abort();
    } catch {
      /* noop */
    }
    aborter = null;
  }
}

module.exports = { downloadModel, downloadModelFile, cancelDownload, MODELS, MODEL_URL, MODEL_NAME, MODEL_BYTES };
