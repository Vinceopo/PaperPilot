export default function VersionHistory({ open, manuscript, versions, tier, onClose }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/50 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="history-title">
      <div className="h-full w-full max-w-md overflow-y-auto border-l border-slate-200 bg-white p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#16bfa8]">Version history</p>
            <h2 id="history-title" className="mt-1 text-xl font-semibold text-slate-800">{manuscript?.title || "Manuscript"}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close version history">
            ✕
          </button>
        </div>

        {tier === "free" && (
          <div className="mt-5 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-700">
            Free accounts can access the current version only. Upgrade to Premium for complete history.
          </div>
        )}

        <div className="mt-5 space-y-3">
          {versions.map((version, index) => (
            <article key={version.id} className="rounded-xl border border-slate-200 bg-[#fafbfc] p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium text-slate-700">Version {version.version_number}</p>
                {index === 0 || version.is_current ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold uppercase text-emerald-700">Current</span>
                ) : null}
              </div>
              <p className="mt-1 truncate text-sm text-slate-400">{version.source_filename || version.filename}</p>
              <p className="mt-2 text-xs text-slate-500">
                {version.created_at ? new Date(version.created_at).toLocaleString() : ""}
              </p>
            </article>
          ))}
          {!versions.length && <p className="text-sm text-slate-400">No accessible versions were returned.</p>}
        </div>
      </div>
    </div>
  );
}
