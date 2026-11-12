import AuthFeatureCard from "./AuthFeatureCard.jsx";

/**
 * Shown after a password change or reset, before the login form.
 */
export default function PasswordChangedScreen({ onContinue }) {
  return (
    <AuthFeatureCard
      mode="page"
      icon="check"
      title="Password updated"
      subtitle="Your account is now signed out on every device."
    >
      <div className="text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#16bfa8] text-xl font-bold text-white shadow-[0_8px_20px_rgba(22,191,168,0.28)]">
          ✓
        </span>
        <p className="mt-5 text-base font-semibold leading-relaxed text-slate-800">
          Changing password is completed! Please login again
        </p>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">
          For your security, all active sessions have been ended. Sign in again with your email and new password to continue.
        </p>
        <button
          type="button"
          onClick={onContinue}
          className="mt-7 w-full rounded-xl bg-[#16bfa8] py-3 text-sm font-bold text-white shadow-[0_8px_20px_rgba(22,191,168,0.28)] transition hover:bg-[#12ae99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16bfa8] focus-visible:ring-offset-2"
        >
          Continue to sign in
        </button>
      </div>
    </AuthFeatureCard>
  );
}
