import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";

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
    } catch {
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
 * Signs in with a Google ID token (from expo-auth-session). Pass idToken/accessToken
 * from the OAuth response — popup flow is not available on React Native.
 */
export async function signInWithGoogle(auth, remember, { idToken, accessToken } = {}) {
  if (!idToken) {
    throw new Error("Google sign-in did not return an identity token.");
  }
  await setRememberMe(Boolean(remember));
  const credential = GoogleAuthProvider.credential(idToken, accessToken || undefined);
  return signInWithCredential(auth, credential);
}

/** @deprecated Prefer signInWithGoogle(auth, remember, tokens). */
export function signInWithGoogleToken(auth, idToken, accessToken) {
  return signInWithGoogle(auth, true, { idToken, accessToken });
}

/**
 * Writes the profile the API could not save itself (no Firestore credentials).
 * Best effort: a failed username claim must not block a verified sign-up.
 */
export async function saveUserProfile(db, uid, { firstName, middleName, lastName, username, email }) {
  if (!db || !uid) return;
  try {
    await setDoc(
      doc(db, "users", uid),
      {
        email,
        username,
        usernameLower: (username || "").toLowerCase(),
        firstName,
        middleName,
        lastName,
        emailVerified: true,
        createdAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (err) {
    console.warn("Could not save profile:", err);
  }
  try {
    await setDoc(doc(db, "usernames", (username || "").toLowerCase()), { uid, username });
  } catch (err) {
    console.warn("Could not reserve username:", err);
  }
}
