import {
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  indexedDBLocalPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
} from "firebase/auth";
import { ref, runTransaction, set } from "firebase/database";

/** Only these mean the session is truly dead — never sign out on network blips. */
const FATAL_AUTH_CODES = new Set([
  "auth/user-token-expired",
  "auth/invalid-user-token",
  "auth/id-token-revoked",
  "auth/user-disabled",
  "auth/user-not-found",
]);

export function isFatalAuthError(err) {
  return FATAL_AUTH_CODES.has(String(err?.code || ""));
}

let googleSignInLock = null;

const LOGIN_NOTICE_KEY = "paperpilot.loginNotice";
const PASSWORD_CHANGED_KEY = "paperpilot.passwordChanged";

export function markPasswordChanged() {
  try {
    sessionStorage.setItem(PASSWORD_CHANGED_KEY, "1");
  } catch {
    // Ignore storage failures (private mode, etc.).
  }
}

export function hasPasswordChangedNotice() {
  try {
    return sessionStorage.getItem(PASSWORD_CHANGED_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearPasswordChangedNotice() {
  try {
    sessionStorage.removeItem(PASSWORD_CHANGED_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export function setLoginNotice(message) {
  try {
    sessionStorage.setItem(LOGIN_NOTICE_KEY, message || "");
  } catch {
    // Ignore storage failures (private mode, etc.).
  }
}

export function takeLoginNotice() {
  try {
    const message = sessionStorage.getItem(LOGIN_NOTICE_KEY) || "";
    sessionStorage.removeItem(LOGIN_NOTICE_KEY);
    return message;
  } catch {
    return "";
  }
}

export async function signOutEverywhere(authInstance) {
  if (!authInstance) return;
  try {
    await signOut(authInstance);
  } catch {
    // Already signed out.
  }
}

// "Remember me" uses IndexedDB, the same storage getAuth starts with, so a new tab
// never has to move the saved session (other open tabs would see that as a sign-out).
export async function signInWithEmail(auth, email, password, remember) {
  await setPersistence(auth, remember ? indexedDBLocalPersistence : browserSessionPersistence);
  return signInWithEmailAndPassword(auth, email, password);
}

/**
 * Client-side account creation. Only used when the API has no service account
 * to create the user itself; the API still gates this behind a verified OTP.
 */
export async function registerWithEmail(auth, email, password, displayName) {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName && displayName.trim()) {
    await updateProfile(credential.user, { displayName: displayName.trim() });
  }
  return credential;
}

/**
 * Google sign-in via popup. If the popup is blocked, fall back to full-page redirect.
 * Concurrent clicks reuse the same in-flight promise (avoids auth/cancelled-popup-request).
 */
export async function signInWithGoogle(auth, remember) {
  if (googleSignInLock) return googleSignInLock;
  googleSignInLock = (async () => {
    await setPersistence(auth, remember ? indexedDBLocalPersistence : browserSessionPersistence);
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      return await signInWithPopup(auth, provider);
    } catch (err) {
      const code = String(err?.code || "");
      // Second click while the first popup is open — ignore, don't show "cancelled".
      if (code === "auth/cancelled-popup-request" && googleSignInLock) {
        throw err;
      }
      if (code === "auth/popup-blocked") {
        await signInWithRedirect(auth, provider);
        return null;
      }
      throw err;
    }
  })().finally(() => {
    googleSignInLock = null;
  });
  return googleSignInLock;
}

/** Complete a Google redirect sign-in if the page just returned from Google. */
export async function completeGoogleRedirect(authInstance) {
  if (!authInstance) return null;
  try {
    return await getRedirectResult(authInstance);
  } catch {
    return null;
  }
}

/**
 * Writes the profile the API could not save itself (no Firestore credentials).
 * Best effort: a failed username claim must not block a verified sign-up.
 */
export async function saveUserProfile(db, uid, { firstName, middleName, lastName, username, email }) {
  if (!db || !uid) return;
  try {
    await set(ref(db, `users/${uid}`), {
      email,
      username,
      usernameLower: (username || "").toLowerCase(),
      firstName,
      middleName,
      lastName,
      emailVerified: true,
      createdAt: Date.now(),
    });
  } catch (err) {
    console.warn("Could not save profile:", err);
  }
  try {
    const usernameKey = encodeURIComponent((username || "").toLowerCase()).replace(/\./g, "%2E");
    await runTransaction(ref(db, `usernames/${usernameKey}`), (current) => {
      if (current && current.uid !== uid) return;
      return { uid, username };
    });
  } catch (err) {
    console.warn("Could not reserve username:", err);
  }
}
