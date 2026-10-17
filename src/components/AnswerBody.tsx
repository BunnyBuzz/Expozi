import type { ReactNode } from "react";

type Block = { kind: "h1" | "h2" | "h3" | "p" | "li"; text: string; marker?: string };

// Small models sometimes emit a literal "# Title" placeholder heading — hide
// it in the UI. The raw text is untouched and still what gets exported.
const PLACEHOLDER_TITLE = /^(title|report|report title|untitled|research report)$/i;

export function parseAnswer(text: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) {
      blocks.push({ kind: "p", text: para.join(" ").trim() });
      para = [];
    }
  };
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      flush();
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      flush();
      const level = h[1].length;
      const heading = h[2].trim();
      if (level === 1 && PLACEHOLDER_TITLE.test(heading)) continue;
      blocks.push({ kind: level === 1 ? "h1" : level === 2 ? "h2" : "h3", text: h[2] });
      continue;
    }
    const li = line.match(/^([-*•]|\d+\.)\s+(.*)$/);
    if (li) {
      flush();
      blocks.push({ kind: "li", text: li[2], marker: /^\d/.test(li[1]) ? li[1] : "•" });
      continue;
    }
    para.push(line);
  }
  flush();
  return blocks;
}

// Renders the assistant's markdown-lite text (headings, lists, paragraphs).
export default function AnswerBody({
  text,
  streaming,
  className,
}: {
  text: string;
  streaming: boolean;
  className?: string;
}): ReactNode {
  const blocks = parseAnswer(text);
  return (
    <div data-answer-body="true" className={className ?? "mt-5 text-[14px] leading-[1.7] text-gray-800"}>
      {blocks.map((b, i) =>
        b.kind === "h1" ? (
          <h1 key={i} className="mt-6 text-[20px] font-semibold leading-snug text-gray-900 first:mt-0">
            {b.text}
          </h1>
        ) : b.kind === "h2" ? (
          <h2 key={i} className="mt-5 text-[17px] font-semibold leading-snug text-gray-900">
            {b.text}
          </h2>
        ) : b.kind === "h3" ? (
          <h3 key={i} className="mt-4 text-[15px] font-semibold text-gray-900">
            {b.text}
          </h3>
        ) : b.kind === "li" ? (
          <div key={i} className="mt-1 flex gap-2">
            <span className="select-none text-gray-400">{b.marker ?? "•"}</span>
            <span>{b.text}</span>
          </div>
        ) : (
          <p key={i} className="mt-2.5">
            {b.text}
          </p>
        ),
      )}
      {streaming && <span className="ml-1 inline-block h-4 w-[2px] animate-pulse bg-teal-600" />}
    </div>
  );
}
