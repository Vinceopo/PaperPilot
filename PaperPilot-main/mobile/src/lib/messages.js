/** Maps Firebase auth error codes to copy we are happy to show a user. */
export function authMessage(err) {
  const code = err?.code;
  if (code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found") {
    return "Email or password is incorrect.";
  }
  if (code === "auth/invalid-email") return "Enter a valid email address.";
  if (code === "auth/email-already-in-use") return "An account with this email already exists.";
  if (code === "auth/weak-password") return "Password must be at least 8 characters.";
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
    return "Google sign-in was cancelled.";
  }
  if (code === "auth/popup-blocked") return "Your browser blocked the Google sign-in popup.";
  if (code === "auth/network-request-failed") return "Network error. Check your connection and try again.";
  if (code === "auth/too-many-requests") return "Too many attempts. Please try again later.";
  if (code === "auth/user-disabled") return "This account has been disabled.";
  return err?.message || "Something went wrong.";
}

export const FIREBASE_MISSING =
  "Add Firebase keys to mobile/app.json (extra.firebase). You can still continue as a guest.";

export const GOOGLE_EXPO_GO_HINT =
  "Google sign-in needs a development build — it is unavailable in Expo Go.";

/** mm:ss for the OTP expiry countdown. */
export function formatCountdown(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
