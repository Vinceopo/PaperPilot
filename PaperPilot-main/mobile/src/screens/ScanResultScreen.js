import { useCallback, useEffect, useRef } from "react";
import { Alert, Animated, BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useAppData } from "../context/AppDataContext";
import { colors } from "../theme";
import AppShell from "../components/shell/AppShell";
import IssuesDetectedPanel, {
  normalizeDetectedIssues,
} from "../components/cockpit/IssuesDetectedPanel";
import TraceDocumentViewer from "../components/cockpit/TraceDocumentViewer";
import PrimaryButton from "../components/ui/PrimaryButton";
import { PaperPilotMark } from "../components/shell/PaperPilotLogo";
import {
  CATEGORY_STATUS_LABEL,
  formatCount,
  formatPct,
  formatScore,
  hasValue,
  plural,
  roundSharesToTotal,
} from "../lib/scoreFormat";
import { APP_TIME_ZONE } from "../lib/timeZone";

function scoreBand(score) {
  if (!hasValue(score))
    return { label: "NOT EVALUATED", text: "#64748b", border: "#e2e8f0", bg: "#f8fafc", score: "#64748b" };
  if (score >= 80)
    return { label: "COMPLIANT", text: "#157347", border: "#b7e4c7", bg: "#eaf7ef", score: "#157347" };
  if (score >= 50)
    return { label: "NEEDS REVISION", text: "#B57200", border: "#f0d9a0", bg: "#fff8e8", score: "#B57200" };
  return { label: "CRITICAL ISSUES", text: "#B02A37", border: "#f0c2c7", bg: "#fdf0f1", score: "#B02A37" };
}

function barColor(score) {
  if (score >= 80) return "#157347";
  if (score >= 60) return "#B57200";
  return "#B02A37";
}

function scoreTextColor(score) {
  if (score >= 80) return "#157347";
  if (score >= 60) return "#B57200";
  return "#B02A37";
}

function formatReportDate(value) {
  if (!value) return "—";
  const raw = String(value);
  const d = new Date(raw.length <= 10 ? `${raw}T12:00:00` : raw);
  if (Number.isNaN(d.getTime())) return "—";
  const datePart = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: APP_TIME_ZONE,
  });
  if (raw.length <= 10) return datePart;
  const timePart = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: APP_TIME_ZONE,
  });
  return `${datePart} · ${timePart}`;
}

function ScoreBar({ metric, score, status }) {
  const evaluated = hasValue(score);
  const safe = evaluated ? Math.max(0, Math.min(100, Number(score))) : 0;
  const width = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(width, {
      toValue: safe,
      duration: 700,
      delay: 60,
      useNativeDriver: false,
    }).start();
  }, [safe, width]);

  return (
    <View style={styles.barRow}>
      <Text style={styles.barLabel} numberOfLines={1}>
        {metric}
        {!evaluated ? ` · ${CATEGORY_STATUS_LABEL[status] || "N/A"}` : ""}
      </Text>
      <View style={styles.barTrack}>
        <Animated.View
          style={[
            styles.barFill,
            {
              backgroundColor: evaluated ? barColor(safe) : "#cbd5e1",
              width: width.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }),
            },
          ]}
        />
      </View>
      <Text style={[styles.barScore, { color: evaluated ? scoreTextColor(safe) : "#94a3b8" }]}>
        {evaluated ? formatPct(safe) : "N/A"}
      </Text>
    </View>
  );
}

export default function ScanResultScreen({ navigation }) {
  const { scanFlow, handleBackToDashboard } = useAppData();
  const hasResult = Boolean(scanFlow?.result);

  const goBack = useCallback(() => {
    handleBackToDashboard();
    navigation.navigate("Upload");
  }, [handleBackToDashboard, navigation]);

  useFocusEffect(
    useCallback(() => {
      if (!hasResult) return undefined;
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        goBack();
        return true;
      });
      return () => sub.remove();
    }, [hasResult, goBack])
  );

  return (
    <AppShell breadcrumb="Dashboard" title="Scan Results" onBack={hasResult ? goBack : undefined}>
      <ScanResultBody navigation={navigation} />
    </AppShell>
  );
}

