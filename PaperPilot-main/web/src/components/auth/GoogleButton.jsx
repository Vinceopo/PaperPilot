export default function GoogleButton({ label, onClick, disabled }) {
  return (
    <>
      <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-wider text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        or continue with
        <span className="h-px flex-1 bg-slate-200" />
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-white py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 disabled:opacity-60"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09Z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.11A6.97 6.97 0 0 1 5.48 12c0-.73.13-1.45.36-2.11V7.05H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.95l3.66-2.84Z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.51 6.16-4.51Z"
          />
        </svg>
        {label}
      </button>
    </>
  );
}
