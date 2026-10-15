import { useEffect, useRef, useState } from "react";
import { Plus, Search, Clock, CalendarDays, LibraryBig, FolderPlus, FileStack, Settings } from "lucide-react";

export type NavView = "home" | "workspace" | "library" | "routines";

export interface HistoryItem {
  query: string;
  count: number;
}

interface Props {
  view: NavView;
  history: HistoryItem[];
  userName: string;
  userEmail: string;
  onSignOut: () => void;
  onOpenSearch: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onNavigate: (v: NavView) => void;
  onNew: () => void;
  onSelectHistory: (query: string) => void;
  onOpenSettings: () => void;
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function ElicitMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden>
      <path d="M13 2 23 7.5 13 13 3 7.5 13 2Z" fill="#0f766e" />
      <path d="M3 12.5 13 18l10-5.5v4L13 22 3 16.5v-4Z" fill="#0f766e" opacity="0.75" />
      <path d="M3 17.5 13 23l10-5.5v1L13 24 3 18.5v-1Z" fill="#0f766e" opacity="0.5" />
    </svg>
  );
}

export default function Sidebar({ view, history, userName, userEmail, onSignOut, onOpenSearch, collapsed, onToggleCollapse, onNavigate, onNew, onSelectHistory, onOpenSettings }: Props) {
  const [width, setWidth] = useState(() => {
    const saved = Number(localStorage.getItem("expozi-sidebar-w"));
    return saved >= 200 && saved <= 420 ? saved : 272;
  });
  const drag = useRef<{ x: number; w: number } | null>(null);

  useEffect(() => {
    const move = (e: MouseEvent) => {
      if (!drag.current) return;
      const w = Math.min(420, Math.max(200, drag.current.w + e.clientX - drag.current.x));
      setWidth(w);
      try {
        localStorage.setItem("expozi-sidebar-w", String(Math.round(w)));
      } catch {
        /* noop */
      }
    };
    const up = () => {
      drag.current = null;
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, []);

  if (collapsed) {
    return (
      <aside className="flex w-16 shrink-0 flex-col items-center border-r border-gray-200 bg-white py-4">
        <ElicitMark />
        <button onClick={onToggleCollapse} className="mt-4 rounded-lg p-2 text-gray-500 hover:bg-gray-100" title="Expand sidebar">
          <FileStack size={18} />
        </button>
        <button onClick={onOpenSettings} className="mt-1 rounded-lg p-2 text-gray-500 hover:bg-gray-100" title="Settings">
          <Settings size={18} />
        </button>
      </aside>
    );
  }

  const nav = [
    { id: "home" as NavView, label: "New", icon: Plus, action: onNew, active: view === "home" },
    { id: "home" as NavView, label: "Search", icon: Search, action: onOpenSearch, active: false },
    { id: "workspace" as NavView, label: "Recents", icon: Clock, action: () => onNavigate("home"), active: false },
    { id: "routines" as NavView, label: "Routines", icon: CalendarDays, action: () => onNavigate("routines"), active: view === "routines" },
    { id: "library" as NavView, label: "Library", icon: LibraryBig, action: () => onNavigate("library"), active: view === "library" },
  ];

  return (
    <aside className="relative flex shrink-0 flex-col border-r border-gray-200 bg-white" style={{ width }}>
      <div
        onMouseDown={(e) => {
          drag.current = { x: e.clientX, w: width };
          document.body.style.cursor = "col-resize";
        }}
        className="absolute -right-1 top-0 z-10 h-full w-2 cursor-col-resize"
        title="Drag to resize sidebar"
      />
      <div className="flex items-center justify-between px-4 pb-2 pt-4">
        <div className="flex items-center gap-2">
          <ElicitMark />
          <span className="text-[18px] font-bold tracking-tight text-teal-800">Expozi</span>
        </div>
        <button onClick={onToggleCollapse} className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100" title="Collapse sidebar">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect x="1.5" y="2.5" width="15" height="13" rx="2" />
            <line x1="11" y1="2.5" x2="11" y2="15.5" />
          </svg>
        </button>
      </div>

      <nav className="px-3 pt-1">
        {nav.map((item) => (
          <button
            key={item.label}
            onClick={item.action}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[14px] text-gray-800 hover:bg-gray-100 ${
              item.active ? "bg-gray-200/70 font-medium" : ""
            }`}
          >
            <item.icon size={19} strokeWidth={1.8} className="text-gray-700" />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="mt-5 px-5 text-[12px] font-semibold uppercase tracking-[0.08em] text-gray-400">Projects</div>
      <div className="px-3 pt-1">
        <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-[14px] text-gray-800 hover:bg-gray-100">
          <FolderPlus size={19} strokeWidth={1.8} className="text-gray-700" />
          New project
        </button>
      </div>

      <div className="mt-5 px-5 text-[12px] font-semibold uppercase tracking-[0.08em] text-gray-400">Recents</div>
      <div className="slim-scroll mt-1 min-h-0 flex-1 overflow-y-auto px-3">
        {history.length === 0 && <p className="px-3 py-2 text-sm text-gray-400">No searches yet.</p>}
        {history.map((h, i) => (
          <button
            key={`${h.query}-${i}`}
            onClick={() => onSelectHistory(h.query)}
            className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[14px] text-gray-800 hover:bg-gray-100 ${
              i === 0 && view === "workspace" ? "bg-gray-200" : ""
            }`}
            title={h.query}
          >
            <FileStack size={18} strokeWidth={1.8} className="shrink-0 text-gray-600" />
            <span className="truncate">{h.query}</span>
          </button>
        ))}
      </div>

      <div className="p-3">
        <div className="rounded-lg bg-teal-50 py-2 text-center text-[13px] font-medium text-teal-700">
          Trial • 2 days left
        </div>
        <div className="mt-1 flex items-center gap-1">
          <button onClick={onSignOut} title={`Signed in as ${userEmail} — click to sign out`} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-gray-100">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-700 text-xs font-semibold text-white">
              {initials(userName)}
            </span>
            <span className="flex-1 truncate text-[14px] text-gray-800">{userName}</span>
          </button>
          <button
            onClick={onOpenSettings}
            title="Settings"
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
          >
            <Settings size={18} />
          </button>
        </div>
      </div>
    </aside>
  );
}
