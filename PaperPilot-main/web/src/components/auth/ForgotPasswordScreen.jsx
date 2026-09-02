import { useState } from "react";
import { resetPasswordWithOtp, sendOtp } from "../../api.js";
import FloatingLabelInput from "../FloatingLabelInput.jsx";
import AuthShell from "./AuthShell.jsx";sdfsdf
import OtpStep from "./OtpStep.jsx";
import { passwordChecks, confirmPasswordError, emailError, passwordError } from "./validation.js";

/**
 * Email -> 6-digit code -> new password -> back to login.
 * `onDone` is called with a confirmation message for the login screen.
 */
export default function ForgotPasswordScreen({ slideDir, initialEmail = "", onGoToLogin, onDone }) {
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

  const backToLogin = (
    <p className="mt-6 text-center text-sm text-slate-500">
      Remembered it?{" "}
      <button
        type="button"
        className="font-semibold text-accent hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-sm"
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
    setBusy(true);
    try {
      const res = await sendOtp({ email: email.trim(), purpose: "reset_password" });
      setOtpMeta({ expiresIn: res.expires_in, resendIn: res.resend_in, devCode: res.dev_code });
      setStep("otp");
    } catch (err2) {
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
      onDone("Password updated. Sign in with your new password.");
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (step === "otp") {
    return (
      <AuthShell
        variant="forgot"
        slideDir="left"
        panelKey="forgot-otp"
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
      </AuthShell>
    );
  }

  if (step === "password") {
    const checks = passwordChecks(password);
    return (
      <AuthShell
        variant="forgot"
        slideDir="left"
        panelKey="forgot-password"
        title="Set a new password"
        subtitle={`Choose a new password for ${email.trim()}.`}
        footer={backToLogin}
      >
        <form className="mt-7 space-y-4" onSubmit={onSetPassword} noValidate>
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
                  <li key={check.label} className={`text-[12.5px] ${check.met ? "text-accent" : "text-slate-400"}`}>
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
            className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-navy shadow-[0_10px_24px_rgba(27,201,160,0.28)] transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-60"
          >
            {busy ? "Updating…" : "Update password"}
          </button>
        </form>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      variant="forgot"
      slideDir={slideDir}
      panelKey="forgot-email"
      title="Reset your password"
      subtitle="We will email you a 6-digit code to confirm your address."
      footer={backToLogin}
    >
      <form className="mt-7 space-y-4" onSubmit={onRequestCode} noValidate>
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
          <p className="text-sm text-rose-500" role="alert">
            {formError}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-navy shadow-[0_10px_24px_rgba(27,201,160,0.28)] transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {busy ? "Sending code…" : "Send verification code"}
        </button>
      </form>
    </AuthShell>
  );
}
