import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme";

export const UPLOAD_JOURNEY = [
  {
    step: 1,
    label: "Upload Mechanics",
    description: "Choose the format rules: a saved guide, a new upload, or fields you set yourself.",
  },
  {
    step: 2,
    label: "Upload Manuscript",
    description: "Add the paper you want checked against those rules.",
  },
  {
    step: 3,
    label: "File Details",
    description: "Review what’s attached, then run the compliance scan.",
  },
];

let journeySeen = false;

export function uploadJourneySeen() {
  return journeySeen;
}

export function markUploadJourneySeen() {
  journeySeen = true;
}

/** Step label + "Show Steps" control shown above each wizard panel heading. */
export function ShowStepsRow({ step, total = 3, onShowSteps }) {
  return (
    <View style={styles.stepsRow}>
      <Text style={styles.stepLabel}>
        Step {step} of {total}
      </Text>
      {typeof onShowSteps === "function" ? (
        <Pressable onPress={onShowSteps} hitSlop={8} accessibilityRole="button">
          <Text style={styles.showSteps}>Show Steps</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function circleStyle(item, current) {
  if (item.step === current) return [styles.circle, styles.circleCurrent];
  if (item.step < current) return [styles.circle, styles.circleDone];
  return [styles.circle, styles.circleTodo];
}

function circleTextStyle(item, current) {
  if (item.step === current) return [styles.circleText, { color: "#092823" }];
  if (item.step < current) return [styles.circleText, { color: colors.white }];
  return [styles.circleText, { color: colors.muted }];
}

export default function UploadJourneyModal({ open, current = 1, onClose }) {
  const currentItem = UPLOAD_JOURNEY.find((item) => item.step === current) || UPLOAD_JOURNEY[0];

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
            <Text style={styles.kicker}>How a scan works</Text>
            <Text style={styles.title}>Three steps</Text>
            <Text style={styles.subtitle}>
              You are on step {current}: {currentItem.label}.
            </Text>

            <View style={styles.list}>
              {UPLOAD_JOURNEY.map((item, index) => {
                const isCurrent = item.step === current;
                const last = index === UPLOAD_JOURNEY.length - 1;
                return (
                  <View key={item.step} style={styles.item}>
                    <View style={styles.rail}>
                      <View style={circleStyle(item, current)}>
                        <Text style={circleTextStyle(item, current)}>{item.step}</Text>
                      </View>
                      {!last ? <View style={styles.connector} /> : null}
                    </View>
                    <View style={[styles.itemBody, !last && styles.itemBodySpaced]}>
                      <View style={styles.itemHead}>
                        <Text style={[styles.itemLabel, isCurrent && styles.itemLabelCurrent]}>
                          {item.label}
                        </Text>
                        {isCurrent ? (
                          <View style={styles.nowPill}>
                            <Text style={styles.nowText}>Now</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.itemDesc}>{item.description}</Text>
                    </View>
                  </View>
                );
              })}
            </View>

            <Pressable
              style={({ pressed }) => [styles.cta, pressed && { backgroundColor: colors.accentHover }]}
              onPress={onClose}
              accessibilityRole="button"
            >
              <Text style={styles.ctaText}>
                {current === 1 ? "Start step 1" : `Continue on step ${current}`}
              </Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  stepsRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 12, rowGap: 4 },
  stepLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.accent,
  },
  showSteps: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.accentText,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 512,
    maxHeight: "90%",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    padding: 24,
    shadowColor: "#0f172a",
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  kicker: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: colors.accent,
  },
  title: { marginTop: 8, fontSize: 24, fontWeight: "700", letterSpacing: -0.4, color: colors.text },
  subtitle: { marginTop: 4, fontSize: 14, lineHeight: 20, color: colors.slate },
  list: { marginTop: 24 },
  item: { flexDirection: "row", gap: 16 },
  rail: { alignItems: "center" },
  circle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  circleCurrent: {
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  circleDone: { backgroundColor: colors.sidebar },
  circleTodo: { borderWidth: 1, borderColor: "#cbd5e1", backgroundColor: colors.white },
  circleText: { fontSize: 18, fontWeight: "700" },
  connector: { flex: 1, width: 1, marginVertical: 4, backgroundColor: colors.border },
  itemBody: { flex: 1, paddingTop: 4 },
  itemBodySpaced: { paddingBottom: 24 },
  itemHead: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  itemLabel: { fontSize: 16, fontWeight: "700", color: colors.text },
  itemLabelCurrent: { color: colors.accentText },
  nowPill: {
    borderRadius: 999,
    backgroundColor: "#e7f8f5",
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  nowText: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: colors.accentText,
  },
  itemDesc: { marginTop: 4, fontSize: 14, lineHeight: 20, color: colors.slate },
  cta: {
    marginTop: 24,
    borderRadius: 12,
    backgroundColor: colors.accent,
    paddingVertical: 12,
    alignItems: "center",
  },
  ctaText: { fontSize: 14, fontWeight: "700", color: "#092823" },
});
