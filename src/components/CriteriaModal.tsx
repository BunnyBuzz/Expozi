import { useState } from "react";
import { Plus, Trash2, Check, X, Filter } from "lucide-react";
import type { ScreeningCriteria } from "../rag";

interface Props {
  query: string;
  initialCriteria?: ScreeningCriteria;
  onConfirm: (criteria: ScreeningCriteria) => void;
  onCancel: () => void;
}

export default function CriteriaModal({ query, initialCriteria, onConfirm, onCancel }: Props) {
  const [include, setInclude] = useState<string[]>(
    initialCriteria?.include || [
      `Directly investigates ${query}`,
      "Contains empirical outcome data or clinical evaluation",
      "Published in a peer-reviewed academic journal or repository",
    ],
  );

  const [exclude, setExclude] = useState<string[]>(
    initialCriteria?.exclude || [
      "Opinion editorials and non-peer reviewed commentaries",
      "Studies lacking measurable outcome data",
      "Off-topic or irrelevant domain",
    ],
  );

  const [studyTypes, setStudyTypes] = useState<string[]>(
    initialCriteria?.study_types || ["RCT", "meta-analysis", "systematic review", "clinical trial"],
  );

  const [newInclude, setNewInclude] = useState("");
  const [newExclude, setNewExclude] = useState("");
  const [newType, setNewType] = useState("");

  const addInclude = () => {
    const t = newInclude.trim();
    if (t && !include.includes(t)) {
      setInclude([...include, t]);
      setNewInclude("");
    }
  };

  const addExclude = () => {
    const t = newExclude.trim();
    if (t && !exclude.includes(t)) {
      setExclude([...exclude, t]);
      setNewExclude("");
    }
  };

  const addType = () => {
    const t = newType.trim();
    if (t && !studyTypes.includes(t)) {
      setStudyTypes([...studyTypes, t]);
      setNewType("");
    }
  };

  const handleConfirm = () => {
    onConfirm({
      include: include.filter(Boolean),
      exclude: exclude.filter(Boolean),
      study_types: studyTypes.filter(Boolean),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4">
      <div className="flex h-[82vh] w-full max-w-[700px] flex-col rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-gray-100 px-6">
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-teal-600" />
            <span className="text-base font-bold text-gray-900">Define Screening Criteria (Step 2)</span>
          </div>
          <button onClick={onCancel} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 slim-scroll">
          <div className="rounded-xl bg-teal-50/70 p-3.5 border border-teal-100">
            <p className="text-xs font-semibold text-teal-900">Research Question</p>
            <p className="mt-1 text-sm text-teal-950 font-medium">{query}</p>
          </div>

          {/* Inclusion Criteria */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                Inclusion Criteria ({include.length})
              </label>
            </div>
            <div className="space-y-2">
              {include.map((crit, idx) => (
                <div key={idx} className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 shrink-0" />
                  <input
                    type="text"
                    value={crit}
                    onChange={(e) => {
                      const updated = [...include];
                      updated[idx] = e.target.value;
                      setInclude(updated);
                    }}
                    className="flex-1 bg-transparent text-xs text-gray-900 outline-none font-medium"
                  />
                  <button
                    onClick={() => setInclude(include.filter((_, i) => i !== idx))}
                    className="text-gray-400 hover:text-rose-600 p-1 rounded"
                    title="Remove"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={newInclude}
                  onChange={(e) => setNewInclude(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addInclude())}
                  placeholder="Add custom inclusion criterion…"
                  className="flex-1 rounded-xl border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-800 outline-none focus:border-teal-500"
                />
                <button
                  type="button"
                  onClick={addInclude}
                  className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 flex items-center gap-1 shrink-0"
                >
                  <Plus size={13} /> Add
                </button>
              </div>
            </div>
          </div>

          {/* Exclusion Criteria */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-rose-800">
                Exclusion Criteria ({exclude.length})
              </label>
            </div>
            <div className="space-y-2">
              {exclude.map((crit, idx) => (
                <div key={idx} className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs">
                  <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0" />
                  <input
                    type="text"
                    value={crit}
                    onChange={(e) => {
                      const updated = [...exclude];
                      updated[idx] = e.target.value;
                      setExclude(updated);
                    }}
                    className="flex-1 bg-transparent text-xs text-gray-900 outline-none font-medium"
                  />
                  <button
                    onClick={() => setExclude(exclude.filter((_, i) => i !== idx))}
                    className="text-gray-400 hover:text-rose-600 p-1 rounded"
                    title="Remove"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="text"
                  value={newExclude}
                  onChange={(e) => setNewExclude(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addExclude())}
                  placeholder="Add custom exclusion criterion…"
                  className="flex-1 rounded-xl border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-800 outline-none focus:border-teal-500"
                />
                <button
                  type="button"
                  onClick={addExclude}
                  className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-100 flex items-center gap-1 shrink-0"
                >
                  <Plus size={13} /> Add
                </button>
              </div>
            </div>
          </div>

          {/* Study Types */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-gray-500 block mb-2">
              Prioritized Study Types
            </label>
            <div className="flex flex-wrap items-center gap-2">
              {studyTypes.map((type, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700 border border-gray-200"
                >
                  {type}
                  <button
                    onClick={() => setStudyTypes(studyTypes.filter((_, i) => i !== idx))}
                    className="hover:text-rose-600"
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addType())}
                  placeholder="e.g. Cohort study"
                  className="w-32 rounded-full border border-dashed border-gray-300 px-3 py-1 text-xs text-gray-800 outline-none"
                />
                <button
                  type="button"
                  onClick={addType}
                  className="rounded-full bg-gray-100 p-1 text-gray-600 hover:bg-gray-200"
                >
                  <Plus size={12} />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex h-16 shrink-0 items-center justify-between border-t border-gray-100 bg-gray-50/50 px-6">
          <button
            onClick={onCancel}
            className="rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex items-center gap-1.5 rounded-xl bg-teal-700 px-5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-teal-800 transition-colors cursor-pointer"
          >
            <Check size={14} />
            <span>Confirm & Run Systematic Review</span>
          </button>
        </div>
      </div>
    </div>
  );
}
