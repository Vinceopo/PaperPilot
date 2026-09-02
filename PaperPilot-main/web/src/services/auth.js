import {
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";
import { ref, runTransaction, set } from "firebase/database";

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
