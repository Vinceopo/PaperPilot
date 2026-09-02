export default function UpgradePrompt({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-5 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="upgrade-title">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
        <span className="inline-flex rounded-full bg-violet-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-violet-600">
          Premium
        </span>
        <h2 id="upgrade-title" className="mt-4 text-xl font-semibold text-slate-800">Upgrade to Premium</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">{message}</p>
        <ul className="mt-4 space-y-2 text-sm text-slate-600">
          <li>✓ Up to 50 compliance scans each month</li>
          <li>✓ Complete manuscript version history</li>
          <li>✓ Deeper AI explanations and recommendations</li>
        </ul>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Not now
          </button>
          <button
            type="button"
            disabled
            title="Billing integration is not configured yet."
            className="flex-1 cursor-not-allowed rounded-lg bg-[#16bfa8] py-2.5 text-sm font-semibold text-white opacity-60"
          >
            Upgrade soon
          </button>
        </div>
      </div>
    </div>
  );
}
