import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import ForgotPasswordScreen from "./auth/ForgotPasswordScreen";
import LandingScreen from "./auth/LandingScreen";
import LoginScreen from "./auth/LoginScreen";
import PasswordChangedScreen from "./auth/PasswordChangedScreen";
import RegisterScreen from "./auth/RegisterScreen";
import {
  clearPasswordChangedNotice,
  hasPasswordChangedNotice,
  markPasswordChanged,
} from "../services/auth";
import { colors } from "../theme";

/**
 * Landing → login / register / password-reset / password-done.
 * Form screens keep their own state; switching modes resets the form.
 *
 * @param {(profile: object) => void} [onRegistered]
 * @param {"landing"|"login"|"register"|"forgot"} [initialMode] Prefer login after logout.
 */
export default function AuthScreen({ onRegistered, initialMode }) {
  const [mode, setMode] = useState("boot");
  const [notice, setNotice] = useState("");
  const [resetEmail, setResetEmail] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const done = await hasPasswordChangedNotice();
      if (cancelled) return;
      if (done) {
        setMode("passwordDone");
        return;
      }
      setMode(initialMode === "login" || initialMode === "register" || initialMode === "forgot" || initialMode === "landing"
        ? initialMode
        : "landing");
    })();
    return () => {
      cancelled = true;
    };
  }, [initialMode]);

  function go(next) {
    setNotice("");
    setMode(next);
  }

  if (mode === "boot") {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (mode === "passwordDone") {
    return (
      <PasswordChangedScreen
        onContinue={async () => {
          await clearPasswordChangedNotice();
          go("login");
        }}
      />
    );
  }

  if (mode === "landing") {
    return <LandingScreen onGetStarted={() => go("register")} onSignIn={() => go("login")} />;
  }

  if (mode === "register") {
    return <RegisterScreen onGoToLogin={() => go("login")} onRegistered={onRegistered} />;
  }

  if (mode === "forgot") {
    return (
      <ForgotPasswordScreen
        initialEmail={resetEmail}
        onGoToLogin={() => go("login")}
        onDone={async () => {
          await markPasswordChanged();
          setMode("passwordDone");
        }}
      />
    );
  }

  return (
    <LoginScreen
      notice={notice}
      onGoToRegister={() => go("register")}
      onGoToForgotPassword={(email) => {
        setResetEmail(email);
        go("forgot");
      }}
    />
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.navy,
  },
});
