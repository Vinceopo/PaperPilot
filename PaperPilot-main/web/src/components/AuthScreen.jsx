import { useEffect, useState } from "react";
import LandingPage from "./LandingPage.jsx";
import ForgotPasswordScreen from "./auth/ForgotPasswordScreen.jsx";
import LoginScreen from "./auth/LoginScreen.jsx";
import PasswordChangedScreen from "./auth/PasswordChangedScreen.jsx";
import RegisterScreen from "./auth/RegisterScreen.jsx";
import {
  clearPasswordChangedNotice,
  hasPasswordChangedNotice,
  markPasswordChanged,
} from "../services/auth.js";

function hashMode() {
  try {
    const hash = String(window.location.hash || "")
      .replace(/^#\/?/, "")
      .split(/[/?#]/)[0]
      .trim()
      .toLowerCase();
    if (hash === "login" || hash === "signin") return "login";
    if (hash === "register" || hash === "signup") return "register";
    if (hash === "forgot") return "forgot";
  } catch {
    // Ignore malformed hash routes.
  }
  return "landing";
}

function initialAuthMode() {
  if (hasPasswordChangedNotice()) return "passwordDone";
  return hashMode();
}

function urlForMode(mode) {
  if (mode === "login" || mode === "register" || mode === "forgot") return `#/${mode}`;
  return `${window.location.pathname}${window.location.search}`;
}

/**
 * Chooses between the landing page, login, register, and password-reset screens.
 * Each auth screen owns its own form state, so switching modes starts clean.
 * Uses pushState so the browser Back button returns to the landing page.
 */
export default function AuthScreen() {
  const [mode, setMode] = useState(initialAuthMode);
  const [slideDir, setSlideDir] = useState("left");
  const [notice, setNotice] = useState("");
  const [resetEmail, setResetEmail] = useState("");

  useEffect(() => {
    function syncFromLocation() {
      if (hasPasswordChangedNotice()) return;
      const next = hashMode();
      setMode((prev) => (prev === next ? prev : next));
    }
    window.addEventListener("popstate", syncFromLocation);
    window.addEventListener("hashchange", syncFromLocation);
    return () => {
      window.removeEventListener("popstate", syncFromLocation);
      window.removeEventListener("hashchange", syncFromLocation);
    };
  }, []);

  function go(next, direction) {
    setSlideDir(direction);
    setNotice("");
    setMode(next);
    try {
      const target = urlForMode(next);
      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (target !== current && target !== window.location.hash) {
        // pushState keeps landing in history so Back returns there.
        window.history.pushState(null, "", target);
      }
    } catch {
      // Ignore history failures (file://, restricted contexts).
    }
  }

  if (mode === "landing") {
    return (
      <LandingPage
        onSignIn={() => go("login", "left")}
        onGetStarted={() => go("register", "left")}
      />
    );
  }

  if (mode === "passwordDone") {
    return (
      <PasswordChangedScreen
        onContinue={() => {
          clearPasswordChangedNotice();
          go("login", "left");
        }}
      />
    );
  }

  if (mode === "register") {
    return (
      <RegisterScreen
        slideDir={slideDir}
        onGoToLogin={() => go("login", "right")}
      />
    );
  }

  if (mode === "forgot") {
    return (
      <ForgotPasswordScreen
        slideDir={slideDir}
        initialEmail={resetEmail}
        onGoToLogin={() => go("login", "right")}
        onDone={() => {
          markPasswordChanged();
          setSlideDir("right");
          setMode("passwordDone");
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
    />
  );
}
