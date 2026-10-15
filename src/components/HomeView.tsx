import { useState } from "react";
import {
  Search,
  FileText,
  Presentation,
  TrendingUp,
  Map,
  ChevronDown,
  Waypoints,
  BookOpen,
  ListOrdered,
  History,
} from "lucide-react";
import Composer from "./Composer";
import type { HistoryItem } from "./Sidebar";

export type HomeMode = "agent" | "report" | "review";

interface Props {
  onSubmit: (q: string) => void;
  history: HistoryItem[];
  mode: HomeMode;
  model: string;
  onModeChange: (m: HomeMode) => void;
  onAddToProject: (text: string) => void;
}

const MODES: { id: HomeMode; label: string; icon: typeof Waypoints }[] = [
  { id: "agent", label: "Research agent", icon: Waypoints },
  { id: "report", label: "Report", icon: BookOpen },
  { id: "review", label: "Systematic review", icon: ListOrdered },
];

const CHIPS = [
  { label: "Draft report", icon: FileText, preset: "Draft a report on " },
  { label: "Build deck", icon: Presentation, preset: "Build a slide deck on " },
  { label: "Find papers", icon: Search, preset: "Find papers on " },
  { label: "Strategy", icon: TrendingUp, preset: "Research strategy for " },
  { label: "Landscapes", icon: Map, preset: "Map the research landscape of " },
];

const PLACEHOLDERS: Record<HomeMode, string> = {
  agent: "Ask a research question or explore literature…",
  report: "Describe the report you want…",
  review: "Describe the systematic review you want to run…",
};

export default function HomeView({ onSubmit, history, mode, model, onModeChange, onAddToProject }: Props) {
  const [preset, setPreset] = useState<string | undefined>(undefined);
  const [menuOpen, setMenuOpen] = useState(false);
  const active = MODES.find((m) => m.id === mode) ?? MODES[0];

  return (
    <div className="flex flex-1 items-start justify-center overflow-y-auto bg-white">
      <div className="w-full max-w-[740px] px-6 pb-10 pt-[9vh]">
        {/* composer card with workflow switcher */}
        <div className="rounded-2xl border border-[#14666e] shadow-[0_16px_48px_rgba(20,102,110,0.16)]">
          <div className="relative rounded-t-[15px] bg-[#14666e] px-3.5 py-2.5">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-2 rounded-lg border border-white/40 px-3 py-1.5 text-sm font-medium text-white hover:bg-white/10"
            >
              <active.icon size={16} />
              {active.label}
              <ChevronDown size={16} className={`transition-transform ${menuOpen ? "rotate-180" : ""}`} />
            </button>
            {menuOpen && (
              <div className="absolute left-4 top-full z-30 mt-1.5 w-[300px] rounded-xl border border-gray-200 bg-white p-2 shadow-xl">
                <p className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-gray-400">
                  Workflows
                </p>
                {MODES.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      onModeChange(m.id);
                      setMenuOpen(false);
                    }}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-gray-100 ${
                      m.id === mode ? "font-medium text-teal-700" : "text-gray-700"
                    }`}
                  >
                    <m.icon size={17} />
                    {m.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-b-[15px] bg-white p-4">
            <Composer
              onSubmit={onSubmit}
              preset={preset}
              bare
              rows={5}
              model={model}
              showProject
              onAddToProject={onAddToProject}
              placeholder={PLACEHOLDERS[mode]}
              autoFocus
            />
          </div>
        </div>

        {/* quick-action chips */}
        <div className="mt-5 flex flex-wrap justify-center gap-2.5">
          {CHIPS.map((c) => (
            <button
              key={c.label}
              onClick={() => setPreset(c.preset)}
              className="flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-700 hover:border-teal-300 hover:bg-teal-50"
            >
              <c.icon size={16} className="text-gray-500" />
              {c.label}
            </button>
          ))}
        </div>

        {/* recent searches if any */}
        {history.length > 0 && (
          <div className="mt-8">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Recent</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {history.slice(0, 3).map((item, idx) => (
                <button
                  key={`${item.query}-${idx}`}
                  onClick={() => onSubmit(item.query)}
                  className="rounded-2xl border border-gray-200 bg-white p-3.5 text-left hover:border-teal-300 hover:shadow-sm transition-all"
                >
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-[12px] text-gray-600">
                    <History size={12} />
                    Search
                  </span>
                  <p className="mt-2 line-clamp-2 text-[14px] font-medium leading-snug text-gray-900">{item.query}</p>
                </button>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
