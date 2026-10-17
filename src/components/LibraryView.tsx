import { useState } from "react";
import {
  Plus,
  Upload,
  ListChecks,
  Expand,
  MessageCircle,
  FileText,
  X,
  Star,
  Rows3,
  List,
} from "lucide-react";
import type { Paper } from "../data/papers";
import { metaLine } from "../data/live";

interface Props {
  starred: Paper[];
  uploaded: string[];
  onUpload: (names: string[]) => void;
  onRemoveUpload: (index: number) => void;
  onOpenPaper: (id: string) => void;
  onToggleStar: (id: string) => void;
  onAction: (q: string) => void;
}

const ACTIONS = [
  { label: "Start systematic review", icon: ListChecks, q: "Start a systematic review of my saved papers" },
  { label: "Extract data", icon: Expand, q: "Extract key data from my saved papers" },
  { label: "Chat with papers", icon: MessageCircle, q: "What are the main findings across my saved papers?" },
];

export default function LibraryView({
  starred,
  uploaded,
  onUpload,
  onRemoveUpload,
  onOpenPaper,
  onToggleStar,
  onAction,
}: Props) {
  const [collections, setCollections] = useState<string[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");

  const hasItems = starred.length > 0 || uploaded.length > 0;

  const pickFiles = (files: FileList | null) => {
    if (!files) return;
    onUpload(Array.from(files).map((f) => f.name));
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-[#fafafa]">
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-5 py-3">
        <h1 className="text-[19px]">
          <span className="text-gray-500">Library</span>
          <span className="mx-2 text-gray-300">/</span>
          <span className="font-semibold text-gray-900">All</span>
        </h1>
        <div className="flex gap-1.5">
          <button
            onClick={() => setDensity("comfortable")}
            title="Comfortable"
            className={`rounded-lg border p-2 ${density === "comfortable" ? "border-gray-400 bg-gray-100 text-gray-800" : "border-gray-200 text-gray-400 hover:bg-gray-50"}`}
          >
            <Rows3 size={16} />
          </button>
          <button
            onClick={() => setDensity("compact")}
            title="Compact"
            className={`rounded-lg border p-2 ${density === "compact" ? "border-gray-400 bg-gray-100 text-gray-800" : "border-gray-200 text-gray-400 hover:bg-gray-50"}`}
          >
            <List size={16} />
          </button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[240px_minmax(0,1fr)_300px] gap-4 overflow-y-auto p-4">
        {/* collections */}
        <div className="h-fit rounded-xl border border-gray-200 bg-white p-2">
          <div className="rounded-lg bg-gray-200/70 px-3 py-2 text-[14px] font-medium text-gray-900">All</div>
          <div className="mt-2 flex items-center justify-between px-3 py-1 text-[14px] text-gray-500">
            Personal collections
            <button onClick={() => setAdding((a) => !a)} className="rounded p-0.5 hover:bg-gray-100" title="New collection">
              <Plus size={15} />
            </button>
          </div>
          {adding && (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && draft.trim()) {
                  setCollections((c) => [...c, draft.trim()]);
                  setDraft("");
                  setAdding(false);
                }
                if (e.key === "Escape") setAdding(false);
              }}
              placeholder="Collection name"
              className="mx-1 mt-1 w-[calc(100%-8px)] rounded-lg border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-teal-600"
            />
          )}
          {collections.map((c) => (
            <div key={c} className="mt-0.5 flex items-center justify-between rounded-lg px-3 py-1.5 text-[14px] text-gray-600 hover:bg-gray-50">
              <span className="truncate">{c}</span>
              <span className="text-xs text-gray-400">0</span>
            </div>
          ))}
          {collections.length === 0 && !adding && (
            <p className="px-3 py-2 text-[13px] text-gray-400">No collections yet.</p>
          )}
        </div>

        {/* papers */}
        <div className="slim-scroll min-h-[420px] overflow-y-auto rounded-xl border border-gray-200 bg-white">
          {!hasItems ? (
            <div className="flex h-full min-h-[420px] flex-col items-center justify-center px-8 py-12 text-center">
              <span className="grid h-20 w-20 place-items-center rounded-full bg-gray-100">
                <FileText size={30} className="text-gray-400" />
              </span>
              <p className="mt-5 text-[16px] font-medium text-gray-900">Upload papers to start using Expozi.</p>
              <p className="mt-1 max-w-[380px] text-[14px] leading-relaxed text-gray-500">
                Your library is used to store papers and research for analysis and insights.
              </p>
              <div className="mt-5 flex gap-2.5">
                <label
                  htmlFor="lib-upload"
                  className="flex cursor-pointer items-center gap-1.5 rounded-lg bg-teal-700 px-5 py-2.5 text-[15px] font-medium text-white hover:bg-teal-800"
                >
                  <Upload size={16} />
                  Upload
                </label>
                <label
                  htmlFor="lib-upload"
                  className="cursor-pointer rounded-lg border border-gray-300 px-5 py-2.5 text-[15px] text-gray-700 hover:bg-gray-50"
                >
                  Connect Zotero
                </label>
              </div>
              <input
                id="lib-upload"
                type="file"
                accept=".pdf,.txt,.md,.docx"
                multiple
                className="hidden"
                onChange={(e) => {
                  pickFiles(e.target.files);
                  e.target.value = "";
                }}
              />
            </div>
          ) : (
            <div>
              {starred.map((p) => (
                <div
                  key={p.id}
                  data-library-row={p.id}
                  onClick={() => onOpenPaper(p.id)}
                  className={`flex cursor-pointer items-start gap-2 border-b border-gray-100 last:border-0 hover:bg-gray-50 ${
                    density === "compact" ? "px-3 py-1.5" : "px-4 py-3"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className={`font-medium leading-snug text-gray-900 ${density === "compact" ? "truncate text-[13px]" : "text-[14px]"}`}>
                      {p.title}
                    </p>
                    {! (density === "compact") && (
                      <p className="mt-0.5 text-xs text-gray-500">{metaLine(p)}</p>
                    )}
                  </div>
                  <button
                    data-star={p.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleStar(p.id);
                    }}
                    className="mt-0.5 text-amber-400 hover:text-amber-500"
                    title="Remove from library"
                  >
                    <Star size={16} fill="currentColor" />
                  </button>
                </div>
              ))}
              {uploaded.map((name, i) => (
                <div
                  key={`${name}-${i}`}
                  className={`flex items-center gap-2 border-b border-gray-100 last:border-0 hover:bg-gray-50 ${
                    density === "compact" ? "px-3 py-1.5" : "px-4 py-3"
                  }`}
                >
                  <FileText size={16} className="shrink-0 text-gray-400" />
                  <p className="min-w-0 flex-1 truncate text-[14px] text-gray-800">{name}</p>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">File</span>
                  <button
                    onClick={() => onRemoveUpload(i)}
                    className="rounded p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                    title="Remove"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              <div className="flex items-center justify-between px-4 py-2.5">
                <p className="text-xs text-gray-400">
                  {starred.length} starred · {uploaded.length} uploaded
                </p>
                <label htmlFor="lib-upload-2" className="cursor-pointer text-xs font-medium text-teal-700 hover:underline">
                  + Add files
                </label>
                <input
                  id="lib-upload-2"
                  type="file"
                  accept=".pdf,.txt,.md,.docx"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    pickFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* actions */}
        <div className="h-fit rounded-xl border border-gray-200 bg-white">
          <p className="border-b border-gray-100 px-4 py-3 text-[14px] font-medium text-gray-900">New from selection</p>
          <div className="space-y-2.5 p-3">
            {ACTIONS.map((a) => (
              <button
                key={a.label}
                onClick={() => onAction(a.q)}
                className="flex w-full items-center justify-between gap-2 rounded-xl border border-gray-200 px-4 py-3 text-left text-[14px] text-gray-500 hover:border-teal-300 hover:text-gray-800"
              >
                {a.label}
                <a.icon size={17} className="shrink-0 text-gray-400" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
