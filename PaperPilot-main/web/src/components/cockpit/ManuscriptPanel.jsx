import { useEffect, useRef, useState } from "react";
import { normalizeTitle } from "../../lib/scannedLibrary.js";
import ConfirmDialog from "../ConfirmDialog.jsx";
import Spinner from "../Spinner.jsx";

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
  mechanicsSelected = true,
  manuscripts = [],
  selectedManuscriptId = "",
  onSelectManuscript,
  onUpload,
  onFilePick,
  onPreview,
  uploadCancelKey = 0,
  busy,
}) {
  const inputRef = useRef(null);
  const previewRequest = useRef(0);
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [manuscriptId, setManuscriptId] = useState(selectedManuscriptId || "");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [preview, setPreview] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [pendingUpload, setPendingUpload] = useState(null);

  useEffect(() => {
    if (selectedManuscriptId && manuscripts.some((m) => m.id === selectedManuscriptId)) {
      setManuscriptId(selectedManuscriptId);
      return;
    }
    if (manuscriptId && !manuscripts.some((m) => m.id === manuscriptId)) {
      setManuscriptId("");
    }
  }, [selectedManuscriptId, manuscripts, manuscriptId]);

  useEffect(() => {
    if (!uploadCancelKey) return;
    setFile(null);
    setSuccess("");
    setError("");
    setTitle("");
    setPreview(null);
    setConfirmOpen(false);
    setPendingUpload(null);
    if (inputRef.current) inputRef.current.value = "";
  }, [uploadCancelKey]);

  function chooseManuscript(id) {
    setManuscriptId(id);
    if (id) setTitle("");
    onSelectManuscript?.(id);
  }

  async function loadPreview(nextFile) {
    const requestId = ++previewRequest.current;
    setPreview(null);
    if (!nextFile || !onPreview) return;
    setPreviewBusy(true);
    try {
      const data = await onPreview(nextFile);
      if (previewRequest.current !== requestId) return;
      setPreview(data);
    } catch (err) {
      if (previewRequest.current !== requestId) return;
      setPreview({
        filename: nextFile.name,
        text_preview: "",
        error: err.message || "Could not preview this file.",
      });
    } finally {
      if (previewRequest.current === requestId) setPreviewBusy(false);
    }
  }

  function requestUpload(e) {
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

    setPendingUpload({
      file,
      title: resolvedTitle,
      manuscriptId,
    });
    setConfirmOpen(true);
  }

  async function confirmUpload() {
    if (!pendingUpload) return;
    setConfirmBusy(true);
    try {
      const ok = await onUpload(pendingUpload);
      if (ok) {
        setFile(null);
        setPreview(null);
        if (inputRef.current) inputRef.current.value = "";
        setSuccess("Manuscript uploaded completely.");
        setConfirmOpen(false);
        setPendingUpload(null);
      }
    } finally {
      setConfirmBusy(false);
    }
  }

  const showPreview = Boolean(file);
  const panelBusy = busy || previewBusy || confirmBusy;

  return (
    <section
      className={`relative mx-auto max-w-4xl rounded-xl border p-6 shadow-sm transition md:p-8 ${
        mechanicsSelected
          ? "border-slate-200 bg-white"
          : "border-slate-200 bg-white opacity-50 grayscale"
      }`}
      aria-disabled={!mechanicsSelected}
    >
      {busy && !confirmBusy && (
        <div className="absolute inset-0 z-10 grid place-items-center rounded-xl bg-white/70 backdrop-blur-[1px]">
          <div className="flex flex-col items-center gap-3 text-[#16bfa8]">
            <Spinner className="h-10 w-10 border-[3px]" />
            <p className="text-sm font-bold text-slate-700">Uploading manuscript…</p>
          </div>
        </div>
      )}

      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#16bfa8]">Step 2 of 3</p>
      <h2 className="mt-1 text-lg font-bold text-[#172033]">Upload Manuscript</h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">
        Upload the manuscript you want to check against the confirmed format guide.
      </p>

      <form onSubmit={requestUpload} className="mt-5 space-y-3">
        {manuscripts.length ? (
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Upload to
            <select
              disabled={!mechanicsSelected || panelBusy}
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
            disabled={!mechanicsSelected || panelBusy}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Manuscript title (must be unique)"
            className="h-10 w-full rounded-lg border border-slate-200 bg-[#f8f9fb] px-3 text-xs text-slate-700 outline-none placeholder:text-slate-400 focus:border-[#16bfa8] disabled:cursor-not-allowed"
          />
        )}

        <div className={`grid gap-4 ${showPreview ? "lg:grid-cols-2" : ""}`}>
          <label
            className={`relative flex min-h-44 flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 text-center ${
              mechanicsSelected
                ? "cursor-pointer border-[#18bda9] bg-[#f7fcfc] hover:bg-[#f0fbf9]"
                : "cursor-not-allowed border-slate-300 bg-slate-50"
            }`}
          >
            {previewBusy ? (
              <span className="flex flex-col items-center gap-3 text-[#16bfa8]">
                <Spinner className="h-10 w-10 border-[3px]" />
                <span className="text-sm font-bold text-slate-700">Preparing preview…</span>
              </span>
            ) : (
              <>
                <span className="grid h-11 w-11 place-items-center rounded-full bg-[#dcf7f2] text-3xl font-light text-[#16bfa8]">
                  ↑
                </span>
                <p className="mt-3 text-sm font-bold text-slate-700">
                  {file ? file.name : "Drop your manuscript here"}
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  {file
                    ? "Preview appears beside this panel — confirm Upload when ready"
                    : "Supports .pdf and .docx · Max 25 MB"}
                </p>
                <span className="mt-3 rounded-full border border-[#16bfa8] bg-white px-5 py-1.5 text-[11px] font-semibold text-[#109b89]">
                  Browse files
                </span>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              disabled={!mechanicsSelected || panelBusy}
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="sr-only"
              onChange={(e) => {
                const next = e.target.files?.[0] || null;
                setFile(next);
                setError(validateFile(next));
                setSuccess("");
                onFilePick?.(next);
                void loadPreview(next);
              }}
            />
          </label>

          {showPreview && (
            <div className="flex min-h-44 flex-col rounded-xl border border-slate-200 bg-[#fafbfc] p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Manuscript preview
                </p>
                {preview?.page_count ? (
                  <span className="text-[10px] font-semibold text-slate-400">
                    {preview.page_count} page{preview.page_count === 1 ? "" : "s"}
                  </span>
                ) : null}
              </div>
              <div className="mt-2 min-h-0 flex-1 overflow-y-auto rounded-lg border border-slate-100 bg-white p-3">
                {previewBusy && (
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Spinner className="h-4 w-4 text-[#16bfa8]" />
                    Extracting manuscript content…
                  </div>
                )}
                {!previewBusy && preview?.error && (
                  <p className="text-xs text-rose-500">{preview.error}</p>
                )}
                {!previewBusy && preview?.text_preview && (
                  <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-slate-600">
                    {preview.text_preview}
                  </p>
                )}
                {!previewBusy && !preview?.text_preview && !preview?.error && (
                  <p className="text-xs text-slate-400">No preview available yet.</p>
                )}
              </div>
              <p className="mt-2 text-[10px] text-slate-400">
                Preview only — compliance analysis starts on File Details.
              </p>
            </div>
          )}
        </div>

        {error && <p className="text-xs text-rose-500">{error}</p>}
        {success && !error && (
          <p className="text-xs font-semibold text-emerald-600" role="status">
            {success}
          </p>
        )}

        <button
          type="submit"
          disabled={!mechanicsSelected || !file || panelBusy}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#16bfa8] py-2.5 text-xs font-bold text-white transition hover:bg-[#12ae99] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? (
            <>
              <Spinner /> Uploading…
            </>
          ) : manuscriptId ? (
            "Upload new version"
          ) : (
            "Upload manuscript"
          )}
        </button>
      </form>

      <ConfirmDialog
        open={confirmOpen}
        title={manuscriptId ? "Upload new version?" : "Upload manuscript?"}
        message={
          pendingUpload
            ? `Upload “${pendingUpload.file?.name}” as “${pendingUpload.title}” and continue to File Details?`
            : ""
        }
        confirmLabel={manuscriptId ? "Upload version" : "Upload & continue"}
        busy={confirmBusy || busy}
        onCancel={() => {
          if (confirmBusy) return;
          setConfirmOpen(false);
          setPendingUpload(null);
        }}
        onConfirm={() => void confirmUpload()}
      />
    </section>
  );
}
