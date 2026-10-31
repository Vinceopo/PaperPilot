/**
 * Shared “Back to Dashboard” control — pill mint style used across cockpit screens.
 * Includes consistent vertical padding so header/content layouts stay even.
 */
export default function BackToDashboardButton({ onClick, className = "", label = "Back to Dashboard" }) {
  if (!onClick) return null;
  return (
    <div className={`inline-flex py-1 ${className}`.trim()}>
      <button
        type="button"
        onClick={onClick}
        className="group inline-flex items-center gap-1.5 rounded-full border border-[#bfeee5] bg-[#f0fbf9] py-1.5 pl-2.5 pr-3.5 text-xs font-bold text-[#109b89] shadow-sm transition hover:border-[#16bfa8] hover:bg-[#dcf7f2] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#16bfa8]/40"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
        </svg>
        {label}
      </button>
    </div>
  );
}
