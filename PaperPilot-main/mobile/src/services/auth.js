import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import { ref, runTransaction, set } from "firebase/database";

export const REMEMBER_ME_KEY = "paperpilot.rememberMe";

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
      // Offline at launch is not a revoked session; keep the user signed in.
      if (err?.code === "auth/network-request-failed") return authInstance.currentUser;
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
 * Signs in with a Google ID token (see services/googleSignIn). Tokens requested with
 * a hashed nonce must pass the raw nonce so Firebase can match it.
 */
export async function signInWithGoogle(auth, remember, { idToken, accessToken, rawNonce } = {}) {
  if (!idToken) {
    throw new Error("Google sign-in did not return an identity token.");
  }
  await setRememberMe(Boolean(remember));
  const credential = rawNonce
    ? new OAuthProvider("google.com").credential({ idToken, rawNonce })
    : GoogleAuthProvider.credential(idToken, accessToken || undefined);
  try {
    return await signInWithCredential(auth, credential);
  } catch (err) {
    if (err?.code === "auth/invalid-credential") {
      const wrapped = new Error(
        "Firebase rejected the Google sign-in. Safelist the iOS client ID under Firebase Authentication → Google."
      );
      wrapped.code = "google/credential-rejected";
      throw wrapped;
    }
    throw err;
  }
}

/** @deprecated Prefer signInWithGoogle(auth, remember, tokens). */
export function signInWithGoogleToken(auth, idToken, accessToken) {
  return signInWithGoogle(auth, true, { idToken, accessToken });
}

/**
 * Writes the profile the API could not save itself (no Admin credentials).
 * Best effort: a failed username claim must not block a verified sign-up.
 * Uses Realtime Database (same paths as web) after the paperpilot-cb289 cutover.
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
