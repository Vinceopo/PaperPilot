import { useEffect, useState } from "react";
import { signOut } from "firebase/auth";
import { otpBypassToken, resetPasswordWithOtp, sendOtp } from "../../api.js";
import { auth } from "../../firebase.js";
import { markPasswordChanged } from "../../services/auth.js";
import FloatingLabelInput from "../FloatingLabelInput.jsx";
import { maskEmail } from "../../lib/maskEmail.js";
import AuthFeatureCard from "./AuthFeatureCard.jsx";
import OtpStep from "./OtpStep.jsx";
import { passwordChecks, confirmPasswordError, emailError, passwordError } from "./validation.js";

/**
 * Email -> 6-digit code -> new password -> back to login.
 * Uses the same navy-header card as Confirm email / Account Created.
 */
export default function ForgotPasswordScreen({ initialEmail = "", onGoToLogin, onDone }) {
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState(initialEmail);
  const [emailErr, setEmailErr] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [otpMeta, setOtpMeta] = useState(null);
  const [resetToken, setResetToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordErrors, setPasswordErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!cooldownUntil || cooldownUntil <= Date.now()) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [cooldownUntil]);

  const cooldownLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));

  const backToLogin = (
    <p className="mt-5 text-center text-sm leading-5">
      <button
        type="button"
        className="rounded-sm font-semibold text-[#16bfa8] transition hover:text-[#12ae99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16bfa8]/40"
        onClick={onGoToLogin}
      >
        Back to sign in
      </button>
    </p>
  );

  async function onRequestCode(e) {
    e.preventDefault();
    setFormError("");
    const err = emailError(email);
    setEmailErr(err);
    if (err) return;
    if (cooldownLeft > 0) {
      setFormError(`Please wait ${cooldownLeft} second(s) before requesting another code.`);
      return;
    }
    setBusy(true);
    try {
      const res = await sendOtp({ email: email.trim(), purpose: "reset_password" });
      const bypass = otpBypassToken(res, "reset_password");
      if (bypass) {
        setResetToken(bypass);
        setStep("password");
        return;
      }
      setOtpMeta({ expiresIn: res.expires_in, resendIn: res.resend_in, devCode: res.dev_code });
      setCooldownUntil(Date.now() + (res.resend_in || 30) * 1000);
      setStep("otp");
    } catch (err2) {
      const wait = Number(err2.retryAfter) || 0;
      if (wait > 0) setCooldownUntil(Date.now() + wait * 1000);
      setFormError(err2.message);
    } finally {
      setBusy(false);
    }
  }

  function onVerified(token) {
    setResetToken(token);
    setStep("password");
  }

  function passwordFieldError(field, nextPassword, nextConfirm) {
    if (field === "password") return passwordError(nextPassword);
    return confirmPasswordError(nextPassword, nextConfirm);
  }

  function revalidatePassword(field, nextPassword, nextConfirm) {
    setPasswordErrors((prev) => {
      const next = { ...prev };
      if (touched[field]) next[field] = passwordFieldError(field, nextPassword, nextConfirm);
      if (field === "password" && touched.confirmPassword) {
        next.confirmPassword = confirmPasswordError(nextPassword, nextConfirm);
      }
      return next;
    });
  }

  async function onSetPassword(e) {
    e.preventDefault();
    setFormError("");
    const next = {
      password: passwordError(password),
      confirmPassword: confirmPasswordError(password, confirmPassword),
    };
    setPasswordErrors(next);
    setTouched({ password: true, confirmPassword: true });
    if (next.password || next.confirmPassword) return;
    setBusy(true);
    try {
      await resetPasswordWithOtp({ email: email.trim(), resetToken, newPassword: password });
      markPasswordChanged();
      if (auth?.currentUser) {
        await signOut(auth).catch(() => {});
      }
      onDone();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (step === "otp") {
    return (
      <AuthFeatureCard
        mode="page"
        icon="shield"
        title="Check your email"
        subtitle="Enter the 6-digit code to confirm it is really you."
        footer={backToLogin}
      >
        <OtpStep
          email={email.trim()}
          purpose="reset_password"
          expiresIn={otpMeta?.expiresIn}
          resendIn={otpMeta?.resendIn}
          devCode={otpMeta?.devCode}
          onVerified={onVerified}
          onBack={() => setStep("email")}
          backLabel="Use a different email"
        />
      </AuthFeatureCard>
    );
  }

  if (step === "password") {
    const checks = passwordChecks(password);
    return (
      <AuthFeatureCard
        mode="page"
        icon="lock"
        title="Set a new password"
        subtitle={`Choose a new password for ${maskEmail(email.trim())}.`}
        footer={backToLogin}
      >
        <form className="flex flex-col gap-3.5" onSubmit={onSetPassword} noValidate>
          <div>
            <FloatingLabelInput
              id="reset-password"
              label="New password"
              type="password"
              icon="lock"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                revalidatePassword("password", e.target.value, confirmPassword);
              }}
              onBlur={() => {
                setTouched((prev) => ({ ...prev, password: true }));
                setPasswordErrors((prev) => ({ ...prev, password: passwordError(password) }));
              }}
              error={passwordErrors.password}
              autoComplete="new-password"
              disabled={busy}
              showPasswordToggle
            />
            {password && !passwordErrors.password ? (
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {checks.map((check) => (
                  <li key={check.label} className={`text-[12.5px] ${check.met ? "text-[#16bfa8]" : "text-slate-400"}`}>
                    {check.met ? "✓" : "○"} {check.label}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <FloatingLabelInput
            id="reset-confirm-password"
            label="Confirm new password"
            type="password"
            icon="lock"
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              revalidatePassword("confirmPassword", password, e.target.value);
            }}
            onBlur={() => {
              setTouched((prev) => ({ ...prev, confirmPassword: true }));
              setPasswordErrors((prev) => ({
                ...prev,
                confirmPassword: confirmPasswordError(password, confirmPassword),
              }));
            }}
            error={passwordErrors.confirmPassword}
            autoComplete="new-password"
            disabled={busy}
            showPasswordToggle
          />

          {formError && (
            <p className="text-sm text-rose-500" role="alert">
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-1 flex h-[48px] w-full items-center justify-center rounded-xl bg-[#16bfa8] text-sm font-bold text-white shadow-[0_8px_20px_rgba(22,191,168,0.28)] transition hover:bg-[#12ae99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16bfa8] focus-visible:ring-offset-2 disabled:opacity-60"
          >
            {busy ? "Updating…" : "Update password"}
          </button>
        </form>
      </AuthFeatureCard>
    );
  }

  return (
    <AuthFeatureCard
      mode="page"
      icon="mail"
      title="Reset your password"
      subtitle="We will email you a 6-digit code to confirm your address."
      footer={backToLogin}
    >
      <form className="flex flex-col gap-3.5" onSubmit={onRequestCode} noValidate>
        <FloatingLabelInput
          id="forgot-email"
          label="Email"
          type="email"
          icon="mail"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (emailErr) setEmailErr(emailError(e.target.value));
          }}
          onBlur={() => setEmailErr(emailError(email))}
          error={emailErr}
          autoComplete="email"
          disabled={busy}
        />

        {formError && (
          <p className="text-sm leading-5 text-rose-500" role="alert">
            {formError}
          </p>
        )}

        <button
          type="submit"
          disabled={busy || cooldownLeft > 0}
          className="mt-1 flex h-[48px] w-full items-center justify-center rounded-xl bg-[#16bfa8] text-sm font-bold text-white shadow-[0_8px_20px_rgba(22,191,168,0.28)] transition hover:bg-[#12ae99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16bfa8] focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {busy
            ? "Sending code…"
            : cooldownLeft > 0
              ? `Try again in ${cooldownLeft}s`
              : "Send verification code"}
        </button>
      </form>
    </AuthFeatureCard>
  );
}
