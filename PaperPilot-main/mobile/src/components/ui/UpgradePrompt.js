import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme";
import PrimaryButton from "./PrimaryButton";
import { normalizeTier } from "../../lib/plans";

export default function UpgradePrompt({ message, tier, onClose, onUpgrade }) {
  if (!message) return null;
  const current = normalizeTier(tier);
  const atTop = current === "pro";
  const heading = atTop
    ? "Scan limit reached"
    : current === "premium"
      ? "Upgrade to Pro"
      : "Upgrade your plan";
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.badge}>{atTop ? "Pro" : current === "premium" ? "Pro" : "Plans"}</Text>
          <Text style={styles.title}>{heading}</Text>
          <Text style={styles.body}>{message}</Text>
          {atTop ? null : current === "premium" ? (
            <Text style={styles.bullet}>✓ Up to 75 compliance scans every week</Text>
          ) : (
            <>
              <Text style={styles.bullet}>✓ More compliance scans each month or week</Text>
              <Text style={styles.bullet}>✓ Full manuscript version history</Text>
              <Text style={styles.bullet}>✓ APA, MLA, and IEEE citation styles</Text>
            </>
          )}
          <View style={styles.row}>
            <Pressable style={styles.secondary} onPress={onClose}>
              <Text style={styles.secondaryText}>Cancel</Text>
            </Pressable>
            <View style={styles.flex}>
              <PrimaryButton
                title="Upgrade plan"
                onPress={() => {
                  onClose?.();
                  onUpgrade?.();
                }}
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 22,
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: colors.accentMuted,
    color: colors.accentText,
    overflow: "hidden",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  title: { marginTop: 14, fontSize: 20, fontWeight: "700", color: colors.text },
  body: { marginTop: 8, fontSize: 14, lineHeight: 21, color: colors.slate },
  bullet: { marginTop: 8, fontSize: 14, color: "#475569" },
  row: { marginTop: 20, flexDirection: "row", gap: 10, alignItems: "center" },
  secondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryText: { color: colors.slate, fontWeight: "600" },
  flex: { flex: 1 },
});
