import { useEffect, useRef, useState } from "react";
import { Alert, Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { useAppData } from "../context/AppDataContext";
import { colors } from "../theme";
import AppShell from "../components/shell/AppShell";
import IssuesDetectedPanel, { normalizeDetectedIssues } from "../components/cockpit/IssuesDetectedPanel";
import TraceDocumentViewer from "../components/cockpit/TraceDocumentViewer";
import PrimaryButton from "../components/ui/PrimaryButton";
import {
  CATEGORY_STATUS_LABEL,
  formatCount,
  formatPct,
  hasValue,
  plural,
  roundSharesToTotal,
} from "../lib/scoreFormat";
import { APP_TIME_ZONE } from "../lib/timeZone";

function scoreBand(score) {
  if (!hasValue(score))
    return { label: "NOT EVALUATED", text: "#64748b", ring: "#cbd5e1", border: "#e2e8f0", bg: "#f8fafc" };
  if (score >= 80)
    return { label: "COMPLIANT", text: "#059669", ring: "#16bfa8", border: "#a7f3d0", bg: "#ecfdf5" };
  if (score >= 50)
    return { label: "NEEDS REVISION", text: "#d97706", ring: "#f59e0b", border: "#fde68a", bg: "#fffbeb" };
  return { label: "CRITICAL ISSUES", text: "#e11d48", ring: "#ef4444", border: "#fecdd3", bg: "#fff1f2" };
}

function barColor(score) {
  if (score >= 80) return "#10b981";
  if (score >= 50) return "#fbbf24";
  return "#f43f5e";
}

function scoreTextColor(score) {
  if (score >= 80) return "#059669";
  if (score >= 50) return "#d97706";
  return "#f43f5e";
}

function CircularScore({ score, categoryCount = null }) {
  const RADIUS = 52;
  const circumference = 2 * Math.PI * RADIUS;
  const [progress, setProgress] = useState(0);
  const band = scoreBand(score);
  const evaluated = hasValue(score);
  const target = evaluated ? Number(score) : 0;

  useEffect(() => {
    const DURATION = 1100;
    const start = Date.now();
    let raf = 0;
    const tick = () => {
      const t = Math.min((Date.now() - start) / DURATION, 1);
      const eased = 1 - (1 - t) ** 3;
      setProgress(eased * target);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  const offset = circumference - (progress / 100) * circumference;

  return (
    <View style={styles.circleWrap}>
      <View>
        <Svg width={148} height={148} viewBox="0 0 148 148" style={{ transform: [{ rotate: "-90deg" }] }}>
          <Circle cx={74} cy={74} r={RADIUS} fill="none" stroke="#e2e8f0" strokeWidth={14} />
          <Circle
            cx={74}
            cy={74}
            r={RADIUS}
            fill="none"
            stroke={band.ring}
            strokeWidth={14}
            strokeLinecap="round"
            strokeDasharray={`${circumference}`}
            strokeDashoffset={offset}
          />
        </Svg>
        <View style={styles.circleCenter}>
          <Text style={styles.circleValue}>{evaluated ? Math.round(progress) : "—"}</Text>
          <Text style={styles.circleOutOf}>/100</Text>
        </View>
      </View>
      <View style={[styles.bandPill, { backgroundColor: band.bg, borderColor: band.border }]}>
        <Text style={[styles.bandText, { color: band.text }]}>{band.label}</Text>
      </View>
      <Text style={styles.circleHint}>
        {!evaluated
          ? "No formatting unit could be measured"
          : categoryCount != null
            ? `Average of the ${categoryCount} measured ${plural(categoryCount, "category", "categories")}`
            : "Average of categories that were actually measured"}
      </Text>
    </View>
  );
}

function ScoreBar({ metric, score, status, unitsChecked, unitsFailed, issueCount = 0 }) {
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
    <View style={styles.barBlock}>
      <View style={styles.barHead}>
        <Text style={styles.barLabel}>
          {metric}
          {!evaluated ? (
            <Text style={styles.barMeta}>
              {"  "}· {CATEGORY_STATUS_LABEL[status] || "Not evaluated"}
            </Text>
          ) : hasValue(unitsChecked) ? (
            <Text style={unitsFailed ? styles.barMeta : styles.barPass}>
              {"  "}· {formatCount(unitsFailed)} of {formatCount(unitsChecked)} {plural(unitsChecked, "unit")} failed
            </Text>
          ) : null}
        </Text>
        <Text style={[styles.barScore, { color: evaluated ? scoreTextColor(safe) : "#94a3b8" }]}>
          {evaluated ? formatPct(safe) : "N/A"}
        </Text>
      </View>
      <View style={styles.barTrack}>
        <Animated.View
          style={[
            styles.barFill,
            {
              backgroundColor: barColor(safe),
              width: width.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] }),
            },
          ]}
        />
      </View>
      {issueCount > 0 ? (
        <Text style={styles.barIssues}>
          {formatCount(issueCount)} {plural(issueCount, "issue")} found in this category
        </Text>
      ) : null}
    </View>
  );
}

