import { useState } from "react";
import { ChevronDown, ArrowRight, Github, Linkedin, Youtube } from "lucide-react";

const SERIF = "Georgia, 'Palatino Linotype', 'Times New Roman', serif";

/* ---------------- Moment ---------------- */

export function MomentSection() {
  return (
    <section id="moment" className="mx-auto max-w-[1200px] scroll-mt-24 px-8 py-24">
      <div className="grid grid-cols-[1fr_1.15fr_1.15fr] gap-12 border-t border-[#0b3b42]/15 pt-14">
        <h2 className="text-[42px] font-normal leading-[1.15]" style={{ fontFamily: SERIF }}>
          This is an important moment in time
        </h2>
        <div className="space-y-6 text-[19px] leading-relaxed">
          <p>
            AI has the potential to significantly change the world. Change is complicated. As researchers
            and scientists, we must direct this technology towards having as positive an impact as
            possible. We need to move quickly, without sacrificing quality. Our research needs to be more
            dynamic to stay relevant in a rapidly-changing world.
          </p>
          <p>Scientific rigor, good reasoning, and high-quality research are more important than ever.</p>
        </div>
        <div className="space-y-6 text-[19px] leading-relaxed">
          <p>
            We built this to help you. To help you understand the never-ending mysteries of our universe.
            To help you make breakthroughs that end disease. To help you wrestle with hard questions
            about how to alleviate poverty, explore new frontiers, or create thriving communities.
          </p>
          <p>
            Thank you for your curiosity. Your sense of wonder. For your uncompromising commitment to
            truth and progress. We hope we can make finding that truth just a little bit easier.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ---------------- FAQ ---------------- */

const FAQS = [
  {
    q: "What data sources do you have access to?",
    a: "Our database includes 545,000 clinical trial registrations from clinicaltrials.gov and 138 million academic papers. Our paper coverage includes the vast majority of published papers, across open access and paywalled papers.",
  },
  {
    q: "Who is Expozi built for?",
    a: "Expozi is built for researchers in academia, pharma, medtech, policy, and beyond — anyone who needs to move quickly without sacrificing evidence.",
  },
  {
    q: "How do you rank sources or determine quality?",
    a: "Expozi ranks papers by semantic similarity to your question combined with citation signals, then lets you screen and filter with your own custom criteria.",
  },
  {
    q: "Is Expozi free?",
    a: "Yes! While our most powerful workflows and features are on the paid plan, we also offer a generous free plan so you can use Expozi.",
  },
];

export function FaqSection() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="scroll-mt-0 bg-[#0e6b74]">
      <div className="mx-auto grid max-w-[1200px] grid-cols-[1fr_2fr] gap-10 px-8 py-24">
        <h2 className="text-[64px] font-normal text-white" style={{ fontFamily: SERIF }}>
          FAQ
        </h2>
        <div>
          {FAQS.map((f, i) => (
            <div key={f.q} className="border-b border-white/25 py-6 first:pt-2">
              <button
                onClick={() => setOpen(open === i ? -1 : i)}
                className="flex w-full items-center justify-between gap-6 text-left text-[22px] text-white"
              >
                {f.q}
                <ChevronDown
                  size={22}
                  className={`shrink-0 transition-transform ${open === i ? "rotate-180" : ""}`}
                />
              </button>
              {open === i && <p className="mt-4 text-[17px] leading-relaxed text-white/85">{f.a}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------------- CTA ---------------- */

export function CtaSection({ onSignUp }: { onSignUp: () => void }) {
  return (
    <section id="cta" className="relative scroll-mt-0 overflow-hidden bg-[#0a3036]">
      <div
        className="absolute inset-0 opacity-50"
        style={{
          backgroundImage: "radial-gradient(#2a7d88 1.4px, transparent 1.5px)",
          backgroundSize: "14px 14px",
        }}
      />
      <div className="absolute -left-32 bottom-0 h-[380px] w-[380px] rounded-full border-[24px] border-[#2a7d88]/25" />
      <div className="absolute -right-24 top-0 h-[420px] w-[420px] rounded-full border-[26px] border-[#2a7d88]/25" />
      <div className="relative mx-auto flex max-w-[1200px] items-center justify-between gap-10 px-8 py-24">
        <h2 className="text-[56px] font-normal leading-[1.15]" style={{ fontFamily: SERIF }}>
          <span className="text-[#e9f59b]">Save time, think better.</span>
          <br />
          <span className="text-white">Try Expozi for free</span>
        </h2>
        <div className="flex shrink-0 gap-4">
          <button
            onClick={onSignUp}
            className="flex w-[300px] items-center justify-between rounded-2xl bg-[#e9f59b] px-7 py-4 text-[19px] font-semibold text-[#0a3036] hover:bg-[#f1fac4]"
          >
            Sign up
            <ArrowRight size={26} strokeWidth={1.6} />
          </button>
          <button className="rounded-2xl border border-white/50 px-7 py-4 text-[19px] font-semibold text-white hover:bg-white/10">
            Talk to Sales
          </button>
        </div>
      </div>
    </section>
  );
}

/* ---------------- Footer ---------------- */

const COLS: { h: string; links: [string, string][] }[] = [
  {
    h: "SOLUTIONS",
    links: [
      ["Research agent", "#agent"],
      ["Literature Review", "#features"],
      ["Paper Search", "#search"],
      ["Library", "#library"],
      ["Routines", "#library"],
      ["Reports", "#reports"],
    ],
  },
  {
    h: "INDUSTRIES",
    links: [
      ["Pharma", "#features"],
      ["Academia", "#features"],
      ["Medtech", "#features"],
      ["Consumer goods", "#features"],
    ],
  },
  {
    h: "RESOURCES",
    links: [
      ["Customers", "#features"],
      ["Blog", "#features"],
      ["Help center ↗", "#features"],
      ["API ↗", "#features"],
      ["Digital garden", "#features"],
      ["Mechanisms of Action", "#features"],
    ],
  },
  {
    h: "MORE",
    links: [
      ["Team", "#features"],
      ["Careers", "#features"],
    ],
  },
];

function XIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
      <path d="M4 4l16 16" />
      <path d="M20 4L4 20" />
    </svg>
  );
}

export function SiteFooter() {
  return (
    <footer id="site-footer" className="bg-[#0a3036] text-white">
      <div className="mx-auto max-w-[1200px] px-8 pb-8 pt-16">
        <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_0.7fr] gap-8">
          <div>
            <span className="flex items-center gap-2.5">
              <svg width="40" height="40" viewBox="0 0 26 26" fill="none" aria-hidden>
                <path d="M13 2 23 7.5 13 13 3 7.5 13 2Z" fill="#ffffff" />
                <path d="M3 12.5 13 18l10-5.5v4L13 22 3 16.5v-4Z" fill="#ffffff" opacity="0.75" />
                <path d="M3 17.5 13 23l10-5.5v1L13 24 3 18.5v-1Z" fill="#ffffff" opacity="0.5" />
              </svg>
              <span className="text-[34px] font-bold tracking-tight">Expozi</span>
            </span>
          </div>
          {COLS.map((c) => (
            <div key={c.h}>
              <h3 className="font-mono text-[14px] tracking-[0.18em] text-white/45">{c.h}</h3>
              <ul className="mt-5 space-y-4">
                {c.links.map(([label, href]) => (
                  <li key={label}>
                    <a href={href} className="text-[19px] text-white/90 hover:text-white hover:underline">
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-16 flex items-center justify-between border-t border-white/15 pt-6">
          <div className="flex items-center gap-5 text-white/55">
            <a href="#features" aria-label="GitHub" className="hover:text-white">
              <Github size={24} />
            </a>
            <a href="#features" aria-label="LinkedIn" className="hover:text-white">
              <Linkedin size={24} />
            </a>
            <a href="#features" aria-label="YouTube" className="hover:text-white">
              <Youtube size={24} />
            </a>
            <a href="#features" aria-label="X" className="hover:text-white">
              <XIcon />
            </a>
          </div>
          <p className="text-[16px] text-white/55">
            © 2026 Expozi, inc.
            <span className="mx-5">Privacy policy</span>
            <span className="mx-5">Terms of service</span>
            <span>Policies</span>
          </p>
        </div>
      </div>
    </footer>
  );
}
