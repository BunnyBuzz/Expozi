import { ChevronDown, ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { SearchSection, ReportsSection, LibraryRoutinesSection, ModelsSection } from "./LandingMore";
import { MomentSection, FaqSection, CtaSection, SiteFooter } from "./LandingBottom";

interface Props {
  onLocal: () => void;
  onSignUp: () => void;
}

const SERIF = "Georgia, 'Palatino Linotype', 'Times New Roman', serif";

function Mark({ light = false }: { light?: boolean }) {
  const c = light ? "#ffffff" : "#0b3b42";
  return (
    <span className="flex items-center gap-2">
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden>
        <path d="M13 2 23 7.5 13 13 3 7.5 13 2Z" fill={c} />
        <path d="M3 12.5 13 18l10-5.5v4L13 22 3 16.5v-4Z" fill={c} opacity="0.75" />
        <path d="M3 17.5 13 23l10-5.5v1L13 24 3 18.5v-1Z" fill={c} opacity="0.5" />
      </svg>
      <span className={`text-[22px] font-bold tracking-tight ${light ? "text-white" : "text-[#0b3b42]"}`}>
        Expozi
      </span>
    </span>
  );
}

function Drop({ label, items, dark = false }: { label: string; items: { label: string; href: string }[]; dark?: boolean }) {
  return (
    <div className="group relative">
      <button
        className={`flex items-center gap-1 py-2 text-[17px] font-medium hover:opacity-70 ${
          dark ? "text-white" : "text-[#0b3b42]"
        }`}
      >
        {label}
        <ChevronDown size={17} />
      </button>
      <div className="invisible absolute left-0 top-full z-30 w-60 translate-y-1 rounded-xl border border-gray-200 bg-white p-2 opacity-0 shadow-xl transition-all group-hover:visible group-hover:translate-y-0 group-hover:opacity-100">
        {items.map((it) => (
          <a
            key={it.label}
            href={it.href}
            className="block rounded-lg px-3 py-2 text-[15px] text-gray-700 hover:bg-gray-100"
          >
            {it.label}
          </a>
        ))}
      </div>
    </div>
  );
}

function FlaskIcon() {
  return (
    <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="#0e7490" strokeWidth="1.4" aria-hidden>
      <path d="M9 3h6" strokeLinecap="round" />
      <path d="M10 3v5.2L4.8 17a2.4 2.4 0 0 0 2.1 3.5h10.2a2.4 2.4 0 0 0 2.1-3.5L14 8.2V3" strokeLinejoin="round" />
      <path d="M7.5 14.5c1.5 1.2 3 .5 4.5 1.2s3-.3 4.5.8" strokeLinecap="round" />
    </svg>
  );
}

export default function LandingView({ onLocal, onSignUp }: Props) {
  const [darkNav, setDarkNav] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const update = () => {
      const dark = ["faq", "cta", "site-footer"].some((id) => {
        const el = document.getElementById(id);
        if (!el) return false;
        return el.getBoundingClientRect().top < 140;
      });
      setDarkNav(dark);
    };
    const obs = new IntersectionObserver(update, { root, threshold: [0, 0.05, 0.2, 0.5, 1] });
    ["faq", "cta", "site-footer"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={scrollRef} className="slim-scroll h-screen overflow-y-auto bg-[#faf8f2] text-[#0b3b42]">
      {/* NAV */}
      <header
        className={`sticky top-0 z-40 border-b backdrop-blur transition-colors ${
          darkNav ? "border-white/10 bg-[#0a3036]/95" : "border-[#0b3b42]/10 bg-[#faf8f2]/95"
        }`}
      >
        <div className="mx-auto flex h-[76px] max-w-[1200px] items-center gap-9 px-8">
          <Mark light={darkNav} />
          <nav className={`flex flex-1 items-center gap-8 ${darkNav ? "text-white" : ""}`}>
            <Drop
              label="Solutions"
              dark={darkNav}
              items={[
                { label: "Research agent", href: "#agent" },
                { label: "Paper search", href: "#search" },
                { label: "Research reports", href: "#reports" },
                { label: "Systematic reviews", href: "#features" },
                { label: "Library", href: "#library" },
                { label: "Routines", href: "#library" },
                { label: "Local & API models", href: "#models" },
              ]}
            />
            <Drop
              label="Industries"
              dark={darkNav}
              items={[
                { label: "Pharma", href: "#features" },
                { label: "Academia", href: "#features" },
                { label: "Medtech", href: "#features" },
                { label: "Policy", href: "#features" },
              ]}
            />
            <Drop
              label="Resources"
              dark={darkNav}
              items={[
                { label: "Blog", href: "#features" },
                { label: "Help center", href: "#features" },
                { label: "API docs", href: "#features" },
              ]}
            />
            <a href="#features" className="py-2 text-[17px] font-medium hover:opacity-70">
              Customers
            </a>
            <a href="#features" className="py-2 text-[17px] font-medium hover:opacity-70">
              Pricing
            </a>
          </nav>
          <button
            onClick={onLocal}
            title="Use Expozi with a local model — no account needed"
            className={`text-[17px] font-medium hover:opacity-70 ${darkNav ? "text-white" : ""}`}
          >
            Local
          </button>
          <button
            onClick={onSignUp}
            className={`rounded-xl px-5 py-2.5 text-[17px] font-semibold ${
              darkNav
                ? "bg-[#e9f59b] text-[#0a3036] hover:bg-[#f1fac4]"
                : "bg-[#0a3036] text-white hover:bg-[#0e4550]"
            }`}
          >
            Join
          </button>
        </div>
      </header>

      {/* HERO */}
      <section className="mx-auto max-w-[1200px] px-8 pb-20 pt-20 text-center">
        <h1 className="mx-auto max-w-[900px] text-[76px] font-normal leading-[1.05]" style={{ fontFamily: SERIF }}>
          AI for Scientific Research
        </h1>
        <p className="mt-5 text-[24px] font-medium">Expozi helps researchers be 10x more evidence-based</p>
        <button
          onClick={onSignUp}
          className="mx-auto mt-8 flex items-center gap-16 rounded-2xl bg-[#0d5c64] px-8 py-4 text-[19px] font-semibold text-white hover:bg-[#0e6b75]"
        >
          Try now
          <ArrowRight size={26} strokeWidth={1.6} />
        </button>

        {/* product preview video */}
        <div className="mx-auto mt-14 max-w-[980px] overflow-hidden rounded-[28px] border border-[#0b3b42]/10 bg-[#d9efea] p-3 shadow-[0_24px_64px_rgba(11,59,66,0.16)]">
          <video
            src="video.webm"
            autoPlay
            muted
            loop
            playsInline
            className="aspect-video w-full rounded-[20px] bg-[#0a3036] object-cover"
          />
        </div>
      </section>

      {/* GIANTS BANNER */}
      <section className="relative overflow-hidden bg-[#0a3036]">
        <div
          className="absolute inset-y-0 right-0 w-[46%] opacity-60"
          style={{
            backgroundImage: "radial-gradient(#2a7d88 1.4px, transparent 1.5px)",
            backgroundSize: "13px 13px",
            maskImage: "linear-gradient(to left, black 30%, transparent 95%)",
            WebkitMaskImage: "linear-gradient(to left, black 30%, transparent 95%)",
          }}
        />
        <div className="absolute -right-24 top-1/2 h-[420px] w-[420px] -translate-y-1/2 rounded-full border-[26px] border-[#2a7d88]/25" />
        <div className="absolute -right-10 top-1/2 h-[280px] w-[280px] -translate-y-1/2 rounded-full border-[18px] border-[#2a7d88]/20" />
        <div className="relative mx-auto max-w-[1200px] px-8 py-28">
          <h2 className="max-w-[640px] text-[56px] font-normal leading-[1.1] text-white" style={{ fontFamily: SERIF }}>
            Stand on the shoulders of giants
          </h2>
          <p className="mt-5 max-w-[640px] text-[21px] leading-relaxed text-white/90">
            Use Expozi to understand more quickly what science already knows, so that you can discover the
            unknown.
          </p>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="mx-auto max-w-[1200px] scroll-mt-24 px-8 pt-20">
        <span className="inline-flex items-center gap-2 rounded-full border border-[#d8e6a0] bg-[#edf6c3] px-4 py-1 text-[15px] font-bold tracking-[0.12em] text-[#0b3b42]">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 0 13 4v6l-6 4-6-4V4l6-4Z" fill="currentColor" />
          </svg>
          FEATURES
        </span>
        <h2 className="mt-4 text-[56px] font-normal leading-tight" style={{ fontFamily: SERIF }}>
          Research takes many forms
        </h2>
        <p className="mt-3 max-w-[700px] text-[21px] leading-relaxed">
          Whether you need a quick answer or are planning a multi-month comprehensive review, Expozi can
          support you from beginning to end.
        </p>

        <div className="mt-10 grid grid-cols-3 gap-5">
          {[
            { t: "Research reports", d: "Generate 10-page literature reviews of the papers you find to summarize all of the evidence that's been published." },
            { t: "Systematic reviews", d: "You can use Expozi search to supplement a search protocol for a systematic review." },
            { t: "Routines", d: "If a search has been useful, create a Routine so you can follow along with any new research that comes out." },
          ].map((c) => (
            <div key={c.t} className="flex flex-col rounded-2xl border border-[#0b3b42]/10 bg-white p-7">
              <h3 className="text-[22px] font-semibold">{c.t}</h3>
              <p className="mt-2 flex-1 text-[16px] leading-relaxed text-[#0b3b42]/80">{c.d}</p>
              <button
                onClick={onSignUp}
                className="mt-5 flex h-11 w-11 items-center justify-center rounded-xl bg-[#0d5c64] text-white hover:bg-[#0e6b75]"
                title={c.t}
              >
                <ArrowRight size={20} />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* RESEARCH AGENT */}
      <section id="agent" className="mx-auto max-w-[1200px] scroll-mt-24 px-8 py-20">
        <div className="grid grid-cols-[1fr_1.6fr] gap-10">
          <div>
            <h2 className="text-[48px] font-normal" style={{ fontFamily: SERIF }}>
              Research agent
            </h2>
            <div className="my-5 h-px bg-[#0b3b42]/15" />
            <ul className="space-y-5 text-[19px] leading-relaxed">
              <li className="flex gap-3">
                <span className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#0b3b42]" />
                Built for high-stakes decisions and rigorous research workflows.
              </li>
              <li className="flex gap-3">
                <span className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#0b3b42]" />
                Gathers evidence across scientific databases, academic journals, public data sources, and
                internally uploaded documents.
              </li>
              <li className="flex gap-3">
                <span className="mt-[11px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#0b3b42]" />
                Creates fully cited artifacts like reports, tables, figures, bioinformatics analyses,
                calculations, and slides
              </li>
            </ul>
            <button
              onClick={onSignUp}
              className="mt-7 flex items-center gap-2 rounded-xl border border-[#0b3b42]/20 px-5 py-2.5 text-[18px] font-semibold hover:bg-white"
            >
              Learn more
              <ArrowRight size={20} />
            </button>
          </div>

          <div className="relative overflow-hidden rounded-[28px] bg-[#f2f4de] px-10 py-12">
            <div className="flex items-start gap-10">
              <div className="flex flex-col items-center pt-16">
                <FlaskIcon />
                <p className="mt-3 text-[22px] font-medium text-[#334155]">Expozi Agent</p>
              </div>
              <div className="flex flex-1 flex-col items-end gap-5">
                {[
                  "Prioritize targets",
                  "Map competitive landscape",
                  "Assess clinical trial landscape",
                  "Synthesize research landscape",
                  "Build structured data tables",
                  "Analyze and interpret data",
                  "Generate slides",
                ].map((p) => (
                  <span
                    key={p}
                    className="rounded-2xl rounded-br-md bg-gradient-to-r from-[#cfe6e2] to-[#e4efec] px-5 py-2.5 text-[19px] text-[#334155] shadow-sm"
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <SearchSection />
      <ReportsSection />
      <LibraryRoutinesSection />
      <ModelsSection />
      <MomentSection />
      <FaqSection />
      <CtaSection onSignUp={onSignUp} />
      <SiteFooter />

    </div>
  );
}
