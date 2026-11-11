import { useCallback, useEffect, useRef } from "react";
import { Alert, BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Svg, { Circle, Path } from "react-native-svg";
import { useAppData } from "../context/AppDataContext";
import { colors } from "../theme";
import AppShell from "../components/shell/AppShell";
import IssueTracingSection from "../components/cockpit/IssueTracingSection";
import {
  categoryForIssue,
  normalizeDetectedIssues,
} from "../components/cockpit/IssuesDetectedPanel";
import { PaperPilotMark } from "../components/shell/PaperPilotLogo";
import PrimaryButton from "../components/ui/PrimaryButton";
import { useFonts, Quicksand_700Bold, Quicksand_600SemiBold } from "@expo-google-fonts/quicksand";
import { getScanDocument } from "../api";
import { isServerId } from "../lib/scanMapper";
import {
  CATEGORY_STATUS_LABEL,
  compliancePercentFromUnits,
  formatCategoryIssuesDetail,
  formatCount,
  formatPct,
  formatScore,
  hasValue,
  reconcileDisplayedUnits,
  resolveCategoryUnitDisplays,
  roundSharesToTotal,
} from "../lib/scoreFormat";
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

function CategoryScoreCard({
  metric,
  score,
  status,
  displayTotal,
  displayNonCompliant,
  displayIssueCount,
  displayScore,
}) {
  // Ring % and subtitle use the same issue count: (total − issues) / total.
  const issueCount = hasValue(displayIssueCount) ? displayIssueCount : displayNonCompliant;
  const fromShown = compliancePercentFromUnits(displayTotal, issueCount);
  const pct =
    fromShown != null
      ? fromShown
      : hasValue(displayScore)
        ? Number(displayScore)
        : hasValue(score)
          ? Number(score)
          : null;
  const evaluated = hasValue(pct);
  const safe = evaluated ? Math.max(0, Math.min(100, Number(pct))) : 0;
  const name = String(metric || "Category").trim() || "Category";
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (safe / 100) * circumference;
  const stroke = ringStroke(evaluated ? safe : null);
  const detail = formatCategoryIssuesDetail(issueCount, displayTotal)
    || (evaluated ? null : CATEGORY_STATUS_LABEL[status] || "Not evaluated")
    || (evaluated ? "0 issues found on 0 total units checked" : "Not evaluated");

  return (
    <View style={styles.catCard}>
      <View style={styles.catRingWrap}>
        <Svg width={56} height={56} viewBox="0 0 56 56" style={{ transform: [{ rotate: "-90deg" }] }}>
          <Circle cx={28} cy={28} r={radius} fill="none" stroke="#e2e8f0" strokeWidth={5} />
          <Circle
            cx={28}
            cy={28}
            r={radius}
            fill="none"
            stroke={stroke}
            strokeWidth={5}
            strokeLinecap="round"
            strokeDasharray={`${circumference}`}
            strokeDashoffset={evaluated ? offset : circumference}
          />
        </Svg>
        <View style={styles.catRingCenter} pointerEvents="none">
          <Text
            style={[styles.catRingValue, { color: evaluated ? stroke : "#94a3b8" }]}
            numberOfLines={1}
          >
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
  const scrollRef = useRef(null);
  const tracingY = useRef(0);
  const [fontsLoaded] = useFonts({ Quicksand_700Bold, Quicksand_600SemiBold });
  const backfillRef = useRef("");

  // Mirror web: hard-refresh / empty Results is not a sticky destination — send authors home.
  useEffect(() => {
    if (result) return undefined;
    const t = setTimeout(() => navigation.navigate("Library"), 0);
    return () => clearTimeout(t);
  }, [result, navigation]);

  // Same URL backfill as My Manuscripts → full results (openSavedResult), so post-analyse
  // Issue Tracing & XAI can use the working cloudinaryUrl path when the upload file is cleared.
  useEffect(() => {
    const scanId = String(result?.scanId || "").trim();
    const hasUrl = Boolean(String(result?.cloudinaryUrl || "").trim());
    if (!scanId || hasUrl || !isServerId(scanId) || backfillRef.current === scanId) return undefined;
    backfillRef.current = scanId;
    let cancelled = false;
    const documentName = result?.documentName || "";
    scanFlow.setDocumentLoading?.(true);
    void getScanDocument(scanId)
      .then((doc) => {
        if (cancelled) return;
        const url = String(doc?.cloudinary_url || "").trim();
        if (!url) return;
        scanFlow.patchResult?.({
          cloudinaryUrl: url,
          documentName: documentName || doc?.source_filename || "",
        });
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) scanFlow.setDocumentLoading?.(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result?.scanId, result?.cloudinaryUrl, result?.documentName]);

  const focusPreview = useCallback(() => {
    scrollRef.current?.scrollTo({ y: Math.max(0, tracingY.current - 8), animated: true });
  }, []);

  if (!result) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyTitle}>No compliance result yet</Text>
        <Text style={styles.emptyBody}>
          Open a manuscript version or run Analyse from Upload. Returning to My Manuscripts…
        </Text>
        <PrimaryButton
          title="My Manuscripts"
          onPress={() => navigation.navigate("Library")}
          style={{ marginTop: 18, minWidth: 160 }}
        />
        <PrimaryButton
          title="Go to Upload"
          onPress={() => navigation.navigate("Upload")}
          style={{ marginTop: 10, minWidth: 160, backgroundColor: colors.sidebar }}
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
    unitsChecked,
    unitsPassed,
    unitsFailed,
    scoringConsistency = null,
  } = result;
  const categoryDisplays = resolveCategoryUnitDisplays(scoreBreakdown);
  // Same expansion as Issue Tracing — cards, rings, and header all use these counts.
  const tracedEntries = normalizeDetectedIssues(formatChecks, pageCount || 0).entries;
  const tracedByCategory = {};
  tracedEntries.forEach((entry) => {
    const key = entry.category || categoryForIssue(entry) || "Other";
    tracedByCategory[key] = (tracedByCategory[key] || 0) + 1;
  });
  const categoryCards = categoryDisplays.map((row) => {
    const name = String(row.metric || row.section || "").trim();
    const traced = name ? tracedByCategory[name] : null;
    const displayIssueCount = hasValue(traced)
      ? traced
      : hasValue(row.displayIssueCount)
        ? row.displayIssueCount
        : row.displayNonCompliant;
    const total = row.displayTotal;
    const displayNonCompliant = hasValue(total) && hasValue(displayIssueCount)
      ? Math.min(Math.max(0, Number(total)), Math.max(0, Number(displayIssueCount)))
      : row.displayNonCompliant;
    const displayCompliant = hasValue(total) && hasValue(displayNonCompliant)
      ? Math.max(0, Number(total) - Number(displayNonCompliant))
      : row.displayCompliant;
    const displayScore = compliancePercentFromUnits(total, displayNonCompliant);
    return {
      ...row,
      displayIssueCount,
      displayNonCompliant,
      displayCompliant,
      displayScore: displayScore != null ? displayScore : row.displayScore,
    };
  });
  // Header totals = sum of category cards so they always match what the user adds up.
  const {
    total: totalUnits,
    compliant: compliantUnits,
    nonCompliant: nonCompliantUnits,
  } = reconcileDisplayedUnits(
    { unitsChecked, unitsPassed, unitsFailed },
    categoryCards,
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
  const evaluatedCards = categoryCards.filter(
    (row) => hasValue(row.displayTotal) && Number(row.displayTotal) > 0 && hasValue(row.displayScore),
  );
  const overallFromCards = evaluatedCards.length
    ? evaluatedCards.reduce((sum, row) => sum + Number(row.displayScore), 0) / evaluatedCards.length
    : overallScore;
  const overallBand = scoreBand(overallFromCards);
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

  const scannedLabel = formatReportDate(scannedAt);
  const generatedLabel = formatReportDate(new Date().toISOString());
  const versionLabel = `v${scanFlow.versionNumber || 1}.0`;
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

  const placeLine = [college, campus].filter(Boolean).join(" · ");

  return (
    <ScrollView ref={scrollRef} style={styles.root} contentContainerStyle={styles.scroll}>
      <View style={styles.brandRow}>
        <View style={styles.brandLockup}>
          <PaperPilotMark size={28} />
          <Text
            style={[
              styles.brandWord,
              fontsLoaded && { fontFamily: "Quicksand_700Bold", fontWeight: undefined },
            ]}
          >
            PAPERPILOT
          </Text>
          <Text
            style={[
              styles.resultsEyebrow,
              fontsLoaded && { fontFamily: "Quicksand_600SemiBold", fontWeight: undefined },
            ]}
          >
            * RESULTS
          </Text>
        </View>
        <Pressable
          onPress={onDownload}
          disabled={scanFlow.downloadBusy}
          style={({ pressed }) => [
            styles.downloadBtnTop,
            pressed && { backgroundColor: "#12ae99" },
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

      <View style={styles.metaStrip}>
        <View style={styles.metaRow}>
          <View style={styles.metaCell}>
            <Text style={styles.metaKey}>Document</Text>
            <Text style={styles.metaValue} numberOfLines={1}>
              {documentTitle}
            </Text>
            {placeLine ? (
              <Text style={styles.metaSub} numberOfLines={1}>
                {placeLine}
              </Text>
            ) : null}
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaKey}>Citation style</Text>
            <Text style={styles.metaValue} numberOfLines={1}>
              {citationStyle} · {versionLabel}
            </Text>
          </View>
        </View>
        <View style={styles.metaRow}>
          <View style={styles.metaCell}>
            <Text style={styles.metaKey}>Scanned</Text>
            <Text style={styles.metaValue} numberOfLines={1}>
              {scannedLabel}
            </Text>
          </View>
          <View style={styles.metaCell}>
            <Text style={styles.metaKey}>Generated</Text>
            <Text style={styles.metaValue} numberOfLines={1}>
              {generatedLabel}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardKicker}>Overall compliance score</Text>
        <View style={styles.overallScoreLine}>
          <Text style={[styles.overallScoreValue, { color: overallBand.text }]}>
            {formatScore(overallFromCards, 0)}
          </Text>
          {hasValue(overallFromCards) ? (
            <Text style={[styles.overallScorePct, { color: overallBand.text }]}>%</Text>
          ) : null}
        </View>
        <View
          style={[
            styles.bandPill,
            {
              alignSelf: "flex-start",
              marginTop: 8,
              backgroundColor: overallBand.bg,
              borderColor: overallBand.border,
            },
          ]}
        >
          <Text style={[styles.bandText, { color: overallBand.text }]}>{overallBand.label}</Text>
        </View>

        <View style={[styles.dualRow, { marginTop: 14 }]}>
          <Text style={[styles.dualLabel, { color: "#157347" }]}>Compliant</Text>
          <Text style={[styles.dualLabel, { color: "#B02A37" }]}>Non-Compliant</Text>
        </View>
        <View style={styles.shareBar}>
          {hasValue(shownRight) || hasValue(shownWrong) ? (
            <>
              <View style={[styles.shareSeg, { flex: compliantShare || 0.0001, backgroundColor: "#157347" }]} />
              <View style={[styles.shareSeg, { flex: nonCompliantShare || 0.0001, backgroundColor: "#B02A37" }]} />
            </>
          ) : null}
        </View>

        <View style={[styles.statGrid, { marginTop: 12 }]}>
          <View style={[styles.stat, styles.statBordered]}>
            <Text style={[styles.statNum, { color: "#1e293b" }]}>{formatCount(totalUnits)}</Text>
            <Text style={[styles.statLabel, { color: "#64748b" }]}>Total Units</Text>
          </View>
          <View style={[styles.stat, styles.statBordered]}>
            <Text style={[styles.statNum, { color: "#157347" }]}>{formatCount(compliantUnits)}</Text>
            <Text style={[styles.statLabel, { color: "#64748b" }]}>Compliant Units</Text>
          </View>
          <View style={[styles.stat, styles.statBordered]}>
            <Text style={[styles.statNum, { color: "#B02A37" }]}>{formatCount(nonCompliantUnits)}</Text>
            <Text style={[styles.statLabel, { color: "#64748b" }]}>Non-Compliant Units</Text>
          </View>
        </View>

        {scoringConsistency && !scoringConsistency.ok ? (
          <Text style={styles.consistencyWarn} accessibilityRole="alert">
            These results failed an internal consistency check. Re-run the analysis before relying on
            them.
          </Text>
        ) : null}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardKicker}>Score Breakdown</Text>
        <View style={styles.catGrid}>
          {categoryCards.map((item) => (
            <CategoryScoreCard
              key={item.metric || item.section}
              metric={item.metric || item.section}
              score={item.displayScore ?? item.score}
              status={item.status}
              displayTotal={item.displayTotal}
              displayNonCompliant={item.displayNonCompliant}
              displayIssueCount={item.displayIssueCount}
              displayScore={item.displayScore}
            />
          ))}
        </View>
      </View>

      <View onLayout={(e) => (tracingY.current = e.nativeEvent.layout.y)}>
        <IssueTracingSection
          result={result}
          file={scanFlow.file}
          documentLoading={Boolean(scanFlow.documentLoading)}
          onFocusPreview={focusPreview}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.pageBg },
  scroll: { padding: 12, paddingBottom: 32, gap: 12 },
  emptyWrap: {
    flex: 1,
    backgroundColor: colors.pageBg,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  emptyBody: {
    marginTop: 6,
    fontSize: 13,
    lineHeight: 18,
    color: colors.muted,
    textAlign: "center",
  },
  downloadBtnTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#bfeee5",
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 36,
  },
  downloadTextTop: { fontSize: 11, fontWeight: "700", color: colors.white },
  dualRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  dualLabel: { fontSize: 12, fontWeight: "700" },
  shareBar: {
    height: 5,
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
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 11,
    lineHeight: 15,
    color: "#92400e",
    textAlign: "center",
  },
  catGrid: { marginTop: 10, gap: 8 },
  catCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f4f6f8",
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  catRingWrap: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  catRingCenter: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  catRingValue: {
    fontSize: 10,
    fontWeight: "800",
    lineHeight: 12,
    textAlign: "center",
    includeFontPadding: false,
    fontVariant: ["tabular-nums"],
  },
  catCopy: { flex: 1, minWidth: 0 },
  catTitle: { fontSize: 13, fontWeight: "700", color: "#1e293b" },
  catDetail: { marginTop: 2, fontSize: 10, lineHeight: 14, color: "#64748b" },
  brandRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  brandLockup: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  brandWord: {
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 1,
    color: "#225b5f",
  },
  resultsEyebrow: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
    color: "#4a5568",
  },
  metaStrip: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  metaRow: { flexDirection: "row", gap: 12 },
  metaCell: { flex: 1, minWidth: 0 },
  metaKey: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: "#94a3b8",
  },
  metaValue: { marginTop: 3, fontSize: 13, fontWeight: "700", color: "#0f172a" },
  metaSub: { marginTop: 1, fontSize: 11, color: colors.slate },
  overallScoreLine: { flexDirection: "row", alignItems: "flex-end", gap: 2 },
  overallScoreValue: {
    fontSize: 36,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    lineHeight: 40,
  },
  overallScorePct: {
    fontSize: 18,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    paddingBottom: 4,
  },
  statBordered: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    padding: 14,
    shadowColor: "#0f172a",
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  cardKicker: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: "#94a3b8",
  },
  bandPill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  bandText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.6 },
  statGrid: { marginTop: 12, flexDirection: "row", gap: 6 },
  stat: { flex: 1, borderRadius: 8, padding: 8, alignItems: "center" },
  statNum: { fontSize: 16, fontWeight: "800" },
  statLabel: {
    marginTop: 2,
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    textAlign: "center",
  },
  downloadError: { marginTop: 8, fontSize: 11, color: "#f43f5e" },
});
