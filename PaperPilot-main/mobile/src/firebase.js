import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth, getReactNativePersistence, initializeAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";

const config = Constants.expoConfig?.extra?.firebase || {};
const configured = Boolean(
  config.apiKey && config.projectId && config.appId && config.databaseURL
);
const app = configured ? (getApps().length ? getApp() : initializeApp(config)) : null;

function createAuth(firebaseApp) {
  try {
    return initializeAuth(firebaseApp, {
      persistence: getReactNativePersistence(AsyncStorage),
    });
  } catch {
    return getAuth(firebaseApp);
  }
}

export const firebaseReady = configured;
export const auth = app ? createAuth(app) : null;
/** Realtime Database (same as web) — profiles / usernames live here after RTDB cutover. */
export const db = app ? getDatabase(app) : null;
