export default function RegistrationSuccessScreen({ profile, onContinue }) {
  const fullName =
    profile?.fullName ||
    [profile?.firstName, profile?.middleName, profile?.lastName].filter(Boolean).join(" ") ||
    "PaperPilot user";

  return (
    <div className="flex min-h-screen bg-[#f3f5f7] text-[#172033]">
      <aside className="relative hidden w-[36%] min-w-[360px] overflow-hidden bg-[#18243a] px-10 py-12 text-white lg:block">
        <div className="absolute -left-20 -top-24 h-72 w-72 rounded-full bg-[#173347]/70" />
        <div className="absolute right-[-24px] top-28 h-32 w-32 rounded-full bg-[#2b4260]" />
        <div className="absolute -bottom-20 right-[-10px] h-64 w-64 rounded-full bg-[#153444]/70" />

        <div className="relative z-10 flex items-center gap-2.5">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-white text-[#18243a]">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
              <path d="M5 5.5h9.5A4.5 4.5 0 0 1 19 10v8.5H9.5A4.5 4.5 0 0 1 5 14V5.5Z" stroke="currentColor" strokeWidth="1.8" />
              <path d="M8 9h7M8 12h7M8 15h4" stroke="#16bfa8" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </span>
          <span className="text-sm font-bold tracking-wide">PAPER PILOT</span>
        </div>

        <div className="relative z-10 mt-28 max-w-sm">
          <h1 className="text-3xl font-semibold leading-tight">
            Join PaperPilot
            <br />
            <span className="text-[#20c9ae]">Analyzer.</span>
          </h1>
          <p className="mt-5 text-sm leading-relaxed text-slate-400">
            Create your account and start checking manuscript formatting in minutes.
          </p>
        </div>
      </aside>

      <main className="relative grid flex-1 place-items-center overflow-hidden px-5 py-10">
        <div className="absolute -right-16 -top-20 h-48 w-48 rounded-full bg-[#e7f1f0]" />
        <div className="absolute -bottom-16 left-[-20px] h-40 w-40 rounded-full bg-[#e1efed]" />

        <section className="relative z-10 w-full max-w-xl overflow-hidden rounded-xl bg-white px-8 pb-12 pt-9 shadow-sm sm:px-12">
          <div className="absolute inset-x-0 top-0 h-1 bg-[#16bfa8]" />

          <div className="text-center">
            <span className="mx-auto grid h-16 w-16 place-items-center rounded-full border-[7px] border-[#dff7f3] bg-[#16bfa8] text-3xl font-bold text-white">
              ✓
            </span>
            <h2 className="mt-3 text-xl font-bold">Account Created Successfully!</h2>
            <p className="mt-1 text-xs text-slate-400">Welcome to PaperPilot, {profile?.firstName || fullName}!</p>
          </div>

          <div className="mt-8 border-t border-slate-100 pt-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Account details</p>

            <label className="mt-3 block text-[11px] font-semibold text-slate-600">
              Full Name
              <div className="mt-1.5 flex h-11 items-center justify-between rounded-lg border border-slate-200 bg-[#f8f9fb] px-4 text-sm font-semibold">
                <span>{fullName}</span>
                <span className="grid h-5 w-5 place-items-center rounded-full bg-emerald-100 text-xs text-emerald-600">✓</span>
              </div>
            </label>

            <label className="mt-3 block text-[11px] font-semibold text-slate-600">
              Email Address
              <div className="mt-1.5 flex h-11 items-center gap-3 rounded-lg border border-slate-200 bg-[#f8f9fb] px-4 text-sm font-semibold">
                <span className="text-slate-400">✉</span>
                <span className="truncate">{profile?.email}</span>
              </div>
            </label>
          </div>

          <button
            type="button"
            onClick={onContinue}
            className="mt-8 w-full rounded-lg bg-[#16bfa8] py-3.5 text-sm font-bold text-white shadow-sm transition hover:bg-[#12ae99]"
          >
            Proceed to Check Format →
          </button>

          <div className="mt-16 border-t border-slate-100" />
        </section>
      </main>
    </div>
  );
}
