import AuthShell from "./AuthShell.jsx";

/**
 * Shown after a password change or reset, before the login form.
 */
export default function PasswordChangedScreen({ onContinue }) {
  return (
    <AuthShell
      variant="login"
      slideDir="right"
      panelKey="password-changed"
      title="Password updated"
      subtitle="Your account is now signed out on every device."
    >
      <div className="mt-8 rounded-2xl border border-emerald-100 bg-white p-7 text-center shadow-sm">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[#16bfa8] text-2xl font-bold text-white shadow-[0_10px_24px_rgba(22,191,168,0.28)]">
          ✓
        </span>
        <p className="mt-5 text-base font-semibold leading-relaxed text-navy">
          Changing password is completed! Please login again
        </p>
        <p className="mt-2 text-sm text-slate-500">
          For your security, all active sessions have been ended. Sign in again with Google or your email and new password to continue.
        </p>
        <button
          type="button"
          onClick={onContinue}
          className="mt-7 w-full rounded-xl bg-accent py-3 text-sm font-semibold text-navy shadow-[0_10px_24px_rgba(27,201,160,0.28)] transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          Continue to sign in
        </button>
      </div>
    </AuthShell>
  );
}
