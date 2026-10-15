import { ArrowRight, CheckCircle2, Search, ChevronDown, Bell, Upload, Plus, FlaskConical, FolderPlus, KeyRound, Cpu } from "lucide-react";

const SERIF = "Georgia, 'Palatino Linotype', 'Times New Roman', serif";

function LearnMore({ onClick }: { onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mt-7 flex items-center gap-2 rounded-xl border border-[#0b3b42]/20 px-5 py-2.5 text-[18px] font-semibold text-[#0b3b42] hover:bg-white"
    >
      Learn more
      <ArrowRight size={20} />
    </button>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="mt-6 space-y-5 text-[19px] leading-relaxed text-[#0b3b42]">
      {items.map((b) => (
        <li key={b} className="flex gap-3">
          <span className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#0b3b42]" />
          {b}
        </li>
      ))}
    </ul>
  );
}

/* ---------------- Search ---------------- */

export function SearchSection() {
  return (
    <section id="search" className="mx-auto max-w-[1200px] scroll-mt-24 px-8 py-20">
      <div className="grid grid-cols-[1.5fr_1fr] gap-10">
        <div className="rounded-[28px] bg-[#f2f4de] p-8">
          <div className="rounded-2xl border border-[#0b3b42]/10 bg-white shadow-[0_16px_48px_rgba(11,59,66,0.10)]">
            <div className="flex items-center gap-2 border-b border-gray-200 px-5 py-3.5 text-[15px]">
              <CheckCircle2 size={17} className="text-[#0d5c64]" />
              <span className="font-semibold text-[#0b3b42]">Found 72 papers</span>
              <span className="text-gray-500">Showing the top 8 sorted by relevance and citation count</span>
            </div>
            <div className="px-5 py-4">
              <p className="text-[15px] font-semibold leading-snug text-[#0b3b42]">
                A rationally designed orally efficacious 3-hydroxy-3-methylglutaryl coenzyme-a reductase
                inhibitor with reduced myotoxicity potential.
              </p>
              <p className="mt-1.5 text-[13px] text-gray-500">
                Saleem Ahmad, C. S. Madsen, P. Stein, E. Janovitz, Christine S. Huang, and 27 more
              </p>
              <p className="mt-1 text-[13px] text-gray-500">Journal of Medicinal Chemistry, 2008, 39 citations</p>
            </div>
            <div className="border-t border-gray-100 px-5 py-4">
              <p className="text-[15px] font-semibold leading-snug text-[#0b3b42]">
                Extended worldwide experience. HMG-CoA reductase inhibitors: lovastatin and simvastatin.
              </p>
              <p className="mt-1.5 text-[13px] text-gray-500">G. Mantell</p>
              <p className="mt-1 text-[13px] text-gray-500">Thérapie (Paris), 1992, 2 citations</p>
              <div className="mt-2 flex gap-2 text-[12px]">
                <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-600">Abstract only</span>
                <span className="rounded-full bg-[#e0f2f0] px-2.5 py-1 text-[#0d5c64]">
                  PDF found on stanford.edu · Download
                </span>
              </div>
            </div>
            <div className="border-t border-gray-100 px-5 py-4">
              <p className="text-[15px] font-semibold leading-snug text-[#0b3b42]">
                HMG-CoA-reductase inhibitors: a new principle in the treatment of hypercholesterolemia.
              </p>
              <p className="mt-1.5 text-[13px] text-gray-500">H. Saxenhofer, P. Weidmann</p>
              <p className="mt-1 text-[13px] text-gray-500">Therapeutische Umschau. Revue thérapeutique, 1990</p>
            </div>
          </div>
        </div>

        <div>
          <h2 className="text-[48px] font-normal" style={{ fontFamily: SERIF }}>
            Search
          </h2>
          <Bullets
            items={[
              "Search over 138 million academic papers and 545,000 clinical trials, with more data sources coming soon.",
              "Expozi's semantic search means you don't have to know all the right keywords to get relevant results.",
            ]}
          />
          <LearnMore />
        </div>
      </div>
    </section>
  );
}

/* ---------------- Research reports ---------------- */

export function ReportsSection() {
  return (
    <section id="reports" className="mx-auto max-w-[1200px] scroll-mt-24 px-8 py-20">
      <div className="grid grid-cols-[1fr_1.6fr] gap-10">
        <div>
          <h2 className="text-[48px] font-normal" style={{ fontFamily: SERIF }}>
            Research reports
          </h2>
          <div className="my-5 h-px bg-[#0b3b42]/15" />
          <Bullets
            items={[
              "Expozi generates high-quality research briefs based on a process inspired by systematic reviews.",
              "Unlike with other AI tools, Expozi Reports can be deeply customized. You can change which papers and what information is covered in the reports.",
            ]}
          />
          <LearnMore />
        </div>

        <div className="rounded-[28px] bg-[#f2f4de] p-10">
          <div className="rounded-2xl bg-white p-8 shadow-[0_16px_48px_rgba(11,59,66,0.12)]">
            <p className="text-[26px] font-medium leading-snug text-[#9aa5b1]">
              What are the <span className="text-[#0b3b42]">biochemical mechanisms</span> through which{" "}
              <span className="text-[#0b3b42]">theanine</span> affects{" "}
              <span className="text-[#0b3b42]">cognitive function</span>?
              <span className="ml-1 inline-block h-7 w-[2px] translate-y-1 bg-[#0b3b42]" />
            </p>
            <p className="mt-6 flex items-center gap-2 text-[15px] text-gray-500">
              <span className="h-3 w-3 rounded-full bg-amber-400" />
              Let&apos;s refine your research question. Try adding elements like these:
            </p>
            <div className="mt-3 flex gap-2.5">
              {["Mechanism", "Dosage", "Onset", "Comparison"].map((c, i) => (
                <span
                  key={c}
                  className={`rounded-full px-4 py-1.5 text-[15px] ${
                    i === 0 ? "bg-[#dceeee] font-medium text-[#0b3b42]" : "bg-[#f1efe9] text-gray-500"
                  }`}
                >
                  {c}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Library + Routines ---------------- */

const LIB_ROWS = [
  { label: "All", count: "229" },
  { label: "Recently deleted", count: "0" },
];
const LIB_COLLECTIONS = [
  { label: "Top papers", count: "17" },
  { label: "Reading list", count: "12" },
  { label: "Systematic reviews", count: "4" },
  { label: "Research grant bait", count: "8" },
  { label: "Gene editing", count: "2", active: true },
];

function LibraryMock() {
  return (
    <div className="flex overflow-hidden rounded-2xl bg-white text-left shadow-[0_16px_48px_rgba(11,59,66,0.12)]">
      <div className="w-40 shrink-0 border-r border-gray-100 p-3 text-[11px]">
        <p className="px-2 py-1 text-[12px] font-semibold text-[#0b3b42]">Library</p>
        {LIB_ROWS.map((r) => (
          <div key={r.label} className="flex items-center justify-between px-2 py-1.5 text-gray-500">
            {r.label}
            <span className="text-gray-400">{r.count}</span>
          </div>
        ))}
        <div className="mt-2 flex items-center justify-between px-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          Collections
          <Plus size={11} />
        </div>
        {LIB_COLLECTIONS.map((r) => (
          <div
            key={r.label}
            className={`flex items-center justify-between rounded-md px-2 py-1.5 ${
              r.active ? "bg-[#e0f2f0] font-medium text-[#0b3b42]" : "text-gray-500"
            }`}
          >
            {r.label}
            <span className="text-gray-400">{r.count}</span>
          </div>
        ))}
      </div>

      <div className="min-w-0 flex-1 p-3">
        <div className="flex items-center gap-2">
          <div className="flex flex-1 items-center gap-1.5 rounded-lg border border-gray-200 px-2 py-1.5 text-[11px] text-gray-400">
            <Search size={12} />
            Search your library…
          </div>
          <span className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1.5 text-[11px] text-gray-600">
            Connect Zotero
            <ChevronDown size={11} />
          </span>
          <span className="flex items-center gap-1 rounded-lg bg-[#0d5c64] px-2 py-1.5 text-[11px] font-medium text-white">
            <Upload size={11} />
            Upload
          </span>
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px]">
          <span className="font-semibold text-[#0b3b42]">
            Gene editing (2) <ChevronDown size={10} className="inline" />
          </span>
          <span className="flex items-center gap-1 text-gray-400">
            <Bell size={11} />
            Enable alerts
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-2 text-[11px] text-gray-500">
          <span className="rounded-md bg-gray-100 px-2 py-1">Sort: Title</span>
          <span className="rounded-md bg-gray-100 px-2 py-1">Filter</span>
        </div>
        <div className="mt-2 overflow-hidden rounded-lg border border-gray-200">
          <div className="grid grid-cols-[1fr_110px] bg-gray-50 px-2 py-1 text-[10px] font-semibold text-gray-500">
            <span>Source</span>
            <span>Tags</span>
          </div>
          <div className="grid grid-cols-[1fr_110px] gap-2 border-t border-gray-100 px-2 py-2">
            <div>
              <p className="text-[11px] font-medium leading-snug text-[#0b3b42]">
                Comparative Analysis of CRISPR-Cas9 and Prime Editing Efficiency in Human Cell Lines
              </p>
              <p className="mt-0.5 text-[10px] text-gray-400">G Coulli, P G Morris • The CRISPR Journal, 2024, 65 citations</p>
              <div className="mt-1 flex gap-1">
                <span className="rounded-full bg-[#e0f2f0] px-1.5 py-0.5 text-[9px] text-[#0d5c64]">Research paper</span>
                <span className="rounded-full bg-[#e0f2f0] px-1.5 py-0.5 text-[9px] text-[#0d5c64]">Full text</span>
              </div>
            </div>
            <div className="flex flex-col items-start gap-1">
              <span className="rounded bg-[#f1efe9] px-1.5 py-0.5 text-[9px] text-gray-600">Gene editing tech</span>
              <span className="rounded bg-[#f1efe9] px-1.5 py-0.5 text-[9px] text-gray-600">CRISPR</span>
            </div>
          </div>
          <div className="grid grid-cols-[1fr_110px] gap-2 border-t border-gray-100 px-2 py-2">
            <p className="text-[11px] font-medium leading-snug text-[#0b3b42]">
              NIH Strategic Roadmap for Genomic Medicine 2025-2030
            </p>
            <span className="rounded bg-[#f1efe9] px-1.5 py-0.5 text-[9px] text-gray-600 self-start">Gene editing tech</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function RoutinesMock() {
  return (
    <div className="rounded-2xl bg-white shadow-[0_16px_48px_rgba(11,59,66,0.12)]">
      <p className="px-6 py-5 text-[16px] leading-relaxed text-[#0b3b42]">
        Track newly registered oncology trials, posted results, major status changes, and clinically
        meaningful safety or efficacy findings.
      </p>
      <div className="flex items-center gap-2 border-t border-gray-100 px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100">
          <Plus size={18} />
        </span>
        <span className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-600">
          <FolderPlus size={14} />
          Add to project
        </span>
        <span className="flex-1" />
        <span className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-2 text-[13px] text-gray-600">
          <FlaskConical size={14} />
          Balanced
        </span>
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#0d5c64] text-white">
          <ArrowRight size={17} />
        </span>
      </div>
    </div>
  );
}

export function LibraryRoutinesSection() {
  return (
    <section id="library" className="mx-auto max-w-[1200px] scroll-mt-24 px-8 py-20">
      <div className="grid grid-cols-2 gap-10">
        <div>
          <h2 className="text-[48px] font-normal" style={{ fontFamily: SERIF }}>
            Library
          </h2>
          <div className="my-5 h-px bg-[#0b3b42]/15" />
          <p className="text-[20px] leading-relaxed">
            As you use Expozi, store and organize the sources that you find so that you can easily reuse
            them in future projects.
          </p>
          <LearnMore />
          <div className="mt-10 rounded-[28px] bg-[#f2f4de] p-6 pt-20">
            <LibraryMock />
          </div>
        </div>

        <div>
          <h2 className="text-[48px] font-normal" style={{ fontFamily: SERIF }}>
            Routines
          </h2>
          <div className="my-5 h-px bg-[#0b3b42]/15" />
          <p className="text-[20px] leading-relaxed">
            Research is constantly evolving; use Expozi Routines to stay on top of new research and keep
            your work up to date
          </p>
          <LearnMore />
          <div className="mt-10 flex min-h-[380px] flex-col justify-end rounded-[28px] bg-[#f2f4de] p-6">
            <RoutinesMock />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Models: API or local ---------------- */

export function ModelsSection() {
  return (
    <section id="models" className="mx-auto max-w-[1200px] scroll-mt-24 px-8 py-20">
      <span className="inline-flex items-center gap-2 rounded-full border border-[#d8e6a0] bg-[#edf6c3] px-4 py-1 text-[15px] font-bold tracking-[0.12em] text-[#0b3b42]">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 0 13 4v6l-6 4-6-4V4l6-4Z" fill="currentColor" />
        </svg>
        MODELS
      </span>
      <h2 className="mt-4 text-[56px] font-normal leading-tight" style={{ fontFamily: SERIF }}>
        Use your model, your way
      </h2>
      <p className="mt-3 max-w-[700px] text-[21px] leading-relaxed">
        Expozi doesn&apos;t lock you into one provider. Plug in your own API key, or run everything
        privately on your own machine.
      </p>

      <div className="mt-10 grid grid-cols-2 gap-5">
        <div className="flex flex-col rounded-2xl border border-[#0b3b42]/10 bg-white p-7">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#e0f2f0] text-[#0d5c64]">
            <KeyRound size={22} />
          </span>
          <h3 className="mt-4 text-[22px] font-semibold text-[#0b3b42]">API models</h3>
          <p className="mt-2 flex-1 text-[16px] leading-relaxed text-[#0b3b42]/80">
            Paste in your own key and Expozi reasons with frontier models. Your key stays on your
            machine — requests go straight from the app to the provider.
          </p>
          <div className="mt-4 flex gap-2">
            {["Claude", "GPT", "Gemini"].map((m) => (
              <span key={m} className="rounded-full bg-[#f1efe9] px-3.5 py-1.5 text-sm text-gray-600">
                {m}
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-col rounded-2xl border border-[#0b3b42]/10 bg-white p-7">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#e0f2f0] text-[#0d5c64]">
            <Cpu size={22} />
          </span>
          <h3 className="mt-4 text-[22px] font-semibold text-[#0b3b42]">Local models</h3>
          <p className="mt-2 flex-1 text-[16px] leading-relaxed text-[#0b3b42]/80">
            Prefer to keep everything in-house? Point Expozi at a local runner and work fully offline.
            100% private — your papers never leave your computer.
          </p>
          <div className="mt-4 flex gap-2">
            {["Ollama", "LM Studio", "llama.cpp"].map((m) => (
              <span key={m} className="rounded-full bg-[#f1efe9] px-3.5 py-1.5 text-sm text-gray-600">
                {m}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
