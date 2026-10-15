import { useEffect, useState } from "react";
import { Plus, FlaskConical, ArrowUp, FolderPlus, Square } from "lucide-react";

interface Props {
  onSubmit: (q: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  preset?: string;
  bare?: boolean;
  rows?: number;
  showProject?: boolean;
  model?: string;
  thinking?: boolean;
  onStop?: () => void;
  onAddToProject?: (text: string) => void;
}

export default function Composer({
  onSubmit,
  placeholder = "Ask about anything you see, update your analysis, or explore a new direction",
  autoFocus = false,
  preset,
  bare = false,
  rows = 2,
  showProject = false,
  model = "Smart",
  thinking = false,
  onStop,
  onAddToProject,
}: Props) {
  const [value, setValue] = useState("");

  useEffect(() => {
    if (preset !== undefined) setValue(preset);
  }, [preset]);

  const submit = () => {
    const t = value.trim();
    if (!t || thinking) return;
    onSubmit(t);
    setValue("");
  };

  return (
    <div className={bare ? "" : "rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_10px_36px_rgba(0,0,0,0.07)]"}>
      <textarea
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        rows={rows}
        className="w-full resize-none bg-transparent text-[15px] leading-relaxed text-gray-900 outline-none placeholder:text-gray-400"
      />
      <div className="mt-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            className="flex h-9 w-9 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100"
            title="Attach"
          >
            <Plus size={20} />
          </button>
          {showProject && (
            <button
              onClick={() => {
                const t = value.trim();
                if (t) onAddToProject?.(t);
              }}
              className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3.5 py-2 text-sm text-gray-600 hover:bg-gray-50"
            >
              <FolderPlus size={15} />
              Add to project
            </button>
          )}
        </div>
        <div className="flex items-center gap-2.5">
          <button
            className="flex items-center gap-1.5 rounded-full border border-gray-300 px-3.5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            title="Model"
          >
            <FlaskConical size={15} />
            {model}
          </button>
          {thinking ? (
            <button
              onClick={onStop}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-800 text-white hover:bg-gray-900"
              title="Stop"
            >
              <Square size={14} fill="currentColor" />
            </button>
          ) : (
            <button
              onClick={submit}
              disabled={!value.trim()}
              className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-700 text-white hover:bg-teal-800 disabled:opacity-40"
              title="Send"
            >
              <ArrowUp size={18} strokeWidth={2.2} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
