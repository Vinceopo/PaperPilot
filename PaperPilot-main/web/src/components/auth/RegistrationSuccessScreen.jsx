import AuthFeatureCard from "./AuthFeatureCard.jsx";

export default function RegistrationSuccessScreen({ profile, onContinue }) {
  const fullName =
    profile?.fullName ||
    [profile?.firstName, profile?.middleName, profile?.lastName].filter(Boolean).join(" ") ||
    "PaperPilot user";

  return (
    <AuthFeatureCard
      mode="page"
      icon="check"
      maxWidth="max-w-lg"
      title="Account created successfully"
      subtitle={`Welcome to PaperPilot, ${profile?.firstName || fullName}!`}
    >
      <div className="rounded-xl border border-slate-100 bg-[#f8f9fb] px-4">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-3">
          <span className="w-28 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Full name
          </span>
          <span className="min-w-0 flex-1 text-sm font-medium text-slate-700">{fullName}</span>
        </div>
        <div className="flex items-start justify-between gap-4 py-3">
          <span className="w-28 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Email
          </span>
          <span className="min-w-0 flex-1 break-all text-sm font-medium text-slate-700">
            {profile?.email || "—"}
          </span>
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-100 text-[10px] text-emerald-600">
            ✓
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={onContinue}
        className="mt-6 w-full rounded-xl bg-[#16bfa8] py-3 text-sm font-bold text-white shadow-[0_8px_20px_rgba(22,191,168,0.28)] transition hover:bg-[#12ae99]"
      >
        Proceed to Check Format →
      </button>
    </AuthFeatureCard>
  );
}
