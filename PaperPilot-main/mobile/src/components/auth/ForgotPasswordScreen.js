import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { resetPasswordWithOtp, sendOtp } from "../../api";
import {
  confirmPasswordError,
  emailError,
  passwordChecks,
  passwordError,
} from "../../lib/validation";
import { colors } from "../../theme";
import PrimaryButton from "../ui/PrimaryButton";
import TextField from "../ui/TextField";
import AuthShell from "./AuthShell";
import OtpStep from "./OtpStep";

/**
 * Email → 6-digit code → new password → back to login.
 * `onDone` is called with a confirmation message for the login screen.
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

  const backToLogin = (
    <Text style={styles.footer}>
      Remembered it?{" "}
      <Text style={styles.footerLink} onPress={onGoToLogin}>
        Back to sign in
      </Text>
    </Text>
  );

  async function onRequestCode() {
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

  async function onSetPassword() {
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
        title="Set a new password"
        subtitle={`Choose a new password for ${email.trim()}.`}
        footer={backToLogin}
      >
        <View style={styles.form}>
          <View>
            <TextField
              label="New password"
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                revalidatePassword("password", v, confirmPassword);
              }}
              onBlur={() => {
                setTouched((prev) => ({ ...prev, password: true }));
                setPasswordErrors((prev) => ({ ...prev, password: passwordError(password) }));
              }}
              error={passwordErrors.password}
              secureTextEntry
              showPasswordToggle
              autoCapitalize="none"
              autoComplete="password-new"
              disabled={busy}
            />
            {password && !passwordErrors.password ? (
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
            label="Confirm new password"
            value={confirmPassword}
            onChangeText={(v) => {
              setConfirmPassword(v);
              revalidatePassword("confirmPassword", password, v);
            }}
            onBlur={() => {
              setTouched((prev) => ({ ...prev, confirmPassword: true }));
              setPasswordErrors((prev) => ({
                ...prev,
                confirmPassword: confirmPasswordError(password, confirmPassword),
              }));
            }}
            error={passwordErrors.confirmPassword}
            secureTextEntry
            showPasswordToggle
            autoCapitalize="none"
            autoComplete="password-new"
            disabled={busy}
          />

          {formError ? <Text style={styles.error}>{formError}</Text> : null}

          <PrimaryButton
            title={busy ? "Updating…" : "Update password"}
            onPress={onSetPassword}
            busy={busy}
          />
        </View>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      variant="forgot"
      title="Reset your password"
      subtitle="We will email you a 6-digit code to confirm your address."
      footer={backToLogin}
    >
      <View style={styles.form}>
        <TextField
          label="Email"
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            if (emailErr) setEmailErr(emailError(v));
          }}
          onBlur={() => setEmailErr(emailError(email))}
          error={emailErr}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          disabled={busy}
        />

        {formError ? <Text style={styles.error}>{formError}</Text> : null}

        <PrimaryButton
          title={busy ? "Sending code…" : "Send verification code"}
          onPress={onRequestCode}
          busy={busy}
        />
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
  footer: { marginTop: 22, textAlign: "center", fontSize: 14, color: colors.slate },
  footerLink: { fontWeight: "700", color: colors.accentText },
});
