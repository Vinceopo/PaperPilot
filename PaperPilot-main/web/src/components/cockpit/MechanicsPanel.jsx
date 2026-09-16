import { useEffect, useRef, useState } from "react";
import FormatMechanicsFields from "./FormatMechanicsFields.jsx";
import DocumentPagePreview from "./DocumentPagePreview.jsx";
import ConfirmDialog from "../ConfirmDialog.jsx";
import Spinner from "../Spinner.jsx";
import {
  emptyMechanicsForm,
  formHasAnyRule,
  formToRules,
  rulesToForm,
  sampleMechanicsForm,
} from "../../lib/formatMechanicsForm.js";
import { downloadSampleMechanics } from "../../api.js";

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

function formFromSaved(item) {
  if (!item) return emptyMechanicsForm();
  const mapped = rulesToForm(item.rules || {}, item.name || item.source_filename || "");
  // If the profile has almost no stored rules, seed editable sample values
  // so the side panel is never a blank placeholder wall.
  if (!formHasAnyRule(mapped)) {
    return sampleMechanicsForm(item.name || "Saved Format");
  }
  return mapped;
}

export default function MechanicsPanel({
  items,
  selectedId,
  onSelect,
  onExtract,
  onSaveProfile,
  onUpdateProfile,
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
  const [uploadForm, setUploadForm] = useState(() => emptyMechanicsForm());
  const [customizeForm, setCustomizeForm] = useState(() => sampleMechanicsForm("My Custom Format"));
  const [savedForm, setSavedForm] = useState(() =>
    items.length
      ? formFromSaved(items.find((item) => item.id === selectedId) || items[0])
      : emptyMechanicsForm()
  );
  const [extractMeta, setExtractMeta] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [sampleBusy, setSampleBusy] = useState(false);
  const selected = items.find((item) => item.id === selectedId);

  const form =
    mode === "upload" ? uploadForm : mode === "customize" ? customizeForm : savedForm;
  const setForm =
    mode === "upload" ? setUploadForm : mode === "customize" ? setCustomizeForm : setSavedForm;

  const selectedRulesKey = JSON.stringify(selected?.rules || {});

  // Keep Format Fields in sync with the selected saved mechanics.
  useEffect(() => {
    if (mode !== "saved") return;
    if (!selected) {
      setSavedForm(emptyMechanicsForm());
      return;
    }
    setSavedForm(formFromSaved(selected));
    setEditing(false);
  }, [mode, selectedId, selectedRulesKey]);

  function clearUploadDraft() {
    setFile(null);
    setExtractMeta(null);
    setUploadForm(emptyMechanicsForm());
    if (inputRef.current) inputRef.current.value = "";
  }

  function switchMode(next) {
    if (next === mode) return;
    setMode(next);
    setError("");
    setSuccess("");
    setEditing(false);
    // Keep upload/customize drafts when switching tabs — only clear on save or refresh.
  }

  async function onDownloadSample() {
    setError("");
    setSampleBusy(true);
    try {
      await downloadSampleMechanics();
      setSuccess("Sample format mechanics downloaded. Upload it here whenever you’re ready.");
    } catch (err) {
      setError(err.message || "Could not download the sample format guide.");
    } finally {
      setSampleBusy(false);
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
        page_count: data.page_count || (data.pages || []).length || 0,
        pages: Array.isArray(data.pages) ? data.pages : [],
      });
      setUploadForm(
        rulesToForm(data.rules || {}, data.name || nextFile.name.replace(/\.(pdf|docx)$/i, ""))
      );
      setSuccess("Format fields extracted from your guide — review and edit below, then save.");
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
      message: `PaperPilot will analyze “${nextFile.name}” and fill Format Fields from the rules in that guide. You can edit any value before saving.`,
      confirmLabel: "Extract fields",
      tone: "primary",
      file: nextFile,
    });
  }

  function buildCreatePayload() {
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
      source_filename:
        mode === "upload" && extractMeta?.source_filename
          ? extractMeta.source_filename
          : `${name}.docx`,
      file_type: mode === "upload" && extractMeta?.file_type ? extractMeta.file_type : "docx",
      extracted_text: mode === "upload" ? extractMeta?.extracted_text || "" : "",
    };
  }

  function buildUpdatePayload() {
    if (!selectedId || !selected) {
      setError("Select a saved format first.");
      return null;
    }
    const name = String(form.name || "").trim();
    if (!name) {
      setError("Enter a profile name before saving.");
      return null;
    }
    if (
      items.some(
        (item) => item.id !== selectedId && item.name.toLowerCase() === name.toLowerCase()
      )
    ) {
      setError("A mechanics document with this name already exists.");
      return null;
    }
    if (!formHasAnyRule(form)) {
      setError("Add at least one format rule before saving.");
      return null;
    }
    return { name, rules: formToRules(form) };
  }

  function requestSaveProfile(e) {
    e?.preventDefault?.();
    setError("");
    setSuccess("");
    const payload = buildCreatePayload();
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

  function requestUpdateSaved(e) {
    e?.preventDefault?.();
    setError("");
    setSuccess("");
    const payload = buildUpdatePayload();
    if (!payload) return;
    setConfirmAction({
      id: "update-saved",
      title: "Save changes to this format?",
      message: `Update “${payload.name}” with the Format Fields shown, then continue to Upload Manuscript?`,
      confirmLabel: "Save & continue",
      tone: "primary",
      payload,
    });
  }

  function requestDelete() {
    if (!selected) return;
    setConfirmAction({
      id: "delete",
      title: "Delete format mechanics?",
      message: `“${selected.name}” will be removed permanently. Manuscripts that used it will keep their files, but this format profile will be gone.`,
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
          if (mode === "upload") {
            clearUploadDraft();
          } else if (mode === "customize") {
            setCustomizeForm(sampleMechanicsForm("My Custom Format"));
          }
          setConfirmAction(null);
          onContinue?.();
        } catch (err) {
          setConfirmAction(null);
          setError(err.message || "Could not save format mechanics. Please try again.");
        }
        return;
      }
      if (confirmAction.id === "update-saved") {
        try {
          if (!onUpdateProfile) {
            throw new Error("Updating saved mechanics is not available.");
          }
          await onUpdateProfile(selectedId, confirmAction.payload);
          setSuccess("Format mechanics updated.");
          setConfirmAction(null);
          onContinue?.();
        } catch (err) {
          setConfirmAction(null);
          setError(err.message || "Could not update format mechanics. Please try again.");
        }
        return;
      }
      if (confirmAction.id === "delete") {
        try {
          const ok = await onDelete(selected.id);
          if (ok !== false) {
            setConfirmAction(null);
            setSuccess("Format mechanics deleted.");
            setSavedForm(emptyMechanicsForm());
          } else {
            setConfirmAction(null);
            setError("Could not delete this format. It may still be linked to a manuscript — try again.");
          }
        } catch (err) {
          setConfirmAction(null);
          setError(err.message || "Could not delete format mechanics.");
        }
        return;
      }
      if (confirmAction.id === "rename") {
        const ok = await onRename(selectedId, confirmAction.name);
        if (ok) {
          setEditing(false);
          setSavedForm((current) => ({ ...current, name: confirmAction.name }));
          setSuccess("Mechanics renamed.");
          setConfirmAction(null);
        }
      }
    } catch (err) {
      setError(err.message || "Action failed.");
    } finally {
      setConfirmBusy(false);
    }
  }

  const showUploadEditor = mode === "upload" && Boolean(extractMeta);
  const showSavedEditor = mode === "saved" && Boolean(selected);
  const showCustomizeEditor = mode === "customize";
  const panelBusy = busy || extracting || sampleBusy;

  return (
    <section className="relative w-full rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
      {(busy) && !confirmBusy && (
        <div className="absolute inset-0 z-10 grid place-items-center rounded-xl bg-white/70 backdrop-blur-[1px]">
          <div className="flex flex-col items-center gap-3 text-[#16bfa8]">
            <Spinner className="h-10 w-10 border-[3px]" />
            <p className="text-sm font-bold text-slate-700">
              Processing…
            </p>
          </div>
        </div>
      )}

      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#16bfa8]">Step 1 of 3</p>
      <h2 className="mt-1 text-lg font-bold text-[#172033]">Upload Format Mechanics</h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">
        Choose a saved format, upload a guide for extraction, or customize fields manually. Format
        Fields always reflect the rules inside the mechanics you select or upload.
      </p>

      <div className="mt-4 flex flex-col gap-2 rounded-xl border border-dashed border-[#18bda9]/60 bg-[#f7fcfc] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-700">Don’t have a format guide yet?</p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            Download a sample DOCX, then upload it here or use Customize to edit the starter rules.
          </p>
        </div>
        <button
          type="button"
          disabled={panelBusy}
          onClick={() => void onDownloadSample()}
          className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[#16bfa8] bg-white px-4 text-[11px] font-bold text-[#109b89] hover:bg-[#eefbf8] disabled:opacity-40"
        >
          {sampleBusy ? (
            <>
              <Spinner className="h-3.5 w-3.5" /> Downloading…
            </>
          ) : (
            "⬇ Download sample format"
          )}
        </button>
      </div>

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
        <div className={`mt-6 grid gap-4 ${showSavedEditor ? "lg:grid-cols-2" : ""}`}>
          <div className="space-y-4">
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

                {selected && (
                  <p className="text-[11px] leading-relaxed text-slate-400">
                    Format Fields on the right show the rules stored in{" "}
                    <span className="font-semibold text-slate-600">
                      {selected.name || selected.source_filename}
                    </span>
                    . Edit them, then save changes or continue.
                  </p>
                )}
              </>
            ) : (
              <p className="text-xs text-slate-400">
                No saved formats yet. Download the sample, upload a guide, or customize a new format.
              </p>
            )}
          </div>

          {showSavedEditor && (
            <div>
              <FormatMechanicsFields
                form={form}
                onChange={setForm}
                disabled={panelBusy}
                title="Format Fields (from saved mechanics)"
              />
              <div className="mt-3">
                <button
                  type="button"
                  disabled={!selectedId || panelBusy}
                  onClick={requestUpdateSaved}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#16bfa8] px-4 text-xs font-bold text-white hover:bg-[#12ae99] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                >
                  {busy ? (
                    <>
                      <Spinner /> Saving…
                    </>
                  ) : (
                    "Save changes & continue"
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {mode === "upload" && (
        <div className={`mt-6 grid gap-4 ${showUploadEditor ? "lg:grid-cols-2" : ""}`}>
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
            {extractMeta && !extracting && (
              <div className="mt-3 flex min-h-[22rem] flex-col overflow-hidden rounded-xl border border-slate-200 bg-[#e8ecf1]">
                <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 bg-[#f3f5f7] px-4 py-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    Mechanics preview
                  </p>
                  {extractMeta.page_count ? (
                    <span className="text-[10px] font-semibold text-slate-400">
                      {extractMeta.page_count} page
                      {extractMeta.page_count === 1 ? "" : "s"} · scroll to read
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold text-slate-400">Scroll to read</span>
                  )}
                </div>
                <div className="pp-scroll max-h-[min(36rem,72vh)] min-h-[20rem] flex-1 overflow-y-auto px-3 py-4 sm:px-5">
                  <DocumentPagePreview
                    preview={extractMeta}
                    emptyLabel="No mechanics preview available yet."
                    centerFirstPage={false}
                  />
                </div>
              </div>
            )}
          </div>

          {showUploadEditor && (
            <div>
              <FormatMechanicsFields
                form={form}
                onChange={setForm}
                disabled={busy || extracting}
                title="Format Fields (from uploaded guide)"
              />
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  disabled={busy || extracting}
                  onClick={requestSaveProfile}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-[#16bfa8] px-6 text-xs font-bold text-white hover:bg-[#12ae99] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                >
                  {busy ? (
                    <>
                      <Spinner /> Saving…
                    </>
                  ) : (
                    "Save & continue"
                  )}
                </button>
                <button
                  type="button"
                  disabled={busy || extracting}
                  onClick={() => {
                    clearUploadDraft();
                    setError("");
                    setSuccess("");
                  }}
                  className="inline-flex h-11 items-center justify-center rounded-lg border border-slate-200 bg-white px-5 text-xs font-semibold text-slate-500 hover:bg-slate-50 disabled:opacity-40"
                >
                  Clear draft
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {showCustomizeEditor && (
        <div className="mt-6 space-y-4">
          <p className="text-xs text-slate-400">
            Starter format rules are loaded below — edit any field to match your requirements, then
            save the profile for reuse.
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
