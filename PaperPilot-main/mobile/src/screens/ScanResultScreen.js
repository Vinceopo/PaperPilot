import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAppData } from "../context/AppDataContext";
import { colors } from "../theme";
import { scoreBand } from "../lib/scoreBand";
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
import IssuesDetectedPanel from "../components/cockpit/IssuesDetectedPanel";
import PrimaryButton from "../components/ui/PrimaryButton";

function barColor(score) {
  if (score >= 80) return colors.emerald;
  if (score >= 50) return colors.amber;
  return colors.rose;
}

function ScoreBar({ metric, score, status, unitsChecked, unitsPassed, unitsFailed, issueCount }) {
  const evaluated = hasValue(score);
  const n = evaluated ? Number(score) : 0;
  const color = evaluated ? barColor(n) : colors.slate;
  return (
    <View style={styles.barBlock}>
      <View style={styles.barHead}>
        <Text style={styles.barLabel}>
          {metric}
          {!evaluated
            ? ` · ${CATEGORY_STATUS_LABEL[status] || "Not evaluated"}`
            : hasValue(unitsChecked)
              ? ` · ${formatCount(unitsFailed)} of ${formatCount(unitsChecked)} failed`
              : ""}
        </Text>
        <Text style={[styles.barScore, { color }]}>
          {evaluated ? formatPct(n) : "N/A"}
        </Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.min(100, n)}%`, backgroundColor: evaluated ? barColor(n) : colors.slate }]} />
      </View>
      {hasValue(unitsChecked) && evaluated ? (
        <Text style={styles.scoreHint}>
          Checked {formatCount(unitsChecked)}
          {hasValue(unitsPassed) ? ` · passed ${formatCount(unitsPassed)}` : ""}
          {hasValue(unitsFailed) ? ` · failed ${formatCount(unitsFailed)}` : ""}
        </Text>
      ) : null}
      {hasValue(issueCount) && Number(issueCount) > 0 ? (
        <Text style={styles.scoreHint}>
          {formatCount(issueCount)} {plural(issueCount, "issue")} found in this category
        </Text>
      ) : null}
    </View>
  );
}

export default function ScanResultScreen({ navigation }) {
  const { scanFlow, resetUploadWizard, setManuscriptReady, setFileDetailsNotice } = useAppData();
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
    categoryWrongPct = [],
    scoreBreakdown = [],
    formatChecks = [],
    pageCount = 0,
    unitsChecked = null,
    unitsPassed = null,
    unitsFailed = null,
    issueTotals = null,
    scoringVersion = null,
    scoringConsistency = null,
  } = result;

  const [shownRight, shownWrong] = roundSharesToTotal([rightPct, wrongPct]);
  const clusterRows = [...categoryWrongPct].sort((a, b) => b.pctOfWrong - a.pctOfWrong).slice(0, 5);
  const clusterShown = roundSharesToTotal(clusterRows.map((row) => row.pctOfWrong));
  const overallEvaluated = hasValue(overallScore);
  const band = scoreBand(overallScore);
  const totalErrors = formatChecks.filter((c) => c.result === "FAIL").length;
  const warnings = formatChecks.filter((c) => c.result === "REVIEW").length;
  const issueTypes = formatChecks.length;
  const issuesFound = totalErrors + warnings;

  const scannedDate = scannedAt
    ? new Date(scannedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: APP_TIME_ZONE,
      })
    : "—";

  const versionLabel = `v${scanFlow.versionNumber || 1}.0`;

  const unevaluated = !overallEvaluated || band.key === "not_evaluated";
  const ringColor = unevaluated
    ? colors.slate
    : band.key === "compliant"
      ? colors.accent
      : band.key === "needs_revision"
        ? colors.amber
        : colors.rose;
  const pillBg = unevaluated
    ? "#f1f5f9"
    : band.key === "compliant"
      ? colors.emeraldBg
      : band.key === "needs_revision"
        ? colors.amberBg
        : colors.roseBg;
  const pillBorder = unevaluated
    ? "#e2e8f0"
    : band.key === "compliant"
      ? "#a7f3d0"
      : band.key === "needs_revision"
        ? "#fde68a"
        : colors.roseBorder;
  const pillText = unevaluated
    ? colors.slate
    : band.key === "compliant"
      ? colors.emerald
      : band.key === "needs_revision"
        ? colors.amber
        : colors.rose;

  async function onDownload() {
    const report = await scanFlow.downloadReport();
    if (report?.summary) {
      Alert.alert("Analysis report", report.summary);
    } else if (scanFlow.downloadError) {
      Alert.alert("Download failed", scanFlow.downloadError);
    }
  }

  function onUploadNewVersion() {
    scanFlow.uploadNewVersion();
    setManuscriptReady(false);
    setFileDetailsNotice("");
    resetUploadWizard(2);
    navigation.navigate("Upload");
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll}>
      <View style={styles.hero}>
        <Text style={styles.scope}>Scope: formatting only</Text>
        <Text style={styles.heroTitle}>{documentTitle}</Text>
        {(campus || college) && (
          <Text style={styles.heroSub}>{[college, campus].filter(Boolean).join(" · ")}</Text>
        )}
        <View style={styles.metaRow}>
          <Text style={styles.metaItem}>Scanned · {scannedDate}</Text>
          <Text style={styles.metaItem}>Version · {versionLabel}</Text>
          <Text style={styles.metaItem}>Citation · {citationStyle}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardKicker}>Compliance score</Text>
        <View style={styles.dualScoreRow}>
          <View style={[styles.dualScore, styles.dualRight]}>
            <Text style={styles.dualLabel}>Right</Text>
            <Text style={styles.dualValue}>{formatPct(shownRight)}</Text>
          </View>
          <View style={[styles.dualScore, styles.dualWrong]}>
            <Text style={styles.dualLabel}>Wrong</Text>
            <Text style={styles.dualValue}>{formatPct(shownWrong)}</Text>
          </View>
        </View>
        {hasValue(unitsChecked) ? (
          <Text style={styles.scoreHint}>
            {Number(unitsChecked) === 0
              ? "No formatting unit could be measured in this document."
              : `Checked ${formatCount(unitsChecked)} ${plural(unitsChecked, "unit")}`}
            {hasValue(unitsPassed) ? ` · ${formatCount(unitsPassed)} passed` : ""}
            {hasValue(unitsFailed) ? ` · ${formatCount(unitsFailed)} failed` : ""}
            {issueTotals
              ? ` · ${formatCount(issueTotals.occurrences)} ${plural(issueTotals.occurrences, "issue")} found`
              : ""}
          </Text>
        ) : null}
        {scoringConsistency && scoringConsistency.ok === false ? (
          <Text style={styles.warn}>
            These results failed an internal consistency check. Re-run the analysis before relying on them.
          </Text>
        ) : null}
        {!scoringVersion ? (
          <Text style={styles.scoreHint}>
            This scan was saved without the full scoring breakdown. Re-analyse the manuscript to generate checked, passed, and failed unit counts.
          </Text>
        ) : null}
        <View style={styles.scoreRow}>
          <View style={[styles.scoreRing, { borderColor: overallEvaluated ? ringColor : colors.slate }]}>
            <Text style={styles.scoreValue}>
              {overallEvaluated ? formatScore(overallScore, 0) : "—"}
            </Text>
            <Text style={styles.scoreOutOf}>/100</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={[styles.bandPill, { backgroundColor: pillBg, borderColor: pillBorder }]}>
              <Text style={[styles.bandText, { color: pillText }]}>
                {overallEvaluated ? band.label : "NOT EVALUATED"}
              </Text>
            </View>
            <Text style={styles.scoreHint}>Average of measured categories · unit right/wrong above</Text>
          </View>
        </View>
        {clusterRows.length ? (
          <View style={{ marginTop: 12, gap: 6 }}>
            <Text style={styles.cardKicker}>Where issues cluster (% of failed units)</Text>
            {clusterRows.map((item, index) => (
              <Text key={item.section} style={styles.catLine}>
                {item.section}: {formatPct(clusterShown[index])} of failed units
              </Text>
            ))}
          </View>
        ) : null}
        <PrimaryButton
          title="View document & trace issues"
          onPress={() => {
            scanFlow.openDocumentTrace(null);
            navigation.navigate("DocumentReference");
          }}
          style={{ marginTop: 14 }}
        />
      </View>

      {scoreBreakdown.length ? (
        <View style={styles.card}>
          <Text style={styles.cardKicker}>Score breakdown</Text>
          <Text style={styles.scoreHint}>Formatting metrics only</Text>
          <View style={{ marginTop: 12, gap: 12 }}>
            {scoreBreakdown.map((item) => (
              <ScoreBar
                key={item.metric || item.section}
                metric={item.metric || item.section}
                score={item.score}
                status={item.status}
                unitsChecked={item.unitsChecked}
                unitsPassed={item.unitsPassed}
                unitsFailed={item.unitsFailed}
                issueCount={item.issueCount}
              />
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.cardKicker}>Scan summary</Text>
        <View style={styles.statGrid}>
          <View style={[styles.stat, { backgroundColor: colors.roseBg }]}>
            <Text style={[styles.statNum, { color: colors.rose }]}>{totalErrors}</Text>
            <Text style={[styles.statLabel, { color: colors.rose }]}>Errors</Text>
          </View>
          <View style={[styles.stat, { backgroundColor: colors.amberBg }]}>
            <Text style={[styles.statNum, { color: colors.amber }]}>{warnings}</Text>
            <Text style={[styles.statLabel, { color: colors.amber }]}>Warnings</Text>
          </View>
          <View style={[styles.stat, { backgroundColor: colors.inputBg }]}>
            <Text style={[styles.statNum, { color: colors.text }]}>{issueTypes}</Text>
            <Text style={[styles.statLabel, { color: colors.slate }]}>Issue types</Text>
          </View>
        </View>
        <View style={styles.tagRow}>
          {hasValue(unitsPassed) ? <Text style={styles.tag}>{unitsPassed} units passed</Text> : null}
          <Text style={styles.tag}>{citationStyle}</Text>
          <Text style={styles.tag}>Format only</Text>
        </View>
        <PrimaryButton
          title={
            scanFlow.downloadBusy
              ? "Generating…"
              : `Download Analysis · ${versionLabel}`
          }
          onPress={onDownload}
          busy={scanFlow.downloadBusy}
          style={{ marginTop: 14 }}
        />
      </View>

      <View>
        <View style={styles.issuesHead}>
          <View style={{ flex: 1 }}>
            <Text style={styles.issuesTitle}>Issues detected</Text>
            <Text style={styles.issuesSub}>
              Findings mapped to the page and line where the check failed.
            </Text>
          </View>
          {issuesFound > 0 ? (
            <Text style={styles.issuesBadge}>
              {issuesFound} issue type{issuesFound === 1 ? "" : "s"}
            </Text>
          ) : null}
        </View>
        <IssuesDetectedPanel
          formatChecks={formatChecks}
          pageCount={pageCount}
          onIssuePress={(entry) => {
            scanFlow.selectTraceIssue(entry);
            scanFlow.openDocumentTrace(entry);
            navigation.navigate("DocumentReference");
          }}
        />
      </View>

      <Pressable style={styles.newVersionBtn} onPress={onUploadNewVersion}>
        <Text style={styles.newVersionText}>Upload New Version</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.pageBg },
  scroll: { padding: 16, paddingBottom: 40, gap: 14 },
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
  hero: {
    borderRadius: 12,
    backgroundColor: colors.sidebar,
    padding: 18,
  },
  scope: {
    alignSelf: "flex-start",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(22,191,168,0.4)",
    backgroundColor: "rgba(22,191,168,0.12)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.accent,
  },
  heroTitle: { marginTop: 10, fontSize: 20, fontWeight: "700", color: colors.white },
  heroSub: { marginTop: 4, fontSize: 13, color: "#94a3b8" },
  metaRow: { marginTop: 14, gap: 4 },
  metaItem: { fontSize: 12, color: "#cbd5e1" },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 16,
  },
  cardKicker: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.muted,
  },
  dualScoreRow: { marginTop: 12, flexDirection: "row", gap: 8 },
  dualScore: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: "center",
  },
  dualRight: { backgroundColor: colors.emeraldBg, borderColor: "#a7f3d0" },
  dualWrong: { backgroundColor: colors.roseBg, borderColor: colors.roseBorder },
  dualLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.muted,
  },
  dualValue: { marginTop: 2, fontSize: 22, fontWeight: "800", color: colors.text },
  catLine: { fontSize: 12, color: colors.slate },
  scoreRow: { marginTop: 14, flexDirection: "row", alignItems: "center", gap: 16 },
  scoreRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 10,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  scoreValue: { fontSize: 28, fontWeight: "800", color: colors.text },
  scoreOutOf: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.muted,
  },
  bandPill: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  bandText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.8 },
  scoreHint: { marginTop: 8, fontSize: 12, color: colors.muted },
  warn: { marginTop: 8, fontSize: 12, color: "#92400e" },
  barBlock: { gap: 6 },
  barHead: { flexDirection: "row", justifyContent: "space-between" },
  barLabel: { fontSize: 12, color: colors.slate },
  barScore: { fontSize: 12, fontWeight: "700" },
  barTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: "#f1f5f9",
    overflow: "hidden",
  },
  barFill: { height: 8, borderRadius: 999 },
  statGrid: { marginTop: 12, flexDirection: "row", gap: 8 },
  stat: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  statNum: { fontSize: 22, fontWeight: "800" },
  statLabel: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  tagRow: { marginTop: 12, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.fileBg,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: "600",
    color: colors.slate,
  },
  issuesHead: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    marginBottom: 10,
  },
  issuesTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  issuesSub: { marginTop: 2, fontSize: 12, color: colors.muted, lineHeight: 16 },
  issuesBadge: {
    overflow: "hidden",
    backgroundColor: colors.roseBg,
    color: colors.rose,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 11,
    fontWeight: "800",
  },
  newVersionBtn: {
    marginTop: 4,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  newVersionText: { fontSize: 13, fontWeight: "800", color: colors.white },
});
