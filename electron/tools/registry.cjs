// Tools layer: every capability the research pipeline uses is registered here
// as { name, description, input, run }. Every call is wrapped with tracing
// (running -> ran / skipped / failed) so the UI and logs always show what the
// agent actually did, including per-source breakdowns and skip reasons.
//
// Tool contract:
//   { name, description, input, run(input, ctx) }
//   run() resolves to one of:
//     { data, count?, detail? }            -> status "ran"
//     { data, count?, detail?, parts? }    -> status "ran"
//     { data, skipped: "reason string" }   -> status "skipped" (not an error)
//   and may throw to signal failure (re-emitted as "failed" and re-thrown).
//
// ctx (execution environment, injected by the pipeline):
//   { promptFn, keys, signal, sessionId, onStage, onToken, emit }
//
// Trace event shape (sent through ctx.emit and forwarded to the renderer):
//   { call, tool, status, detail, count, ms, parts? }
//   status: "running" | "progress" | "ran" | "skipped" | "failed"
//   parts: [{ name, status, count?, reason? }] — per-source detail for search.
// Tools may emit live progress for long loops via ctx.progress("4/13 read…");
// progress events update the same trace line in the renderer.

const tools = new Map();
let callSeq = 0;

function define(tool) {
  if (!tool || typeof tool.name !== "string" || !tool.name) {
    throw new Error("tool.name required");
  }
  if (typeof tool.description !== "string" || !tool.description) {
    throw new Error(`tool ${tool.name}: description required`);
  }
  if (typeof tool.run !== "function") {
    throw new Error(`tool ${tool.name}: run() required`);
  }
  if (tools.has(tool.name)) {
    throw new Error(`duplicate tool: ${tool.name}`);
  }
  if (!tool.input) tool.input = {};
  tools.set(tool.name, tool);
  return tool;
}

function get(name) {
  return tools.get(name);
}

function names() {
  return [...tools.keys()];
}

function list() {
  return [...tools.values()].map((t) => ({
    name: t.name,
    description: t.description,
    input: t.input,
  }));
}

function summarizeParts(parts) {
  if (!Array.isArray(parts) || parts.length === 0) return "";
  return parts
    .map((p) => {
      if (p.status === "skipped") return `${p.name} skipped (${p.reason || "unavailable"})`;
      if (p.status === "failed") return `${p.name} failed (${p.reason || "error"})`;
      return `${p.name} ${typeof p.count === "number" ? p.count : "ok"}`;
    })
    .join(" · ");
}

function throwIfAborted(signal) {
  if (signal && signal.aborted) {
    const e = new Error("aborted");
    e.name = "AbortError";
    throw e;
  }
}

function isAbortError(e) {
  return !!e && (e.name === "AbortError" || /abort/i.test(String(e.message || "")));
}

// Run one tool by name with tracing. Resolves to the tool result object
// ({ data, count, detail, parts, ... }). Throws on failure after emitting a
// "failed" trace event; abort errors keep their AbortError identity.
async function run(name, input, ctx = {}) {
  const tool = tools.get(name);
  const emit = typeof ctx.emit === "function" ? ctx.emit : () => {};
  const call = ++callSeq;
  const t0 = Date.now();

  if (!tool) {
    const e = new Error(`unknown tool: ${name}`);
    emit({ call, tool: name, status: "failed", detail: e.message, count: null, ms: 0 });
    throw e;
  }

  emit({ call, tool: name, status: "running", detail: "", count: null, ms: null });

  try {
    const callCtx = Object.assign({}, ctx, {
      progress: (detail) =>
        emit({ call, tool: name, status: "progress", detail: String(detail || ""), count: null, ms: null }),
    });
    const res = (await tool.run(input || {}, callCtx)) || {};
    const base = {
      call,
      tool: name,
      count: typeof res.count === "number" ? res.count : null,
      ms: Date.now() - t0,
      parts: res.parts,
    };
    if (res.skipped) {
      emit({ ...base, status: "skipped", detail: String(res.detail || res.skipped) });
    } else {
      let detail = String(res.detail || "");
      if (!detail) {
        const count = typeof res.count === "number" ? `${res.count} result${res.count === 1 ? "" : "s"}` : "done";
        const parts = summarizeParts(res.parts);
        detail = parts ? `${count} · ${parts}` : count;
      } else {
        const parts = summarizeParts(res.parts);
        if (parts) detail = `${detail} · ${parts}`;
      }
      emit({ ...base, status: "ran", detail });
    }
    return res;
  } catch (err) {
    emit({
      call,
      tool: name,
      status: "failed",
      detail: isAbortError(err) ? "stopped" : String((err && err.message) || err),
      count: null,
      ms: Date.now() - t0,
    });
    throw err;
  }
}

module.exports = { define, run, get, names, list, summarizeParts, throwIfAborted, isAbortError };
