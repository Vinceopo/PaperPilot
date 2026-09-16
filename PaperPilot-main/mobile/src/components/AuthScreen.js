import { useState } from "react";
import ForgotPasswordScreen from "./auth/ForgotPasswordScreen";
import LoginScreen from "./auth/LoginScreen";
import RegisterScreen from "./auth/RegisterScreen";

/**
 * Chooses between the login, register, and password-reset screens. Each screen
 * owns its own form state, so switching modes starts from a clean slate.
 *
 * @param {() => void} [onContinueAsGuest]
 * @param {(profile: object) => void} [onRegistered]
 */
export default function AuthScreen({ onContinueAsGuest, onRegistered }) {
  const [mode, setMode] = useState("login");
  const [notice, setNotice] = useState("");
  const [resetEmail, setResetEmail] = useState("");

  function go(next) {
    setNotice("");
    setMode(next);
  }

  if (mode === "register") {
    return (
      <RegisterScreen
        onGoToLogin={() => go("login")}
        onContinueAsGuest={onContinueAsGuest}
        onRegistered={onRegistered}
      />
    );
  }

  if (mode === "forgot") {
    return (
      <ForgotPasswordScreen
        initialEmail={resetEmail}
        onGoToLogin={() => go("login")}
        onDone={(message) => {
          setMode("login");
          setNotice(message);
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
      onContinueAsGuest={onContinueAsGuest}
    />
  );
}
