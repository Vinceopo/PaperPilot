/**
 * Shared navy-header card used by Confirm email, Forgot Password, OTP,
 * Account Created, Password Changed, and similar auth / account flows.
 *
 * mode="overlay" — fixed centered modal with backdrop (in-app)
 * mode="page"    — full-viewport centered card (pre-login screens)
 */

const ICONS = {
  lock: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
    </svg>
  ),
  mail: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
    </svg>
  ),
  shield: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 12 2.25c2.663 0 5.176.736 7.309 2.016A11.966 11.966 0 0 1 21.75 12c0 5.272-3.42 9.736-8.16 11.25A11.95 11.95 0 0 1 12 23.25a11.95 11.95 0 0 1-1.59-.105C5.67 21.736 2.25 17.272 2.25 12c0-2.63.84-5.066 2.266-7.034A11.958 11.958 0 0 1 12 2.25Z" />
    </svg>
  ),
  check: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
    </svg>
  ),
  user: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
    </svg>
  ),
};

export default function AuthFeatureCard({
  mode = "overlay",
  title,
  subtitle,
  icon = "lock",
  /** Square-ish default; use max-w-2xl + square={false} for wider forms like Edit profile. */
  maxWidth = "max-w-[28rem]",
  square = true,
  onBackdrop,
  children,
  footer,
  zIndex = "z-50",
}) {
  const iconNode = typeof icon === "string" ? ICONS[icon] || ICONS.lock : icon;

  const card = (
    <div
      className={`flex max-h-[min(92dvh,40rem)] w-full ${maxWidth} flex-col overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl ${
        square ? "min-h-[min(28rem,85dvh)]" : ""
      }`}
      role={mode === "overlay" ? undefined : "region"}
      aria-label={title}
    >
      <div className="relative overflow-hidden border-b border-slate-100 bg-gradient-to-br from-[#101a30] via-[#15243d] to-[#1a3a5c] px-8 py-8 text-white">
        <div
          className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-[#16bfa8]/15 blur-2xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-10 left-8 h-28 w-28 rounded-full bg-sky-400/10 blur-2xl"
          aria-hidden
        />
        <div className="relative flex flex-col items-center gap-3 text-center">
          {iconNode ? (
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[#16bfa8]/20 text-[#16bfa8] ring-1 ring-[#16bfa8]/30">
              {iconNode}
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
            {subtitle ? (
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{subtitle}</p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col justify-center px-8 py-8">
        {children}
        {footer}
      </div>
    </div>
  );

  if (mode === "page") {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#eef1f5] px-4 py-8 sm:px-6">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-[#d7ebe7]/70 blur-2xl" />
          <div className="absolute -bottom-24 -left-16 h-56 w-56 rounded-full bg-[#dce4f0]/80 blur-2xl" />
        </div>
        <div className="relative z-10 flex w-full justify-center">{card}</div>
      </div>
    );
  }

  return (
    <div
      className={`fixed inset-0 ${zIndex} flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-sm sm:p-6`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget && onBackdrop) onBackdrop();
      }}
    >
      <div className="flex w-full justify-center">{card}</div>
    </div>
  );
}
