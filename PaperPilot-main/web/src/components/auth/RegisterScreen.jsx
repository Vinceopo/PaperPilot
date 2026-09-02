import { useState } from "react";
import { completeRegister, registerCheck, sendOtp } from "../../api.js";
import { auth, db, firebaseReady } from "../../firebase.js";
import { registerWithEmail, saveUserProfile, signInWithEmail, signInWithGoogle } from "../../services/auth.js";
import FloatingLabelInput from "../FloatingLabelInput.jsx";
import AuthShell from "./AuthShell.jsx";
import GoogleButton from "./GoogleButton.jsx";
import OtpStep from "./OtpStep.jsx";
import { FIREBASE_MISSING, authMessage } from "./messages.js";
import { passwordChecks, registerErrors, registerFieldError } from "./validation.js";

const EMPTY = {
  firstName: "",
  middleName: "",
  lastName: "",
  username: "",
  email: "",
  password: "",
  confirmPassword: "",
};

const REGISTRATION_SUCCESS_KEY = "paperpilot.registrationSuccess";

function rememberRegistrationSuccess(profile) {
  sessionStorage.setItem(
    REGISTRATION_SUCCESS_KEY,
    JSON.stringify({ ...profile, createdAt: Date.now() })
  );
}

export default function RegisterScreen({ slideDir, onGoToLogin, onContinueAsGuest }) {
  const [step, setStep] = useState("form");
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [otpMeta, setOtpMeta] = useState(null);

  function setField(field, value) {
    const nextValues = { ...values, [field]: value };
    setValues(nextValues);
    // Re-check a field only once the user has left it, so errors are not premature.
    setErrors((prev) => {
      const next = { ...prev };
      if (touched[field]) next[field] = registerFieldError(field, nextValues);
      // Keep password confirmation honest while the password changes.
      if (field === "password" && touched.confirmPassword) {
        next.confirmPassword = registerFieldError("confirmPassword", nextValues);
      }
      return next;
    });
  }

  function onBlurField(field) {
    setTouched((prev) => ({ ...prev, [field]: true }));
    setErrors((prev) => ({ ...prev, [field]: registerFieldError(field, values) }));
  }

  function inputProps(field, label, extra = {}) {
    return {
      id: `register-${field}`,
      label,
      value: values[field],
      onChange: (e) => setField(field, e.target.value),
      onBlur: () => onBlurField(field),
      error: errors[field],
      disabled: busy,
      ...extra,
    };
  }

  async function onSubmit(e) {
    e.preventDefault();
    setFormError("");
    const next = registerErrors(values);
    setErrors(next);
    setTouched(Object.keys(EMPTY).reduce((acc, key) => ({ ...acc, [key]: true }), {}));
    if (Object.keys(next).length > 0) return;
    if (!firebaseReady || !auth) {
      setFormError(FIREBASE_MISSING);
      return;
    }

    const email = values.email.trim();
    setBusy(true);
    try {
      // Fail fast on a taken email or username before spending an OTP.
      await registerCheck({ email, username: values.username.trim() });
      const res = await sendOtp({ email, purpose: "verify_email" });
      setOtpMeta({
        expiresIn: res.expires_in,
        resendIn: res.resend_in,
        devCode: res.dev_code,
      });
      setStep("otp");
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy(false);
    }
  }

  /** Runs once the emailed code is confirmed; only now does the account exist. */
  async function onVerified(signupToken) {
    const email = values.email.trim();
    const username = values.username.trim();
    const profile = {
      firstName: values.firstName.trim(),
      middleName: values.middleName.trim(),
      lastName: values.lastName.trim(),
      username,
      email,
    };

    let res;
    try {
      res = await completeRegister({ signupToken, ...profile, password: values.password });
    } catch (err) {
      // The verification token is single-use, so send the user back to correct and retry.
      setFormError(`${err.message} Please review your details and register again.`);
      setStep("form");
      return;
    }

    try {
      if (res.client_signup) {
        const displayName = [profile.firstName, profile.middleName, profile.lastName]
          .filter(Boolean)
          .join(" ");
        rememberRegistrationSuccess(profile);
        const credential = await registerWithEmail(auth, email, values.password, displayName);
        await saveUserProfile(db, credential.user.uid, profile);
      } else {
        rememberRegistrationSuccess(profile);
        await signInWithEmail(auth, email, values.password, true);
        if (!res.profile_saved && auth.currentUser) {
          await saveUserProfile(db, auth.currentUser.uid, profile);
        }
      }
    } catch (err) {
      sessionStorage.removeItem(REGISTRATION_SUCCESS_KEY);
      setFormError(`Your account is verified, but signing in failed: ${authMessage(err)}`);
      setStep("form");
    }
  }

  async function onGoogle() {
    setFormError("");
    if (!firebaseReady || !auth) {
      setFormError("Add Firebase keys to web/.env to enable Google sign-up.");
      return;
    }
    setBusy(true);
    try {
      await signInWithGoogle(auth, true);
    } catch (err) {
      setFormError(authMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const loginFooter = (
    <p className="mt-6 text-center text-sm text-slate-500">
      Already have an account?{" "}
      <button
        type="button"
        className="font-semibold text-accent hover:text-accent-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-sm"
        onClick={onGoToLogin}
      >
        Sign in
      </button>
    </p>
  );

  if (step === "otp") {
    return (
      <AuthShell
        variant="register"
        slideDir="left"
        panelKey="register-otp"
        title="Verify your email"
        subtitle="Your account becomes active once the code is confirmed."
        footer={loginFooter}
      >
        <OtpStep
          email={values.email.trim()}
          purpose="verify_email"
          expiresIn={otpMeta?.expiresIn}
          resendIn={otpMeta?.resendIn}
          devCode={otpMeta?.devCode}
          onVerified={onVerified}
          onBack={() => setStep("form")}
          backLabel="Use a different email"
        />
      </AuthShell>
    );
  }

  const checks = passwordChecks(values.password);

  return (
    <AuthShell
      variant="register"
      slideDir={slideDir}
      panelKey="register-form"
      title="Create your account"
      subtitle="Join PaperPilot to save scores and reports."
      onContinueAsGuest={onContinueAsGuest}
      footer={loginFooter}
    >
      <form className="mt-7 space-y-4" onSubmit={onSubmit} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <FloatingLabelInput {...inputProps("firstName", "First name", { icon: "user", autoComplete: "given-name" })} />
          <FloatingLabelInput
            {...inputProps("middleName", "Middle name (optional)", {
              icon: "user",
              autoComplete: "additional-name",
            })}
          />
        </div>
        <FloatingLabelInput {...inputProps("lastName", "Last name", { icon: "user", autoComplete: "family-name" })} />
        <FloatingLabelInput
          {...inputProps("username", "Username", {
            icon: "at",
            autoComplete: "username",
            autoCapitalize: "none",
            spellCheck: false,
            maxLength: 20,
            hint: "3–20 characters: letters, numbers, underscore, or period.",
          })}
        />
        <FloatingLabelInput {...inputProps("email", "Email", { type: "email", icon: "mail", autoComplete: "email" })} />
        <div>
          <FloatingLabelInput
            {...inputProps("password", "Password", {
              type: "password",
              icon: "lock",
              autoComplete: "new-password",
              showPasswordToggle: true,
            })}
          />
          {values.password && !errors.password ? (
            <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {checks.map((check) => (
                <li
                  key={check.label}
                  className={`text-[12.5px] ${check.met ? "text-accent" : "text-slate-400"}`}
                >
                  {check.met ? "✓" : "○"} {check.label}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <FloatingLabelInput
          {...inputProps("confirmPassword", "Confirm password", {
            type: "password",
            icon: "lock",
            autoComplete: "new-password",
            showPasswordToggle: true,
          })}
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
          {busy ? "Sending code…" : "Create account"}
        </button>
      </form>

      <GoogleButton label="Sign up with Google" onClick={onGoogle} disabled={busy} />
    </AuthShell>
  );
}
