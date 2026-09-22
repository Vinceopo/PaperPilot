import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from "firebase/auth";
import { ref, runTransaction, set } from "firebase/database";

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

export async function signInWithEmail(auth, email, password, remember) {
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
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

export async function signInWithGoogle(auth, remember) {
  await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
  return signInWithPopup(auth, new GoogleAuthProvider());
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
