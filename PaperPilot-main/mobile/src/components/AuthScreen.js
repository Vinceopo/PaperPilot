import { useEffect, useState } from "react";
import ForgotPasswordScreen from "./auth/ForgotPasswordScreen";
import LoginScreen from "./auth/LoginScreen";
import PasswordChangedScreen from "./auth/PasswordChangedScreen";
import RegisterScreen from "./auth/RegisterScreen";
import {
  clearPasswordChangedNotice,
  hasPasswordChangedNotice,
  markPasswordChanged,
} from "../services/auth";

/**
 * Chooses between the login, register, password-reset, and password-changed screens.
 * Each screen owns its own form state, so switching modes starts from a clean slate.
 *
 * @param {(profile: object) => void} [onRegistered]
 */
export default function AuthScreen({ onRegistered }) {
  const [mode, setMode] = useState("login");
  const [notice, setNotice] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const showDone = await hasPasswordChangedNotice();
      if (!cancelled) {
        if (showDone) setMode("passwordDone");
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function go(next) {
    setNotice("");
    setMode(next);
  }

  if (!ready) return null;

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
