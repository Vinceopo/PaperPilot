import { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useAuthRequest } from "expo-auth-session/providers/google";
import Constants from "expo-constants";
import { completeRegister, registerCheck, sendOtp } from "../../api";
import { auth, db, firebaseReady } from "../../firebase";
import { FIREBASE_MISSING, GOOGLE_EXPO_GO_HINT, authMessage } from "../../lib/messages";
import { passwordChecks, registerErrors, registerFieldError } from "../../lib/validation";
import { registerWithEmail, saveUserProfile, signInWithEmail, signInWithGoogle } from "../../services/auth";
import { colors } from "../../theme";
import PrimaryButton from "../ui/PrimaryButton";
import TextField from "../ui/TextField";
import AuthShell from "./AuthShell";
import OtpStep from "./OtpStep";

WebBrowser.maybeCompleteAuthSession();

const isExpoGo = Constants.appOwnership === "expo";

const EMPTY = {
  firstName: "",
  middleName: "",
  lastName: "",
  username: "",
  email: "",
  password: "",
  confirmPassword: "",
};

export default function RegisterScreen({ onGoToLogin, onContinueAsGuest, onRegistered }) {
  const [step, setStep] = useState("form");
  const [values, setValues] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [otpMeta, setOtpMeta] = useState(null);

  const googleClientId = Constants.expoConfig?.extra?.googleWebClientId;
  const googleEnabled = Boolean(googleClientId) && !isExpoGo;
  const [request, response, promptGoogle] = useAuthRequest({
    clientId: googleClientId,
    responseType: "id_token",
  });

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

  useEffect(() => {
    if (response?.type !== "success" || !auth) return;
    const idToken = response.authentication?.idToken || response.params?.id_token;
    const accessToken = response.authentication?.accessToken || response.params?.access_token;
    setBusy(true);
    setFormError("");
    signInWithGoogle(auth, true, { idToken, accessToken })
      .catch((err) => setFormError(authMessage(err)))
      .finally(() => setBusy(false));
  }, [response]);

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
    if (isExpoGo) {
      setFormError(GOOGLE_EXPO_GO_HINT);
      return;
    }
    if (!firebaseReady || !auth) {
      setFormError("Add Firebase keys to mobile/app.json to enable Google sign-up.");
      return;
    }
    if (!request) {
      setFormError("Google sign-in is not configured.");
      return;
    }
    setBusy(true);
    try {
      await promptGoogle();
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
      onContinueAsGuest={onContinueAsGuest}
      footer={loginFooter}
    >
      <View style={styles.form}>
        <TextField
          label="First name"
          value={values.firstName}
          onChangeText={(v) => setField("firstName", v)}
          onBlur={() => onBlurField("firstName")}
          error={errors.firstName}
          autoComplete="given-name"
          disabled={busy}
        />
        <TextField
          label="Middle name (optional)"
          value={values.middleName}
          onChangeText={(v) => setField("middleName", v)}
          onBlur={() => onBlurField("middleName")}
          error={errors.middleName}
          autoComplete="additional-name"
          disabled={busy}
        />
        <TextField
          label="Last name"
          value={values.lastName}
          onChangeText={(v) => setField("lastName", v)}
          onBlur={() => onBlurField("lastName")}
          error={errors.lastName}
          autoComplete="family-name"
          disabled={busy}
        />
        <TextField
          label="Username"
          value={values.username}
          onChangeText={(v) => setField("username", v)}
          onBlur={() => onBlurField("username")}
          error={errors.username}
          hint="3–20 characters: letters, numbers, underscore, or period."
          autoCapitalize="none"
          autoComplete="username"
          maxLength={20}
          disabled={busy}
        />
        <TextField
          label="Email"
          value={values.email}
          onChangeText={(v) => setField("email", v)}
          onBlur={() => onBlurField("email")}
          error={errors.email}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          disabled={busy}
        />
        <View>
          <TextField
            label="Password"
            value={values.password}
            onChangeText={(v) => setField("password", v)}
            onBlur={() => onBlurField("password")}
            error={errors.password}
            secureTextEntry
            showPasswordToggle
            autoCapitalize="none"
            autoComplete="password-new"
            disabled={busy}
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
        <TextField
          label="Confirm password"
          value={values.confirmPassword}
          onChangeText={(v) => setField("confirmPassword", v)}
          onBlur={() => onBlurField("confirmPassword")}
          error={errors.confirmPassword}
          secureTextEntry
          showPasswordToggle
          autoCapitalize="none"
          autoComplete="password-new"
          disabled={busy}
        />

        {formError ? <Text style={styles.error}>{formError}</Text> : null}

        <PrimaryButton
          title={busy ? "Sending code…" : "Create account"}
          onPress={onSubmit}
          busy={busy}
        />

        <TouchableOpacity
          style={[styles.google, (!googleEnabled || busy) && styles.googleDisabled]}
          onPress={onGoogle}
          disabled={busy || !googleEnabled}
          accessibilityRole="button"
        >
          <Text style={styles.googleText}>Sign up with Google</Text>
        </TouchableOpacity>
        {isExpoGo ? <Text style={styles.googleHint}>{GOOGLE_EXPO_GO_HINT}</Text> : null}
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  form: { marginTop: 20, gap: 14 },
  checks: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 8 },
  check: { fontSize: 12.5, color: colors.muted },
  checkMet: { color: colors.accentText },
  error: { fontSize: 13, color: colors.rose },
  google: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: colors.white,
  },
  googleDisabled: { opacity: 0.55 },
  googleText: { fontSize: 14, fontWeight: "600", color: colors.text },
  googleHint: { fontSize: 12, color: colors.muted, textAlign: "center", marginTop: -4 },
  footer: { marginTop: 22, textAlign: "center", fontSize: 14, color: colors.slate },
  footerLink: { fontWeight: "700", color: colors.accentText },
});
