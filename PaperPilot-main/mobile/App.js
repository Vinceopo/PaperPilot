import { useEffect, useState } from "react";
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import Constants from "expo-constants";
import { onAuthStateChanged, signOut } from "firebase/auth";
import AuthScreen from "./src/components/AuthScreen";
import { auth, firebaseReady } from "./src/firebase";

const API = Constants.expoConfig?.extra?.apiUrl || "http://127.0.0.1:8000";

export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(!firebaseReady);
  const [title, setTitle] = useState("PaperPilot mobile");
  const [abstract, setAbstract] = useState("");
  const [text, setText] = useState("");
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!auth) return undefined;
    return onAuthStateChanged(auth, (next) => {
      setUser(next);
      setAuthReady(true);
    });
  }, []);

  async function analyze() {
    setBusy(true);
    setOut("");
    try {
      const res = await fetch(`${API}/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, abstract, text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Failed");
      setOut(
        `Score ${data.rules.score}\n\n${data.summary}\n\n${(data.suggested_improvements || []).join(
          "\n"
        )}`
      );
    } catch (e) {
      setOut(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  if (!authReady) return <SafeAreaView style={styles.safe} />;
  if (!user) return <AuthScreen />;

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.wrap}>
        <Text style={styles.kicker}>PAPERPILOT</Text>
        <Text style={styles.h1}>Analyze a draft</Text>
        <TouchableOpacity onPress={() => signOut(auth)}><Text style={styles.signOut}>Sign out</Text></TouchableOpacity>
        <Text style={styles.hint}>
          On a physical phone, set extra.apiUrl in app.json to your PC LAN IP (e.g. http://192.168.x.x:8000).
        </Text>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Title" placeholderTextColor="#64748b" />
        <TextInput
          style={[styles.input, styles.area]}
          value={abstract}
          onChangeText={setAbstract}
          placeholder="Abstract"
          placeholderTextColor="#64748b"
          multiline
        />
        <TextInput
          style={[styles.input, styles.body]}
          value={text}
          onChangeText={setText}
          placeholder="Paste manuscript text"
          placeholderTextColor="#64748b"
          multiline
        />
        <TouchableOpacity style={styles.btn} onPress={analyze} disabled={busy}>
          <Text style={styles.btnText}>{busy ? "Working…" : "Analyze"}</Text>
        </TouchableOpacity>
        {out ? (
          <View style={styles.card}>
            <Text style={styles.out}>{out}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#020617" },
  wrap: { padding: 20, gap: 12 },
  kicker: { color: "#34d399", letterSpacing: 3, fontSize: 12, fontWeight: "700" },
  h1: { color: "#f8fafc", fontSize: 28, fontWeight: "700" },
  signOut: { color: "#34d399", fontSize: 14 },
  hint: { color: "#94a3b8", fontSize: 13, lineHeight: 18 },
  input: {
    borderWidth: 1,
    borderColor: "#1e293b",
    backgroundColor: "#0f172a",
    color: "#e2e8f0",
    borderRadius: 10,
    padding: 12,
  },
  area: { minHeight: 80, textAlignVertical: "top" },
  body: { minHeight: 160, textAlignVertical: "top" },
  btn: { backgroundColor: "#34d399", borderRadius: 10, padding: 14, alignItems: "center" },
  btnText: { color: "#022c22", fontWeight: "700" },
  card: { backgroundColor: "#0f172a", borderRadius: 10, padding: 14 },
  out: { color: "#cbd5e1", lineHeight: 20 },
});
