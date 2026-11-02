import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import ForgotPasswordScreen from "./auth/ForgotPasswordScreen";
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
 * Chooses between the login, register, password-reset, and password-done screens.
 * Each screen owns its own form state, so switching modes starts from a clean slate.
 *
 * @param {(profile: object) => void} [onRegistered]
 */
export default function AuthScreen({ onRegistered }) {
  const [mode, setMode] = useState("boot");
  const [notice, setNotice] = useState("");
  const [resetEmail, setResetEmail] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const done = await hasPasswordChangedNotice();
      if (!cancelled) setMode(done ? "passwordDone" : "login");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
