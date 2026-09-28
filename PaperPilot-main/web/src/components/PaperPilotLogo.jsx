function PaperPilotMark({ className = "h-12 w-12" }) {
  return (
    <svg viewBox="0 0 64 64" className={`${className} drop-shadow-[0_6px_12px_rgba(20,184,166,0.28)]`} aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#BDF2D8" />
      <path d="M15 33.5 51 13l-13 38-5.4-15.2L15 33.5Z" fill="#1ec4ae" />
      <path d="M15 33.5 51 13 32.6 28.8 15 33.5Z" fill="#101a30" />
      <circle cx="17.5" cy="45.5" r="2.15" fill="#f2b431" />
      <circle cx="23" cy="50" r="1.7" fill="#f2b431" />
      <circle cx="27.6" cy="53.6" r="1.25" fill="#f2b431" />
    </svg>
  );
}

export default function PaperPilotLogo({
  className = "",
  markClassName = "h-12 w-12",
  subtitle = true,
  wordClassName = "text-[17px]",
  tone = "light",
}) {
  const onDark = tone === "dark";
  return (
    <span className={`flex min-w-0 items-center gap-3 ${className}`}>
      <PaperPilotMark className={`shrink-0 ${markClassName}`} />
      <span className="min-w-0 text-left">
        <span className={`block font-bold leading-none tracking-tight ${onDark ? "text-white" : "text-[#172033]"} ${wordClassName}`}>
          Paper<span className="text-[#14b8a6]">Pilot</span>
        </span>
        {subtitle ? (
          <span className={`mt-1 block text-[11px] leading-tight ${onDark ? "text-slate-400" : "text-slate-500"}`}>
            Academic document compliance
          </span>
        ) : null}
      </span>
    </span>
  );
}
