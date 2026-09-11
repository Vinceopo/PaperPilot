import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAppData } from "../context/AppDataContext";
import { colors } from "../theme";
import { manuscriptSummary } from "../lib/scoreBand";

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso + (iso.length <= 10 ? "T12:00:00" : "")).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function bandColors(band) {
  if (band?.key === "compliant") {
    return { bg: colors.emeraldBg, border: "#a7f3d0", text: colors.emerald };
  }
  if (band?.key === "needs_revision") {
    return { bg: colors.amberBg, border: "#fde68a", text: colors.amber };
  }
  return { bg: colors.roseBg, border: colors.roseBorder, text: colors.rose };
}

export default function ManuscriptsScreen() {
  const { scannedLibrary, updateScannedLibrary } = useAppData();
  const items = Array.isArray(scannedLibrary) ? scannedLibrary : [];

  if (!items.length) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyTitle}>My Manuscripts</Text>
        <Text style={styles.emptyBody}>
          No scanned manuscripts yet. Run a scan from Upload to build your library.
        </Text>
      </View>
    );
  }

  function openDetail(summary) {
    Alert.alert(
      summary.title || "Manuscript",
      [
        `Score: ${Math.round(summary.latestScore)}/100`,
        `Status: ${summary.band?.label || "—"}`,
        `Latest: ${summary.latestVersionLabel}`,
        `Versions: ${summary.versionCount}`,
        `Scanned: ${formatDate(summary.scannedDate)}`,
      ].join("\n"),
      [
        { text: "Close", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            Alert.alert("Delete manuscript", `Remove “${summary.title}” from your library?`, [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: () =>
                  updateScannedLibrary(items.filter((m) => m.id !== summary.id)),
              },
            ]);
          },
        },
      ]
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll}>
      <Text style={styles.kicker}>Library</Text>
      <Text style={styles.title}>My Manuscripts</Text>
      <Text style={styles.subtitle}>Only manuscripts you have scanned appear here</Text>

      {items.map((item) => {
        const summary = manuscriptSummary(item);
        const tone = bandColors(summary.band);
        return (
          <Pressable key={item.id} style={styles.card} onPress={() => openDetail(summary)}>
            <View style={styles.cardTop}>
              <Text style={styles.cardTitle} numberOfLines={2}>
                {summary.title || "Untitled manuscript"}
              </Text>
              <View
                style={[
                  styles.badge,
                  { backgroundColor: tone.bg, borderColor: tone.border },
                ]}
              >
                <Text style={[styles.badgeText, { color: tone.text }]}>
                  {summary.band?.label || "—"}
                </Text>
              </View>
            </View>
            <Text style={styles.meta}>
              Score {Math.round(summary.latestScore)} · {summary.latestVersionLabel} ·{" "}
              {summary.versionCount} version{summary.versionCount === 1 ? "" : "s"}
            </Text>
            <Text style={styles.meta}>Scanned {formatDate(summary.scannedDate)}</Text>
          </Pressable>
        );
      })}
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
  cardTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: "700", color: colors.text },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.6 },
  meta: { marginTop: 6, fontSize: 12, color: colors.slate },
});
