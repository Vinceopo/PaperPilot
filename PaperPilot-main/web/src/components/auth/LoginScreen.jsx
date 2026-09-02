import { useState } from "react";
import { resolveEmail } from "../../api.js";
import { auth, firebaseReady } from "../../firebase.js";
import { signInWithEmail, signInWithGoogle } from "../../services/auth.js";
import FloatingLabelInput from "../FloatingLabelInput.jsx";
import AuthShell from "./AuthShell.jsx";
import GoogleButton from "./GoogleButton.jsx";
import { FIREBASE_MISSING, authMessage } from "./messages.js";

/** True when the value looks like a username (no @, 3–20 valid chars). */
function looksLikeUsername(val) {
  return val.length >= 1 && !val.includes("@");
}

function identifierError(val) {
  const v = val.trim();
  if (!v) return "Email or username is required.";
  return "";
}

export default function LoginScreen({
  slideDir,
  notice,
  onGoToRegister,
  onGoToForgotPassword,
  onContinueAsGuest,
}) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  function fieldError(field, nextId = identifier, nextPw = password) {
    if (field === "identifier") return identifierError(nextId);
    if (field === "password") return nextPw ? "" : "Password is required.";
    return "";
  }

  function revalidate(field, nextId, nextPw) {
    if (!touched[field]) return;
    setErrors((prev) => ({ ...prev, [field]: fieldError(field, nextId, nextPw) }));
  }

  function onBlurField(field) {
    setTouched((prev) => ({ ...prev, [field]: true }));
    setErrors((prev) => ({ ...prev, [field]: fieldError(field) }));
  }

  async function onSubmit(e) {
    e.preventDefault();
    setFormError("");
    const next = { identifier: fieldError("identifier"), password: fieldError("password") };
    setErrors(next);
    setTouched({ identifier: true, password: true });
    if (next.identifier || next.password) return;
    if (!firebaseReady || !auth) {
      setFormError(FIREBASE_MISSING);
      return;
    }
    setBusy(true);
    try {
      let loginEmail = identifier.trim();
      if (looksLikeUsername(loginEmail)) {
        // Resolve username → email via the API before handing off to Firebase.
        const res = await resolveEmail(loginEmail);
        loginEmail = res.email;
      }
      await signInWithEmail(auth, loginEmail, password, remember);
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
          id="login-identifier"
          label="Email or Username"
          type="text"
          icon="mail"
          value={identifier}
          onChange={(e) => {
            setIdentifier(e.target.value);
            revalidate("identifier", e.target.value, password);
          }}
          onBlur={() => onBlurField("identifier")}
          error={errors.identifier}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
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
            onClick={() => onGoToForgotPassword(identifier.includes("@") ? identifier.trim() : "")}
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
