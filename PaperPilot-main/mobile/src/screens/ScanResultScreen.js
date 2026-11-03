/**
 * ScanResultScreen — RN port of web ScanResultsScreen: report-style results with
 * brand lockup, meta strip, overall score + Compliant/Non-Compliant bar, breakdown,
 * and Issue tracing & XAI (preview + clickable findings in one section).
 */

import { useCallback, useEffect, useRef } from "react";
import { Alert, BackHandler, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import Svg, { Circle, Path } from "react-native-svg";
import { useFonts, Quicksand_600SemiBold, Quicksand_700Bold } from "@expo-google-fonts/quicksand";
import { useAppData } from "../context/AppDataContext";
import { colors } from "../theme";
import AppShell from "../components/shell/AppShell";
import { PaperPilotMark } from "../components/shell/PaperPilotLogo";
import IssueTracingSection from "../components/cockpit/IssueTracingSection";
import { categoryForIssue, normalizeDetectedIssues } from "../components/cockpit/IssuesDetectedPanel";
import PrimaryButton from "../components/ui/PrimaryButton";
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
    return {
      label: "NOT EVALUATED",
      textColor: "#64748b",
      badgeBorder: "#e2e8f0",
      badgeBg: "#f8fafc",
      scoreColor: "#64748b",
    };
  if (score >= 80)
    return {
      label: "GOOD STANDING",
      textColor: "#157347",
      badgeBorder: "#b7e4c7",
      badgeBg: "#eaf7ef",
      scoreColor: "#157347",
    };
  if (score >= 50)
    return {
      label: "UNDER REVIEW",
      textColor: "#B57200",
      badgeBorder: "#f0d9a0",
      badgeBg: "#fff8e8",
      scoreColor: "#B57200",
    };
  return {
    label: "ATTENTION REQUIRED",
    textColor: "#B02A37",
    badgeBorder: "#f0c2c7",
    badgeBg: "#fdf0f1",
    scoreColor: "#B02A37",
  };
}

