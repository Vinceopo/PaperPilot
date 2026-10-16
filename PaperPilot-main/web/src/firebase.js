import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "demo",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "demo.firebaseapp.com",
  databaseURL:
    import.meta.env.VITE_FIREBASE_DATABASE_URL ||
    "https://paperpilotv6-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "demo",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "demo.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "0",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "demo",
};

const configured = Boolean(import.meta.env.VITE_FIREBASE_API_KEY);
const app = configured ? initializeApp(firebaseConfig) : null;

export const firebaseReady = configured;
export const auth = app ? getAuth(app) : null;
export const db = app ? getDatabase(app) : null;
export const storage = app ? getStorage(app) : null;

// getAuth already keeps signed-in users across refreshes (IndexedDB). Do not call
// setPersistence here: it moves the saved session on every page load, which other
// open tabs see as a sign-out followed by a sign-in.
