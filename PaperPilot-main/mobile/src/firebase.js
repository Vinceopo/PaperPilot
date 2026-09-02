import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { getApp, getApps, initializeApp } from "firebase/app";
import { getReactNativePersistence, initializeAuth } from "firebase/auth";

const config = Constants.expoConfig?.extra?.firebase || {};
const configured = Boolean(config.apiKey && config.projectId && config.appId);
const app = configured ? (getApps().length ? getApp() : initializeApp(config)) : null;

export const firebaseReady = configured;
export const auth = app
  ? initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) })
  : null;
