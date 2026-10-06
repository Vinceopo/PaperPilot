import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { useAppData } from "../context/AppDataContext";
import { colors } from "../theme";
import { normalizeDetectedIssues } from "../components/cockpit/IssuesDetectedPanel";
import TraceDocumentViewer from "../components/cockpit/TraceDocumentViewer";
import PrimaryButton from "../components/ui/PrimaryButton";

const ACTIVE_TONE = {
  critical: { backgroundColor: "rgba(255,241,242,0.9)", borderColor: "#fda4af" },
  moderate: { backgroundColor: "rgba(255,247,237,0.9)", borderColor: "#fdba74" },
  minor: { backgroundColor: "rgba(255,251,235,0.9)", borderColor: "#fcd34d" },
};

function formatLocation(entry) {
  const parts = [];
  if (entry.page != null) parts.push(`Page ${entry.page}`);
  if (entry.line != null) parts.push(`Line ${entry.line}`);
  return parts.length ? parts.join(", ") : "Document";
}

function toTarget(entry) {
  const loc = entry.location || {};
  return {
    id: entry.id,
    page: entry.page ?? loc.page ?? null,
    line: entry.line ?? loc.line ?? null,
    bbox: entry.bbox || loc.bbox || null,
    excerpt: entry.excerpt || loc.excerpt || "",
    severity: entry.severity || "minor",
    finding: entry.finding || "",
    section: entry.section || loc.section || "",
  };
}

export default function DocumentReferenceScreen({ navigation }) {
  const { scanFlow } = useAppData();
  const result = scanFlow?.result;
  const leavingRef = useRef(false);
  const stepRef = useRef(scanFlow?.step);
  stepRef.current = scanFlow?.step;

  const { entries } = useMemo(
    () => normalizeDetectedIssues(result?.formatChecks || [], result?.pageCount || 0),
    [result]
  );

  const initial = scanFlow?.traceHighlight;
  const [highlight, setHighlight] = useState(() =>
    initial?.page != null || initial?.line != null
      ? initial
      : entries[0]
        ? toTarget(entries[0])
        : null
  );

  useEffect(() => {
    if (highlight || !entries[0]) return;
    setHighlight(toTarget(entries[0]));
  }, [entries, highlight]);

  useEffect(() => {
    return navigation.addListener("beforeRemove", () => {
      if (!leavingRef.current && stepRef.current === "documentTrace") scanFlow.backToSummary();
    });
  }, [navigation, scanFlow]);

  const onSelectIssue = useCallback(
    (entry) => {
      const target = toTarget(entry);
      setHighlight(target);
      scanFlow.selectTraceIssue(entry);
    },
    [scanFlow]
  );

  function backToSummary() {
    leavingRef.current = true;
    scanFlow.backToSummary();
    navigation.navigate("MainTabs", { screen: "Upload" });
  }

  function viewFullResult() {
    leavingRef.current = true;
    scanFlow.openFullResult();
    navigation.navigate("MainTabs", { screen: "Results" });
  }

  if (!result) {
    return (
      <SafeAreaView style={styles.empty}>
        <Text style={styles.emptyTitle}>No scan to trace</Text>
        <PrimaryButton
          title="Back to Upload"
          onPress={() => navigation.navigate("MainTabs", { screen: "Upload" })}
        />
      </SafeAreaView>
    );
  }

  const activeId = highlight?.id;

  return (
    <SafeAreaView style={styles.root} edges={["top", "left", "right"]}>
      <View style={styles.toolbar}>
        <View style={styles.toolbarRow}>
          <Pressable
            style={({ pressed }) => [styles.backBtn, pressed && { backgroundColor: "#eefbf8" }]}
            onPress={backToSummary}
            hitSlop={6}
          >
            <Svg width={14} height={14} viewBox="0 0 16 16">
              <Path
                d="M10.5 3.5 6 8l4.5 4.5"
                fill="none"
                stroke="#109b89"
                strokeWidth={1.75}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
            <Text style={styles.backText}>Back to summary</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.fullBtn, pressed && { backgroundColor: "#047857" }]}
            onPress={viewFullResult}
          >
            <Text style={styles.fullBtnText}>View Full Result</Text>
          </Pressable>
        </View>
        <Text style={styles.title}>Reference tracing</Text>
        <Text style={styles.hint}>
          Tap an issue to jump to the matching page and line in your document.
        </Text>
      </View>

      <View style={styles.docFrame}>
        <TraceDocumentViewer
          file={scanFlow.file}
          documentUrl={result.cloudinaryUrl || ""}
          documentName={result.documentName || scanFlow.file?.name || ""}
          preview={result.documentPreview}
          pageCount={result.pageCount}
          formatChecks={result.formatChecks}
          highlight={highlight}
        />
      </View>

      <View style={styles.aside}>
        <View style={styles.asideHead}>
          <Text style={styles.asideTitle}>
            {entries.length} issue{entries.length === 1 ? "" : "s"}
          </Text>
          <Text style={styles.asideHint}>Select an issue to jump to that page.</Text>
        </View>
        <FlatList
          data={entries}
          keyExtractor={(item) => item.id}
          initialNumToRender={20}
          windowSize={11}
          extraData={activeId}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListEmptyComponent={<Text style={styles.noIssues}>No issues to trace.</Text>}
          renderItem={({ item }) => {
            const active = item.id === activeId;
            const tone = ACTIVE_TONE[item.severity] || ACTIVE_TONE.minor;
            return (
              <Pressable
                onPress={() => onSelectIssue(item)}
                style={({ pressed }) => [
                  styles.issueRow,
                  active ? [styles.issueActive, tone] : pressed ? { backgroundColor: "#f8fafc" } : null,
                ]}
              >
                <Text style={styles.issueLoc}>{formatLocation(item)}</Text>
                <Text style={styles.issueFinding}>{item.finding}</Text>
                <Text style={styles.issueSection}>{item.section}</Text>
              </Pressable>
            );
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.pageBg },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: 12 },
  toolbar: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 10 },
  toolbarRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#16bfa8",
    backgroundColor: colors.white,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  backText: { fontSize: 13, fontWeight: "600", color: "#109b89" },
  fullBtn: {
    backgroundColor: "#059669",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  fullBtnText: { fontSize: 12, fontWeight: "700", color: colors.white },
  title: { marginTop: 10, fontSize: 17, fontWeight: "700", color: "#172033" },
  hint: { marginTop: 2, fontSize: 12, color: colors.muted },
  docFrame: {
    flex: 1.35,
    marginHorizontal: 12,
    overflow: "hidden",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#e8ecf1",
  },
  aside: {
    flex: 1,
    margin: 12,
    overflow: "hidden",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  asideHead: {
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    backgroundColor: "#f8fffd",
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  asideTitle: { fontSize: 14, fontWeight: "700", color: "#1e293b" },
  asideHint: { marginTop: 1, fontSize: 11, color: colors.muted },
  separator: { height: 1, backgroundColor: "#f1f5f9" },
  issueRow: { paddingHorizontal: 16, paddingVertical: 12, borderWidth: 1, borderColor: "transparent" },
  issueActive: { borderWidth: 1 },
  issueLoc: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: "#16bfa8",
  },
  issueFinding: { marginTop: 4, fontSize: 14, fontWeight: "600", color: "#1e293b" },
  issueSection: { marginTop: 2, fontSize: 11, color: colors.muted },
  noIssues: { paddingHorizontal: 16, paddingVertical: 32, textAlign: "center", fontSize: 13, color: colors.muted },
});
