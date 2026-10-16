import { useState } from "react";
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { resolveEmail } from "../../api";
import { auth, firebaseReady } from "../../firebase";
import { FIREBASE_MISSING, authMessage } from "../../lib/messages";
import { signInWithEmail, signInWithGoogle } from "../../services/auth";
import { promptGoogleSignIn } from "../../services/googleSignIn";
import { colors } from "../../theme";
import FloatingLabelInput from "../ui/FloatingLabelInput";
import PrimaryButton from "../ui/PrimaryButton";
import AuthShell from "./AuthShell";
import GoogleButton from "./GoogleButton";

const USERNAME_NOT_FOUND = "No account uses that username. Check the spelling or sign in with your email.";
const USERNAME_SIGN_IN_UNAVAILABLE =
  "Signing in with a username isn't available right now. Use your email address instead.";
const WRONG_PASSWORD = "Incorrect password. Try again or use Forgot password to reset it.";

/** True when the value looks like a username (no @). */
function looksLikeUsername(val) {
  return val.length >= 1 && !val.includes("@");
}

function identifierError(val) {
  if (!val.trim()) return "Email or username is required.";
  return "";
}

function Checkbox({ checked, onChange, label }) {
  return (
    <Pressable
      style={styles.remember}
      onPress={() => onChange(!checked)}
      hitSlop={6}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View style={[styles.box, checked ? styles.boxChecked : null]}>
        {checked ? (
          <Svg width={12} height={12} viewBox="0 0 24 24">
            <Path
              d="M5 12.5l4.5 4.5L19 7.5"
              stroke={colors.white}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </Svg>
        ) : null}
      </View>
      <Text style={styles.rememberLabel}>{label}</Text>
    </Pressable>
  );
}

export default function LoginScreen({
  notice,
  onGoToRegister,
  onGoToForgotPassword,
}) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  function fieldError(field, nextId = identifier, nextPassword = password) {
    if (field === "identifier") return identifierError(nextId);
    if (field === "password") return nextPassword ? "" : "Password is required.";
    return "";
  }

  function revalidate(field, nextId, nextPassword) {
    if (!touched[field]) return;
    setErrors((prev) => ({ ...prev, [field]: fieldError(field, nextId, nextPassword) }));
  }

  function onBlurField(field) {
    setTouched((prev) => ({ ...prev, [field]: true }));
    setErrors((prev) => ({ ...prev, [field]: fieldError(field) }));
  }

  async function onSubmit() {
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
    let loginEmail = identifier.trim();
    const byUsername = looksLikeUsername(loginEmail);
    try {
      if (byUsername) {
        try {
          const res = await resolveEmail(loginEmail);
          loginEmail = res.email;
        } catch (err) {
          if (err?.code === "username_not_found") {
            setErrors((prev) => ({ ...prev, identifier: USERNAME_NOT_FOUND }));
          } else if (err?.status === 404) {
            setFormError(USERNAME_SIGN_IN_UNAVAILABLE);
          } else {
            setFormError(authMessage(err));
          }
          return;
        }
      }
      await signInWithEmail(auth, loginEmail, password, remember);
    } catch (err) {
      const code = err?.code;
      // The username lookup already proved the account exists, so a credential error means the password.
      if (
        code === "auth/wrong-password" ||
        (byUsername && (code === "auth/invalid-credential" || code === "auth/invalid-login-credentials"))
      ) {
        setErrors((prev) => ({ ...prev, password: WRONG_PASSWORD }));
      } else if (code === "auth/user-not-found") {
        setErrors((prev) => ({ ...prev, identifier: "No account uses that email address." }));
      } else if (code === "auth/invalid-email") {
        setErrors((prev) => ({ ...prev, identifier: authMessage(err) }));
      } else {
        setFormError(authMessage(err));
      }
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setFormError("");
    if (!firebaseReady || !auth) {
      setFormError("Add Firebase keys to mobile/app.json to enable Google sign-in.");
      return;
    }
    setBusy(true);
    try {
      const tokens = await promptGoogleSignIn();
      await signInWithGoogle(auth, remember, tokens);
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
      footer={footer}
    >
      <View style={styles.form}>
        <FloatingLabelInput
          label="Email or Username"
          icon="mail"
          value={identifier}
          onChangeText={(v) => {
            setIdentifier(v);
            revalidate("identifier", v, password);
          }}
          onBlur={() => onBlurField("identifier")}
          error={errors.identifier}
          autoComplete="username"
          textContentType="username"
        />
        <FloatingLabelInput
          label="Password"
          icon="lock"
          value={password}
          onChangeText={(v) => {
            setPassword(v);
            revalidate("password", identifier, v);
          }}
          onBlur={() => onBlurField("password")}
          error={errors.password}
          secureTextEntry
          showPasswordToggle
          autoComplete="current-password"
          textContentType="password"
        />

        <View style={styles.row}>
          <Checkbox checked={remember} onChange={setRemember} label="Remember me" />
          <TouchableOpacity
            onPress={() => onGoToForgotPassword(identifier.includes("@") ? identifier.trim() : "")}
            accessibilityRole="button"
          >
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
      </View>

      <GoogleButton label="Sign in with Google" onPress={onGoogle} disabled={busy} />
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  form: { marginTop: 28, gap: 16 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 2,
  },
  remember: { flexDirection: "row", alignItems: "center", gap: 8 },
  box: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  boxChecked: { backgroundColor: colors.accent, borderColor: colors.accent },
  rememberLabel: { fontSize: 14, color: "#475569" },
  forgot: { fontSize: 14, fontWeight: "500", color: colors.accent },
  error: { fontSize: 14, color: colors.rose },
  notice: { fontSize: 14, color: colors.accentText },
  footer: { marginTop: 24, textAlign: "center", fontSize: 14, color: colors.slate },
  footerLink: { fontWeight: "600", color: colors.accent },
});
