import { useRef, useState } from "react";

const ACCEPTED = [".pdf", ".docx"];

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
  onUpload,
  onRename,
  onDelete,
  busy,
}) {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [success, setSuccess] = useState("");
  const selected = items.find((item) => item.id === selectedId);

  async function submit(e) {
    e.preventDefault();
    const issue = validateFile(file);
    setError(issue);
    setSuccess("");
    if (issue) return;
    const fileName = file.name.replace(/\.(pdf|docx)$/i, "");
    // Server is the source of truth for uniqueness (also clears orphaned name locks).
    const ok = await onUpload(file, fileName);
    if (ok) {
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      setSuccess("Format mechanics uploaded completely and ready to use.");
    }
  }

  async function submitRename(e) {
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
    const ok = await onRename(selectedId, editName);
    if (ok) {
      setEditing(false);
      setEditName("");
      setError("");
    }
  }

  async function removeSelected() {
    if (!selected) return;
    const confirmed = window.confirm(
      `Delete “${selected.name}”? This cannot be undone.`
    );
    if (confirmed) await onDelete(selected.id);
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#16bfa8]">Step 1</p>
      <h2 className="mt-1 text-lg font-bold text-[#172033]">Upload Format Mechanics</h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-400">
        Upload the formatting guide or template your manuscript should follow.
      </p>

      <form onSubmit={submit} className="mt-5">
        <label className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-[#18bda9] bg-[#f7fcfc] px-5 text-center hover:bg-[#f0fbf9]">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-[#dcf7f2] text-3xl font-light text-[#16bfa8]">↑</span>
          <span className="mt-3 text-sm font-bold text-slate-700">
            {file ? file.name : "Drop your format guide here"}
          </span>
          <span className="mt-1 text-[11px] text-slate-400">
            {file ? "Click Upload format mechanics below when ready" : "Supports .pdf and .docx · Max 25 MB"}
          </span>
          <span className="mt-3 rounded-full border border-[#16bfa8] bg-white px-5 py-1.5 text-[11px] font-semibold text-[#109b89]">
            Browse files
          </span>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="sr-only"
            onChange={(e) => {
              const next = e.target.files?.[0] || null;
              setFile(next);
              setError(validateFile(next));
            }}
          />
        </label>

        <button
          type="submit"
          disabled={busy || !file || Boolean(error)}
          className="mt-3 h-11 w-full rounded-lg bg-[#16bfa8] px-6 text-xs font-bold text-white hover:bg-[#12ae99] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
        >
          {busy ? "Uploading format mechanics…" : "Upload format mechanics"}
        </button>
        {error && <p className="mt-2 text-xs text-rose-500">{error}</p>}
        {success && !error && (
          <p className="mt-2 text-xs font-semibold text-emerald-600" role="status">
            {success}
          </p>
        )}
      </form>

      <div className="mt-4 border-t border-slate-100 pt-4">
        {items.length ? (
          <>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Saved mechanics
              <select
                value={selectedId}
                onChange={(e) => {
                  onSelect(e.target.value);
                  setEditing(false);
                  setError("");
                }}
                className="mt-2 h-10 w-full rounded-lg border border-slate-200 bg-[#f8f9fb] px-3 text-xs font-medium normal-case tracking-normal text-slate-700 outline-none focus:border-[#16bfa8]"
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
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={busy}
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
                  disabled={busy}
                  onClick={removeSelected}
                  className="rounded-md px-2.5 py-1.5 text-[11px] font-semibold text-rose-500 hover:bg-rose-50 disabled:opacity-40"
                >
                  Delete
                </button>
              </div>
            )}

            {selected && editing && (
              <form onSubmit={submitRename} className="mt-3 flex gap-2">
                <input
                  autoFocus
                  maxLength={200}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="h-9 min-w-0 flex-1 rounded-lg border border-[#16bfa8] bg-white px-3 text-xs text-slate-700 outline-none"
                  aria-label="New mechanics name"
                />
                <button
                  type="submit"
                  disabled={busy || !editName.trim()}
                  className="rounded-lg bg-[#16bfa8] px-3 text-[11px] font-bold text-white disabled:opacity-40"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="rounded-lg border border-slate-200 px-3 text-[11px] font-semibold text-slate-500"
                >
                  Cancel
                </button>
              </form>
            )}
          </>
        ) : (
          <p className="text-xs text-slate-400">Upload your first mechanics guide to continue.</p>
        )}
      </div>
    </section>
  );
}
