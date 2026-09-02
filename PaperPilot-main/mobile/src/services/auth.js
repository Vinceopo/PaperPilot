import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithCredential,
  signInWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";

export async function signInWithEmail(auth, email, password) {
  return signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function registerWithEmail(auth, email, password, displayName) {
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  if (displayName.trim()) {
    await updateProfile(credential.user, { displayName: displayName.trim() });
  }
  return credential;
}

export function signInWithGoogleToken(auth, idToken, accessToken) {
  const credential = GoogleAuthProvider.credential(idToken, accessToken);
  return signInWithCredential(auth, credential);
}
