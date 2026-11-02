import { useEffect, useState } from "react";
import { PaperPilotMark } from "./PaperPilotLogo.jsx";
import {
  ANNUAL_SAVINGS_LABEL,
  FREE_FEATURES,
  PLAN_PRICES,
  PREMIUM_FEATURES,
  PRO_FEATURES,
} from "../lib/plans.js";

const NAV = [
  { id: "features", label: "Features" },
  { id: "pricing", label: "Pricing" },
  { id: "how-it-works", label: "How It Works" },
  { id: "about", label: "About" },
];

const FEATURES = [
  {
    title: "Format Compliance Scan",
    body: "Upload a PDF manuscript and run a rule-based check for fonts, headings, margins, indentation, spacing, alignment, pagination, captions, and citations.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
        <path
          d="M8 4h6l4 4v12a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path d="M14 4v4h4M9.5 12h5M9.5 15.5h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Format Mechanics Profiles",
    body: "Use a saved format, upload a PDF or DOCX format guide, or customize fields yourself - then scan manuscripts against those rules.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
        <path
          d="M12 3l7 3v5c0 4.5-2.9 7.8-7 9-4.1-1.2-7-4.5-7-9V6l7-3Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M9.5 12l1.8 1.8L15 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Citation Style Checks",
    body: "When a style is set, PaperPilot checks in-text citation markers for APA, MLA, or IEEE. Free plans support APA scans; Premium and Pro unlock all three.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
        <path
          d="M8 7c0-1.7 1.1-3 2.8-3H12v10.5c0 1.4-1.1 2.5-2.5 2.5S7 15.9 7 14.5V11h3"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path
          d="M16 7c0-1.7 1.1-3 2.8-3H20v10.5c0 1.4-1.1 2.5-2.5 2.5S15 15.9 15 14.5V11h3"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    title: "Scores, Tracing & Reports",
    body: "Get an overall compliance score, issue cards with explanations and recommendations, click-to-trace findings on the page preview, and a downloadable PDF report.",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
        <path
          d="M12 3.5 13.8 9H19l-4.2 3.2L16.5 18 12 14.9 7.5 18l1.7-5.8L5 9h5.2L12 3.5Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
];

const STEPS = [
  {
    n: "01",
    title: "Set your format mechanics",
    body: "Choose a saved format, upload a PDF or DOCX format guide, or fill in the formatting fields yourself.",
  },
  {
    n: "02",
    title: "Upload your manuscript",
    body: "Add the PDF paper you want checked against those rules. Manuscript uploads are PDF-only for precise issue tracing.",
  },
  {
    n: "03",
    title: "Run the compliance scan",
    body: "Review the attached files, start the scan, then open the score, traced issues, and downloadable report.",
  },
];

const ABOUT_POINTS = [
  {
    title: "Built for format compliance",
    body: "PaperPilot is an academic document analysis and compliance checking system. It evaluates formatting rules - not grammar, content quality, or plagiarism.",
  },
  {
    title: "Guidance you can act on",
    body: "Each scan returns a score, detected issues, explanations, and recommendations. Results are guidance to help you revise - they do not guarantee acceptance.",
  },
  {
    title: "Your manuscripts, your versions",
    body: "Save scans in My Manuscripts, keep version history on paid plans, and manage your account, subscription, and notifications from the dashboard.",
  },
];

const PLANS = [
  {
    name: "Free",
    price: "0",
    period: "/ month",
    blurb: "3 APA scans per month to try the compliance workflow.",
    features: FREE_FEATURES,
    accent: false,
  },
  {
    name: "Premium",
    price: String(PLAN_PRICES.premium.monthly),
    period: "/ month",
    blurb: "More monthly scans, MLA & IEEE, and full version history.",
    features: PREMIUM_FEATURES,
    accent: true,
  },
  {
    name: "Pro",
    price: String(PLAN_PRICES.pro.monthly),
    period: "/ month",
    blurb: "Higher weekly scan quota with the same paid-style features.",
    features: PRO_FEATURES,
    accent: false,
  },
];

function scrollToId(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function CompliancePreview() {
  const score = 92;
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);

  return (
    <div className="lp-preview relative mx-auto w-full max-w-[440px]">
      <div className="lp-sheet lp-sheet--back absolute inset-x-6 -bottom-3 top-8 rotate-[-4deg] rounded-[1.25rem] border border-white/10 bg-navy-mid/80" aria-hidden="true" />
      <div className="lp-sheet lp-sheet--mid absolute inset-x-3 -bottom-1.5 top-4 rotate-[2.5deg] rounded-[1.25rem] border border-accent/20 bg-gradient-to-br from-accent/20 to-navy-mid/90" aria-hidden="true" />

      <div className="relative overflow-hidden rounded-[1.4rem] border border-white/15 bg-[#fbfcfd] text-navy shadow-[0_36px_70px_-30px_rgba(0,0,0,0.65)]">
        <div className="flex items-center gap-2 border-b border-slate-100 bg-navy px-5 py-3.5 sm:px-6">
          <span className="h-2 w-2 rounded-full bg-accent" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-300">
            Compliance Report
          </p>
          <span className="ml-auto rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-emerald-300">
            Good Standing
          </span>
        </div>

        <div className="grid grid-cols-[auto_1fr] items-center gap-5 px-5 py-5 sm:gap-6 sm:px-6">
          <div className="relative h-[118px] w-[118px]">
            <svg viewBox="0 0 112 112" className="h-full w-full -rotate-90" aria-hidden="true">
              <circle cx="56" cy="56" r={radius} fill="none" stroke="#e5edf5" strokeWidth="9" />
              <circle
                className="lp-ring"
                cx="56"
                cy="56"
                r={radius}
                fill="none"
                stroke="#1BC9A0"
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={circumference}
                style={{ "--lp-ring-offset": offset }}
              />
            </svg>
            <div className="absolute inset-0 grid place-items-center">
              <div className="text-center">
                <p className="text-[1.7rem] font-bold leading-none tracking-tight text-navy">{score}%</p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Score</p>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Detected Issues</p>
            <ul className="mt-3 space-y-2.5">
              {[
                { label: "Margins", tone: "warn", tag: "Moderate" },
                { label: "Spacing", tone: "issue", tag: "Critical" },
                { label: "Citations", tone: "ok", tag: "Passed" },
              ].map((row) => (
                <li key={row.label} className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium text-slate-700">{row.label}</span>
                  <span
                    className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      row.tone === "warn"
                        ? "bg-amber-50 text-amber-700"
                        : row.tone === "issue"
                          ? "bg-rose-50 text-rose-700"
                          : "bg-emerald-50 text-emerald-700"
                    }`}
                  >
                    {row.tag}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="relative border-t border-slate-100 px-5 py-4 sm:px-6">
          <div className="absolute inset-y-0 left-0 w-1 bg-accent" aria-hidden="true" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Recommendation</p>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
            Adjust line spacing to match your format mechanics, then re-scan the PDF manuscript.
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Public marketing surface shown before auth. CTAs hand off to login / register.
 */
export default function LandingPage({ onSignIn, onGetStarted }) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    function onScroll() {
      setScrolled(window.scrollY > 12);
    }
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function goSection(id) {
    setMenuOpen(false);
    scrollToId(id);
  }

  return (
    <div className="min-h-screen bg-[#eef3f6] text-navy antialiased">
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow,backdrop-filter] duration-300 ${
          scrolled
            ? "border-b border-white/10 bg-navy-deep/92 shadow-[0_10px_40px_-24px_rgba(0,0,0,0.55)] backdrop-blur-md"
            : "bg-transparent"
        }`}
      >
        <div className="mx-auto flex h-[4.25rem] max-w-6xl items-center justify-between px-5 sm:px-8">
          <a
            href="#top"
            className="flex items-center gap-2.5"
            onClick={(e) => {
              e.preventDefault();
              setMenuOpen(false);
              scrollToId("top");
            }}
          >
            <PaperPilotMark className="h-9 w-9" />
            <span className="font-['Quicksand',sans-serif] text-[15px] font-bold tracking-[0.08em] text-white">
              PAPERPILOT
            </span>
          </a>

          <nav className="hidden items-center gap-7 lg:flex" aria-label="Primary">
            <button
              type="button"
              onClick={() => goSection("top")}
              className="text-sm font-medium text-slate-300 transition hover:text-white"
            >
              Home
            </button>
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => goSection(item.id)}
                className="text-sm font-medium text-slate-300 transition hover:text-white"
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="hidden items-center gap-3 md:flex">
            <button
              type="button"
              onClick={onSignIn}
              className="rounded-full border border-accent/70 px-4 py-2 text-sm font-semibold text-accent transition hover:bg-accent/10"
            >
              Sign In
            </button>
          </div>

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-white lg:hidden"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
              {menuOpen ? (
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              ) : (
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              )}
            </svg>
          </button>
        </div>

        {menuOpen ? (
          <div className="border-t border-white/10 bg-navy-deep px-5 py-4 lg:hidden">
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => goSection("top")}
                className="rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-200 hover:bg-white/5"
              >
                Home
              </button>
              {NAV.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => goSection(item.id)}
                  className="rounded-lg px-3 py-2.5 text-left text-sm font-medium text-slate-200 hover:bg-white/5"
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="mt-3">
              <button
                type="button"
                onClick={onSignIn}
                className="w-full rounded-full border border-accent/70 px-3 py-2.5 text-sm font-semibold text-accent"
              >
                Sign In
              </button>
            </div>
          </div>
        ) : null}
      </header>

      <main id="top">
        <section className="relative overflow-hidden bg-navy-deep text-white">
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <div className="lp-hero-glow absolute -left-24 top-10 h-[34rem] w-[34rem] rounded-full bg-[radial-gradient(circle,rgba(27,201,160,0.18),transparent_62%)]" />
            <div className="absolute -right-28 bottom-[-6rem] h-[30rem] w-[30rem] rounded-full bg-[radial-gradient(circle,rgba(22,35,58,0.95),transparent_70%)]" />
            <svg className="absolute inset-0 h-full w-full opacity-[0.16]" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <pattern id="lp-ledger" width="72" height="72" patternUnits="userSpaceOnUse">
                  <path d="M72 0H0V72" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="0.6" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="url(#lp-ledger)" />
            </svg>
            <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-b from-transparent to-[#eef3f6]" />
          </div>

          <div className="relative mx-auto grid max-w-6xl gap-14 px-5 pb-28 pt-28 sm:px-8 lg:grid-cols-[1.08fr_0.92fr] lg:items-end lg:gap-8 lg:pb-32 lg:pt-36">
            <div className="lp-hero-copy max-w-xl pb-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-accent">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Academic Document Analysis
              </div>
              <h1 className="mt-5 font-semibold tracking-tight text-[2.45rem] leading-[1.08] sm:text-[3.15rem] lg:text-[3.4rem]">
                Format Compliance
                <span className="mt-1 block text-accent">Made Simple.</span>
              </h1>
              <p className="mt-5 max-w-md text-[15px] leading-relaxed text-slate-300 sm:text-base">
                Set format mechanics, upload a PDF manuscript, and get a compliance score with traced
                issues and recommendations - focused on formatting, not grammar or content.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={onGetStarted}
                  className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-navy-deep shadow-[0_12px_30px_-12px_rgba(27,201,160,0.85)] transition hover:bg-accent-hover"
                >
                  Get Started
                </button>
                <button
                  type="button"
                  onClick={() => goSection("features")}
                  className="rounded-full border border-white/20 bg-white/[0.04] px-6 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/[0.07]"
                >
                  Explore Features
                </button>
              </div>

              <ul className="mt-8 flex flex-col gap-2.5 text-sm text-slate-300 sm:flex-row sm:flex-wrap sm:gap-x-6">
                {["Academic Formatting Standards", "Issue tracing & reports"].map((item) => (
                  <li key={item} className="flex items-center gap-2">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-accent/15 text-accent">
                      <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" aria-hidden="true">
                        <path
                          d="M3.5 8.2 6.4 11l6-6.5"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="lp-hero-visual lg:translate-y-6">
              <CompliancePreview />
            </div>
          </div>
        </section>

        <section id="features" className="relative scroll-mt-24 -mt-10 pb-20 sm:pb-24">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-white shadow-[0_30px_60px_-40px_rgba(15,27,45,0.35)]">
              <div className="grid gap-0 lg:grid-cols-[0.9fr_1.1fr]">
                <div className="border-b border-slate-100 bg-[linear-gradient(160deg,#0F1B2D_0%,#16233A_55%,#12353A_100%)] px-7 py-10 text-white sm:px-10 lg:border-b-0 lg:border-r lg:border-white/10">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-accent">Features</p>
                  <h2 className="mt-3 text-[1.85rem] font-semibold tracking-tight sm:text-[2.15rem]">
                    What PaperPilot offers
                  </h2>
                  <p className="mt-4 max-w-sm text-sm leading-relaxed text-slate-300">
                    The same workflow you use in the app: mechanics, PDF manuscript upload, compliance
                    scan, and a report you can download.
                  </p>
                  <button
                    type="button"
                    onClick={onGetStarted}
                    className="mt-8 rounded-full bg-accent px-5 py-2.5 text-sm font-semibold text-navy-deep transition hover:bg-accent-hover"
                  >
                    Start checking
                  </button>
                </div>

                <div className="grid sm:grid-cols-2">
                  {FEATURES.map((feature, index) => (
                    <article
                      key={feature.title}
                      className={`group px-6 py-7 sm:px-7 ${
                        index % 2 === 0 ? "sm:border-r sm:border-slate-100" : ""
                      } ${index < 2 ? "border-b border-slate-100" : ""}`}
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-muted text-accent transition group-hover:scale-105 group-hover:bg-accent group-hover:text-navy-deep">
                        {feature.icon}
                      </div>
                      <h3 className="mt-4 text-base font-semibold tracking-tight text-navy">{feature.title}</h3>
                      <p className="mt-2 text-sm leading-relaxed text-slate-500">{feature.body}</p>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-24 pb-20 sm:pb-24">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="max-w-2xl">
              <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-accent">How It Works</p>
              <h2 className="mt-3 text-[1.85rem] font-semibold tracking-tight text-navy sm:text-[2.25rem]">
                The same three steps as the upload journey
              </h2>
            </div>

            <ol className="relative mt-12 grid gap-6 lg:grid-cols-3">
              <div
                className="pointer-events-none absolute left-[8%] right-[8%] top-[2.15rem] hidden h-px bg-gradient-to-r from-accent/10 via-accent/50 to-accent/10 lg:block"
                aria-hidden="true"
              />
              {STEPS.map((step) => (
                <li
                  key={step.n}
                  className="relative rounded-2xl border border-slate-200/80 bg-white/80 px-6 py-7 backdrop-blur-sm"
                >
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-navy font-['Quicksand',sans-serif] text-xs font-bold tracking-[0.12em] text-accent">
                    {step.n}
                  </span>
                  <h3 className="mt-4 text-lg font-semibold text-navy">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500 sm:text-[15px]">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="pricing" className="scroll-mt-24 pb-20 sm:pb-24">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-accent">Pricing</p>
              <h2 className="mt-3 text-[1.85rem] font-semibold tracking-tight text-navy sm:text-[2.25rem]">
                Plans that match your scan limits
              </h2>
              <p className="mt-3 text-sm text-slate-500 sm:text-[15px]">
                Limits below match the in-app subscription catalogue. Annual billing available for paid
                tiers ({ANNUAL_SAVINGS_LABEL}).
              </p>
            </div>

            <div className="mt-12 grid gap-5 lg:grid-cols-3">
              {PLANS.map((plan) => (
                <div
                  key={plan.name}
                  className={`relative flex flex-col overflow-hidden rounded-2xl border px-6 py-7 ${
                    plan.accent
                      ? "border-accent/35 bg-navy text-white shadow-[0_28px_55px_-30px_rgba(15,27,45,0.65)]"
                      : "border-slate-200/90 bg-white text-navy"
                  }`}
                >
                  {plan.accent ? (
                    <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-accent/15 blur-2xl" aria-hidden="true" />
                  ) : null}
                  <div className="relative flex items-baseline justify-between gap-3">
                    <h3 className="text-lg font-semibold">{plan.name}</h3>
                    {plan.accent ? (
                      <span className="rounded-full bg-accent/15 px-2.5 py-1 text-[11px] font-semibold text-accent">
                        Popular
                      </span>
                    ) : null}
                  </div>
                  <p className={`relative mt-4 text-sm ${plan.accent ? "text-slate-300" : "text-slate-500"}`}>
                    {plan.blurb}
                  </p>
                  <p className="relative mt-5 flex items-end gap-1">
                    <span className="text-3xl font-semibold tracking-tight">
                      {plan.price === "0" ? "Free" : `₱${Number(plan.price).toLocaleString("en-PH")}`}
                    </span>
                    {plan.price !== "0" ? (
                      <span className={`pb-1 text-sm ${plan.accent ? "text-slate-400" : "text-slate-500"}`}>
                        {plan.period}
                      </span>
                    ) : null}
                  </p>
                  <ul className="relative mt-6 flex-1 space-y-2.5">
                    {plan.features.map((feature) => (
                      <li
                        key={feature}
                        className={`flex items-start gap-2 text-sm ${
                          plan.accent ? "text-slate-200" : "text-slate-600"
                        }`}
                      >
                        <span className="mt-0.5 text-accent">
                          <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" aria-hidden="true">
                            <path
                              d="M3.5 8.2 6.4 11l6-6.5"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={onGetStarted}
                    className={`relative mt-8 w-full rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                      plan.accent
                        ? "bg-accent text-navy-deep hover:bg-accent-hover"
                        : "border border-navy/15 text-navy hover:border-accent hover:text-accent"
                    }`}
                  >
                    {plan.price === "0" ? "Start free" : "Choose plan"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="about" className="scroll-mt-24 pb-20 sm:pb-24">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="overflow-hidden rounded-[1.75rem] bg-navy text-white">
              <div className="grid lg:grid-cols-[1.05fr_0.95fr]">
                <div className="relative px-7 py-12 sm:px-10 sm:py-14">
                  <div className="pointer-events-none absolute inset-0 opacity-40" aria-hidden="true">
                    <div className="absolute -left-16 top-10 h-56 w-56 rounded-full bg-accent/20 blur-3xl" />
                  </div>
                  <p className="relative text-[12px] font-semibold uppercase tracking-[0.18em] text-accent">About</p>
                  <h2 className="relative mt-3 max-w-md text-[1.9rem] font-semibold tracking-tight sm:text-[2.3rem]">
                    An AI-powered academic document analysis and compliance checking system
                  </h2>
                  <p className="relative mt-5 max-w-md text-sm leading-relaxed text-slate-300 sm:text-[15px]">
                    Built for students, researchers, and professionals preparing academic manuscripts.
                    PaperPilot checks your PDF against format mechanics you save, upload, or customize.
                  </p>
                </div>

                <div className="border-t border-white/10 bg-navy-mid/50 px-7 py-10 sm:px-10 lg:border-l lg:border-t-0">
                  <ul className="space-y-7">
                    {ABOUT_POINTS.map((point, index) => (
                      <li key={point.title} className="flex gap-4">
                        <span className="mt-1 font-['Quicksand',sans-serif] text-sm font-bold text-accent">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <div>
                          <h3 className="text-base font-semibold">{point.title}</h3>
                          <p className="mt-1.5 text-sm leading-relaxed text-slate-300">{point.body}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="pb-20 sm:pb-24">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="relative overflow-hidden rounded-[1.75rem] border border-accent/25 bg-[linear-gradient(120deg,#0B1422_0%,#0F1B2D_45%,#13443C_100%)] px-7 py-12 text-white sm:px-10 sm:py-14">
              <div className="pointer-events-none absolute -right-8 top-0 h-48 w-48 rounded-full bg-accent/20 blur-3xl" aria-hidden="true" />
              <div className="relative flex flex-col items-start justify-between gap-8 lg:flex-row lg:items-center">
                <div className="max-w-xl">
                  <h2 className="text-[1.85rem] font-semibold tracking-tight sm:text-[2.15rem]">
                    Ready to run a compliance scan?
                  </h2>
                  <p className="mt-3 text-sm leading-relaxed text-slate-300 sm:text-[15px]">
                    Create a free account, set your format mechanics, upload a PDF manuscript, and open your
                    compliance report.
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={onGetStarted}
                    className="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-navy-deep transition hover:bg-accent-hover"
                  >
                    Get Started
                  </button>
                  <button
                    type="button"
                    onClick={onSignIn}
                    className="rounded-full border border-white/25 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/45"
                  >
                    Sign In
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200/80 bg-white/70">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-8 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2.5">
            <PaperPilotMark className="h-8 w-8" />
            <div>
              <p className="font-['Quicksand',sans-serif] text-sm font-bold tracking-[0.08em] text-navy">
                PAPERPILOT
              </p>
              <p className="text-[11px] text-slate-500">
                AI-powered academic document analysis and compliance checking.
              </p>
            </div>
          </div>
          <nav className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-500" aria-label="Footer">
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => goSection(item.id)}
                className="transition hover:text-navy"
              >
                {item.label}
              </button>
            ))}
          </nav>
          <p className="text-xs text-slate-400">© {new Date().getFullYear()} PaperPilot. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
