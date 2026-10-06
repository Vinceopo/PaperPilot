import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import AsyncStorage from "@react-native-async-storage/async-storage";
import AuthScreen from "./src/components/AuthScreen";
import RegistrationSuccessScreen from "./src/components/auth/RegistrationSuccessScreen";
import { AppDataProvider, useAppData } from "./src/context/AppDataContext";
import MainNavigator from "./src/navigation/MainNavigator";
import { colors } from "./src/theme";

const REGISTRATION_SUCCESS_KEY = "paperpilot.registrationSuccess";
const THIRTY_MIN = 30 * 60 * 1000;

async function pendingRegistration(user) {
  try {
    const raw = await AsyncStorage.getItem(REGISTRATION_SUCCESS_KEY);
    const saved = raw ? JSON.parse(raw) : null;
    const fresh = saved?.createdAt && Date.now() - saved.createdAt < THIRTY_MIN;
    const matches =
      !user?.email || saved?.email?.toLowerCase() === user.email.toLowerCase();
    if (fresh && matches) return saved;
  } catch {
    // Ignore malformed storage.
  }
  await AsyncStorage.removeItem(REGISTRATION_SUCCESS_KEY);
  return null;
}

function Root() {
  const { user, authReady } = useAppData();
  const [registrationSuccess, setRegistrationSuccess] = useState(null);
  const [regChecked, setRegChecked] = useState(false);
  const signedIn = Boolean(user);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!authReady) return;
      if (user) {
        const pending = await pendingRegistration(user);
        if (!cancelled) setRegistrationSuccess(pending);
      }
      if (!cancelled) setRegChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [authReady, user]);

  const onRegistered = useCallback(async (profile) => {
    const payload = { ...profile, createdAt: Date.now() };
    await AsyncStorage.setItem(REGISTRATION_SUCCESS_KEY, JSON.stringify(payload));
    setRegistrationSuccess(payload);
  }, []);

  if (!authReady || !regChecked) {
    return (
      <SafeAreaView style={styles.loading}>
        <StatusBar style="dark" />
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.loadingText}>Loading…</Text>
      </SafeAreaView>
    );
  }

  if (!signedIn) {
    return (
      <>
        <StatusBar style="dark" />
        <AuthScreen onRegistered={onRegistered} />
      </>
    );
  }

  if (registrationSuccess) {
    return (
      <>
        <StatusBar style="dark" />
        <RegistrationSuccessScreen
          profile={registrationSuccess}
          onContinue={async () => {
            await AsyncStorage.removeItem(REGISTRATION_SUCCESS_KEY);
            setRegistrationSuccess(null);
          }}
        />
      </>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <MainNavigator />
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppDataProvider>
        <Root />
      </AppDataProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: colors.pageBg,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: { color: colors.muted, fontSize: 13 },
});
