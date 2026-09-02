const COPY = {
  login: {
    headlineBefore: "Format Compliance ",
    headlineAccent: "Made Simple.",
    sub: "Check manuscripts against journal rules and get instant, citation-aware feedback.",
  },
  register: {
    headlineBefore: "Your next submission, ",
    headlineAccent: "done right.",
    sub: "Create an account to save reviews, track format scores, and ship camera-ready papers faster.",
  },
  forgot: {
    headlineBefore: "Back to your ",
    headlineAccent: "research, fast.",
    sub: "Confirm the 6-digit code we email you, then choose a new password.",
  },
};

function LogoMark() {
  return (
    <div className="flex items-center gap-3">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-navy shadow-[0_8px_24px_rgba(27,201,160,0.28)]">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
          <path d="M4 12.5 20 4l-6.2 16-2.4-6.4L4 12.5Z" fill="currentColor" />
        </svg>
      </span>
      <span className="text-lg font-semibold tracking-tight text-white">PaperPilot</span>
    </div>
  );
}

/**
 * Split-screen frame shared by the login, register, and password-reset screens.
 * `panelKey` re-triggers the slide animation whenever the visible step changes.
 */
export default function AuthShell({
  variant = "login",
  slideDir = "left",
  panelKey,
  title,
  subtitle,
  children,
  footer,
  onContinueAsGuest,
}) {
  const copy = COPY[variant] || COPY.login;

  return (
    <div className="flex min-h-screen bg-white text-slate-800">
      <aside className="relative hidden w-[45%] flex-col overflow-hidden bg-navy px-10 py-10 text-white lg:flex xl:px-14">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -bottom-28 -left-24 h-[28rem] w-[28rem] rounded-full bg-navy-mid/80" />
          <div className="absolute -bottom-10 left-10 h-80 w-80 rounded-full border border-white/[0.07]" />
          <div className="absolute bottom-24 left-28 h-52 w-52 rounded-full border border-accent/15" />
          <div className="absolute -right-16 top-24 h-64 w-64 rounded-full bg-accent/[0.06]" />
          <div className="absolute right-20 top-40 h-40 w-40 rounded-full border border-white/[0.06]" />
        </div>

        <div className="relative z-10">
          <LogoMark />
        </div>

        <div className="relative z-10 mt-16 max-w-md">
          <h1
            key={`h-${variant}`}
            className={`text-[2.35rem] font-semibold leading-[1.15] tracking-tight auth-copy-${slideDir}`}
          >
            {copy.headlineBefore}
            <span className="text-accent">{copy.headlineAccent}</span>
          </h1>
          <p key={`s-${variant}`} className={`mt-4 text-[15px] leading-relaxed text-slate-300/90 auth-copy-${slideDir}`}>
            {copy.sub}
          </p>
          <ul className="mt-8 flex flex-wrap gap-2">
            {["Format Checker", "AI Feedback", "Instant Reports"].map((item) => (
              <li
                key={item}
                className="rounded-full border border-white/10 bg-white/[0.06] px-3.5 py-1.5 text-xs font-medium tracking-wide text-slate-200"
              >
                {item}
              </li>
            ))}
          </ul>
        </div>

        <blockquote className="relative z-10 mt-auto max-w-md border-t border-white/10 pt-6">
          <p className="text-sm leading-relaxed text-slate-300">
            “PaperPilot caught every margin and citation mismatch before our journal desk reject.”
          </p>
        </blockquote>
      </aside>

      <section className="flex w-full flex-1 items-center justify-center bg-[#EEF1F5] px-5 py-10 sm:px-10 lg:w-[55%]">
        <div className="w-full max-w-[440px] sm:px-9 sm:py-10">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent text-navy">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
                <path d="M4 12.5 20 4l-6.2 16-2.4-6.4L4 12.5Z" fill="currentColor" />
              </svg>
            </span>
            <span className="font-semibold text-navy">PaperPilot</span>
          </div>

          <div className="relative min-h-[34rem] overflow-hidden">
            <div key={panelKey ?? variant} className={`auth-panel auth-slide-${slideDir}`}>
              <h2 className="text-[1.65rem] font-semibold tracking-tight text-navy">{title}</h2>
              {subtitle ? <p className="mt-1.5 text-sm text-slate-500">{subtitle}</p> : null}

              {children}

              {footer}

              {onContinueAsGuest && (
                <p className="mt-3 text-center">
                  <button
                    type="button"
                    className="text-sm text-slate-400 underline-offset-2 hover:text-slate-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-sm"
                    onClick={onContinueAsGuest}
                  >
                    Continue without signing in
                  </button>
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
