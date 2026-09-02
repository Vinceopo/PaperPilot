import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "demo",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "demo.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "demo",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "demo.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "0",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "demo",
};

const configured = Boolean(import.meta.env.VITE_FIREBASE_API_KEY);
const app = configured ? initializeApp(firebaseConfig) : null;

export const firebaseReady = configured;
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const storage = app ? getStorage(app) : null;
