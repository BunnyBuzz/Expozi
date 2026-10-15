async function testProvider(id, { key, baseURL, model }) {
  try {
    switch (id) {
      case "semantic-scholar": {
        if (!key) return { ok: false, message: "No key saved" };
        const res = await fetch(
          "https://api.semanticscholar.org/graph/v1/paper/search?query=test&limit=1&fields=title",
          { headers: { Accept: "application/json", "x-api-key": key } },
        );
        if (res.status === 200) return { ok: true, message: "Key accepted — higher rate limits active" };
        if (res.status === 429) return { ok: false, message: "Key not applied (still rate limited)" };
        return { ok: false, message: `Rejected (HTTP ${res.status})` };
      }
      case "jina": {
        if (!key) return { ok: false, message: "No key saved" };
        const res = await fetch("https://api.jina.ai/http://example.com", {
          headers: { Authorization: `Bearer ${key}` },
        });
        if (res.status === 200) return { ok: true, message: "Key accepted" };
        return { ok: false, message: `Rejected (HTTP ${res.status})` };
      }
      case "exa": {
        if (!key) return { ok: false, message: "No key saved" };
        const res = await fetch("https://api.exa.ai/search", {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-api-key": key },
          body: JSON.stringify({ query: "test", contentsLimit: 1 }),
        });
        if (res.status === 200) return { ok: true, message: "Key accepted" };
        return { ok: false, message: `Rejected (HTTP ${res.status})` };
      }
      case "tavily": {
        if (!key) return { ok: false, message: "No key saved" };
        const res = await fetch("https://api.tavily.com/search", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({ query: "test", max_results: 1 }),
        });
        if (res.status === 200) return { ok: true, message: "Key accepted" };
        return { ok: false, message: `Rejected (HTTP ${res.status})` };
      }
      case "openai":
      case "openrouter":
      case "openai-custom":
      case "ollama": {
        const base =
          baseURL ||
          (id === "ollama"
            ? "http://localhost:11434/v1"
            : id === "openrouter"
              ? "https://openrouter.ai/api/v1"
              : "https://api.openai.com/v1");
        const res = await fetch(`${base.replace(/\/$/, "")}/models`, {
          headers: key ? { Authorization: `Bearer ${key}` } : {},
        });
        if (res.status === 200) return { ok: true, message: "Endpoint reachable" };
        return { ok: false, message: `Unreachable (HTTP ${res.status})` };
      }
      case "anthropic": {
        if (!key) return { ok: false, message: "No key saved" };
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({ model: model || "claude-haiku-4-5", max_tokens: 1, messages: [{ role: "user", content: "hi" }] }),
        });
        if (res.status === 200) return { ok: true, message: "Key accepted" };
        return { ok: false, message: `Rejected (HTTP ${res.status})` };
      }
      case "gemini": {
        if (!key) return { ok: false, message: "No key saved" };
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`,
        );
        if (res.status === 200) return { ok: true, message: "Key accepted" };
        return { ok: false, message: `Rejected (HTTP ${res.status})` };
      }
      default:
        return { ok: false, message: "Unknown provider" };
    }
  } catch (e) {
    return { ok: false, message: "Network error: " + String((e && e.message) || e).slice(0, 120) };
  }
}

const PROVIDERS = [
  { id: "semantic-scholar", label: "Semantic Scholar", kind: "search", needsKey: true },
  { id: "jina", label: "Jina reader", kind: "fetch", needsKey: true },
  { id: "exa", label: "Exa search", kind: "search", needsKey: true },
  { id: "tavily", label: "Tavily search", kind: "search", needsKey: true },
  { id: "openai", label: "OpenAI", kind: "chat", needsKey: true, defaultModel: "gpt-4o-mini" },
  { id: "openrouter", label: "OpenRouter", kind: "chat", needsKey: true, defaultModel: "openai/gpt-4o-mini" },
  { id: "anthropic", label: "Anthropic", kind: "chat", needsKey: true, defaultModel: "claude-haiku-4-5" },
  { id: "gemini", label: "Google Gemini", kind: "chat", needsKey: true, defaultModel: "gemini-3.5-flash" },
  { id: "openai-custom", label: "Custom OpenAI endpoint", kind: "chat", needsKey: false, needsBaseUrl: true, defaultModel: "" },
  { id: "ollama", label: "Ollama (local server)", kind: "chat", needsKey: false, defaultBaseUrl: "http://localhost:11434/v1" },
];

module.exports = { testProvider, PROVIDERS };
