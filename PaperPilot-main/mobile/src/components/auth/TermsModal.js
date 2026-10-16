import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme";

export const TERMS_SECTIONS = [
  {
    heading: "1. Using PaperPilot",
    body: "PaperPilot checks academic manuscripts against formatting and citation rules (APA, MLA, and IEEE). Results are guidance only; you remain responsible for the final content and formatting of your work and for following your institution's requirements.",
  },
  {
    heading: "2. Your account",
    body: "Keep your login details private and accurate. You are responsible for activity under your account. We may suspend accounts that misuse the service.",
  },
  {
    heading: "3. Your documents",
    body: "You keep ownership of the manuscripts you upload. You allow PaperPilot to store and process them only to provide scans, previews, version history, and reports. Do not upload content you have no right to share.",
  },
  {
    heading: "4. AI-generated results",
    body: "Some findings and explanations are produced by AI and may be incomplete or incorrect. Review every suggestion before applying it.",
  },
  {
    heading: "5. Plans and payments",
    body: "Paid plans (Premium and Pro) are billed through PayMongo, monthly or annually. Scan allowances reset on the schedule shown for your plan. Canceling returns you to the Free plan.",
  },
  {
    heading: "6. Privacy",
    body: "We collect only what is needed to run the service, such as your name, email, and uploaded documents. We do not sell your personal data.",
  },
  {
    heading: "7. Changes",
    body: "We may update these terms. Continuing to use PaperPilot after an update means you accept the new terms.",
  },
];

export default function TermsModal({ open, onClose, onAgree }) {
  return (
    <Modal visible={Boolean(open)} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.card} accessibilityViewIsModal>
          <Text style={styles.title}>Terms and Conditions</Text>
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            {TERMS_SECTIONS.map((section) => (
              <View key={section.heading}>
                <Text style={styles.heading}>{section.heading}</Text>
                <Text style={styles.text}>{section.body}</Text>
              </View>
            ))}
          </ScrollView>
          <View style={styles.actions}>
            <Pressable
              onPress={onClose}
              style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed]}
              accessibilityRole="button"
            >
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
            {onAgree ? (
              <Pressable
                onPress={onAgree}
                style={({ pressed }) => [styles.agreeBtn, pressed && styles.agreeBtnPressed]}
                accessibilityRole="button"
              >
                <Text style={styles.agreeText}>I agree</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(15,23,42,0.5)",
    padding: 16,
  },
  card: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "85%",
    borderRadius: 16,
    backgroundColor: colors.white,
    overflow: "hidden",
  },
  title: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    fontSize: 18,
    fontWeight: "700",
    color: colors.navy,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  body: { flexGrow: 0 },
  bodyContent: { paddingHorizontal: 20, paddingVertical: 16, gap: 14 },
  heading: { fontSize: 14, fontWeight: "600", color: "#1e293b" },
  text: { marginTop: 4, fontSize: 14, lineHeight: 21, color: "#475569" },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
  },
  closeBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  closeBtnPressed: { backgroundColor: "#f8fafc" },
  closeText: { fontSize: 14, fontWeight: "600", color: colors.slate },
  agreeBtn: { borderRadius: 12, backgroundColor: colors.accent, paddingHorizontal: 18, paddingVertical: 10 },
  agreeBtnPressed: { backgroundColor: colors.accentHover },
  agreeText: { fontSize: 14, fontWeight: "700", color: colors.navy },
});
