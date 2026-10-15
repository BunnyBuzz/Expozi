async function chatOpenAICompatible({ baseURL, key, model, messages, maxTokens, temperature, onToken, signal }) {
  const url = String(baseURL || "").replace(/\/$/, "") + "/chat/completions";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      "HTTP-Referer": "https://expozi.app",
      "X-Title": "Expozi",
    },
    body: JSON.stringify({
      model: model || "gpt-4o-mini",
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: maxTokens || 500,
      temperature: temperature ?? 0.3,
      stream: true,
    }),
    signal,
  });
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => "");
    throw new Error(`API HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const data = t.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const j = JSON.parse(data);
        const delta = (j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content) || "";
        if (delta) {
          full += delta;
          if (onToken) onToken(delta);
        }
      } catch {
        /* partial JSON chunk */
      }
    }
  }
  return full;
}

async function chatAnthropic({ key, model, messages, maxTokens, temperature, onToken, signal }) {
  const sys = messages.find((m) => m.role === "system");
  const rest = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: model || "claude-haiku-4-5",
      max_tokens: maxTokens || 500,
      temperature: temperature ?? 0.3,
      stream: true,
      ...(sys ? { system: sys.content } : {}),
      messages: rest,
    }),
    signal,
  });
  if (!res.ok || !res.body) {
    const t = await res.text().catch(() => "");
    throw new Error(`Anthropic HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      const t = line.trim();
      if (!t.startsWith("data:")) continue;
      const data = t.slice(5).trim();
      if (!data) continue;
      try {
        const j = JSON.parse(data);
        const text = (j.delta && j.delta.text) || "";
        if (j.type === "content_block_delta" && text) {
          full += text;
          if (onToken) onToken(text);
        }
      } catch {
        /* partial */
      }
    }
  }
  return full;
}

function resolveGeminiModel(m) {
  if (!m || m.includes("gpt") || m.includes("claude") || m.includes("llama")) return "gemini-3.5-flash";
  if (m === "gemini-2.0-flash" || m === "gemini-2.5-flash") return "gemini-3.5-flash";
  return m;
}

async function chatGemini({ key, model, messages, maxTokens, temperature, onToken, signal }) {
  const actualModel = resolveGeminiModel(model);
  const sys = messages.find((m) => m.role === "system");
  const contents = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      actualModel,
    )}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(sys ? { system_instruction: { parts: [{ text: sys.content }] } } : {}),
        contents,
        generationConfig: { maxOutputTokens: maxTokens || 500, temperature: temperature ?? 0.3 },
      }),
      signal,
    },
  );
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Gemini HTTP ${res.status}: ${t.slice(0, 200)}`);
  }
  const j = await res.json();
  const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
  const text = parts.map((p) => p.text || "").join("");
  if (onToken && text) onToken(text);
  return text;
}

async function embedOpenAICompatible({ baseURL, key, model, texts }) {
  const url = String(baseURL || "").replace(/\/$/, "") + "/embeddings";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { Authorization: `Bearer ${key}` } : {}),
      "HTTP-Referer": "https://expozi.app",
      "X-Title": "Expozi",
    },
    body: JSON.stringify({ model: model || "text-embedding-3-small", input: texts }),
    signal: AbortSignal.timeout(90000),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Embeddings HTTP ${res.status}: ${t.slice(0, 160)}`);
  }
  const j = await res.json();
  const out = ((j && j.data) || []).map((d) => d && d.embedding).filter(Boolean);
  if (out.length !== texts.length) throw new Error(`Embeddings: expected ${texts.length}, got ${out.length}`);
  return out;
}

async function embedGemini({ key, model, texts }) {
  const m = model && !model.includes("text-embedding-") ? model : "gemini-embedding-001";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:batchEmbedContents?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: texts.map((t) => ({ model: `models/${m}`, content: { parts: [{ text: t }] } })),
      }),
      signal: AbortSignal.timeout(90000),
    },
  );
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Gemini embeddings HTTP ${res.status}: ${t.slice(0, 160)}`);
  }
  const j = await res.json();
  const out = ((j && j.embeddings) || []).map((e) => e && e.values).filter(Boolean);
  if (out.length !== texts.length) throw new Error(`Embeddings: expected ${texts.length}, got ${out.length}`);
  return out;
}

async function embedComplete({ backend, baseURL, key, model, texts }) {
  switch (backend) {
    case "openai":
      return embedOpenAICompatible({ baseURL: "https://api.openai.com/v1", key, model: model || "text-embedding-3-small", texts });
    case "openai-custom":
      if (!baseURL) throw new Error("Custom endpoint needs a base URL");
      return embedOpenAICompatible({ baseURL, key, model, texts });
    case "ollama":
      return embedOpenAICompatible({ baseURL: baseURL || "http://localhost:11434/v1", key, model: model || "nomic-embed-text", texts });
    case "gemini":
      return embedGemini({ key, model, texts });
    default:
      throw new Error("This provider does not support embeddings: " + backend);
  }
}

async function chatComplete({ backend, baseURL, key, model, messages, maxTokens, temperature, onToken, signal }) {  switch (backend) {
    case "openai":
      return chatOpenAICompatible({ baseURL: "https://api.openai.com/v1", key, model, messages, maxTokens, temperature, onToken, signal });
    case "openrouter":
      return chatOpenAICompatible({ baseURL: "https://openrouter.ai/api/v1", key, model: model || "openai/gpt-4o-mini", messages, maxTokens, temperature, onToken, signal });
    case "ollama":
      return chatOpenAICompatible({ baseURL: baseURL || "http://localhost:11434/v1", key, model: model || "llama3.2", messages, maxTokens, temperature, onToken, signal });
    case "openai-custom":
      if (!baseURL) throw new Error("Custom endpoint needs a base URL");
      return chatOpenAICompatible({ baseURL, key, model, messages, maxTokens, temperature, onToken, signal });
    case "anthropic":
      return chatAnthropic({ key, model, messages, maxTokens, temperature, onToken, signal });
    case "gemini":
      return chatGemini({ key, model, messages, maxTokens, temperature, onToken, signal });
    default:
      throw new Error("Unknown chat backend: " + backend);
  }
}

module.exports = {
  chatComplete,
  chatOpenAICompatible,
  chatAnthropic,
  chatGemini,
  embedComplete,
  embedOpenAICompatible,
  embedGemini,
  EMBED_CAPABLE: ["openai", "openai-custom", "ollama", "gemini"],
};
