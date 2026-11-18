import { normalizeTier } from "../../lib/plans";

export default function UpgradePrompt({ message, tier, onClose, onUpgrade }) {
  if (!message) return null;
  const current = normalizeTier(tier);
  const atTop = current === "pro";
  const heading = atTop
    ? "Scan limit reached"
    : current === "premium"
      ? "Upgrade to Pro"
      : "Upgrade your plan";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 p-5 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="upgrade-title">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
        <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#109b89]">
          {atTop ? "Pro" : current === "premium" ? "Pro" : "Plans"}
        </span>
        <h2 id="upgrade-title" className="mt-4 text-xl font-semibold text-slate-800">
          {heading}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">{message}</p>
        {!atTop && (
          <ul className="mt-4 space-y-2 text-sm text-slate-600">
            {current === "premium" ? (
              <li>✓ Up to 75 compliance scans every week</li>
            ) : (
              <>
                <li>✓ More compliance scans each month or week</li>
                <li>✓ Full manuscript version history</li>
                <li>✓ APA, MLA, and IEEE citation styles</li>
              </>
            )}
          </ul>
        )}
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onClose?.();
              onUpgrade?.();
            }}
            className="flex-1 rounded-lg bg-[#16bfa8] py-2.5 text-sm font-semibold text-white hover:bg-[#12ae99]"
          >
            Upgrade plan
          </button>
        </div>
      </div>
    </div>
  );
}
