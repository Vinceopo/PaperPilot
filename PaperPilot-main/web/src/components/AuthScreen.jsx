import { useState } from "react";
import ForgotPasswordScreen from "./auth/ForgotPasswordScreen.jsx";
import LoginScreen from "./auth/LoginScreen.jsx";
import RegisterScreen from "./auth/RegisterScreen.jsx";

/**
 * Chooses between the login, register, and password-reset screens. Each screen
 * owns its own form state, so switching modes starts from a clean slate.
 */
export default function AuthScreen({ onContinueAsGuest }) {
  const [mode, setMode] = useState("login");
  const [slideDir, setSlideDir] = useState("left");
  const [notice, setNotice] = useState("");
  const [resetEmail, setResetEmail] = useState("");

  function go(next, direction) {
    setSlideDir(direction);
    setNotice("");
    setMode(next);
  }

  if (mode === "register") {
    return (
      <RegisterScreen
        slideDir={slideDir}
        onGoToLogin={() => go("login", "right")}
        onContinueAsGuest={onContinueAsGuest}
      />
    );
  }

  if (mode === "forgot") {
    return (
      <ForgotPasswordScreen
        slideDir={slideDir}
        initialEmail={resetEmail}
        onGoToLogin={() => go("login", "right")}
        onDone={(message) => {
          setSlideDir("right");
          setMode("login");
          setNotice(message);
        }}
      />
    );
  }

  return (
    <LoginScreen
      slideDir={slideDir}
      notice={notice}
      onGoToRegister={() => go("register", "left")}
      onGoToForgotPassword={(email) => {
        setResetEmail(email);
        go("forgot", "left");
      }}
      onContinueAsGuest={onContinueAsGuest}
    />
  );
}
