import { useEffect, useState } from "react";
import { StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useAuthRequest } from "expo-auth-session/providers/google";
import Constants from "expo-constants";
import { auth, firebaseReady } from "../../firebase";
import { FIREBASE_MISSING, GOOGLE_EXPO_GO_HINT, authMessage } from "../../lib/messages";
import { emailError } from "../../lib/validation";
import { signInWithEmail, signInWithGoogle } from "../../services/auth";
import { colors } from "../../theme";
import PrimaryButton from "../ui/PrimaryButton";
import TextField from "../ui/TextField";
import AuthShell from "./AuthShell";

WebBrowser.maybeCompleteAuthSession();

const isExpoGo = Constants.appOwnership === "expo";

export default function LoginScreen({
  notice,
  onGoToRegister,
  onGoToForgotPassword,
  onContinueAsGuest,
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const googleClientId = Constants.expoConfig?.extra?.googleWebClientId;
  const googleEnabled = Boolean(googleClientId) && !isExpoGo;
  const [request, response, promptGoogle] = useAuthRequest({
    clientId: googleClientId,
    responseType: "id_token",
  });

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

  useEffect(() => {
    if (response?.type !== "success" || !auth) return;
    const idToken = response.authentication?.idToken || response.params?.id_token;
    const accessToken = response.authentication?.accessToken || response.params?.access_token;
    setBusy(true);
    setFormError("");
    signInWithGoogle(auth, remember, { idToken, accessToken })
      .catch((err) => setFormError(authMessage(err)))
      .finally(() => setBusy(false));
  }, [response, remember]);

  async function onSubmit() {
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
    if (isExpoGo) {
      setFormError(GOOGLE_EXPO_GO_HINT);
      return;
    }
    if (!firebaseReady || !auth) {
      setFormError("Add Firebase keys to mobile/app.json to enable Google sign-in.");
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

  const footer = (
    <Text style={styles.footer}>
      Don't have an account?{" "}
      <Text style={styles.footerLink} onPress={onGoToRegister}>
        Create an account
      </Text>
    </Text>
  );

  return (
    <AuthShell
      variant="login"
      title="Welcome back"
      subtitle="Sign in to continue reviewing manuscripts."
      onContinueAsGuest={onContinueAsGuest}
      footer={footer}
    >
      <View style={styles.form}>
        <TextField
          label="Email"
          value={email}
          onChangeText={(v) => {
            setEmail(v);
            revalidate("email", v, password);
          }}
          onBlur={() => onBlurField("email")}
          error={errors.email}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            revalidate("password", email, v);
          }}
          onBlur={() => onBlurField("password")}
          error={errors.password}
          secureTextEntry
          showPasswordToggle
          autoCapitalize="none"
          autoComplete="password"
        />

        <View style={styles.row}>
          <View style={styles.remember}>
            <Switch
              value={remember}
              onValueChange={setRemember}
              trackColor={{ false: colors.border, true: colors.accentMuted }}
              thumbColor={remember ? colors.accent : "#f4f4f5"}
            />
            <Text style={styles.rememberLabel}>Remember me</Text>
          </View>
          <TouchableOpacity onPress={() => onGoToForgotPassword(email.trim())} accessibilityRole="button">
            <Text style={styles.forgot}>Forgot password?</Text>
          </TouchableOpacity>
        </View>

        {formError ? <Text style={styles.error}>{formError}</Text> : null}
        {notice && !formError ? <Text style={styles.notice}>{notice}</Text> : null}

        <PrimaryButton
          title={busy ? "Please wait…" : "Sign in to PaperPilot"}
          onPress={onSubmit}
          busy={busy}
        />

        <TouchableOpacity
          style={[styles.google, (!googleEnabled || busy) && styles.googleDisabled]}
          onPress={onGoogle}
          disabled={busy || !googleEnabled}
          accessibilityRole="button"
        >
          <Text style={styles.googleText}>Sign in with Google</Text>
        </TouchableOpacity>
        {isExpoGo ? <Text style={styles.googleHint}>{GOOGLE_EXPO_GO_HINT}</Text> : null}
      </View>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  form: { marginTop: 20, gap: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  remember: { flexDirection: "row", alignItems: "center", gap: 8 },
  rememberLabel: { fontSize: 14, color: colors.slate },
  forgot: { fontSize: 14, fontWeight: "600", color: colors.accentText },
  error: { fontSize: 13, color: colors.rose },
  notice: { fontSize: 13, color: colors.accentText },
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
