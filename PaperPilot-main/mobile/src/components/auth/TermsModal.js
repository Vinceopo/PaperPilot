import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme";

export const TERMS_SECTIONS = [
  {
    heading: "1. Acceptance of these terms",
    body: "By creating an account or using PaperPilot, you agree to these Terms and Conditions. If you do not agree, do not use the service. PaperPilot is intended for students, researchers, and professionals preparing academic manuscripts.",
  },
  {
    heading: "2. Using PaperPilot",
    body: "PaperPilot checks manuscripts against formatting and citation rules such as APA, MLA, and IEEE. Scan results, scores, and suggestions are guidance only. You remain responsible for the final content and formatting of your work and for meeting your institution, journal, or publisher requirements.",
  },
  {
    heading: "3. Your account",
    body: "Provide accurate registration details and keep your login credentials private. You are responsible for activity under your account. Notify us if you suspect unauthorized access. We may suspend or terminate accounts that misuse the service, attempt to bypass plan limits, or violate these terms.",
  },
  {
    heading: "4. Your documents",
    body: "You retain ownership of manuscripts you upload. You grant PaperPilot permission to store and process them solely to provide scans, previews, version history, and reports. Do not upload content you are not allowed to share. You may delete documents from your account subject to normal retention needed for backups and abuse prevention.",
  },
  {
    heading: "5. AI-generated results",
    body: "Some findings and explanations are produced with automated or AI-assisted systems and may be incomplete, outdated, or incorrect. Always review suggestions before applying them. PaperPilot does not guarantee acceptance by any journal, conference, or institution.",
  },
  {
    heading: "6. Plans and payments",
    body: "Free and paid plans (such as Premium and Pro) include the scan allowances and features shown at checkout. Paid plans are billed through PayMongo on a monthly or annual schedule. Allowances reset on the schedule for your plan. Canceling stops future renewals and returns you to the Free plan at the end of the current billing period unless otherwise stated.",
  },
  {
    heading: "7. Privacy",
    body: "We collect information needed to operate the service, including your name, email, account settings, and uploaded documents. We do not sell your personal data. Processing is limited to authentication, scans, reports, billing, and service improvement. See our privacy practices in the product for more detail.",
  },
  {
    heading: "8. Acceptable use",
    body: "Do not abuse the service, attempt unauthorized access, reverse engineer protected systems, upload malware, or use PaperPilot to infringe others' rights. We may limit or refuse service where these rules are broken.",
  },
  {
    heading: "9. Changes",
    body: "We may update these terms from time to time. Continued use of PaperPilot after an update means you accept the revised terms. Material changes may be highlighted in the app or by email when practical.",
  },
  {
    heading: "10. Contact",
    body: "Questions about these terms or your account can be sent through the support options available in PaperPilot.",
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
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnPressed: { backgroundColor: "#f8fafc" },
  closeText: { fontSize: 14, fontWeight: "600", color: colors.slate },
  agreeBtn: {
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.accent,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  agreeBtnPressed: { backgroundColor: colors.accentHover },
  agreeText: { fontSize: 14, fontWeight: "700", color: colors.navy },
});
