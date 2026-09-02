import { useRef, useState } from "react";

function validateFile(file) {
  if (!file) return "Choose a manuscript.";
  const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
  if (![".pdf", ".docx"].includes(ext)) return "Manuscript must be a PDF or DOCX file.";
  if (file.size > 25_000_000) return "File must be 25 MB or smaller.";
  return "";
}

export default function ManuscriptPanel({
  mechanicsSelected,
  manuscripts,
  currentVersion,
  onUpload,
  onLoadHistory,
  onFileSelect,   // optional: called with (File|null) whenever the user picks a file
  busy,
}) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [manuscriptId, setManuscriptId] = useState("");
  const [error, setError] = useState("");

  async function submit(e) {
    e.preventDefault();
    const issue = validateFile(file);
    if (!manuscriptId && !title.trim()) {
      setError("Enter a title for a new manuscript.");
      return;
    }
    setError(issue);
    if (issue) return;
    const ok = await onUpload({ file, title: title || file.name.replace(/\.(pdf|docx)$/i, ""), manuscriptId });
    if (ok) {
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
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
              onChange={(e) => {
                setManuscriptId(e.target.value);
                if (e.target.value) setTitle("");
              }}
              className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-[#f8f9fb] px-3 text-xs font-medium normal-case tracking-normal text-slate-700 outline-none focus:border-[#16bfa8] disabled:cursor-not-allowed"
            >
              <option value="">Create a new manuscript</option>
              {manuscripts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title} · upload version {Number(item.version_count || item.current_version_number || 0) + 1}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        {!manuscriptId && (
          <input
            disabled={!mechanicsSelected || busy}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Manuscript title"
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
          <p className="mt-3 text-sm font-bold text-slate-700">{file?.name || "Drop your manuscript here"}</p>
          <p className="mt-1 text-[11px] text-slate-400">Supports .pdf and .docx · Max 25 MB</p>
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
              onFileSelect?.(next);   // notify parent (feeds useScanFlow)
            }}
          />
        </label>

        {error && <p className="text-xs text-rose-500">{error}</p>}

        <button
          type="submit"
          disabled={!mechanicsSelected || !file || busy}
          className="w-full rounded-lg bg-[#16bfa8] py-2.5 text-xs font-bold text-white transition hover:bg-[#12ae99] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Uploading and parsing…" : manuscriptId ? "Upload new version" : "Upload manuscript"}
        </button>
      </form>

      {currentVersion && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
          <div>
            <p className="text-xs font-semibold text-emerald-600">✓ Version {currentVersion.version_number} ready</p>
            <p className="mt-0.5 text-[11px] text-slate-400">
              {currentVersion.source_filename || currentVersion.filename} ·{" "}
              {currentVersion.page_count ||
                currentVersion.parsed_data?.metadata?.page_count ||
                currentVersion.parsed_data?.pages?.length ||
                1} page(s)
            </p>
          </div>
          <button type="button" onClick={onLoadHistory} className="text-xs font-semibold text-[#16a994] hover:text-[#118c7b]">
            Version history
          </button>
        </div>
      )}
    </section>
  );
}
