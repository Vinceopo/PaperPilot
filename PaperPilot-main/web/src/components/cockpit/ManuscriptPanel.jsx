import { useEffect, useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { normalizeTitle } from "../../lib/scannedLibrary.js";
import {
  ACCEPT_ATTRIBUTE,
  ACCEPTED_EXTENSIONS,
  MAX_FILE_SIZE_BYTES,
  getFileRejection,
} from "../../lib/uploadLimits.js";
import { formatFileSize } from "../../lib/formatFileSize.js";
import ConfirmDialog from "../ConfirmDialog.jsx";
import Spinner from "../Spinner.jsx";
import DocumentLoader from "../DocumentLoader.jsx";
import DocumentPagePreview from "./DocumentPagePreview.jsx";
import { ShowStepsRow } from "./UploadJourneyModal.jsx";

function validateFile(file) {
  if (!file) return "Choose a manuscript.";
  const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
  if (!ACCEPTED_EXTENSIONS.includes(ext)) return "type";
  if (file.size > MAX_FILE_SIZE_BYTES) return "size";
  return "";
}

function rejectionMessage(rejection) {
  if (!rejection) return "";
  if (rejection.kind === "type") {
    return `'${rejection.name}' isn't a supported file type. Please upload a PDF or Word document (${ACCEPTED_EXTENSIONS.join(", ")}).`;
  }
  const max = formatFileSize(MAX_FILE_SIZE_BYTES);
  let actual = formatFileSize(rejection.size);
  if (actual === max) actual = formatFileSize(rejection.size, { roundUp: true });
  return `Your file '${rejection.name}' is ${actual}, but we can only accept files up to ${max}. Please choose a smaller file and try again.`;
}

/**
 * manuscripts — shared library entries from My Manuscripts (same source of truth).
 */
export default function ManuscriptPanel({
  mechanicsSelected = true,
  manuscripts = [],
  onSelectManuscript,
  onUpload,
  onFilePick,
  onPreview,
  uploadCancelKey = 0,
  onCancel,
  onShowSteps,
  busy,
}) {
  const inputRef = useRef(null);
  const dropRef = useRef(null);
  const pulseTimer = useRef(0);
  const previewRequest = useRef(0);
  const pickRequest = useRef(0);
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("");
  const [manuscriptId, setManuscriptId] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [preview, setPreview] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [titleOpen, setTitleOpen] = useState(false);
  const [titleMode, setTitleMode] = useState("new");
  const [existingId, setExistingId] = useState("");
  const [titleError, setTitleError] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [pendingUpload, setPendingUpload] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [rejection, setRejection] = useState(null);
  const [dropPulse, setDropPulse] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

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
    if ((issue === "type" || issue === "size") && file) {
      rejectFile(file, issue);
      return;
    }
    setError(issue);
    setSuccess("");
    if (issue) return;
    setManuscriptId("");
    setTitle("");
    setTitleError("");
    setTitleMode(manuscripts.length ? "existing" : "new");
    setExistingId(manuscripts[0]?.id || "");
    setTitleOpen(true);
  }

  function useExistingManuscript(id) {
    const selected = manuscripts.find((item) => item.id === id);
    if (!selected) {
      setTitleError("Choose a manuscript to add this version to.");
      return;
    }
    setManuscriptId(selected.id);
    onSelectManuscript?.(selected.id);
    setTitle("");
    setTitleError("");
    setError("");
    setTitleOpen(false);
    setPendingUpload({
      file,
      title: selected.title,
      manuscriptId: selected.id,
    });
    setConfirmOpen(true);
  }

  function submitTitle(event) {
    event.preventDefault();
    if (titleMode === "existing") {
      useExistingManuscript(existingId);
      return;
    }
    const resolvedTitle = title.trim();
    if (!resolvedTitle) {
      setTitleError("Enter a title for a new manuscript.");
      return;
    }
    const match = manuscripts.find(
      (item) => normalizeTitle(item.title) === normalizeTitle(resolvedTitle)
    );
    if (match) {
      setExistingId(match.id);
      setTitleMode("existing");
      setTitleError(
        "That title is already in your library. Continue to save this file as a new version, or enter a different name."
      );
      return;
    }
    setTitleError("");
    setError("");
    setTitleOpen(false);
    setPendingUpload({
      file,
      title: resolvedTitle,
      manuscriptId: "",
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

  function rejectFile(next, kind) {
    setFile(null);
    setPreview(null);
    setError("");
    setSuccess("");
    onFilePick?.(null);
    if (inputRef.current) inputRef.current.value = "";
    setRejection({ kind, name: next.name, size: next.size });
    setDropPulse(true);
    window.clearTimeout(pulseTimer.current);
    pulseTimer.current = window.setTimeout(() => setDropPulse(false), 1600);
    dropRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    dropRef.current?.focus();
  }

  async function applyFile(next) {
    if (!canPickFile && next) return;
    if (inputRef.current) inputRef.current.value = "";
    const pickId = ++pickRequest.current;
    const issue = next ? await getFileRejection(next) : "";
    if (pickRequest.current !== pickId) return;
    if (issue) {
      rejectFile(next, issue);
      return;
    }
    setFile(next);
    setError("");
    setSuccess("");
    onFilePick?.(next);
    if (next) void loadPreview(next);
    else setPreview(null);
  }

  function chooseAnotherFile() {
    setRejection(null);
    if (canPickFile) inputRef.current?.click();
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
    void applyFile(next);
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
        <div className="flex flex-col gap-4">
          <label
            ref={dropRef}
            tabIndex={-1}
            onDragEnter={onDropZoneDragOver}
            onDragOver={onDropZoneDragOver}
            onDragLeave={onDropZoneDragLeave}
            onDrop={onDropZoneDrop}
            className={`relative flex min-h-44 flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 text-center transition outline-none ${
              dropPulse
                ? "border-rose-400 bg-rose-50 ring-2 ring-rose-300"
                : dragOver && canPickFile
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
                    ? `${formatFileSize(file.size)} · Preparing document preview on the right…`
                    : previewUploading
                      ? `${formatFileSize(file.size)} · Uploading — see progress beside this panel`
                      : `${formatFileSize(file.size)} · Preview appears beside this panel — confirm Upload when ready`
                  : `Drag & drop or browse · .pdf and .docx · Max ${formatFileSize(MAX_FILE_SIZE_BYTES)}`}
              </p>
              <span className="mt-3 rounded-full border border-[#16bfa8] bg-white px-5 py-1.5 text-[11px] font-semibold text-[#109b89]">
                Browse files
              </span>
            </>
            <input
              ref={inputRef}
              type="file"
              disabled={!canPickFile}
              accept={ACCEPT_ATTRIBUTE}
              className="sr-only"
              onChange={(e) => {
                const next = e.target.files?.[0] || null;
                void applyFile(next);
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
                    <DocumentLoader className="h-28 w-28" />
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

        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              if (file) setCancelOpen(true);
              else onCancel?.();
            }}
            disabled={previewUploading}
            className="rounded-lg border border-slate-200 bg-white px-7 py-2.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!mechanicsSelected || !file || panelBusy}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-[#16bfa8] py-2.5 text-xs font-bold text-white transition hover:bg-[#12ae99] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {previewUploading ? (
              <>
                <Spinner /> Uploading…
              </>
            ) : previewPreparing ? (
              <>
                <Spinner /> Preparing preview…
              </>
            ) : (
              "Upload manuscript"
            )}
          </button>
        </div>
      </form>

      {titleOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-5" role="dialog" aria-modal="true" aria-labelledby="manuscript-title-heading">
          <form onSubmit={submitTitle} className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 id="manuscript-title-heading" className="text-lg font-bold text-[#172033]">
              Manuscript title
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              {manuscripts.length
                ? "Save this file as a new version of a title you already have, or give it a new title."
                : "This name must be unique. You can still change the file before you confirm the upload."}
            </p>
            {manuscripts.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTitleMode("existing");
                    setTitleError("");
                    if (!existingId) setExistingId(manuscripts[0]?.id || "");
                  }}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                    titleMode === "existing"
                      ? "bg-[#e7f8f5] text-[#0f766e] ring-1 ring-[#16bfa8]"
                      : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  Use an existing title
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTitleMode("new");
                    setTitleError("");
                  }}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                    titleMode === "new"
                      ? "bg-[#e7f8f5] text-[#0f766e] ring-1 ring-[#16bfa8]"
                      : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                  }`}
                >
                  New title
                </button>
              </div>
            )}
            {titleMode === "existing" && manuscripts.length > 0 ? (
              <label className="mt-4 block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Existing title
                <select
                  autoFocus
                  value={existingId}
                  onChange={(e) => {
                    setExistingId(e.target.value);
                    setTitleError("");
                  }}
                  className="mt-2 h-11 w-full rounded-lg border border-slate-200 bg-[#f8f9fb] px-3 text-sm font-medium normal-case tracking-normal text-slate-700 outline-none focus:border-[#16bfa8]"
                >
                  {manuscripts.map((item) => {
                    const versionCount = Number(
                      item.version_count ?? item.current_version_number ?? item.versions?.length ?? 0
                    );
                    return (
                      <option key={item.id} value={item.id}>
                        {item.title} · version {versionCount + 1}
                      </option>
                    );
                  })}
                </select>
              </label>
            ) : (
              <input
                autoFocus
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value);
                  setTitleError("");
                }}
                placeholder="Enter a title"
                className="mt-4 h-11 w-full rounded-lg border border-slate-200 bg-[#f8f9fb] px-3 text-sm text-slate-700 outline-none focus:border-[#16bfa8]"
              />
            )}
            {titleError && <p className="mt-3 text-xs text-rose-500">{titleError}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTitleOpen(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-[#16bfa8] px-4 py-2 text-xs font-bold text-[#092823] hover:bg-[#12ae99]"
              >
                Continue
              </button>
            </div>
          </form>
        </div>
      )}

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
      <ConfirmDialog
        open={cancelOpen}
        title="Go back to the previous step?"
        message="Your selected manuscript will be discarded and you will return to Step 1. Your chosen format stays selected."
        confirmLabel="Cancel and go back"
        cancelLabel="Stay here"
        tone="danger"
        onCancel={() => setCancelOpen(false)}
        onConfirm={() => {
          setCancelOpen(false);
          previewRequest.current += 1;
          onCancel?.();
        }}
      />
      <ConfirmDialog
        open={rejection != null}
        icon={
          <span className="grid h-11 w-11 place-items-center rounded-full bg-amber-50 text-amber-500">
            <TriangleAlert className="h-6 w-6" aria-hidden="true" />
          </span>
        }
        title={rejection?.kind === "type" ? "Unsupported File Type" : "File Too Large"}
        message={rejectionMessage(rejection)}
        confirmLabel="Choose Another File"
        cancelLabel=""
        onCancel={() => setRejection(null)}
        onConfirm={chooseAnotherFile}
      />
    </section>
  );
}
