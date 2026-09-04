import { useEffect, useRef, useState } from "react";
import { normalizeTitle } from "../../lib/scannedLibrary.js";

function validateFile(file) {
  if (!file) return "Choose a manuscript.";
  const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
  if (![".pdf", ".docx"].includes(ext)) return "Manuscript must be a PDF or DOCX file.";
  if (file.size > 25_000_000) return "File must be 25 MB or smaller.";
  return "";
}

/**
 * manuscripts — shared library entries from My Manuscripts (same source of truth).
 */
export default function ManuscriptPanel({
  mechanicsSelected,
  manuscripts = [],
  selectedManuscriptId = "",
  onSelectManuscript,
  onUpload,
  onFilePick,
  uploadCancelKey = 0,
  busy,
}) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [manuscriptId, setManuscriptId] = useState(selectedManuscriptId || "");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Keep selection in sync with parent + drop deleted targets.
  useEffect(() => {
    if (selectedManuscriptId && manuscripts.some((m) => m.id === selectedManuscriptId)) {
      setManuscriptId(selectedManuscriptId);
      return;
    }
    if (manuscriptId && !manuscripts.some((m) => m.id === manuscriptId)) {
      setManuscriptId("");
    }
  }, [selectedManuscriptId, manuscripts, manuscriptId]);

  // Parent Dismiss / Cancel upload — clear staged file and success copy.
  useEffect(() => {
    if (!uploadCancelKey) return;
    setFile(null);
    setSuccess("");
    setError("");
    setTitle("");
    if (inputRef.current) inputRef.current.value = "";
  }, [uploadCancelKey]);

  function chooseManuscript(id) {
    setManuscriptId(id);
    if (id) setTitle("");
    onSelectManuscript?.(id);
  }

  async function submit(e) {
    e.preventDefault();
    const issue = validateFile(file);
    if (!manuscriptId && !title.trim()) {
      setError("Enter a title for a new manuscript.");
      return;
    }
    setError(issue);
    setSuccess("");
    if (issue) return;

    const selectedMs = manuscriptId
      ? manuscripts.find((m) => m.id === manuscriptId)
      : null;
    const resolvedTitle = (
      selectedMs?.title ||
      title ||
      file.name.replace(/\.(pdf|docx)$/i, "")
    ).trim();
    if (!manuscriptId) {
      const taken = manuscripts.some(
        (m) => normalizeTitle(m.title) === normalizeTitle(resolvedTitle)
      );
      if (taken) {
        setError("A manuscript with this title already exists. Choose a unique title.");
        return;
      }
    }

    const uploaded = file;
    const ok = await onUpload({
      file: uploaded,
      title: resolvedTitle,
      manuscriptId,
    });
    if (ok) {
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setSuccess("Manuscript uploaded completely and ready to scan. See File details below.");
    }
  }

  return (
    <section
      className={`rounded-xl border p-6 shadow-sm transition ${
        mechanicsSelected
          ? "border-slate-200 bg-white"
          : "border-slate-200 bg-white opacity-50 grayscale"
      }`}
      aria-disabled={!mechanicsSelected}
    >
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#16bfa8]">Step 2</p>
      <h2 className="mt-1 text-lg font-bold text-[#172033]">Upload Manuscript</h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">
        {mechanicsSelected
          ? "Upload the manuscript you want to check against the selected format guide."
          : "Select formatting mechanics first to unlock this upload."}
      </p>

      <form onSubmit={submit} className="mt-5 space-y-3">
        {manuscripts.length ? (
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Upload to
            <select
              disabled={!mechanicsSelected || busy}
              value={manuscriptId}
              onChange={(e) => chooseManuscript(e.target.value)}
              className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-[#f8f9fb] px-3 text-xs font-medium normal-case tracking-normal text-slate-700 outline-none focus:border-[#16bfa8] disabled:cursor-not-allowed"
            >
              <option value="">Create a new manuscript</option>
              {manuscripts.map((item) => {
                const versionCount = Number(
                  item.version_count ?? item.current_version_number ?? item.versions?.length ?? 0
                );
                return (
                  <option key={item.id} value={item.id}>
                    {item.title} · upload version {versionCount + 1}
                  </option>
                );
              })}
            </select>
          </label>
        ) : (
          <p className="text-xs text-slate-400">
            No manuscripts in My Manuscripts yet — create a new one below, then scan it.
          </p>
        )}

        {!manuscriptId && (
          <input
            disabled={!mechanicsSelected || busy}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Manuscript title (must be unique)"
            className="h-10 w-full rounded-lg border border-slate-200 bg-[#f8f9fb] px-3 text-xs text-slate-700 outline-none placeholder:text-slate-400 focus:border-[#16bfa8] disabled:cursor-not-allowed"
          />
        )}

        <label
          className={`flex min-h-40 flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 text-center ${
            mechanicsSelected
              ? "cursor-pointer border-[#18bda9] bg-[#f7fcfc] hover:bg-[#f0fbf9]"
              : "cursor-not-allowed border-slate-300 bg-slate-50"
          }`}
        >
          <span className="grid h-11 w-11 place-items-center rounded-full bg-[#dcf7f2] text-3xl font-light text-[#16bfa8]">↑</span>
          <p className="mt-3 text-sm font-bold text-slate-700">
            {file ? file.name : "Drop your manuscript here"}
          </p>
          <p className="mt-1 text-[11px] text-slate-400">
            {file
              ? "Click Upload manuscript below when ready"
              : "Supports .pdf and .docx · Max 25 MB"}
          </p>
          <span className="mt-3 rounded-full border border-[#16bfa8] bg-white px-5 py-1.5 text-[11px] font-semibold text-[#109b89]">
            Browse files
          </span>
          <input
            ref={inputRef}
            type="file"
            disabled={!mechanicsSelected || busy}
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="sr-only"
            onChange={(e) => {
              const next = e.target.files?.[0] || null;
              setFile(next);
              setError(validateFile(next));
              setSuccess("");
              onFilePick?.(next);
            }}
          />
        </label>

        {error && <p className="text-xs text-rose-500">{error}</p>}
        {success && !error && (
          <p className="text-xs font-semibold text-emerald-600" role="status">
            {success}
          </p>
        )}

        <button
          type="submit"
          disabled={!mechanicsSelected || !file || busy}
          className="w-full rounded-lg bg-[#16bfa8] py-2.5 text-xs font-bold text-white transition hover:bg-[#12ae99] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Uploading…" : manuscriptId ? "Upload new version" : "Upload manuscript"}
        </button>
      </form>
    </section>
  );
}
