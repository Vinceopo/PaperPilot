import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
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

function GuestGate({ onSignIn }) {
  return (
    <SafeAreaView style={styles.guestSafe}>
      <StatusBar style="dark" />
      <View style={styles.guestCard}>
        <Text style={styles.guestBrand}>PaperPilot</Text>
        <Text style={styles.guestTitle}>Sign in to scan manuscripts</Text>
        <Text style={styles.guestBody}>
          Mechanics, versions, scan allowances, and saved results are tied to your account.
        </Text>
        <Pressable style={styles.guestBtn} onPress={onSignIn}>
          <Text style={styles.guestBtnText}>Go to sign in</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Root() {
  const { user, authReady } = useAppData();
  const [guest, setGuest] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(null);
  const [regChecked, setRegChecked] = useState(false);
  const signedIn = Boolean(user) && !guest;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!authReady) return;
      if (user) {
        setGuest(false);
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

  if (!signedIn && !guest) {
    return (
      <>
        <StatusBar style="dark" />
        <AuthScreen
          onContinueAsGuest={() => setGuest(true)}
          onRegistered={onRegistered}
        />
      </>
    );
  }

  if (guest) {
    return <GuestGate onSignIn={() => setGuest(false)} />;
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
  guestSafe: {
    flex: 1,
    backgroundColor: colors.navyDeep,
    justifyContent: "center",
    padding: 24,
  },
  guestCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#1e293b",
    backgroundColor: colors.navyMid,
    padding: 28,
    alignItems: "center",
  },
  guestBrand: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
    color: colors.accent,
  },
  guestTitle: {
    marginTop: 12,
    fontSize: 22,
    fontWeight: "600",
    color: colors.white,
    textAlign: "center",
  },
  guestBody: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 21,
    color: colors.muted,
    textAlign: "center",
  },
  guestBtn: {
    marginTop: 22,
    width: "100%",
    borderRadius: 12,
    backgroundColor: colors.accent,
    paddingVertical: 14,
    alignItems: "center",
  },
  guestBtnText: { fontSize: 15, fontWeight: "700", color: colors.navyDeep },
});
