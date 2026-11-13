import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { completeRegister, otpBypassToken, registerCheck, sendOtp } from "../../api";
import { auth, db, firebaseReady } from "../../firebase";
import { FIREBASE_MISSING, authMessage } from "../../lib/messages";
import { passwordChecks, registerErrors, registerFieldError } from "../../lib/validation";
import { registerWithEmail, saveUserProfile, signInWithEmail } from "../../services/auth";
import { colors } from "../../theme";
import FloatingLabelInput from "../ui/FloatingLabelInput";
import PrimaryButton from "../ui/PrimaryButton";
import AuthFeatureCard from "./AuthFeatureCard";
import AuthShell from "./AuthShell";
import OtpStep from "./OtpStep";
import TermsModal from "./TermsModal";

const TERMS_REQUIRED = "You must agree to the Terms and Conditions to create an account.";

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
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [termsError, setTermsError] = useState("");
  const [termsOpen, setTermsOpen] = useState(false);

  function setAgreed(value) {
    setAgreedToTerms(value);
    if (value) setTermsError("");
  }

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
    setTermsError(agreedToTerms ? "" : TERMS_REQUIRED);
    if (Object.keys(next).length > 0 || !agreedToTerms) return;
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
      <AuthFeatureCard
        mode="page"
        icon="shield"
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
      </AuthFeatureCard>
    );
  }

  const checks = passwordChecks(values.password);

  return (
    <AuthShell
      variant="register"
      title="Create your account"
      subtitle="Save scores and reports in one place."
      footer={loginFooter}
    >
      <View style={styles.form}>
        <FloatingLabelInput
          {...inputProps("firstName", "First name", { icon: "user", autoComplete: "given-name", autoCapitalize: "words" })}
        />
        <FloatingLabelInput
          {...inputProps("middleName", "Middle name (optional)", {
            icon: "user",
            autoComplete: "additional-name",
            autoCapitalize: "words",
          })}
        />
        <FloatingLabelInput
          {...inputProps("lastName", "Last name", { icon: "user", autoComplete: "family-name", autoCapitalize: "words" })}
        />
        <FloatingLabelInput
          {...inputProps("email", "Email", {
            icon: "mail",
            keyboardType: "email-address",
            autoComplete: "email",
            autoCapitalize: "none",
          })}
        />
        <FloatingLabelInput
          {...inputProps("username", "Username", {
            icon: "at",
            autoComplete: "username",
            autoCapitalize: "none",
            autoCorrect: false,
            maxLength: 20,
          })}
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

        <View>
          <View style={styles.termsRow}>
            <Pressable
              onPress={() => setAgreed(!agreedToTerms)}
              disabled={busy}
              hitSlop={8}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: agreedToTerms, disabled: busy }}
              accessibilityLabel="I agree to the Terms and Conditions"
              style={[
                styles.checkbox,
                agreedToTerms && styles.checkboxChecked,
                termsError ? styles.checkboxError : null,
              ]}
            >
              {agreedToTerms ? <Text style={styles.checkboxMark}>✓</Text> : null}
            </Pressable>
            <Text style={styles.termsText}>
              <Text onPress={() => !busy && setAgreed(!agreedToTerms)}>I agree to the </Text>
              <Text style={styles.termsLink} onPress={() => setTermsOpen(true)} accessibilityRole="link">
                Terms and Conditions
              </Text>
            </Text>
          </View>
          {termsError ? <Text style={styles.termsError}>{termsError}</Text> : null}
        </View>

        {formError ? <Text style={styles.error}>{formError}</Text> : null}

        <PrimaryButton
          title={busy ? "Sending code…" : "Create account"}
          onPress={onSubmit}
          busy={busy}
          style={styles.submit}
        />
      </View>

      <TermsModal
        open={termsOpen}
        onClose={() => setTermsOpen(false)}
        onAgree={() => {
          setAgreed(true);
          setTermsOpen(false);
        }}
      />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  form: { marginTop: 8, gap: 7 },
  checks: { flexDirection: "row", flexWrap: "wrap", columnGap: 10, rowGap: 2, marginTop: 4 },
  check: { fontSize: 11, lineHeight: 14, color: colors.muted },
  checkMet: { color: colors.accent },
  error: { fontSize: 13, lineHeight: 18, color: colors.rose },
  termsRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  checkbox: {
    marginTop: 1,
    width: 15,
    height: 15,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: "#cbd5e1",
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxChecked: { borderColor: colors.accent, backgroundColor: colors.white },
  checkboxError: { borderColor: colors.rose },
  checkboxMark: { fontSize: 10, lineHeight: 12, fontWeight: "700", color: colors.accent },
  termsText: { flex: 1, fontSize: 12, lineHeight: 17, color: colors.slate },
  termsLink: { fontWeight: "600", color: colors.accent, textDecorationLine: "underline" },
  termsError: { marginTop: 4, fontSize: 12, lineHeight: 15, color: colors.rose },
  submit: {
    height: 44,
    borderRadius: 999,
    paddingVertical: 0,
    minHeight: 44,
  },
  footer: { marginTop: 16, textAlign: "center", fontSize: 13, lineHeight: 18, color: colors.slate },
  footerLink: { fontWeight: "700", color: colors.accent },
});
