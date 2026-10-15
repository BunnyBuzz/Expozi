import { useState } from "react";
import { CalendarDays, Plus } from "lucide-react";

interface Props {
  routines: string[];
  onAdd: (r: string) => void;
}

export default function RoutinesView({ routines, onAdd }: Props) {
  const [value, setValue] = useState("");

  return (
    <div className="slim-scroll min-h-0 flex-1 overflow-y-auto bg-white">
      <div className="mx-auto w-full max-w-[920px] px-6 py-8">
        <h1 className="text-[21px] font-semibold text-gray-900">Routines</h1>
        <p className="mt-1 text-sm text-gray-500">
          Tell Expozi what to keep current — routines re-run your research on a schedule.
        </p>
        <form
          className="mt-5 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (value.trim()) {
              onAdd(value.trim());
              setValue("");
            }
          }}
        >
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. Weekly: new papers on GLP-1 side effects"
            className="flex-1 rounded-xl border border-gray-300 px-4 py-2.5 text-[15px] outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-100"
          />
          <button
            type="submit"
            className="flex items-center gap-1.5 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-800"
          >
            <Plus size={16} /> Add
          </button>
        </form>
        {routines.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-300 p-10 text-center">
            <CalendarDays size={28} className="mx-auto text-gray-300" />
            <p className="mt-3 font-medium text-gray-700">No routines yet</p>
            <p className="mt-1 text-sm text-gray-500">Create one above to keep a topic updated.</p>
          </div>
        ) : (
          <div className="mt-5 space-y-2">
            {routines.map((r, i) => (
              <div key={i} className="flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3">
                <CalendarDays size={17} className="shrink-0 text-teal-700" />
                <p className="text-[14px] text-gray-800">{r}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
