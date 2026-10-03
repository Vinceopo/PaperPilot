const INK = "#1e5756";
const TEAL = "#3f9a8c";
const MINT = "#b1e7cb";

export function PaperPilotMark({ className = "h-12 w-12", tile = true }) {
  return (
    <svg viewBox="4 1 64 69" className={className} aria-hidden="true">
      {tile && <rect x="4" y="1" width="64" height="69" rx="15" fill={MINT} />}
      <g stroke={INK} strokeWidth="3.2" strokeLinejoin="round">
        <rect x="13.5" y="14.5" width="25" height="48.5" fill={TEAL} />
        <path d="M21.5 7.5H45.5L58.5 20.5V47.5H38.5V55H21.5Z" fill={MINT} />
        <path d="M45.5 7.5V20.5H58.5Z" fill={TEAL} />
        <path d="M31 32L36.5 39.5L50.5 21.5" fill="none" strokeWidth="4" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/**
 * Brand lockup: mark with the PAPERPILOT wordmark and tagline stacked beneath.
 * Text has no backdrop so it sits directly on whatever surface hosts it.
 */
export default function PaperPilotLogo({
  className = "",
  markClassName = "h-12 w-12",
  subtitle = true,
  tone = "light",
  align = "center",
}) {
  const onDark = tone === "dark";
  const alignment = align === "start" ? "items-start text-left" : "items-center text-center";
  return (
    <span className={`flex min-w-0 flex-col ${alignment} ${className}`}>
      <PaperPilotMark className={`shrink-0 ${markClassName}`} />
      <span
        className={`mt-2 block font-['Quicksand',sans-serif] text-[23px] font-bold leading-none tracking-[0.06em] ${
          onDark ? "text-[#e6faf5]" : "text-[#225b5f]"
        }`}
      >
        PAPERPILOT
      </span>
      {subtitle ? (
        <span
          className={`mt-1.5 block font-['Quicksand',sans-serif] text-[8px] font-semibold uppercase leading-[1.55] tracking-[0.14em] ${
            onDark ? "text-[#5fd3c1]" : "text-[#1f9e97]"
          }`}
        >
          <span className="block whitespace-nowrap">An AI-powered academic document</span>
          <span className="block whitespace-nowrap">analysis and compliance checking system</span>
        </span>
      ) : null}
    </span>
  );
}
