import { useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { completeRegister, otpBypassToken, registerCheck, sendOtp } from "../../api";
import { auth, db, firebaseReady } from "../../firebase";
import { FIREBASE_MISSING, authMessage } from "../../lib/messages";
import { passwordChecks, registerErrors, registerFieldError } from "../../lib/validation";
import { registerWithEmail, saveUserProfile, signInWithEmail, signInWithGoogle } from "../../services/auth";
import { promptGoogleSignIn } from "../../services/googleSignIn";
import { colors } from "../../theme";
import FloatingLabelInput from "../ui/FloatingLabelInput";
import PrimaryButton from "../ui/PrimaryButton";
import AuthShell from "./AuthShell";
import GoogleButton from "./GoogleButton";
import OtpStep from "./OtpStep";

const TWO_COLUMN_MIN_WIDTH = 640;

const EMPTY = {
  firstName: "",
  middleName: "",
  lastName: "",
  username: "",
  email: "",
  password: "",
  confirmPassword: "",
};

export default function RegisterScreen({ onGoToLogin, onRegistered }) {
  const [step, setStep] = useState("form");
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [otpMeta, setOtpMeta] = useState(null);
  const { width } = useWindowDimensions();
  const twoColumn = width >= TWO_COLUMN_MIN_WIDTH;

  function inputProps(field, label, extra = {}) {
    return {
      label,
      value: values[field],
      onChangeText: (v) => setField(field, v),
      onBlur: () => onBlurField(field),
      error: errors[field],
      disabled: busy,
      ...extra,
    };
  }

  function setField(field, value) {
    const nextValues = { ...values, [field]: value };
    setValues(nextValues);
    setErrors((prev) => {
      const next = { ...prev };
      if (touched[field]) next[field] = registerFieldError(field, nextValues);
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

  async function onSubmit() {
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
      await registerCheck({ email, username: values.username.trim() });
      const res = await sendOtp({ email, purpose: "verify_email" });
      const bypass = otpBypassToken(res, "verify_email");
      if (bypass) {
        await onVerified(bypass);
        return;
      }
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
      setFormError(`${err.message} Please review your details and register again.`);
      setStep("form");
      return;
    }

    try {
      if (res.client_signup) {
        const displayName = [profile.firstName, profile.middleName, profile.lastName]
          .filter(Boolean)
          .join(" ");
        const credential = await registerWithEmail(auth, email, values.password, displayName);
        await saveUserProfile(db, credential.user.uid, profile);
      } else {
        await signInWithEmail(auth, email, values.password, true);
        if (!res.profile_saved && auth.currentUser) {
          await saveUserProfile(db, auth.currentUser.uid, profile);
        }
      }
      onRegistered?.(profile);
    } catch (err) {
      setFormError(`Your account is verified, but signing in failed: ${authMessage(err)}`);
      setStep("form");
    }
  }

  async function onGoogle() {
    setFormError("");
    if (!firebaseReady || !auth) {
      setFormError("Add Firebase keys to mobile/app.json to enable Google sign-up.");
      return;
    }
    setBusy(true);
    try {
      const tokens = await promptGoogleSignIn();
      await signInWithGoogle(auth, true, tokens);
    } catch (err) {
      setFormError(authMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const loginFooter = (
    <Text style={styles.footer}>
      Already have an account?{" "}
      <Text style={styles.footerLink} onPress={onGoToLogin}>
        Sign in
      </Text>
    </Text>
  );

  if (step === "otp") {
    return (
      <AuthShell
        variant="register"
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
      title="Create your account"
      subtitle="Join PaperPilot to save scores and reports."
      footer={loginFooter}
    >
      <View style={styles.form}>
        <View style={twoColumn ? styles.nameRow : styles.nameStack}>
          <FloatingLabelInput
            {...inputProps("firstName", "First name", { icon: "user", autoComplete: "given-name", autoCapitalize: "words" })}
            style={twoColumn ? styles.nameCell : null}
          />
          <FloatingLabelInput
            {...inputProps("middleName", "Middle name (optional)", {
              icon: "user",
              autoComplete: "additional-name",
              autoCapitalize: "words",
            })}
            style={twoColumn ? styles.nameCell : null}
          />
        </View>
        <FloatingLabelInput
          {...inputProps("lastName", "Last name", { icon: "user", autoComplete: "family-name", autoCapitalize: "words" })}
        />
        <FloatingLabelInput
          {...inputProps("username", "Username", {
            icon: "at",
            autoComplete: "username",
            maxLength: 20,
            hint: "3–20 characters: letters, numbers, underscore, or period.",
          })}
        />
        <FloatingLabelInput
          {...inputProps("email", "Email", { icon: "mail", keyboardType: "email-address", autoComplete: "email" })}
        />
        <View>
          <FloatingLabelInput
            {...inputProps("password", "Password", {
              icon: "lock",
              secureTextEntry: true,
              showPasswordToggle: true,
              autoComplete: "new-password",
              textContentType: "newPassword",
            })}
          />
          {values.password && !errors.password ? (
            <View style={styles.checks}>
              {checks.map((check) => (
                <Text key={check.label} style={[styles.check, check.met ? styles.checkMet : null]}>
                  {check.met ? "✓" : "○"} {check.label}
                </Text>
              ))}
            </View>
          ) : null}
        </View>
        <FloatingLabelInput
          {...inputProps("confirmPassword", "Confirm password", {
            icon: "lock",
            secureTextEntry: true,
            showPasswordToggle: true,
            autoComplete: "new-password",
            textContentType: "newPassword",
          })}
        />

        {formError ? <Text style={styles.error}>{formError}</Text> : null}

        <PrimaryButton
          title={busy ? "Sending code…" : "Create account"}
          onPress={onSubmit}
          busy={busy}
        />
      </View>

      <GoogleButton label="Sign up with Google" onPress={onGoogle} disabled={busy} />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  form: { marginTop: 28, gap: 16 },
  nameRow: { flexDirection: "row", gap: 16 },
  nameStack: { gap: 16 },
  nameCell: { flex: 1, width: "auto" },
  checks: { flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 4, marginTop: 8 },
  check: { fontSize: 12.5, color: colors.muted },
  checkMet: { color: colors.accent },
  error: { fontSize: 14, color: colors.rose },
  footer: { marginTop: 24, textAlign: "center", fontSize: 14, color: colors.slate },
  footerLink: { fontWeight: "600", color: colors.accent },
});