function LegendDot({ color, label }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendText}>{label}</Text>
    </View>
  );
}

function DownloadIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 4v12m0 0 4-4m-4 4-4-4M4 20h16"
        stroke={colors.white}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function ScanResultScreen({ navigation }) {
  const { scanFlow, handleBackToDashboard } = useAppData();
  const hasResult = Boolean(scanFlow?.result);

  return (
    <AppShell
      breadcrumb="Dashboard"
      title="Scan Results"
      onBack={
        hasResult
          ? () => {
              handleBackToDashboard();
              navigation.navigate("Upload");
            }
          : undefined
      }
    >
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
    overallCategories = null,
    rightPct,
    wrongPct,
    scoreBreakdown = [],
    formatChecks = [],
    pageCount = 0,
    pagination = null,
    cloudinaryUrl = "",
    documentName = "",
    documentPreview = null,
    unitsChecked,
    unitsPassed,
    unitsFailed,
    issueTotals = null,
    scoringConsistency = null,
    scoringVersion = null,
  } = result;

  const [shownRight, shownWrong] = roundSharesToTotal([rightPct, wrongPct]);
  const criticalTypes = formatChecks.filter((c) => c.result === "FAIL").length;
  const warningTypes = formatChecks.filter((c) => c.result === "REVIEW").length;
  const issueTypes = formatChecks.length;

  const scannedDate = scannedAt
    ? new Date(scannedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: APP_TIME_ZONE,
      })
    : "—";

  const versionLabel = `v${scanFlow.versionNumber || 1}.0`;
  const hasPreview = Boolean(scanFlow.file || cloudinaryUrl || documentPreview);

  async function onDownload() {
    const report = await scanFlow.downloadReport();
    if (report?.summary) Alert.alert("Analysis report", report.summary);
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
      <View style={styles.hero}>
        <View style={styles.heroLinks}>
          <Pressable onPress={backToSummary} hitSlop={6}>
            <Text style={styles.heroBack}>← Back to summary</Text>
          </Pressable>
          <Pressable onPress={openReferenceTracing} hitSlop={6}>
            <Text style={styles.heroTrace}>Open reference tracing</Text>
          </Pressable>
        </View>
        <Text style={styles.scope}>SCOPE: FORMATTING ONLY</Text>
        <Text style={styles.heroTitle}>{documentTitle}</Text>
        {campus || college ? (
          <Text style={styles.heroSub}>{[college, campus].filter(Boolean).join(" · ")}</Text>
        ) : null}
        <View style={styles.metaTable}>
          <View style={styles.metaRow}>
            <Text style={styles.metaKey}>Scanned</Text>
            <Text style={styles.metaValue}>{scannedDate}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaKey}>Version</Text>
            <Text style={styles.metaVersion}>{versionLabel}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaKey}>Citation style</Text>
            <Text style={styles.metaValue}>{citationStyle}</Text>
          </View>
        </View>
        <Text style={styles.heroNote}>
          Structure and content are not evaluated — results reflect formatting compliance only.
        </Text>
      </View>

      <View style={{ gap: 12 }}>
        <View style={[styles.dualCard, styles.dualRight]}>
          <Text style={[styles.dualLabel, { color: "#047857" }]}>Right (passed units)</Text>
          <Text style={[styles.dualValue, { color: "#047857" }]}>{formatPct(shownRight)}</Text>
          {hasValue(unitsPassed) && hasValue(unitsChecked) ? (
            <Text style={[styles.dualSub, { color: "rgba(4,120,87,0.8)" }]}>
              {formatCount(unitsPassed)} of {formatCount(unitsChecked)} {plural(unitsChecked, "unit")}
            </Text>
          ) : null}
        </View>
        <View style={[styles.dualCard, styles.dualWrong]}>
          <Text style={[styles.dualLabel, { color: "#be123c" }]}>Wrong (failed units)</Text>
          <Text style={[styles.dualValue, { color: "#be123c" }]}>{formatPct(shownWrong)}</Text>
          {hasValue(unitsFailed) && hasValue(unitsChecked) ? (
            <Text style={[styles.dualSub, { color: "rgba(190,18,60,0.8)" }]}>
              {formatCount(unitsFailed)} of {formatCount(unitsChecked)} {plural(unitsChecked, "unit")}
            </Text>
          ) : null}
        </View>
        {hasValue(unitsChecked) ? (
          <Text style={styles.unitsNote}>
            {Number(unitsChecked) === 0
              ? "No formatting unit could be measured in this document."
              : `Based on ${formatCount(unitsChecked)} measured formatting ${plural(unitsChecked, "unit")}`}
            {issueTotals
              ? ` · ${formatCount(issueTotals.occurrences)} ${plural(issueTotals.occurrences, "issue")} found (one failed unit can break more than one rule)`
              : ""}
          </Text>
        ) : null}
        {scoringConsistency && !scoringConsistency.ok ? (
          <Text style={styles.consistencyWarn} accessibilityRole="alert">
            These results failed an internal consistency check. Re-run the analysis before relying on them.
          </Text>
        ) : null}
        {!scoringVersion ? (
          <Text style={styles.unitsNote}>
            This scan was saved without the full scoring breakdown. Re-analyse the manuscript to generate
            checked, passed, and failed unit counts. Stored scores are shown as saved.
          </Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardKicker}>Overall Score</Text>
        <CircularScore
          score={overallScore}
          categoryCount={Array.isArray(overallCategories) ? overallCategories.length : null}
        />
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeadRow}>
          <Text style={styles.cardKicker}>Score Breakdown</Text>
          <Text style={styles.cardAside}>Passed units ÷ checked units</Text>
        </View>
        <View style={{ marginTop: 20, gap: 16 }}>
          {scoreBreakdown.map((item) => (
            <ScoreBar
              key={item.metric || item.section}
              metric={item.metric || item.section}
              score={item.score}
              status={item.status}
              unitsChecked={item.unitsChecked}
              unitsFailed={item.unitsFailed}
              issueCount={item.issueCount}
            />
          ))}
        </View>
        <View style={styles.legend}>
          <LegendDot color="#10b981" label="Good (≥80%)" />
          <LegendDot color="#fbbf24" label="Needs review (50–79%)" />
          <LegendDot color="#f43f5e" label="Critical (<50%)" />
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardKicker}>Scan Summary</Text>
        <View style={styles.statGrid}>
          <View style={[styles.stat, { backgroundColor: "#fff1f2" }]}>
            <Text style={[styles.statNum, { color: "#e11d48" }]}>{criticalTypes}</Text>
            <Text style={[styles.statLabel, { color: "#f43f5e" }]}>Errors</Text>
          </View>
          <View style={[styles.stat, { backgroundColor: "#fffbeb" }]}>
            <Text style={[styles.statNum, { color: "#d97706" }]}>{warningTypes}</Text>
            <Text style={[styles.statLabel, { color: "#f59e0b" }]}>Warnings</Text>
          </View>
          <View style={[styles.stat, { backgroundColor: "#f8fafc" }]}>
            <Text style={[styles.statNum, { color: "#334155" }]}>{issueTypes}</Text>
            <Text style={[styles.statLabel, { color: "#64748b" }]}>Issue types</Text>
          </View>
        </View>
        <Text style={styles.statNote}>
          Errors are critical issue types; warnings are moderate or minor issue types.
        </Text>
        <View style={styles.tagRow}>
          {hasValue(unitsPassed) ? (
            <Text style={[styles.tag, styles.tagPass]}>
              {formatCount(unitsPassed)} {plural(unitsPassed, "unit")} passed
            </Text>
          ) : null}
          <Text style={styles.tag}>{citationStyle}</Text>
          <Text style={styles.tag}>Format only</Text>
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
            pressed && { backgroundColor: "#243049" },
            scanFlow.downloadBusy && { opacity: 0.5 },
          ]}
        >
          <DownloadIcon />
          <Text style={styles.downloadText}>
            {scanFlow.downloadBusy ? "Generating PDF…" : `Download full report · ${versionLabel}`}
          </Text>
        </Pressable>
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
          <View style={{ flex: 1, minWidth: 200 }}>
            <Text style={styles.issuesTitle}>Issues detected</Text>
            <Text style={styles.issuesSub}>
              Grouped by page with explanations and fix suggestions. Each page starts at line 1.
            </Text>
          </View>
          {issueTypes > 0 ? (
            <Text style={styles.issuesBadge}>
              {issueTypes} issue type{issueTypes === 1 ? "" : "s"}
            </Text>
          ) : null}
        </View>
        <IssuesDetectedPanel formatChecks={formatChecks} pageCount={pageCount} pagination={pagination} />
      </View>

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
  scroll: { padding: 16, paddingBottom: 40, gap: 20 },
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
  hero: { borderRadius: 12, backgroundColor: "#172033", padding: 20 },
  heroLinks: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginBottom: 8 },
  heroBack: { fontSize: 11, fontWeight: "600", color: colors.accent },
  heroTrace: { fontSize: 11, fontWeight: "600", color: "#cbd5e1" },
  scope: {
    alignSelf: "flex-start",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(22,191,168,0.4)",
    backgroundColor: "rgba(22,191,168,0.1)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 3,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: colors.accent,
  },
  heroTitle: { marginTop: 8, fontSize: 20, lineHeight: 26, fontWeight: "700", color: colors.white },
  heroSub: { marginTop: 4, fontSize: 14, color: "#94a3b8" },
  metaTable: { marginTop: 16, gap: 4 },
  metaRow: { flexDirection: "row" },
  metaKey: { width: 96, fontSize: 12, color: "#64748b" },
  metaValue: { flex: 1, fontSize: 12, fontWeight: "500", color: "#e2e8f0" },
  metaVersion: { flex: 1, fontSize: 12, color: "#94a3b8" },
  heroNote: { marginTop: 16, fontSize: 12, lineHeight: 17, color: "#64748b" },
  dualCard: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    alignItems: "center",
  },
  dualRight: { backgroundColor: "rgba(236,253,245,0.8)", borderColor: "#a7f3d0" },
  dualWrong: { backgroundColor: "rgba(255,241,242,0.8)", borderColor: "#fecdd3" },
  dualLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  dualValue: { marginTop: 4, fontSize: 30, fontWeight: "800" },
  unitsNote: { fontSize: 11, lineHeight: 16, color: "#64748b", textAlign: "center" },
  dualSub: { marginTop: 2, fontSize: 11 },
  consistencyWarn: {
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
  barIssues: { fontSize: 10, color: "#94a3b8" },
  statNote: { marginTop: 8, fontSize: 10, lineHeight: 14, color: "#94a3b8" },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    padding: 20,
    shadowColor: "#0f172a",
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  cardHeadRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12 },
  cardKicker: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.8,
    textTransform: "uppercase",
    color: "#94a3b8",
  },
  cardAside: { fontSize: 10, fontWeight: "500", color: "#94a3b8" },
  circleWrap: { alignItems: "center", gap: 16, paddingVertical: 16 },
  circleCenter: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  circleValue: { fontSize: 30, fontWeight: "800", color: "#1e293b" },
  circleOutOf: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    color: "#94a3b8",
  },
  bandPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 6 },
  bandText: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8 },
  circleHint: { fontSize: 12, color: "#94a3b8", textAlign: "center" },
  barBlock: { gap: 6 },
  barHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  barLabel: { flex: 1, fontSize: 12, fontWeight: "500", color: "#475569" },
  barMeta: { fontWeight: "400", color: "#94a3b8" },
  barPass: { fontWeight: "400", color: "#059669" },
  barScore: { fontSize: 12, fontWeight: "700" },
  barTrack: { height: 8, borderRadius: 999, backgroundColor: "#f1f5f9", overflow: "hidden" },
  barFill: { height: 8, borderRadius: 999 },
  legend: { marginTop: 20, flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 10, color: "#94a3b8" },
  statGrid: { marginTop: 16, flexDirection: "row", gap: 8 },
  stat: { flex: 1, borderRadius: 8, padding: 12, alignItems: "center" },
  statNum: { fontSize: 24, fontWeight: "800" },
  statLabel: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  tagRow: { marginTop: 16, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#f8fafc",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: "500",
    color: "#475569",
  },
  tagPass: { borderColor: "#a7f3d0", backgroundColor: "#ecfdf5", color: "#047857" },
  downloadError: { marginTop: 12, fontSize: 12, color: "#f43f5e" },
  downloadBtn: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    backgroundColor: "#172033",
    paddingVertical: 12,
  },
  downloadText: { fontSize: 12, fontWeight: "700", color: colors.white },
  previewCard: {
    overflow: "hidden",
    borderRadius: 12,
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
    paddingHorizontal: 20,
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
  issuesHead: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 12,
  },
  issuesTitle: { fontSize: 14, fontWeight: "700", color: "#1e293b" },
  issuesSub: { marginTop: 2, fontSize: 12, lineHeight: 17, color: "#94a3b8" },
  issuesBadge: {
    overflow: "hidden",
    backgroundColor: "#ffe4e6",
    color: "#be123c",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: "700",
  },
  footerRow: { flexDirection: "row", justifyContent: "flex-end", paddingBottom: 8 },
  newVersionBtn: {
    borderRadius: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 24,
    paddingVertical: 11,
  },
  newVersionText: { fontSize: 12, fontWeight: "700", color: colors.white },
});
