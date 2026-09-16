import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme";

export default function VersionHistoryModal({ open, manuscript, versions, tier, onClose }) {
  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.kicker}>Version history</Text>
              <Text style={styles.title}>{manuscript?.title || "Manuscript"}</Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>

          {tier === "free" ? (
            <View style={styles.note}>
              <Text style={styles.noteText}>
                Free accounts can access the current version only. Upgrade to Premium for complete history.
              </Text>
            </View>
          ) : null}

          <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
            {versions.map((version, index) => (
              <View key={version.id || index} style={styles.card}>
                <View style={styles.row}>
                  <Text style={styles.version}>Version {version.version_number}</Text>
                  {index === 0 || version.is_current ? (
                    <Text style={styles.current}>Current</Text>
                  ) : null}
                </View>
                <Text style={styles.file} numberOfLines={1}>
                  {version.source_filename || version.filename}
                </Text>
                <Text style={styles.date}>
                  {version.created_at ? new Date(version.created_at).toLocaleString() : ""}
                </Text>
              </View>
            ))}
            {!versions.length ? (
              <Text style={styles.empty}>No accessible versions were returned.</Text>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(15,23,42,0.45)", justifyContent: "flex-end" },
  sheet: {
    maxHeight: "85%",
    backgroundColor: colors.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    padding: 20,
  },
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  kicker: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  title: { marginTop: 4, fontSize: 20, fontWeight: "700", color: colors.text },
  close: { fontSize: 18, color: colors.muted, padding: 4 },
  note: {
    marginTop: 16,
    backgroundColor: "#f5f3ff",
    borderColor: "#ddd6fe",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  noteText: { color: "#6d28d9", fontSize: 13, lineHeight: 19 },
  card: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.fileBg,
    borderRadius: 14,
    padding: 14,
  },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  version: { fontWeight: "600", color: "#334155" },
  current: {
    backgroundColor: colors.emeraldBg,
    color: colors.emerald,
    overflow: "hidden",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  file: { marginTop: 6, color: colors.muted, fontSize: 13 },
  date: { marginTop: 8, color: colors.slate, fontSize: 12 },
  empty: { marginTop: 20, color: colors.muted, fontSize: 14 },
});