function ringStroke(score) {
  if (!hasValue(score)) return "#cbd5e1";
  if (score >= 80) return "#157347";
  if (score >= 50) return "#B57200";
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
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (safe / 100) * circumference;
  const stroke = ringStroke(evaluated ? safe : null);
  const detail =
    formatCategoryIssuesDetail(issueCount, displayTotal) ||
    (evaluated ? null : CATEGORY_STATUS_LABEL[status] || "Not evaluated") ||
    (evaluated ? "0 issues found on 0 total units checked" : "Not evaluated");

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
          <Text style={[styles.catRingValue, { color: evaluated ? stroke : "#94a3b8" }]}>
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
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Path
        d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M7.5 12l4.5 4.5m0 0l4.5-4.5M12 16.5V3"
        stroke={colors.white}
        strokeWidth={2.5}
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
  const [fontsLoaded] = useFonts({ Quicksand_600SemiBold, Quicksand_700Bold });

  // Mirror web: hard-refresh / empty Results is not a sticky destination - send authors home.
  useEffect(() => {
    if (result) return undefined;
    const t = setTimeout(() => navigation.navigate("Library"), 0);
    return () => clearTimeout(t);
  }, [result, navigation]);

  // Stacked layout: selecting a finding brings the preview (top of the tracing section) into view.
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
    rightPct,
    wrongPct,
    scoreBreakdown = [],
    formatChecks = [],
    unitsChecked,
    unitsPassed,
    unitsFailed,
    scoringConsistency = null,
  } = result;

  const categoryDisplays = resolveCategoryUnitDisplays(scoreBreakdown);
  // Same expansion as Issue Tracing — cards, rings, and header all use these counts.
  const tracedEntries = normalizeDetectedIssues(formatChecks, result.pageCount || 0).entries;
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
    // Failed count for % must match the issues shown: (total − issues) / total.
    const displayNonCompliant =
      hasValue(total) && hasValue(displayIssueCount)
        ? Math.min(Math.max(0, Number(total)), Math.max(0, Number(displayIssueCount)))
        : row.displayNonCompliant;
    const displayCompliant =
      hasValue(total) && hasValue(displayNonCompliant)
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
  } = reconcileDisplayedUnits({ unitsChecked, unitsPassed, unitsFailed }, categoryCards);
  // Bar shares only — percent numbers are not shown in the public results UI.
  const fromOverallUnits =
    hasValue(totalUnits) && totalUnits > 0 && hasValue(nonCompliantUnits)
      ? [
          compliancePercentFromUnits(totalUnits, nonCompliantUnits),
          (Number(nonCompliantUnits) / Number(totalUnits)) * 100,
        ]
      : [rightPct, wrongPct];
  const [shownCompliant, shownNonCompliant] = roundSharesToTotal(fromOverallUnits, 2);
  const evaluatedCards = categoryCards.filter(
    (row) => hasValue(row.displayTotal) && Number(row.displayTotal) > 0 && hasValue(row.displayScore)
  );
  const overallFromCards = evaluatedCards.length
    ? evaluatedCards.reduce((sum, row) => sum + Number(row.displayScore), 0) / evaluatedCards.length
    : overallScore;
  const band = scoreBand(overallFromCards);
  const evaluated = hasValue(overallFromCards);
  const compliantShare = hasValue(shownCompliant)
    ? Math.max(0, Math.min(100, Number(shownCompliant)))
    : 0;
  const nonCompliantShare = hasValue(shownNonCompliant)
    ? Math.max(0, Math.min(100, Number(shownNonCompliant)))
    : 0;

  const versionLabel = `v${scanFlow.versionNumber || 1}.0`;
  const scannedLabel = formatReportDate(scannedAt);
  const generatedLabel = formatReportDate(new Date().toISOString());

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

  return (
    <ScrollView ref={scrollRef} style={styles.root} contentContainerStyle={styles.scroll}>
      <View style={styles.topRow}>
        <View style={styles.lockup}>
          <PaperPilotMark size={40} />
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
              styles.brandSub,
              fontsLoaded && { fontFamily: "Quicksand_600SemiBold", fontWeight: undefined },
            ]}
          >
            * RESULTS
          </Text>
        </View>
        <View style={styles.downloadWrap}>
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
              pressed && { backgroundColor: "#12ae99", borderColor: "#12ae99" },
              scanFlow.downloadBusy && { opacity: 0.5 },
            ]}
          >
            <DownloadIcon />
            <Text style={styles.downloadText}>
              {scanFlow.downloadBusy ? "Generating PDF…" : `Download full report · ${versionLabel}`}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.metaGrid}>
          <View>
            <Text style={styles.metaLabel}>Document</Text>
            <Text style={styles.metaValue} numberOfLines={1}>
              {documentTitle}
            </Text>
            {campus || college ? (
              <Text style={styles.metaSub} numberOfLines={1}>
                {[college, campus].filter(Boolean).join(" · ")}
              </Text>
            ) : null}
          </View>
          <View>
            <Text style={styles.metaLabel}>Citation style</Text>
            <Text style={styles.metaValue}>
              {citationStyle} · {versionLabel}
            </Text>
          </View>
          <View>
            <Text style={styles.metaLabel}>Scanned</Text>
            <Text style={styles.metaValue}>{scannedLabel}</Text>
          </View>
          <View>
            <Text style={styles.metaLabel}>Generated</Text>
            <Text style={styles.metaValue}>{generatedLabel}</Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.kicker}>Overall compliance score</Text>
        <View style={styles.scoreLine}>
          <Text style={[styles.scoreValue, { color: band.scoreColor }]}>
            {evaluated ? formatScore(overallFromCards, 0) : "—"}
          </Text>
          {evaluated ? <Text style={[styles.scorePct, { color: band.scoreColor }]}>%</Text> : null}
        </View>
        <View
          style={[
            styles.bandPill,
            { backgroundColor: band.badgeBg, borderColor: band.badgeBorder },
          ]}
        >
          <Text style={[styles.bandText, { color: band.textColor }]}>{band.label}</Text>
        </View>

        <View style={styles.barBlock}>
          <View style={styles.dualRow}>
            <Text style={[styles.dualLabel, { color: "#157347" }]}>Compliant</Text>
            <Text style={[styles.dualLabel, { color: "#B02A37" }]}>Non-Compliant</Text>
          </View>
          <View style={styles.shareBar}>
            {hasValue(shownCompliant) || hasValue(shownNonCompliant) ? (
              <>
                <View
                  style={[
                    styles.shareSeg,
                    { flex: compliantShare || 0.0001, backgroundColor: "#157347" },
                  ]}
                />
                <View
                  style={[
                    styles.shareSeg,
                    { flex: nonCompliantShare || 0.0001, backgroundColor: "#B02A37" },
                  ]}
                />
              </>
            ) : null}
          </View>

          <View style={styles.statGrid}>
            <View style={styles.stat}>
              <Text style={[styles.statNum, { color: "#1e293b" }]}>{formatCount(totalUnits)}</Text>
              <Text style={styles.statLabel}>Total Units</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statNum, { color: "#157347" }]}>{formatCount(compliantUnits)}</Text>
              <Text style={styles.statLabel}>Compliant Units</Text>
            </View>
            <View style={styles.stat}>
              <Text style={[styles.statNum, { color: "#B02A37" }]}>
                {formatCount(nonCompliantUnits)}
              </Text>
              <Text style={styles.statLabel}>Non-Compliant Units</Text>
            </View>
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
        <Text style={styles.breakdownTitle}>Score Breakdown</Text>
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
  topRow: { gap: 12 },
  lockup: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 12, rowGap: 8 },
  brandWord: { fontSize: 18, fontWeight: "700", letterSpacing: 1.44, color: "#172033" },
  brandSub: { fontSize: 14, fontWeight: "600", letterSpacing: 1.4, color: "#4a5568" },
  downloadWrap: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 12 },
  downloadError: { fontSize: 12, color: "#f43f5e" },
  downloadBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#bfeee5",
    backgroundColor: "#16bfa8",
    paddingHorizontal: 20,
    paddingVertical: 10,
    shadowColor: "#0f172a",
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  downloadText: { fontSize: 12, fontWeight: "700", color: colors.white },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: colors.white,
    padding: 20,
    shadowColor: "#0f172a",
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  metaGrid: { gap: 16 },
  metaLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: "#94a3b8",
  },
  metaValue: { marginTop: 4, fontSize: 14, fontWeight: "700", color: "#0f172a" },
  metaSub: { marginTop: 2, fontSize: 12, color: "#64748b" },
  kicker: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: "#94a3b8",
  },
  scoreLine: { marginTop: 8, flexDirection: "row", alignItems: "flex-end", gap: 4 },
  scoreValue: { fontSize: 48, fontWeight: "800", fontVariant: ["tabular-nums"], lineHeight: 52 },
  scorePct: { fontSize: 24, fontWeight: "800", fontVariant: ["tabular-nums"], paddingBottom: 6 },
  bandPill: {
    alignSelf: "flex-start",
    marginTop: 12,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  bandText: { fontSize: 10, fontWeight: "700", letterSpacing: 1.2 },
  barBlock: { marginTop: 24, gap: 16 },
  dualRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  dualLabel: { fontSize: 14, fontWeight: "600" },
  shareBar: {
    height: 6,
    borderRadius: 999,
    overflow: "hidden",
    backgroundColor: "#eeeeee",
    flexDirection: "row",
  },
  shareSeg: { height: "100%" },
  statGrid: { flexDirection: "row", gap: 8 },
  stat: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    paddingHorizontal: 6,
    paddingVertical: 12,
    alignItems: "center",
  },
  statNum: { fontSize: 20, fontWeight: "800", fontVariant: ["tabular-nums"] },
  statLabel: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    textAlign: "center",
    color: "#64748b",
  },
  consistencyWarn: {
    marginTop: 12,
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
  breakdownTitle: { fontSize: 18, fontWeight: "700", color: "#0f172a" },
  catGrid: { marginTop: 20, gap: 12 },
  catCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f4f6f8",
    paddingHorizontal: 14,
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
  catRingValue: { fontSize: 12, fontWeight: "800", fontVariant: ["tabular-nums"] },
  catCopy: { flex: 1, minWidth: 0 },
  catTitle: { fontSize: 14, fontWeight: "700", color: "#1e293b" },
  catDetail: { marginTop: 2, fontSize: 11, lineHeight: 15, color: "#64748b" },
});
