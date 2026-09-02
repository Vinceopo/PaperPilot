import { useEffect, useState } from "react";
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { useAuthRequest } from "expo-auth-session/providers/google";
import Constants from "expo-constants";
import { auth, firebaseReady } from "../firebase";
import { registerWithEmail, signInWithEmail, signInWithGoogleToken } from "../services/auth";

WebBrowser.maybeCompleteAuthSession();

function message(error) {
  if (error?.code === "auth/invalid-credential" || error?.code === "auth/user-not-found") return "Email or password is incorrect.";
  if (error?.code === "auth/email-already-in-use") return "An account with this email already exists.";
  if (error?.code === "auth/weak-password") return "Password should be at least 6 characters.";
  return error?.message || "Authentication failed.";
}

export default function AuthScreen() {
  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const googleClientId = Constants.expoConfig?.extra?.googleWebClientId;
  const [request, response, promptGoogle] = useAuthRequest({ clientId: googleClientId, responseType: "id_token" });

  useEffect(() => {
    if (response?.type !== "success" || !auth) return;
    setBusy(true);
    const idToken = response.authentication?.idToken || response.params?.id_token;
    const accessToken = response.authentication?.accessToken || response.params?.access_token;
    if (!idToken) {
      Alert.alert("Google sign-in", "Google did not return an identity token.");
      return;
    }
    signInWithGoogleToken(auth, idToken, accessToken)
      .catch((error) => Alert.alert("Google sign-in", message(error)))
      .finally(() => setBusy(false));
  }, [response]);

  async function submit() {
    if (!firebaseReady || !auth) return Alert.alert("Firebase setup required", "Add the mobile Firebase config in app.json.");
    if (!email.trim() || password.length < 6 || (mode === "register" && name.trim().length < 2)) {
      return Alert.alert("Check your details", mode === "register" ? "Enter your name, email, and a 6-character password." : "Enter a valid email and a 6-character password.");
    }
    setBusy(true);
    try {
      if (mode === "login") await signInWithEmail(auth, email, password);
      else await registerWithEmail(auth, email, password, name);
    } catch (error) {
      Alert.alert("Authentication", message(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.kicker}>PAPERPILOT</Text>
      <Text style={styles.h1}>{mode === "login" ? "Welcome back" : "Create your account"}</Text>
      <Text style={styles.hint}>Sign in to review and save manuscript reports.</Text>
      {mode === "register" && <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Full name" placeholderTextColor="#64748b" />}
      <TextInput style={styles.input} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="Email" placeholderTextColor="#64748b" />
      <TextInput style={styles.input} value={password} onChangeText={setPassword} secureTextEntry placeholder="Password" placeholderTextColor="#64748b" />
      <TouchableOpacity style={styles.btn} onPress={submit} disabled={busy}>
        <Text style={styles.btnText}>{busy ? "Please wait..." : mode === "login" ? "Sign in" : "Create account"}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.google} onPress={() => promptGoogle()} disabled={!request || busy || !googleClientId}>
        <Text style={styles.googleText}>{mode === "login" ? "Sign in with Google" : "Sign up with Google"}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => setMode(mode === "login" ? "register" : "login")}>
        <Text style={styles.switch}>{mode === "login" ? "Create an account" : "Already have an account? Sign in"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "#020617", gap: 12 },
  kicker: { color: "#34d399", letterSpacing: 3, fontSize: 12, fontWeight: "700" },
  h1: { color: "#f8fafc", fontSize: 30, fontWeight: "700" },
  hint: { color: "#94a3b8", fontSize: 14, marginBottom: 12 },
  input: { borderWidth: 1, borderColor: "#1e293b", backgroundColor: "#0f172a", color: "#e2e8f0", borderRadius: 10, padding: 14 },
  btn: { backgroundColor: "#34d399", borderRadius: 10, padding: 14, alignItems: "center", marginTop: 4 },
  btnText: { color: "#022c22", fontWeight: "700" },
  google: { borderWidth: 1, borderColor: "#334155", borderRadius: 10, padding: 14, alignItems: "center" },
  googleText: { color: "#e2e8f0", fontWeight: "600" },
  switch: { color: "#34d399", textAlign: "center", marginTop: 8 },
});
