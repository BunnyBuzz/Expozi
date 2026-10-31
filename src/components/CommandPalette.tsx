import { useEffect, useMemo, useState } from "react";
import { Search, FileText, LibraryBig, Clock, Settings, Code2 } from "lucide-react";
import type { HistoryItem } from "./Sidebar";
import type { Paper } from "../data/papers";

interface Item {
  id: string;
  label: string;
  hint: string;
  icon: typeof Search;
  run: () => void;
}

interface Props {
  history: HistoryItem[];
  starred: Paper[];
  onClose: () => void;
  onSubmitSession: (q: string) => void;
  onGoLibrary: () => void;
  onGoHome: () => void;
  onOpenSettings: () => void;
  onOpenDevTools: () => void;
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded-md border border-gray-200 bg-gray-50 px-1.5 py-0.5 font-sans text-[12px] text-gray-500">
      {children}
    </kbd>
  );
}

export default function CommandPalette({
  history,
  starred,
  onClose,
  onSubmitSession,
  onGoLibrary,
  onGoHome,
  onOpenSettings,
  onOpenDevTools,
}: Props) {
  const [text, setText] = useState("");
  const [active, setActive] = useState(0);

  const sessions = useMemo(() => history.slice(0, 6), [history]);
  void starred;

  const q = text.trim().toLowerCase();
  const sess: Item[] = sessions
    .filter((s) => !q || s.query.toLowerCase().includes(q))
    .map((s, i) => ({
      id: `s-${i}`,
      label: s.query,
      hint: "Session",
      icon: FileText,
      run: () => onSubmitSession(s.query),
    }));
  const cmds: Item[] = (
    [
      { id: "lib", label: "Go to Library", icon: LibraryBig, run: onGoLibrary },
      { id: "home", label: "Go to Recent sessions", icon: Clock, run: onGoHome },
      { id: "set", label: "Go to Settings", icon: Settings, run: onOpenSettings },
      { id: "dev", label: "Go to Developer", icon: Code2, run: onOpenDevTools },
    ] as Item[]
  ).filter((c) => !q || c.label.toLowerCase().includes(q));

  const items = [...sess, ...cmds];
  useEffect(() => setActive(0), [text]);

  const row = (item: Item, index: number) => (
    <button
      key={item.id}
      onMouseEnter={() => setActive(index)}
      onClick={() => item.run()}
      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ${
        active === index ? "bg-gray-100" : ""
      }`}
    >
      <item.icon size={18} className="shrink-0 text-gray-500" />
      <span className="min-w-0 flex-1 truncate text-[16px] text-gray-900">{item.label}</span>
      {item.hint && <span className="shrink-0 text-sm text-gray-400">{item.hint}</span>}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/40 p-6 pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-[880px] overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-gray-200 px-5 py-4">
          <Search size={20} className="shrink-0 text-gray-400" />
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, items.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              } else if (e.key === "Enter") {
                const it = items[active];
                if (it) it.run();
                else if (text.trim()) onSubmitSession(text.trim());
              } else if (e.key === "Escape") {
                onClose();
              }
            }}
            placeholder="Search sessions, library, or type a command…"
            className="flex-1 bg-transparent text-[17px] text-gray-900 outline-none placeholder:text-gray-400"
          />
        </div>

        <div className="slim-scroll max-h-[46vh] overflow-y-auto p-2">
          {sess.length > 0 && (
            <p className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-gray-400">Recent</p>
          )}
          {sess.map((s, i) => row(s, i))}
          {cmds.length > 0 && (
            <p className="px-3 pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-gray-400">Go to</p>
          )}
          {cmds.map((c, j) => row(c, sess.length + j))}
          {items.length === 0 && text.trim() && (
            <button
              onClick={() => onSubmitSession(text.trim())}
              className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-gray-100"
            >
              <Search size={18} className="shrink-0 text-gray-500" />
              <span className="text-[16px] text-gray-900">Research “{text.trim()}”</span>
            </button>
          )}
          {items.length === 0 && !text.trim() && (
            <p className="px-4 py-6 text-center text-sm text-gray-400">No sessions yet.</p>
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-gray-200 px-5 py-3 text-[13px] text-gray-500">
          <span className="flex items-center gap-1.5">
            <Kbd>↑</Kbd>
            <Kbd>↓</Kbd> navigate
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↵</Kbd> open
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>esc</Kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
