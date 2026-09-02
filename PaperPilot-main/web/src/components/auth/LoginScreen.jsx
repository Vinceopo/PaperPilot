import { useState } from "react";
import { auth, firebaseReady } from "../../firebase.js";
import { signInWithEmail, signInWithGoogle } from "../../services/auth.js";
import FloatingLabelInput from "../FloatingLabelInput.jsx";
import AuthShell from "./AuthShell.jsx";
import GoogleButton from "./GoogleButton.jsx";
import { FIREBASE_MISSING, authMessage } from "./messages.js";
import { emailError } from "./validation.js";

export default function LoginScreen({
  slideDir,
  notice,
  onGoToRegister,
  onGoToForgotPassword,
  onContinueAsGuest,
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  function fieldError(field, nextEmail = email, nextPassword = password) {
    if (field === "email") return emailError(nextEmail);
    if (field === "password") return nextPassword ? "" : "Password is required.";
    return "";
  }

  function revalidate(field, nextEmail, nextPassword) {
    if (!touched[field]) return;
    setErrors((prev) => ({ ...prev, [field]: fieldError(field, nextEmail, nextPassword) }));
  }

  function onBlurField(field) {
    setTouched((prev) => ({ ...prev, [field]: true }));
    setErrors((prev) => ({ ...prev, [field]: fieldError(field) }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setFormError("");
    const next = { email: fieldError("email"), password: fieldError("password") };
    setErrors(next);
    setTouched({ email: true, password: true });
    if (next.email || next.password) return;
    if (!firebaseReady || !auth) {
      setFormError(FIREBASE_MISSING);
      return;
    }
    setBusy(true);
    try {
      await signInWithEmail(auth, email.trim(), password, remember);
    } catch (err) {
      setFormError(authMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setFormError("");
    if (!firebaseReady || !auth) {
      setFormError("Add Firebase keys to web/.env to enable Google sign-in.");
      return;
    }
    setBusy(true);
    try {
      await signInWithGoogle(auth, remember);
    } catch (err) {
      setFormError(authMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      variant="login"
      slideDir={slideDir}
      panelKey="login"
      title="Welcome back"
      subtitle="Sign in to continue reviewing manuscripts."
      onContinueAsGuest={onContinueAsGuest}
      footer={
        <p className="mt-6 text-center text-sm text-slate-500">
          Don&apos;t have an account?{" "}
          <button
            type="button"
            className="font-semibold text-accent hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-sm"
            onClick={onGoToRegister}
          >
            Create an account
          </button>
        </p>
      }
    >
      <form className="mt-7 space-y-4" onSubmit={onSubmit} noValidate>
        <FloatingLabelInput
          id="login-email"
          label="Email"
          type="email"
          icon="mail"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            revalidate("email", e.target.value, password);
          }}
          onBlur={() => onBlurField("email")}
          error={errors.email}
          autoComplete="email"
        />
        <FloatingLabelInput
          id="login-password"
          label="Password"
          type="password"
          icon="lock"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            revalidate("password", email, e.target.value);
          }}
          onBlur={() => onBlurField("password")}
          error={errors.password}
          autoComplete="current-password"
          showPasswordToggle
        />

        <div className="flex items-center justify-between pt-0.5">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-accent focus:ring-accent"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Remember me
          </label>
          <button
            type="button"
            className="text-sm font-medium text-accent hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-sm"
            onClick={() => onGoToForgotPassword(email.trim())}
          >
            Forgot password?
          </button>
        </div>

        {formError && (
          <p className="text-sm text-rose-500" role="alert">
            {formError}
          </p>
        )}
        {notice && !formError && (
          <p className="text-sm text-accent" role="status">
            {notice}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-accent py-3 text-sm font-semibold text-navy shadow-[0_10px_24px_rgba(27,201,160,0.28)] transition hover:bg-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {busy ? "Please wait…" : "Sign in to PaperPilot"}
        </button>
      </form>

      <GoogleButton label="Sign in with Google" onClick={onGoogle} disabled={busy} />
    </AuthShell>
  );
}
