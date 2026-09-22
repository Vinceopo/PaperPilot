/**
 * Small PDF / Word badge for uploaded documents (only those types are allowed).
 */

function extensionOf(name = "") {
  const match = String(name).toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "";
}

export function resolveFileKind(fileType, filename) {
  const raw = String(fileType || "").toLowerCase().trim();
  if (raw === "pdf" || raw.includes("pdf")) return "pdf";
  if (
    raw === "docx" ||
    raw === "doc" ||
    raw.includes("word") ||
    raw.includes("officedocument")
  ) {
    return "docx";
  }
  const ext = extensionOf(filename);
  if (ext === "pdf") return "pdf";
  if (ext === "docx" || ext === "doc") return "docx";
  return "";
}

function PdfGlyph({ className = "h-8 w-7" }) {
  return (
    <svg viewBox="0 0 32 40" className={className} aria-hidden="true">
      <path
        d="M4 0h16l8 8v28a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4z"
        fill="#FEE2E2"
      />
      <path d="M20 0l8 8h-6a2 2 0 0 1-2-2V0z" fill="#FECACA" />
      <rect x="4" y="18" width="24" height="12" rx="2" fill="#DC2626" />
      <text
        x="16"
        y="27"
        textAnchor="middle"
        fontSize="7"
        fontWeight="700"
        fontFamily="system-ui,Segoe UI,sans-serif"
        fill="#fff"
      >
        PDF
      </text>
    </svg>
  );
}

function WordGlyph({ className = "h-8 w-7" }) {
  return (
    <svg viewBox="0 0 32 40" className={className} aria-hidden="true">
      <path
        d="M4 0h16l8 8v28a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4z"
        fill="#DBEAFE"
      />
      <path d="M20 0l8 8h-6a2 2 0 0 1-2-2V0z" fill="#BFDBFE" />
      <rect x="4" y="18" width="24" height="12" rx="2" fill="#2563EB" />
      <text
        x="16"
        y="27"
        textAnchor="middle"
        fontSize="6.5"
        fontWeight="700"
        fontFamily="system-ui,Segoe UI,sans-serif"
        fill="#fff"
      >
        DOC
      </text>
    </svg>
  );
}

function UnknownGlyph({ className = "h-8 w-7" }) {
  return (
    <span
      className={`inline-block rounded-sm border-2 border-slate-300 bg-white ${className}`}
      aria-hidden="true"
    />
  );
}

export default function FileTypeIcon({ fileType, filename, className = "h-8 w-7 shrink-0" }) {
  const kind = resolveFileKind(fileType, filename);
  if (kind === "pdf") return <PdfGlyph className={className} />;
  if (kind === "docx") return <WordGlyph className={className} />;
  return <UnknownGlyph className={className} />;
}