function ScanResultBody({ navigation }) {
  const {
    scanFlow,
    resetUploadWizard,
    setManuscriptReady,
    setFileDetailsNotice,
    selectedMechanicsId,
  } = useAppData();
  const result = scanFlow?.result;

  if (!result) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyTitle}>Run a scan from Upload</Text>
        <Text style={styles.emptyBody}>
          Upload format mechanics and a manuscript, then Analyse to see compliance results here.
        </Text>
        <PrimaryButton
          title="Go to Upload"
          onPress={() => navigation.navigate("Upload")}
          style={{ marginTop: 18, minWidth: 160 }}
        />
      </View>
    );
  }

  const {
    documentTitle = "Untitled Document",
    campus,
    college,
    scannedAt,
    citationStyle = "APA",
    overallScore = null,
    rightPct,
    wrongPct,
    scoreBreakdown = [],
    formatChecks = [],
    pageCount = 0,
    cloudinaryUrl = "",
    documentName = "",
    documentPreview = null,
    unitsChecked,
    issueTotals = null,
    scoringConsistency = null,
    scoringVersion = null,
    pagination = null,
  } = result;

  const [shownRight, shownIncorrect] = roundSharesToTotal([rightPct, wrongPct]);
  const criticalTypes = formatChecks.filter((c) => c.result === "FAIL").length;
  const warningTypes = formatChecks.filter((c) => c.result === "REVIEW").length;
  const issueTypes = formatChecks.filter((c) => c.result === "FAIL" || c.result === "REVIEW").length;
  const band = scoreBand(overallScore);
  const evaluated = hasValue(overallScore);
  const rightShare = hasValue(shownRight) ? Math.max(0, Math.min(100, Number(shownRight))) : 0;
  const incorrectShare = hasValue(shownIncorrect)
    ? Math.max(0, Math.min(100, Number(shownIncorrect)))
    : 0;

  const versionLabel = `v${scanFlow.versionNumber || 1}.0`;
  const scannedLabel = formatReportDate(scannedAt);
  const generatedLabel = formatReportDate(new Date().toISOString());
  const hasPreview = Boolean(scanFlow.file || cloudinaryUrl || documentPreview);

  async function onDownload() {
    try {
      await scanFlow.downloadReport();
    } catch (err) {
      Alert.alert("Download failed", err?.message || "Could not generate the PDF report.");
    }
  }

  function openReferenceTracing() {
    const { entries } = normalizeDetectedIssues(formatChecks, pageCount);
    const first = entries[0];
    if (first) scanFlow.selectTraceIssue(first);
    scanFlow.openDocumentTrace(first || null);
    navigation.navigate("DocumentReference");
  }

  function backToSummary() {
    scanFlow.backToSummary();
    navigation.navigate("Upload");
  }

  function onUploadNewVersion() {
    scanFlow.uploadNewVersion();
    setManuscriptReady(false);
    setFileDetailsNotice("");
    resetUploadWizard(selectedMechanicsId ? 2 : 1);
    navigation.navigate("Upload");
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll}>
      <View style={styles.brandRow}>
        <PaperPilotMark size={40} />
        <Text style={styles.brandWord}>PAPERPILOT</Text>
        <Text style={styles.brandResults}>* RESULTS</Text>
      </View>

      <View style={styles.heroLinks}>
        <Pressable onPress={backToSummary} hitSlop={6}>
          <Text style={styles.heroBack}>← Back to summary</Text>
        </Pressable>
        <Pressable onPress={openReferenceTracing} hitSlop={6}>
          <Text style={styles.heroTrace}>Open reference tracing</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <View style={styles.metaGrid}>
          <View style={styles.metaCell}>
            <Text style={styles.metaKey}>Document</Text>
            <Text style={styles.metaValue} numberOfLines={2}>
              {documentTitle}
            </Text>
            {campus || college ? (
              <Text style={styles.metaSub} numberOfLines={1}>
                {[college, campus].filter(Boolean).join(" · ")}
              </Text>
            ) : null}
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaKey}>Citation style</Text>
            <Text style={styles.metaValue}>
              {citationStyle} · {versionLabel}
            </Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaKey}>Scanned</Text>
            <Text style={styles.metaValue}>{scannedLabel}</Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaKey}>Generated</Text>
            <Text style={styles.metaValue}>{generatedLabel}</Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardKicker}>Overall compliance score</Text>
        <View style={styles.scoreRow}>
          <Text style={[styles.scoreBig, { color: band.score }]}>
            {evaluated ? formatScore(overallScore, 0) : "—"}
          </Text>
          <Text style={styles.scoreOutOf}>/ 100</Text>
        </View>
        <View style={[styles.bandPill, { backgroundColor: band.bg, borderColor: band.border }]}>
          <Text style={[styles.bandText, { color: band.text }]}>{band.label}</Text>
        </View>

        <View style={styles.shareLabels}>
          <Text style={styles.shareRight}>Right {formatPct(shownRight)}</Text>
          <Text style={styles.shareIncorrect}>Incorrect {formatPct(shownIncorrect)}</Text>
        </View>
        <View style={styles.shareTrack}>
          <View style={[styles.shareRightFill, { width: `${rightShare}%` }]} />
          <View style={[styles.shareIncorrectFill, { width: `${incorrectShare}%` }]} />
        </View>

        <View style={styles.statGrid}>
          <View style={styles.statBox}>
            <Text style={[styles.statNum, { color: "#B02A37" }]}>{criticalTypes}</Text>
            <Text style={styles.statLabel}>Errors</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={[styles.statNum, { color: "#B57200" }]}>{warningTypes}</Text>
            <Text style={styles.statLabel}>Warnings</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{issueTypes}</Text>
            <Text style={styles.statLabel}>Issue types</Text>
          </View>
        </View>

        {hasValue(unitsChecked) ? (
          <Text style={styles.unitsNote}>
            {Number(unitsChecked) === 0
              ? "No formatting unit could be measured in this document."
              : `Based on ${formatCount(unitsChecked)} measured formatting ${plural(unitsChecked, "unit")}`}
            {issueTotals
              ? ` · ${formatCount(issueTotals.occurrences)} ${plural(issueTotals.occurrences, "issue")} found`
              : ""}
          </Text>
        ) : null}
        {scoringConsistency && !scoringConsistency.ok ? (
          <Text style={styles.consistencyWarn} accessibilityRole="alert">
            These results failed an internal consistency check. Re-run the analysis before relying on
            them.
          </Text>
        ) : null}
        {!scoringVersion ? (
          <Text style={styles.unitsNote}>
            This scan was saved without the full scoring breakdown. Re-analyse the manuscript to
            generate checked, passed, and failed unit counts.
          </Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Score breakdown</Text>
        <Text style={styles.sectionSub}>
          Share of measured text that matched the format in each category
        </Text>
        <View style={styles.legend}>
          <Text style={styles.legendText}>● 80% and above</Text>
          <Text style={[styles.legendText, { color: "#B57200" }]}>● 60–79%</Text>
          <Text style={[styles.legendText, { color: "#B02A37" }]}>● Below 60%</Text>
        </View>
        <View style={{ marginTop: 16, gap: 14 }}>
          {scoreBreakdown.map((item) => (
            <ScoreBar
              key={item.metric || item.section}
              metric={item.metric || item.section}
              score={item.score}
              status={item.status}
            />
          ))}
        </View>
      </View>

      <View style={styles.previewCard}>
        <View style={styles.previewHead}>
          <View style={{ flex: 1, minWidth: 180 }}>
            <Text style={styles.previewTitle}>Document preview</Text>
            <Text style={styles.previewSub}>
              Starts on page 1. Scroll to read every page, or trace an issue to jump to it.
            </Text>
          </View>
          <Pressable
            onPress={openReferenceTracing}
            style={({ pressed }) => [styles.traceBtn, pressed && { backgroundColor: "#047857" }]}
          >
            <Text style={styles.traceBtnText}>Trace issues in document</Text>
          </Pressable>
        </View>
        {hasPreview ? (
          <View style={styles.previewBody}>
            <View style={styles.previewFrame}>
              <TraceDocumentViewer
                key={scanFlow.file?.uri || cloudinaryUrl || "empty"}
                file={scanFlow.file}
                documentUrl={cloudinaryUrl}
                documentName={documentName || scanFlow.file?.name || ""}
                preview={documentPreview}
                pageCount={pageCount}
                formatChecks={formatChecks}
                highlight={null}
                emptyLabel="Preview unavailable for this version."
              />
            </View>
          </View>
        ) : null}
      </View>

      <View>
        <View style={styles.issuesHead}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.issuesTitle}>Issues detected</Text>
            <Text style={styles.issuesSub}>
              Grouped by page with explanations and fix suggestions. Each page starts at line 1.
            </Text>
          </View>
          {issueTypes > 0 ? (
            <View style={styles.issuesBadge}>
              <Text style={styles.issuesBadgeText}>
                {issueTypes} issue type{issueTypes === 1 ? "" : "s"}
              </Text>
            </View>
          ) : null}
        </View>
        <IssuesDetectedPanel
          formatChecks={formatChecks}
          pageCount={pageCount}
          pagination={pagination}
          onIssuePress={(entry) => {
            scanFlow.selectTraceIssue(entry);
            scanFlow.openDocumentTrace(entry);
            navigation.navigate("DocumentReference");
          }}
        />
      </View>

      {scanFlow.downloadError ? (
        <Text style={styles.downloadError} accessibilityRole="alert">
          {scanFlow.downloadError}
        </Text>
      ) : null}

      <Pressable
        onPress={onDownload}
        disabled={scanFlow.downloadBusy}
        style={({ pressed }) => [
          styles.downloadBtn,
          pressed && { backgroundColor: "#f8fafc" },
          scanFlow.downloadBusy && { opacity: 0.5 },
        ]}
      >
        <Text style={styles.downloadText}>
          {scanFlow.downloadBusy ? "Generating PDF…" : `Download full report · ${versionLabel}`}
        </Text>
      </Pressable>

      <View style={styles.footerRow}>
        <Pressable
          style={({ pressed }) => [styles.newVersionBtn, pressed && { backgroundColor: "#12ae99" }]}
          onPress={onUploadNewVersion}
        >
          <Text style={styles.newVersionText}>Upload New Version</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.pageBg },
  scroll: { padding: 16, paddingBottom: 40, gap: 16 },
  emptyWrap: {
    flex: 1,
    backgroundColor: colors.pageBg,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
  emptyBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
    textAlign: "center",
  },
  brandRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
  },
  brandWord: {
    fontSize: 18,
    fontWeight: "700",
    letterSpacing: 1.2,
    color: "#172033",
  },
  brandResults: {
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 1.4,
    color: "#4a5568",
  },
  heroLinks: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  heroBack: { fontSize: 11, fontWeight: "600", color: colors.accent },
  heroTrace: { fontSize: 11, fontWeight: "600", color: "#64748b" },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    padding: 18,
  },
  metaGrid: { gap: 14 },
  metaCell: { gap: 2 },
  metaKey: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "#94a3b8",
  },
  metaValue: { fontSize: 14, fontWeight: "700", color: "#0f172a" },
  metaSub: { fontSize: 12, color: "#64748b" },
  cardKicker: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: "#94a3b8",
  },
  scoreRow: { flexDirection: "row", alignItems: "flex-end", gap: 6, marginTop: 8 },
  scoreBig: { fontSize: 48, fontWeight: "800", lineHeight: 52 },
  scoreOutOf: { fontSize: 16, fontWeight: "600", color: "#94a3b8", paddingBottom: 8 },
  bandPill: {
    alignSelf: "flex-start",
    marginTop: 10,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  bandText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8 },
  shareLabels: {
    marginTop: 18,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  shareRight: { fontSize: 13, fontWeight: "700", color: "#157347" },
  shareIncorrect: { fontSize: 13, fontWeight: "700", color: "#B02A37" },
  shareTrack: {
    marginTop: 8,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#eeeeee",
    overflow: "hidden",
    flexDirection: "row",
  },
  shareRightFill: { height: "100%", backgroundColor: "#157347" },
  shareIncorrectFill: { height: "100%", backgroundColor: "#B02A37" },
  statGrid: { marginTop: 16, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statBox: {
    width: "30%",
    flexGrow: 1,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  statNum: { fontSize: 22, fontWeight: "800", color: "#0f172a" },
  statLabel: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "#64748b",
  },
  unitsNote: { marginTop: 12, fontSize: 11, lineHeight: 16, color: "#64748b", textAlign: "center" },
  consistencyWarn: {
    marginTop: 10,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#fde68a",
    backgroundColor: "#fffbeb",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 11,
    lineHeight: 16,
    color: "#92400e",
    textAlign: "center",
  },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: "#0f172a" },
  sectionSub: { marginTop: 4, fontSize: 13, lineHeight: 18, color: "#64748b" },
  legend: { marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 12 },
  legendText: { fontSize: 11, color: "#157347" },
  barRow: { gap: 6 },
  barLabel: { fontSize: 13, fontWeight: "600", color: "#334155" },
  barTrack: { height: 4, borderRadius: 999, backgroundColor: "#eeeeee", overflow: "hidden" },
  barFill: { height: 4, borderRadius: 999 },
  barScore: { fontSize: 13, fontWeight: "700", alignSelf: "flex-end" },
  issuesHead: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 10,
  },
  issuesTitle: { fontSize: 14, fontWeight: "700", color: "#1e293b" },
  issuesSub: { marginTop: 2, fontSize: 12, lineHeight: 16, color: "#94a3b8" },
  issuesBadge: {
    borderRadius: 999,
    backgroundColor: "#ffe4e6",
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  issuesBadgeText: { fontSize: 12, fontWeight: "700", color: "#be123c" },
  downloadError: { fontSize: 12, color: "#f43f5e" },
  downloadBtn: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingVertical: 12,
    paddingHorizontal: 20,
    shadowColor: "#0f172a",
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  downloadText: { fontSize: 12, fontWeight: "700", color: "#334155" },
  previewCard: {
    overflow: "hidden",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  previewHead: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    backgroundColor: "#f8fffd",
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  previewTitle: { fontSize: 14, fontWeight: "700", color: "#1e293b" },
  previewSub: { marginTop: 2, fontSize: 11, lineHeight: 16, color: "#64748b" },
  traceBtn: {
    borderRadius: 8,
    backgroundColor: "#059669",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  traceBtnText: { fontSize: 11, fontWeight: "700", color: colors.white },
  previewBody: { backgroundColor: "#e8ecf1", padding: 12 },
  previewFrame: { height: 520, overflow: "hidden", borderRadius: 8, backgroundColor: "#e8ecf1" },
  footerRow: { flexDirection: "row", justifyContent: "flex-end", paddingBottom: 8 },
  newVersionBtn: {
    borderRadius: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 11,
  },
  newVersionText: { fontSize: 12, fontWeight: "700", color: colors.white },
});
