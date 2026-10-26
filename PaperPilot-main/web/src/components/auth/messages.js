/** Maps Firebase auth error codes to copy we are happy to show a user. */
export function authMessage(err) {
  const code = err?.code;
  if (
    code === "auth/invalid-credential" ||
    code === "auth/invalid-login-credentials" ||
    code === "auth/wrong-password" ||
    code === "auth/user-not-found"
  ) {
    return "Email or password is incorrect.";
  }
  if (code === "auth/missing-password") return "Password is required.";
  if (code === "auth/invalid-email") return "Enter a valid email address.";
  if (code === "auth/email-already-in-use") return "An account with this email already exists.";
  if (code === "auth/weak-password") return "Password must be at least 8 characters.";
  if (code === "auth/cancelled-popup-request") {
    return "Google sign-in is already open. Finish or close that window, then try once.";
  }
  if (code === "auth/popup-closed-by-user") {
    return "Google sign-in was closed before finishing. Click Sign in with Google again.";
  }
  if (code === "auth/popup-blocked") {
    return "Your browser blocked the Google popup. Allow popups for PaperPilot, or try again — we will use a full-page Google sign-in.";
  }
  if (code === "auth/unauthorized-domain") {
    return "This website domain is not authorized for Google sign-in. Ask an admin to add it in Firebase Authentication → Settings → Authorized domains.";
  }
  if (code === "auth/operation-not-allowed") {
    return "Google sign-in is not enabled for this Firebase project yet.";
  }
  if (code === "auth/account-exists-with-different-credential") {
    return "An account already exists with this email using a different sign-in method. Sign in with email/password instead.";
  }
  if (code === "auth/network-request-failed") return "Network error. Check your connection and try again.";
  if (code === "auth/too-many-requests") return "Too many attempts. Please try again later.";
  if (code === "auth/user-disabled") return "This account has been disabled.";
  if (typeof code === "string" && code.startsWith("auth/")) {
    return `Sign-in failed (${code.replace("auth/", "")}). Please try again.`;
  }
  return err?.message || "Something went wrong. Please try again.";
}

export const FIREBASE_MISSING =
  "Add Firebase keys to web/.env (see .env.example) to enable sign-in.";

/** mm:ss for the OTP expiry countdown. */
export function formatCountdown(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
