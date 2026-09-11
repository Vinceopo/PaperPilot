import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAppData } from "../context/AppDataContext";
import { colors } from "../theme";

export default function ManuscriptsScreen() {
  const { manuscripts, currentManuscript, currentVersion } = useAppData();
  const [selectedId, setSelectedId] = useState(null);

  const selected =
    manuscripts.find((item) => item.id === selectedId) ||
    (selectedId === currentManuscript?.id ? currentManuscript : null);

  if (!manuscripts.length) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyTitle}>My Manuscripts</Text>
        <Text style={styles.emptyBody}>
          No manuscripts yet. Upload one from the Upload tab to start tracking versions.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll}>
      <Text style={styles.kicker}>Library</Text>
      <Text style={styles.title}>My Manuscripts</Text>
      <Text style={styles.subtitle}>Saved drafts and versioned uploads</Text>

      {manuscripts.map((item) => {
        const active = selectedId === item.id;
        const versions =
          item.version_count ?? item.current_version_number ?? item.versions?.length ?? 0;
        return (
          <Pressable
            key={item.id}
            style={[styles.card, active && styles.cardActive]}
            onPress={() => setSelectedId(active ? null : item.id)}
          >
            <Text style={styles.cardTitle} numberOfLines={2}>
              {item.title || "Untitled manuscript"}
            </Text>
            <Text style={styles.meta}>
              {versions} version{Number(versions) === 1 ? "" : "s"}
              {item.updated_at
                ? ` · updated ${new Date(item.updated_at).toLocaleDateString()}`
                : ""}
            </Text>
          </Pressable>
        );
      })}

      {selected ? (
        <View style={styles.details}>
          <Text style={styles.detailsLabel}>Details</Text>
          <Text style={styles.detailsTitle}>{selected.title}</Text>
          <Text style={styles.meta}>
            Versions: {selected.version_count ?? selected.current_version_number ?? "—"}
          </Text>
          {currentManuscript?.id === selected.id && currentVersion ? (
            <Text style={styles.ready}>
              Current session · v{currentVersion.version_number} ready to scan
            </Text>
          ) : (
            <Text style={styles.hint}>
              Open Upload to add a new version of this manuscript.
            </Text>
          )}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.pageBg },
  scroll: { padding: 16, paddingBottom: 40 },
  emptyWrap: {
    flex: 1,
    backgroundColor: colors.pageBg,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: colors.text },
  emptyBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
    textAlign: "center",
  },
  kicker: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.accent,
  },
  title: { marginTop: 4, fontSize: 22, fontWeight: "700", color: colors.text },
  subtitle: { marginTop: 4, marginBottom: 16, fontSize: 13, color: colors.muted },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    marginBottom: 10,
  },
  cardActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  cardTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  meta: { marginTop: 6, fontSize: 12, color: colors.slate },
  details: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
  },
  detailsLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.muted,
  },
  detailsTitle: { marginTop: 6, fontSize: 17, fontWeight: "700", color: colors.text },
  ready: { marginTop: 10, fontSize: 13, fontWeight: "600", color: colors.emerald },
  hint: { marginTop: 10, fontSize: 13, color: colors.muted, lineHeight: 19 },
});
