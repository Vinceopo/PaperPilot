import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAppData } from "../context/AppDataContext";
import { colors } from "../theme";
import { scoreBand } from "../lib/scoreBand";
import IssuesDetectedPanel from "../components/cockpit/IssuesDetectedPanel";
import PrimaryButton from "../components/ui/PrimaryButton";

function barColor(score) {
  if (score >= 80) return colors.emerald;
  if (score >= 50) return colors.amber;
  return colors.rose;
}

function ScoreBar({ metric, score }) {
  const n = Number(score) || 0;
  return (
    <View style={styles.barBlock}>
      <View style={styles.barHead}>
        <Text style={styles.barLabel}>{metric}</Text>
        <Text style={[styles.barScore, { color: barColor(n) }]}>{n}%</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.min(100, n)}%`, backgroundColor: barColor(n) }]} />
      </View>
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
    overallScore = 0,
    scoreBreakdown = [],
    formatChecks = [],
    pageCount = 0,
  } = result;

  const band = scoreBand(overallScore);
  const totalErrors = formatChecks.filter((c) => c.result === "FAIL").length;
  const warnings = formatChecks.filter((c) => c.result === "REVIEW").length;
  const checksRun = formatChecks.length;
  const issuesFound = totalErrors + warnings;
  const passCount = checksRun - totalErrors - warnings;

  const scannedDate = scannedAt
    ? new Date(scannedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "—";

  const versionLabel = `v${scanFlow.versionNumber || 1}.0`;

  const ringColor =
    band.key === "compliant" ? colors.accent : band.key === "needs_revision" ? colors.amber : colors.rose;
  const pillBg =
    band.key === "compliant"
      ? colors.emeraldBg
      : band.key === "needs_revision"
        ? colors.amberBg
        : colors.roseBg;
  const pillBorder =
    band.key === "compliant"
      ? "#a7f3d0"
      : band.key === "needs_revision"
        ? "#fde68a"
        : colors.roseBorder;
  const pillText =
    band.key === "compliant"
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
        <Text style={styles.cardKicker}>Overall score</Text>
        <View style={styles.scoreRow}>
          <View style={[styles.scoreRing, { borderColor: ringColor }]}>
            <Text style={styles.scoreValue}>{Math.round(overallScore)}</Text>
            <Text style={styles.scoreOutOf}>/100</Text>
          </View>
          <View style={{ flex: 1 }}>
            <View style={[styles.bandPill, { backgroundColor: pillBg, borderColor: pillBorder }]}>
              <Text style={[styles.bandText, { color: pillText }]}>{band.label}</Text>
            </View>
            <Text style={styles.scoreHint}>Overall compliance score</Text>
          </View>
        </View>
      </View>

      {scoreBreakdown.length ? (
        <View style={styles.card}>
          <Text style={styles.cardKicker}>Score breakdown</Text>
          <View style={{ marginTop: 12, gap: 12 }}>
            {scoreBreakdown.map((item) => (
              <ScoreBar
                key={item.metric || item.section}
                metric={item.metric || item.section}
                score={item.score}
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
            <Text style={[styles.statNum, { color: colors.text }]}>{checksRun}</Text>
            <Text style={[styles.statLabel, { color: colors.slate }]}>Checks</Text>
          </View>
        </View>
        <View style={styles.tagRow}>
          <Text style={styles.tag}>{passCount} passed</Text>
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
              {issuesFound} issue{issuesFound === 1 ? "" : "s"}
            </Text>
          ) : null}
        </View>
        <IssuesDetectedPanel formatChecks={formatChecks} pageCount={pageCount} />
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
