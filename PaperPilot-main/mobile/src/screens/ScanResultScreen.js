import { useCallback, useEffect, useState } from "react";
import { Alert, BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Svg, { Circle, Path } from "react-native-svg";
import { useAppData } from "../context/AppDataContext";
import { colors } from "../theme";
import AppShell from "../components/shell/AppShell";
import IssuesDetectedPanel, { normalizeDetectedIssues } from "../components/cockpit/IssuesDetectedPanel";
import TraceDocumentViewer from "../components/cockpit/TraceDocumentViewer";
import PrimaryButton from "../components/ui/PrimaryButton";
import {
  CATEGORY_STATUS_LABEL,
  compliancePercentFromUnits,
  formatCategoryIssuesDetail,
  formatCount,
  formatPct,
  hasValue,
  plural,
  reconcileDisplayedUnits,
  resolveCategoryUnitDisplays,
  roundSharesToTotal,
} from "../lib/scoreFormat";
import { isApproximateTracing } from "../lib/documentPreviewLocate";
import { APP_TIME_ZONE } from "../lib/timeZone";

function scoreBand(score) {
  if (!hasValue(score))
    return { label: "NOT EVALUATED", text: "#64748b", ring: "#cbd5e1", border: "#e2e8f0", bg: "#f8fafc" };
  if (score >= 80)
    return { label: "GOOD STANDING", text: "#059669", ring: "#16bfa8", border: "#a7f3d0", bg: "#ecfdf5" };
  if (score >= 50)
    return { label: "UNDER REVIEW", text: "#d97706", ring: "#f59e0b", border: "#fde68a", bg: "#fffbeb" };
  return { label: "ATTENTION REQUIRED", text: "#e11d48", ring: "#ef4444", border: "#fecdd3", bg: "#fff1f2" };
}

function ringStroke(score) {
  if (!hasValue(score)) return "#cbd5e1";
  if (score >= 80) return "#157347";
  if (score >= 50) return "#B57200";
  return "#B02A37";
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
          {evaluated ? <Text style={styles.circleOutOf}>%</Text> : null}
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

function CategoryScoreCard({ metric, score, status, displayTotal, displayNonCompliant, displayScore }) {
  const fromUnits = compliancePercentFromUnits(displayTotal, displayNonCompliant);
  const pct =
    fromUnits != null
      ? fromUnits
      : hasValue(displayScore)
        ? Number(displayScore)
        : hasValue(score)
          ? Number(score)
          : null;
  const evaluated = hasValue(pct);
  const safe = evaluated ? Math.max(0, Math.min(100, Number(pct))) : 0;
  const name = String(metric || "Category").trim() || "Category";
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (safe / 100) * circumference;
  const stroke = ringStroke(evaluated ? safe : null);
  const detail = formatCategoryIssuesDetail(displayNonCompliant, displayTotal)
    || (evaluated ? null : CATEGORY_STATUS_LABEL[status] || "Not evaluated")
    || (evaluated ? "0 issues found on 0 total units checked" : "Not evaluated");

  return (
    <View style={styles.catCard}>
      <View style={styles.catRingWrap}>
        <Svg width={64} height={64} viewBox="0 0 64 64" style={{ transform: [{ rotate: "-90deg" }] }}>
          <Circle cx={32} cy={32} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={5.5} />
          <Circle
            cx={32}
            cy={32}
            r={radius}
            fill="none"
            stroke={stroke}
            strokeWidth={5.5}
            strokeLinecap="round"
            strokeDasharray={`${circumference}`}
            strokeDashoffset={evaluated ? offset : circumference}
          />
        </Svg>
        <View style={styles.catRingCenter}>
          <Text style={[styles.catRingValue, { color: evaluated ? stroke : "#94a3b8", fontSize: 11 }]}>
            {evaluated ? formatPct(safe, 2) : "—"}
          </Text>
        </View>
      </View>
      <View style={styles.catCopy}>
        <Text style={styles.catTitle} numberOfLines={1}>
          {name}
        </Text>
        <Text style={styles.catDetail}>{detail}</Text>
      </View>
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

  const goBack = useCallback(() => {
    handleBackToDashboard();
    navigation.navigate("Library");
  }, [handleBackToDashboard, navigation]);

  // Android back would otherwise land on Upload while the scan is still on "results" (a blank page).
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
    <AppShell
      active="results"
      breadcrumb="Dashboard"
      title="Scan Results"
      onBack={hasResult ? goBack : undefined}
    >
      <ScanResultBody navigation={navigation} />
    </AppShell>
  );
}

function ScanResultBody({ navigation }) {
  const { scanFlow } = useAppData();
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
    scoringConsistency = null,
  } = result;

  const issueTypes = formatChecks.filter((c) => c.result === "FAIL" || c.result === "REVIEW").length;
  const categoryDisplays = resolveCategoryUnitDisplays(scoreBreakdown);
  // Header totals = sum of category cards so they always match what the user adds up.
  const {
    total: totalUnits,
    compliant: compliantUnits,
    nonCompliant: nonCompliantUnits,
  } = reconcileDisplayedUnits(
    { unitsChecked, unitsPassed, unitsFailed },
    categoryDisplays,
  );
  // Bar shares only — percent numbers are not shown in the public results UI.
  const fromOverallUnits =
    hasValue(totalUnits) && totalUnits > 0 && hasValue(nonCompliantUnits)
      ? [
          compliancePercentFromUnits(totalUnits, nonCompliantUnits),
          (Number(nonCompliantUnits) / Number(totalUnits)) * 100,
        ]
      : [rightPct, wrongPct];
  const [shownRight, shownWrong] = roundSharesToTotal(fromOverallUnits, 2);
  const compliantShare = hasValue(shownRight) ? Math.max(0, Math.min(100, Number(shownRight))) : 0;
  const nonCompliantShare = hasValue(shownWrong) ? Math.max(0, Math.min(100, Number(shownWrong))) : 0;
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
    if (report?.shared) {
      // Share sheet already presented the PDF (same report as web).
      return;
    }
    if (scanFlow.downloadError) {
      Alert.alert("Download failed", scanFlow.downloadError);
      return;
    }
    if (report?.summary) Alert.alert("Analysis report", report.summary);
  }

  function openReferenceTracing() {
    // Open the tracer without jumping to a location — user picks an issue first.
    scanFlow.openDocumentTrace(null);
    navigation.navigate("DocumentReference");
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll}>
      <View style={styles.hero}>
        <View style={styles.heroTopRow}>
          <View style={styles.heroLinks}>
            <Pressable onPress={openReferenceTracing} hitSlop={6}>
              <Text style={styles.heroTrace}>Open reference tracing</Text>
            </Pressable>
          </View>
          <Pressable
            onPress={onDownload}
            disabled={scanFlow.downloadBusy}
            style={({ pressed }) => [
              styles.downloadBtnTop,
              pressed && { backgroundColor: "#f1f5f9" },
              scanFlow.downloadBusy && { opacity: 0.5 },
            ]}
          >
            <DownloadIcon />
            <Text style={styles.downloadTextTop}>
              {scanFlow.downloadBusy ? "Generating PDF…" : `Download · ${versionLabel}`}
            </Text>
          </Pressable>
        </View>
        {scanFlow.downloadError ? (
          <Text style={styles.downloadError} accessibilityRole="alert">
            {scanFlow.downloadError}
          </Text>
        ) : null}
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
        <View style={styles.dualRow}>
          <Text style={[styles.dualLabel, { color: "#047857" }]}>Compliant</Text>
          <Text style={[styles.dualLabel, { color: "#be123c" }]}>Non-Compliant</Text>
        </View>
        <View style={styles.shareBar}>
          {hasValue(shownRight) || hasValue(shownWrong) ? (
            <>
              <View style={[styles.shareSeg, { flex: compliantShare || 0.0001, backgroundColor: "#047857" }]} />
              <View style={[styles.shareSeg, { flex: nonCompliantShare || 0.0001, backgroundColor: "#be123c" }]} />
            </>
          ) : null}
        </View>
        {scoringConsistency && !scoringConsistency.ok ? (
          <Text style={styles.consistencyWarn} accessibilityRole="alert">
            These results failed an internal consistency check. Re-run the analysis before relying on
            them.
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
        <Text style={styles.cardKicker}>Score Breakdown</Text>
        <View style={styles.catGrid}>
          {categoryDisplays.map((item) => (
            <CategoryScoreCard
              key={item.metric || item.section}
              metric={item.metric || item.section}
              score={item.displayScore ?? item.score}
              status={item.status}
              displayTotal={item.displayTotal}
              displayNonCompliant={item.displayNonCompliant}
              displayScore={item.displayScore}
            />
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardKicker}>Scan Summary</Text>
        <View style={styles.statGrid}>
          <View style={[styles.stat, { backgroundColor: "#f8fafc" }]}>
            <Text style={[styles.statNum, { color: "#334155" }]}>{formatCount(totalUnits)}</Text>
            <Text style={[styles.statLabel, { color: "#64748b" }]}>Total Units</Text>
          </View>
          <View style={[styles.stat, { backgroundColor: "#ecfdf5" }]}>
            <Text style={[styles.statNum, { color: "#059669" }]}>{formatCount(compliantUnits)}</Text>
            <Text style={[styles.statLabel, { color: "#10b981" }]}>Compliant Units</Text>
          </View>
          <View style={[styles.stat, { backgroundColor: "#fff1f2" }]}>
            <Text style={[styles.statNum, { color: "#e11d48" }]}>{formatCount(nonCompliantUnits)}</Text>
            <Text style={[styles.statLabel, { color: "#f43f5e" }]}>Non-Compliant Units</Text>
          </View>
        </View>
        <Text style={styles.statNote}>
          Compliant Units + Non-Compliant Units equals Total Units checked.
        </Text>
        <View style={styles.tagRow}>
          <Text style={styles.tag}>{citationStyle}</Text>
          <Text style={styles.tag}>Format only</Text>
        </View>
      </View>

      <View style={styles.previewCard}>
        <View style={styles.previewHead}>
          <View style={{ flex: 1, minWidth: 180 }}>
            <Text style={styles.previewTitle}>Document preview</Text>
            <Text style={styles.previewSub}>
              Starts on page 1. Scroll to read every page, or trace an issue to jump to it.
            </Text>
            {isApproximateTracing(pagination) ? (
              <Text style={styles.approxNote}>
                Approximate locations — this Word file was scanned without exact page breaks.
                Highlights may be near the issue. For precise tracing, upload a PDF of the same
                manuscript.
              </Text>
            ) : null}
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
  heroTopRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 8,
  },
  heroLinks: { flexDirection: "row", flexWrap: "wrap", gap: 14 },
  heroTrace: { fontSize: 11, fontWeight: "600", color: "#cbd5e1" },
  downloadBtnTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(148,163,184,0.45)",
    backgroundColor: "rgba(255,255,255,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  downloadTextTop: { fontSize: 11, fontWeight: "700", color: "#e2e8f0" },
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
  dualRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dualLabel: { fontSize: 13, fontWeight: "700" },
  shareBar: {
    height: 6,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "#eeeeee",
    flexDirection: "row",
  },
  shareSeg: { height: "100%" },
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
  catGrid: { marginTop: 16, gap: 10 },
  catCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f4f6f8",
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  catRingWrap: { width: 64, height: 64, alignItems: "center", justifyContent: "center" },
  catRingCenter: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  catRingValue: { fontSize: 12, fontWeight: "800" },
  catCopy: { flex: 1, minWidth: 0 },
  catTitle: { fontSize: 14, fontWeight: "700", color: "#1e293b" },
  catDetail: { marginTop: 2, fontSize: 11, lineHeight: 15, color: "#64748b" },
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
  approxNote: {
    marginTop: 8,
    fontSize: 11,
    lineHeight: 16,
    color: "#92400e",
    backgroundColor: "#fffbeb",
    borderWidth: 1,
    borderColor: "#fde68a",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
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
});
