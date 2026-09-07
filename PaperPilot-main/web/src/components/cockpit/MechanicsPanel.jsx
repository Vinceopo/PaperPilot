import { useRef, useState } from "react";
import FormatMechanicsFields from "./FormatMechanicsFields.jsx";
import ConfirmDialog from "../ConfirmDialog.jsx";
import Spinner from "../Spinner.jsx";
import {
  emptyMechanicsForm,
  formHasAnyRule,
  formToRules,
  rulesToForm,
} from "../../lib/formatMechanicsForm.js";

const ACCEPTED = [".pdf", ".docx"];
const MODES = [
  { id: "saved", label: "Use a Saved Format" },
  { id: "upload", label: "Upload a New Format" },
  { id: "customize", label: "Customize a New Format" },
];

function validateFile(file) {
  if (!file) return "Choose a mechanics document.";
  const ext = `.${file.name.split(".").pop()?.toLowerCase()}`;
  if (!ACCEPTED.includes(ext)) return "Mechanics must be a PDF or DOCX file.";
  if (file.size > 25_000_000) return "File must be 25 MB or smaller.";
  return "";
}

export default function MechanicsPanel({
  items,
  selectedId,
  onSelect,
  onExtract,
  onSaveProfile,
  onRename,
  onDelete,
  onContinue,
  busy,
}) {
  const inputRef = useRef(null);
  const [mode, setMode] = useState(items.length ? "saved" : "upload");
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [form, setForm] = useState(() => emptyMechanicsForm());
  const [extractMeta, setExtractMeta] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [continueBusy, setContinueBusy] = useState(false);
  const selected = items.find((item) => item.id === selectedId);

  function switchMode(next) {
    setMode(next);
    setError("");
    setSuccess("");
    setEditing(false);
    if (next === "customize") {
      setForm(emptyMechanicsForm());
      setExtractMeta(null);
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
    }
    if (next === "upload") {
      setForm(emptyMechanicsForm());
      setExtractMeta(null);
    }
  }

  async function runExtract(nextFile) {
    const issue = validateFile(nextFile);
    setError(issue);
    setSuccess("");
    setFile(nextFile);
    setExtractMeta(null);
    if (issue || !nextFile) return;
    setExtracting(true);
    try {
      const data = await onExtract(nextFile);
      if (!data) {
        setError("Could not extract format mechanics from this file.");
        return;
      }
      setExtractMeta({
        source_filename: data.source_filename,
        file_type: data.file_type,
        extracted_text: data.extracted_text || "",
        text_preview: data.text_preview || "",
      });
      setForm(rulesToForm(data.rules || {}, data.name || nextFile.name.replace(/\.(pdf|docx)$/i, "")));
      setSuccess("Format fields extracted — review and edit below, then save.");
    } catch (err) {
      setError(err.message || "Extraction failed.");
    } finally {
      setExtracting(false);
    }
  }

  function requestExtract(nextFile) {
    if (!nextFile) return;
    const issue = validateFile(nextFile);
    if (issue) {
      setError(issue);
      setFile(nextFile);
      return;
    }
    setConfirmAction({
      id: "extract",
      title: "Extract format fields?",
      message: `PaperPilot will analyze “${nextFile.name}” and auto-fill the Format Fields panel. You can edit any value before saving.`,
      confirmLabel: "Extract fields",
      tone: "primary",
      file: nextFile,
    });
  }

  function buildSavePayload() {
    const name = String(form.name || "").trim();
    if (!name) {
      setError("Enter a profile name before saving.");
      return null;
    }
    if (items.some((item) => item.name.toLowerCase() === name.toLowerCase())) {
      setError("A mechanics document with this name already exists.");
      return null;
    }
    if (!formHasAnyRule(form)) {
      setError("Add at least one format rule before saving.");
      return null;
    }
    return {
      name,
      rules: formToRules(form),
      source_filename: extractMeta?.source_filename || `${name}.manual`,
      file_type: extractMeta?.file_type || "manual",
      extracted_text: extractMeta?.extracted_text || "",
    };
  }

  function requestSaveProfile(e) {
    e?.preventDefault?.();
    setError("");
    setSuccess("");
    const payload = buildSavePayload();
    if (!payload) return;
    setConfirmAction({
      id: "save",
      title: "Save format mechanics?",
      message: `Save “${payload.name}” to Saved Mechanics and continue to Upload Manuscript?`,
      confirmLabel: "Save & continue",
      tone: "primary",
      payload,
    });
  }

  function requestContinueSaved() {
    if (!selectedId || !selected) {
      setError("Select a saved format first.");
      return;
    }
    setError("");
    setConfirmAction({
      id: "continue-saved",
      title: "Use this saved format?",
      message: `Continue to Upload Manuscript using “${selected.name || selected.source_filename}”?`,
      confirmLabel: "Continue",
      tone: "primary",
    });
  }

  function requestDelete() {
    if (!selected) return;
    setConfirmAction({
      id: "delete",
      title: "Delete format mechanics?",
      message: `“${selected.name}” will be removed permanently. This cannot be undone.`,
      confirmLabel: "Delete",
      tone: "danger",
    });
  }

  function requestRename(e) {
    e.preventDefault();
    if (!editName.trim()) {
      setError("Enter a mechanics name.");
      return;
    }
    if (
      items.some(
        (item) =>
          item.id !== selectedId &&
          item.name.toLowerCase() === editName.trim().toLowerCase()
      )
    ) {
      setError("A mechanics document with this name already exists.");
      return;
    }
    setError("");
    setConfirmAction({
      id: "rename",
      title: "Rename format mechanics?",
      message: `Rename “${selected?.name}” to “${editName.trim()}”?`,
      confirmLabel: "Save name",
      tone: "primary",
      name: editName.trim(),
    });
  }

  async function runConfirmedAction() {
    if (!confirmAction) return;
    setConfirmBusy(true);
    setError("");
    try {
      if (confirmAction.id === "extract") {
        const nextFile = confirmAction.file;
        setConfirmAction(null);
        setConfirmBusy(false);
        await runExtract(nextFile);
        return;
      }
      if (confirmAction.id === "save") {
        try {
          await onSaveProfile(confirmAction.payload);
          setSuccess("Format mechanics saved.");
          setFile(null);
          setExtractMeta(null);
          setForm(emptyMechanicsForm());
          if (inputRef.current) inputRef.current.value = "";
          setConfirmAction(null);
          onContinue?.();
        } catch (err) {
          // Close dialog and show the real error below the form.
          setConfirmAction(null);
          setError(err.message || "Could not save format mechanics. Please try again.");
        }
        return;
      }
      if (confirmAction.id === "continue-saved") {
        setContinueBusy(true);
        setConfirmAction(null);
        await new Promise((resolve) => setTimeout(resolve, 350));
        onContinue?.();
        return;
      }
      if (confirmAction.id === "delete") {
        const ok = await onDelete(selected.id);
        if (ok !== false) {
          setConfirmAction(null);
          setSuccess("Format mechanics deleted.");
        }
        return;
      }
      if (confirmAction.id === "rename") {
        const ok = await onRename(selectedId, confirmAction.name);
        if (ok) {
          setEditing(false);
          setSuccess("Mechanics renamed.");
          setConfirmAction(null);
        }
      }
    } catch (err) {
      setError(err.message || "Action failed.");
    } finally {
      setConfirmBusy(false);
      setContinueBusy(false);
    }
  }

  const showEditor = mode === "customize" || (mode === "upload" && Boolean(extractMeta));
  const panelBusy = busy || extracting || continueBusy;

  return (
    <section className="relative mx-auto max-w-4xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
      {(busy || continueBusy) && !confirmBusy && (
        <div className="absolute inset-0 z-10 grid place-items-center rounded-xl bg-white/70 backdrop-blur-[1px]">
          <div className="flex flex-col items-center gap-3 text-[#16bfa8]">
            <Spinner className="h-10 w-10 border-[3px]" />
            <p className="text-sm font-bold text-slate-700">
              {continueBusy ? "Continuing…" : "Processing…"}
            </p>
          </div>
        </div>
      )}

      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#16bfa8]">Step 1 of 3</p>
      <h2 className="mt-1 text-lg font-bold text-[#172033]">Upload Format Mechanics</h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">
        Choose a saved format, upload a guide for AI extraction, or customize fields manually.
      </p>

      <div className="mt-5 flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-[#f8f9fb] p-1">
        {MODES.map((item) => (
          <button
            key={item.id}
            type="button"
            disabled={panelBusy}
            onClick={() => switchMode(item.id)}
            className={`flex-1 rounded-lg px-3 py-2.5 text-[11px] font-bold transition disabled:opacity-40 ${
              mode === item.id
                ? "bg-white text-[#109b89] shadow-sm"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {mode === "saved" && (
        <div className="mt-6 space-y-4">
          {items.length ? (
            <>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                Saved mechanics
                <select
                  value={selectedId}
                  disabled={panelBusy}
                  onChange={(e) => {
                    onSelect(e.target.value);
                    setEditing(false);
                    setError("");
                    setSuccess("");
                  }}
                  className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-[#f8f9fb] px-3 text-xs font-medium normal-case tracking-normal text-slate-700 outline-none focus:border-[#16bfa8] disabled:cursor-not-allowed"
                >
                  <option value="">Select a mechanics document</option>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name || item.source_filename}
                    </option>
                  ))}
                </select>
              </label>

              {selected && !editing && (
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={panelBusy}
                    onClick={() => {
                      setEditName(selected.name);
                      setEditing(true);
                    }}
                    className="rounded-md px-2.5 py-1.5 text-[11px] font-semibold text-[#129c8a] hover:bg-emerald-50 disabled:opacity-40"
                  >
                    Rename
                  </button>
                  <button
                    type="button"
                    disabled={panelBusy}
                    onClick={requestDelete}
                    className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-semibold text-rose-500 hover:bg-rose-50 disabled:opacity-40"
                  >
                    Delete
                  </button>
                </div>
              )}

              {selected && editing && (
                <form onSubmit={requestRename} className="flex gap-2">
                  <input
                    autoFocus
                    maxLength={200}
                    value={editName}
                    disabled={panelBusy}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-9 min-w-0 flex-1 rounded-lg border border-[#16bfa8] bg-white px-3 text-xs text-slate-700 outline-none disabled:opacity-40"
                    aria-label="New mechanics name"
                  />
                  <button
                    type="submit"
                    disabled={panelBusy || !editName.trim()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#16bfa8] px-3 text-[11px] font-bold text-white disabled:opacity-40"
                  >
                    {busy ? <Spinner className="h-3 w-3" /> : null}
                    Save
                  </button>
                  <button
                    type="button"
                    disabled={panelBusy}
                    onClick={() => setEditing(false)}
                    className="rounded-lg border border-slate-200 px-3 text-[11px] font-semibold text-slate-500 disabled:opacity-40"
                  >
                    Cancel
                  </button>
                </form>
              )}

              <button
                type="button"
                disabled={!selectedId || panelBusy}
                onClick={requestContinueSaved}
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#16bfa8] px-6 text-xs font-bold text-white hover:bg-[#12ae99] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              >
                {continueBusy ? (
                  <>
                    <Spinner /> Continuing…
                  </>
                ) : (
                  "Continue to Upload Manuscript"
                )}
              </button>
            </>
          ) : (
            <p className="text-xs text-slate-400">
              No saved formats yet. Upload a guide or customize a new format.
            </p>
          )}
        </div>
      )}

      {mode === "upload" && (
        <div className={`mt-6 grid gap-4 ${showEditor ? "lg:grid-cols-2" : ""}`}>
          <div>
            <label className="relative flex min-h-44 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#18bda9] bg-[#f7fcfc] px-5 text-center hover:bg-[#f0fbf9]">
              {extracting ? (
                <span className="flex flex-col items-center gap-3 text-[#16bfa8]">
                  <Spinner className="h-10 w-10 border-[3px]" />
                  <span className="text-sm font-bold text-slate-700">Extracting format fields…</span>
                </span>
              ) : (
                <>
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-[#dcf7f2] text-3xl font-light text-[#16bfa8]">
                    ↑
                  </span>
                  <span className="mt-3 text-sm font-bold text-slate-700">
                    {file ? file.name : "Drop your format guide here"}
                  </span>
                  <span className="mt-1 text-[11px] text-slate-400">
                    {file
                      ? "Confirm extraction to fill Format Fields beside this panel"
                      : "Supports .pdf and .docx · Max 25 MB"}
                  </span>
                  <span className="mt-3 rounded-full border border-[#16bfa8] bg-white px-5 py-1.5 text-[11px] font-semibold text-[#109b89]">
                    Browse files
                  </span>
                </>
              )}
              <input
                ref={inputRef}
                type="file"
                disabled={extracting || busy}
                accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                className="sr-only"
                onChange={(e) => {
                  const next = e.target.files?.[0] || null;
                  requestExtract(next);
                  if (inputRef.current) inputRef.current.value = "";
                }}
              />
            </label>
            {extractMeta?.text_preview && !extracting && (
              <div className="mt-3 max-h-36 overflow-y-auto rounded-lg border border-slate-100 bg-white p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Guide preview
                </p>
                <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-slate-500">
                  {extractMeta.text_preview.slice(0, 1200)}
                  {extractMeta.text_preview.length > 1200 ? "…" : ""}
                </p>
              </div>
            )}
          </div>

          {showEditor && (
            <div>
              <FormatMechanicsFields
                form={form}
                onChange={setForm}
                disabled={busy || extracting}
                title="Format Fields"
              />
              <button
                type="button"
                disabled={busy || extracting}
                onClick={requestSaveProfile}
                className="mt-3 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#16bfa8] px-6 text-xs font-bold text-white hover:bg-[#12ae99] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
              >
                {busy ? (
                  <>
                    <Spinner /> Saving…
                  </>
                ) : (
                  "Save & continue"
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {mode === "customize" && (
        <div className="mt-6 space-y-4">
          <p className="text-xs text-slate-400">
            Build a format profile manually with the same Format Fields used after AI extraction, then save it for reuse.
          </p>
          <FormatMechanicsFields
            form={form}
            onChange={setForm}
            disabled={busy}
            title="Format Fields"
          />
          <button
            type="button"
            disabled={busy}
            onClick={requestSaveProfile}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#16bfa8] px-6 text-xs font-bold text-white hover:bg-[#12ae99] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
          >
            {busy ? (
              <>
                <Spinner /> Saving…
              </>
            ) : (
              "Save customized format & continue"
            )}
          </button>
        </div>
      )}

      {error && <p className="mt-3 text-xs text-rose-500">{error}</p>}
      {success && !error && (
        <p className="mt-3 text-xs font-semibold text-emerald-600" role="status">
          {success}
        </p>
      )}

      <ConfirmDialog
        open={Boolean(confirmAction)}
        title={confirmAction?.title || ""}
        message={confirmAction?.message || ""}
        confirmLabel={confirmAction?.confirmLabel || "Confirm"}
        tone={confirmAction?.tone || "primary"}
        busy={confirmBusy || busy}
        onCancel={() => {
          if (confirmBusy) return;
          setConfirmAction(null);
        }}
        onConfirm={() => void runConfirmedAction()}
      />
    </section>
  );
}
