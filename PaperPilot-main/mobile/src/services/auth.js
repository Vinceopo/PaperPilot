import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import { ref, runTransaction, set } from "firebase/database";

export const REMEMBER_ME_KEY = "paperpilot.rememberMe";

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

export async function setRememberMe(remember) {
  await AsyncStorage.setItem(REMEMBER_ME_KEY, remember ? "true" : "false");
}

export async function clearRememberMe() {
  await AsyncStorage.removeItem(REMEMBER_ME_KEY);
}

export async function shouldRestoreSession() {
  try {
    return (await AsyncStorage.getItem(REMEMBER_ME_KEY)) === "true";
  } catch {
    return false;
  }
}

/**
 * On cold start: only keep the Firebase session if the user opted into Remember me.
 * Otherwise sign out so the login screen is shown. API calls still require a live ID token.
 */
export async function enforceAuthSession(authInstance) {
  if (!authInstance) return null;
  const restore = await shouldRestoreSession();
  if (!restore && authInstance.currentUser) {
    await signOut(authInstance);
    return null;
  }
  if (restore && authInstance.currentUser) {
    try {
      await authInstance.currentUser.getIdToken(true);
    } catch (err) {
      // Network / transient failures must NOT wipe the session.
      if (!isFatalAuthError(err)) return authInstance.currentUser;
      await signOut(authInstance);
      await clearRememberMe();
      return null;
    }
  }
  return authInstance.currentUser;
}

export async function signOutUser(authInstance) {
  await clearRememberMe();
  if (authInstance) await signOut(authInstance);
}

export async function signInWithEmail(auth, email, password, remember = false) {
  await setRememberMe(remember);
  return signInWithEmailAndPassword(auth, email.trim(), password);
}

/**
 * Client-side account creation. Only used when the API has no service account
 * to create the user itself; the API still gates this behind a verified OTP.
 */
export async function registerWithEmail(auth, email, password, displayName) {
  await setRememberMe(true);
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  if (displayName && displayName.trim()) {
    await updateProfile(credential.user, { displayName: displayName.trim() });
  }
  return credential;
}

/**
 * Writes the profile the API could not save itself (mirrors web RTDB paths).
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
