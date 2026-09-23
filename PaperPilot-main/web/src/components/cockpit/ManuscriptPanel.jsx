import { useEffect, useRef, useState } from "react";
import { normalizeTitle } from "../../lib/scannedLibrary.js";
import ConfirmDialog from "../ConfirmDialog.jsx";
import Spinner from "../Spinner.jsx";
import DocumentPagePreview from "./DocumentPagePreview.jsx";
import { ShowStepsRow } from "./UploadJourneyModal.jsx";

function validateFile(file) {
  if (!file) return "Choose a manuscript.";
  const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
  if (![".pdf", ".docx"].includes(ext)) return "Manuscript must be a PDF or DOCX file.";
  if (file.size > 100_000_000) return "File must be 100 MB or smaller.";
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
  onShowSteps,
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
  const [dragOver, setDragOver] = useState(false);

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
        page_count: 0,
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
      } else {
        setConfirmOpen(false);
        setPendingUpload(null);
      }
    } finally {
      setConfirmBusy(false);
    }
  }

  const showPreview = Boolean(file);
  const panelBusy = busy || previewBusy || confirmBusy;
  const previewUploading = Boolean(busy || confirmBusy);
  const previewPreparing = Boolean(previewBusy && file && !previewUploading);
  const canPickFile = Boolean(mechanicsSelected && !panelBusy);

  function applyFile(next) {
    if (!canPickFile && next) return;
    setFile(next);
    setError(next ? validateFile(next) : "");
    setSuccess("");
    onFilePick?.(next);
    void loadPreview(next);
    if (inputRef.current) inputRef.current.value = "";
  }

  function onDropZoneDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    if (!canPickFile) return;
    setDragOver(true);
  }

  function onDropZoneDragLeave(e) {
    e.preventDefault();
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setDragOver(false);
  }

  function onDropZoneDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (!canPickFile) return;
    const next = e.dataTransfer?.files?.[0] || null;
    if (!next) return;
    applyFile(next);
  }

  return (
    <section
      className={`relative w-full rounded-xl border p-6 shadow-sm transition md:p-8 ${
        mechanicsSelected
          ? "border-slate-200 bg-white"
          : "border-slate-200 bg-white opacity-50 grayscale"
      }`}
      aria-disabled={!mechanicsSelected}
    >
      <ShowStepsRow step={2} onShowSteps={onShowSteps} />
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
            onDragEnter={onDropZoneDragOver}
            onDragOver={onDropZoneDragOver}
            onDragLeave={onDropZoneDragLeave}
            onDrop={onDropZoneDrop}
            className={`relative flex min-h-44 flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 text-center transition ${
              dragOver && canPickFile
                ? "cursor-copy border-[#0d9488] bg-[#e7faf6] ring-2 ring-[#16bfa8]/35"
                : canPickFile
                  ? "cursor-pointer border-[#18bda9] bg-[#f7fcfc] hover:bg-[#f0fbf9]"
                  : mechanicsSelected
                    ? "cursor-wait border-[#18bda9] bg-[#f7fcfc]"
                    : "cursor-not-allowed border-slate-300 bg-slate-50"
            }`}
          >
            <>
              <span className="grid h-11 w-11 place-items-center rounded-full bg-[#dcf7f2] text-3xl font-light text-[#16bfa8]">
                ↑
              </span>
              <p className="mt-3 text-sm font-bold text-slate-700">
                {dragOver && canPickFile
                  ? "Release to upload"
                  : file
                    ? file.name
                    : "Drop your manuscript here"}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">
                {file
                  ? previewPreparing
                    ? "Preparing document preview on the right…"
                    : previewUploading
                      ? "Uploading — see progress beside this panel"
                      : "Preview appears beside this panel — confirm Upload when ready"
                  : "Drag & drop or browse · .pdf and .docx · Max 100 MB"}
              </p>
              <span className="mt-3 rounded-full border border-[#16bfa8] bg-white px-5 py-1.5 text-[11px] font-semibold text-[#109b89]">
                Browse files
              </span>
            </>
            <input
              ref={inputRef}
              type="file"
              disabled={!canPickFile}
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="sr-only"
              onChange={(e) => {
                const next = e.target.files?.[0] || null;
                applyFile(next);
              }}
            />
          </label>

          {showPreview && (
            <div className="relative flex min-h-44 flex-col overflow-hidden rounded-xl border border-slate-200 bg-[#e8ecf1]">
              <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 bg-[#f3f5f7] px-4 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Manuscript preview
                </p>
                {previewUploading ? (
                  <span className="text-[10px] font-semibold text-[#0d9488]">Uploading…</span>
                ) : previewPreparing ? (
                  <span className="text-[10px] font-semibold text-[#0d9488]">Preparing…</span>
                ) : preview?.page_count && file?.name?.toLowerCase().endsWith(".pdf") ? (
                  <span className="text-[10px] font-semibold text-slate-400">
                    {preview.page_count} page{preview.page_count === 1 ? "" : "s"} · scroll to read
                  </span>
                ) : (
                  <span className="text-[10px] font-semibold text-slate-400">
                    Original document · scroll to read
                  </span>
                )}
              </div>

              <div
                className={`relative max-h-[min(36rem,72vh)] min-h-[22rem] flex-1 ${
                  file?.name?.toLowerCase().endsWith(".pdf")
                    ? "overflow-hidden bg-white"
                    : "pp-scroll overflow-y-auto px-3 py-4 sm:px-5"
                }`}
              >
                {preview?.error ? (
                  <p className="rounded-lg bg-white px-4 py-3 text-xs text-rose-500 shadow-sm">
                    {preview.error}
                  </p>
                ) : (
                  <DocumentPagePreview
                    file={file}
                    preview={preview}
                    emptyLabel="No manuscript preview available yet."
                  />
                )}

                {(previewPreparing || previewUploading) && (
                  <div
                    className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#e8ecf1]/88 backdrop-blur-[2px]"
                    role="status"
                    aria-live="polite"
                  >
                    <Spinner className="h-12 w-12 border-[3px] text-[#16bfa8]" />
                    <p className="text-sm font-bold text-slate-800">
                      {previewUploading ? "Uploading manuscript…" : "Opening manuscript preview…"}
                    </p>
                    <p className="max-w-[16rem] text-center text-[11px] leading-relaxed text-slate-500">
                      {previewUploading
                        ? "Please wait while your academic document is saved. The upload button unlocks when this finishes."
                        : "Please wait while your academic document is prepared for display."}
                    </p>
                  </div>
                )}
              </div>
              <p className="border-t border-slate-200/80 bg-[#f3f5f7] px-4 py-2 text-[10px] text-slate-400">
                {previewUploading
                  ? "Uploading in progress — stay on this page until it completes."
                  : previewPreparing
                    ? "Preparing live preview of your academic document…"
                    : "Live preview of your uploaded manuscript — scroll to see pages below."}
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
          {previewUploading ? (
            <>
              <Spinner /> Uploading…
            </>
          ) : previewPreparing ? (
            <>
              <Spinner /> Preparing preview…
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
            ? `Save “${pendingUpload.file?.name}” as “${pendingUpload.title}” on the server? File Details opens only after the upload finishes.`
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
