import Spinner from "./Spinner.jsx";

/**
 * In-app confirmation dialog matching PaperPilot modal styling.
 * Replaces browser window.confirm for important actions.
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "primary", // "primary" | "danger"
  busy = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  const confirmClass =
    tone === "danger"
      ? "bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300"
      : "bg-[#16bfa8] hover:bg-[#12ae99] disabled:bg-slate-200 disabled:text-slate-400";

  return (
    <div
      className="fixed inset-0 z-[60] grid place-items-center bg-slate-900/50 p-5 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-message"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h3 id="confirm-dialog-title" className="text-lg font-bold text-[#172033]">
          {title}
        </h3>
        {message ? (
          <p id="confirm-dialog-message" className="mt-2 text-sm leading-relaxed text-slate-500">
            {message}
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`inline-flex min-w-28 items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-xs font-bold text-white ${confirmClass}`}
          >
            {busy ? (
              <>
                <Spinner /> Processing…
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
