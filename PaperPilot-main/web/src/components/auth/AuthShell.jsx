import PaperPilotLogo from "../PaperPilotLogo.jsx";

const COPY = {
  login: {
    headlineBefore: "Format Compliance ",
    headlineAccent: "Made Simple.",
    sub: "Check manuscripts against journal rules and get instant, citation-aware feedback.",
    quote: "PaperPilot helps you get every academic document format-ready.",
  },
  register: {
    headlineBefore: "Your next submission, ",
    headlineAccent: "done right.",
    sub: "Create an account to save reviews, track format scores, and ship camera-ready papers faster.",
    quote: "PaperPilot helps you get every academic document format-ready.",
  },
  forgot: {
    headlineBefore: "Back to your ",
    headlineAccent: "research, fast.",
    sub: "Confirm the 6-digit code we email you, then choose a new password.",
    quote: "PaperPilot helps you get every academic document format-ready.",
  },
};

/**
 * Split-screen frame shared by the login, register, and password-reset screens.
 * `panelKey` re-triggers the slide animation whenever the visible step changes.
 * `compact` densifies the right panel so tall forms (registration) fit one desktop viewport.
 */
export default function AuthShell({
  variant = "login",
  slideDir = "left",
  panelKey,
  title,
  subtitle,
  children,
  footer,
  compact = false,
}) {
  const copy = COPY[variant] || COPY.login;

  return (
    <div
      className={`flex bg-white text-slate-800 ${
        compact ? "h-dvh max-h-dvh overflow-hidden" : "min-h-screen"
      }`}
    >
      <aside
        className={`relative hidden w-[45%] flex-col overflow-hidden bg-navy text-white lg:flex ${
          compact ? "px-8 py-7 xl:px-12" : "px-10 py-10 xl:px-14"
        }`}
      >
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -bottom-28 -left-24 h-[28rem] w-[28rem] rounded-full bg-navy-mid/80" />
          <div className="absolute -bottom-10 left-10 h-80 w-80 rounded-full border border-white/[0.07]" />
          <div className="absolute bottom-24 left-28 h-52 w-52 rounded-full border border-accent/15" />
          <div className="absolute -right-16 top-24 h-64 w-64 rounded-full bg-accent/[0.06]" />
          <div className="absolute right-20 top-40 h-40 w-40 rounded-full border border-white/[0.06]" />
        </div>

        <div className="relative z-10">
          <PaperPilotLogo tone="dark" align="start" />
        </div>

        <div className={`relative z-10 max-w-md ${compact ? "mt-10" : "mt-16"}`}>
          <h1
            key={`h-${variant}`}
            className={`${
              compact ? "text-[2rem]" : "text-[2.35rem]"
            } font-semibold leading-[1.15] tracking-tight auth-copy-${slideDir}`}
          >
            {copy.headlineBefore}
            <span className="text-accent">{copy.headlineAccent}</span>
          </h1>
          <p
            key={`s-${variant}`}
            className={`${
              compact ? "mt-3 text-[14px]" : "mt-4 text-[15px]"
            } leading-relaxed text-slate-300/90 auth-copy-${slideDir}`}
          >
            {copy.sub}
          </p>
          <ul className={`flex flex-wrap gap-2 ${compact ? "mt-5" : "mt-8"}`}>
            {["Format Checker", "AI Feedback", "Compliance Report"].map((item) => (
              <li
                key={item}
                className="rounded-full border border-white/10 bg-white/[0.06] px-3.5 py-1.5 text-xs font-medium tracking-wide text-slate-200"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>

        <blockquote
          className={`relative z-10 mt-auto max-w-md border-t border-white/10 ${
            compact ? "pt-4" : "pt-6"
          }`}
        >
          <p className={`leading-relaxed text-slate-300 ${compact ? "text-[13px]" : "text-sm"}`}>
            {copy.quote}
          </p>
        </blockquote>
      </aside>

      <section
        className={`flex w-full flex-1 items-center justify-center bg-[#EEF1F5] lg:w-[55%] ${
          compact
            ? "min-h-0 overflow-x-hidden overflow-y-auto px-4 py-4 sm:px-8 lg:py-5"
            : "px-5 py-10 sm:px-10"
        }`}
      >
        <div
          className={`w-full ${
            compact ? "max-w-[460px] sm:px-4" : "max-w-[440px] sm:px-9 sm:py-10"
          }`}
        >
          <div className={`flex justify-center lg:hidden ${compact ? "mb-4" : "mb-8"}`}>
            <PaperPilotLogo markClassName={compact ? "h-9 w-9" : "h-10 w-10"} />
          </div>

          <div className="relative overflow-hidden">
            <div
              key={panelKey ?? variant}
              className={`auth-panel auth-slide-${slideDir}${compact ? " auth-form-compact" : ""}`}
            >
              <h2
                className={`font-semibold tracking-tight text-navy ${
                  compact
                    ? "text-[1.35rem] leading-snug"
                    : "text-[1.65rem] leading-snug"
                }`}
              >
                {title}
              </h2>
              {subtitle ? (
                <p
                  className={`text-slate-500 ${
                    compact ? "mt-1 text-[13px] leading-4" : "mt-1.5 text-sm leading-5"
                  }`}
                >
                  {subtitle}
                </p>
              ) : null}

              {children}

              {footer}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
