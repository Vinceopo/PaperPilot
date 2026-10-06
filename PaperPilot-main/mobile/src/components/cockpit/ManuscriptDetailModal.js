import { useEffect, useMemo, useState } from "react";
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../theme";
import { bandTone, scoreBand } from "../../lib/scoreBand";
import { downloadReport } from "../../lib/mockAnalysis";
import { versionToScanResult } from "../../lib/scannedLibrary";
import { CATEGORY_STATUS_LABEL, formatCount, formatScore, hasValue, plural } from "../../lib/scoreFormat";
import { APP_TIME_ZONE } from "../../lib/timeZone";
import ConfirmDialog from "../ui/ConfirmDialog";
import UpgradePrompt from "../ui/UpgradePrompt";
import { ClockIcon, CloseIcon, DownloadIcon, LockIcon, TrashIcon } from "../shell/icons";

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };
const MONO = Platform.select({ ios: "Menlo", default: "monospace" });

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso + (iso.length <= 10 ? "T12:00:00" : "")).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: APP_TIME_ZONE,
    });
  } catch {
    return iso;
  }
}

function severityTone(severity) {
  if (severity === "critical" || severity === "major") {
    return { border: "#fecdd3", bg: "#fff1f2", text: "#9f1239" };
  }
  if (severity === "moderate" || severity === "warning") {
    return { border: "#fed7aa", bg: "#fff7ed", text: "#9a3412" };
  }
  if (severity === "minor") return { border: "#fde68a", bg: "#fffbeb", text: "#92400e" };
  return { border: colors.border, bg: "#f8fafc", text: "#475569" };
}

function formatLocationChip(loc) {
  if (loc?.page == null) return loc?.section || "Document";
  return `Page ${loc.page}${loc.line != null ? `, line ${loc.line}` : ""}`;
}

function IssueCard({ issue }) {
  const [open, setOpen] = useState(false);
  const tone = severityTone(issue.severity);
  const locs = Array.isArray(issue.locations) ? issue.locations : [];
  const pages = [...new Set(locs.map((loc) => loc.page).filter((p) => p != null))].sort((a, b) => a - b);
  return (
    <View style={[styles.issue, { borderColor: tone.border, backgroundColor: tone.bg }]}>
      <View style={styles.issueHead}>
        <View style={styles.issueHeadText}>
          <Text style={[styles.issueTitle, { color: tone.text }]}>{issue.category}</Text>
          <Text style={[styles.issueBody, { color: tone.text }]}>
            {issue.explanation || issue.description}
          </Text>
        </View>
        <View style={[styles.severityChip, { borderColor: `${tone.text}33` }]}>
          <Text style={[styles.severityText, { color: tone.text }]}>{issue.severity}</Text>
        </View>
      </View>

      {issue.recommendation ? (
        <View style={styles.fixBox}>
          <Text style={styles.fixText}>Fix: {issue.recommendation}</Text>
        </View>
      ) : null}

      {locs.length > 0 ? (
        <View style={styles.locWrap}>
          <Pressable onPress={() => setOpen((o) => !o)} hitSlop={6} accessibilityState={{ expanded: open }}>
            <Text style={[styles.locToggle, { color: tone.text }, open && styles.locToggleOpen]}>
              {locs.length} location{locs.length === 1 ? "" : "s"}
              {pages.length ? ` · pages ${pages.slice(0, 6).join(", ")}${pages.length > 6 ? "…" : ""}` : ""}
            </Text>
          </Pressable>
          {open ? (
            <View style={styles.chips}>
              {locs.slice(0, 40).map((loc, locIdx) => (
                <View key={locIdx} style={[styles.chip, { borderColor: `${tone.text}26` }]}>
                  <Text style={[styles.chipText, { color: tone.text }]}>
                    {formatLocationChip(loc)}
                    {loc.section ? ` · ${loc.section}` : ""}
                  </Text>
                </View>
              ))}
              {locs.length > 40 ? (
                <View style={styles.chipMore}>
                  <Text style={[styles.chipMoreText, { color: tone.text }]}>+{locs.length - 40} more</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * Read-only version detail sheet for one manuscript.
 * Free plan: only the latest scanned version is accessible. Premium: all versions.
 */
export default function ManuscriptDetailModal({
  manuscript,
  tier = "free",
  onUpgrade,
  onDeleteVersion,
  onOpenResult,
  resolveResult,
  onClose,
}) {
  const insets = useSafeAreaInsets();
  const isPremium = String(tier || "free").toLowerCase() === "premium";

  const versionsDesc = useMemo(() => {
    const list = [...(manuscript?.versions || [])];
    list.sort((a, b) => (b.versionNumber || 0) - (a.versionNumber || 0));
    return list;
  }, [manuscript]);

  const latestId = versionsDesc[0]?.id || "";

  const [selectedId, setSelectedId] = useState(latestId);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [upgradeMessage, setUpgradeMessage] = useState("");

  useEffect(() => {
    setSelectedId(latestId);
  }, [manuscript?.id, latestId]);

  if (!manuscript) return null;

  const selected =
    versionsDesc.find((v) => v.id === selectedId) ||
    versionsDesc.find((v) => v.id === latestId) ||
    versionsDesc[0];
  const band = scoreBand(selected?.score);
  const tone = bandTone(band);
  const versionLabel = selected ? `v${selected.versionNumber}.0` : "—";

  function selectVersion(ver) {
    const isLatest = ver.id === latestId;
    if (!isPremium && !isLatest) {
      setUpgradeMessage(
        "Free plan can only open the most recent scanned version. Upgrade to Premium to access all versions."
      );
      return;
    }
    setSelectedId(ver.id);
    onOpenResult?.(ver);
  }

  async function onDownload() {
    if (!selected || downloadBusy) return;
    setDownloadBusy(true);
    setDownloadError("");
    try {
      const payload = resolveResult
        ? await resolveResult(manuscript, selected)
        : versionToScanResult(manuscript, selected);
      const report = await downloadReport(payload, { versionNumber: selected.versionNumber });
      if (report?.summary) Alert.alert("Analysis report", report.summary);
    } catch (err) {
      setDownloadError(err?.message || "Download failed.");
    } finally {
      setDownloadBusy(false);
    }
  }

  const issues = [...(selected?.issues || [])].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
  );

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} presentationStyle="fullScreen">
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.kicker}>Manuscript detail</Text>
            <Text style={styles.title} numberOfLines={1}>
              {manuscript.title}
            </Text>
            <Text style={styles.subtitle}>
              {manuscript.institution} · {manuscript.citationStyle}
            </Text>
            <View style={styles.pillRow}>
              <View style={[styles.pill, { backgroundColor: tone.pillBg, borderColor: tone.pillBorder }]}>
                <Text style={[styles.pillText, { color: tone.pillText }]}>
                  {formatScore(selected?.score, 0)} · {band.label}
                </Text>
              </View>
              <View style={[styles.pill, styles.pillNeutral]}>
                <Text style={[styles.pillText, styles.pillNeutralText]}>{versionLabel}</Text>
              </View>
              <Text style={styles.readOnly}>Read-only checker view</Text>
            </View>
          </View>
          <Pressable style={styles.closeBtn} onPress={onClose} accessibilityLabel="Close detail" hitSlop={6}>
            <CloseIcon size={16} />
          </Pressable>
        </View>

        <View style={styles.aside}>
          <View style={styles.asideLabelRow}>
            <ClockIcon size={14} />
            <Text style={styles.asideLabel}>Versions</Text>
          </View>
          <ScrollView style={styles.versionScroll} contentContainerStyle={styles.versionList} nestedScrollEnabled>
            {versionsDesc.map((ver) => {
              const vb = scoreBand(ver.score);
              const active = ver.id === selected?.id;
              const isLatest = ver.id === latestId;
              const locked = !isPremium && !isLatest;
              return (
                <View key={ver.id} style={styles.versionRow}>
                  <Pressable
                    onPress={() => selectVersion(ver)}
                    style={({ pressed }) => [
                      styles.versionBtn,
                      active && styles.versionBtnActive,
                      pressed && !active && styles.versionBtnPressed,
                    ]}
                  >
                    <View style={styles.versionTop}>
                      <Text style={[styles.versionNum, active && styles.versionMutedActive]}>
                        v{ver.versionNumber}.0
                      </Text>
                      {locked ? <LockIcon size={14} /> : null}
                      {isLatest ? (
                        <Text style={[styles.latest, { color: active ? colors.accent : "#059669" }]}>Latest</Text>
                      ) : null}
                    </View>
                    <Text style={[styles.versionDate, active && styles.versionMutedActive]}>
                      {formatDate(ver.scannedDate)}
                    </Text>
                    <Text
                      style={[
                        styles.versionScore,
                        { color: active ? colors.accent : locked ? colors.muted : bandTone(vb).text },
                      ]}
                    >
                      {locked ? "Premium only" : `Score ${formatScore(ver.score, 0)}`}
                    </Text>
                  </Pressable>
                  {onDeleteVersion ? (
                    <Pressable
                      style={styles.versionDelete}
                      onPress={() => setPendingDeleteId(ver.id)}
                      accessibilityLabel={`Delete version ${ver.versionNumber}`}
                      hitSlop={6}
                    >
                      <TrashIcon size={14} color={colors.muted} />
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
          {!isPremium && versionsDesc.length > 1 ? (
            <Text style={styles.freeNote}>
              Free plan: only the latest version is viewable. Upgrade for full history.
            </Text>
          ) : null}
        </View>

        <ScrollView style={styles.body} contentContainerStyle={[styles.bodyContent, { paddingBottom: insets.bottom + 28 }]}>
          {!selected ? (
            <Text style={styles.emptyText}>No versions available.</Text>
          ) : (
            <>
              <View style={styles.selectedRow}>
                <View>
                  <Text style={styles.selectedLabel}>Selected version</Text>
                  <Text style={styles.selectedMeta}>
                    {versionLabel} · {formatDate(selected.scannedDate)}
                  </Text>
                </View>
                <View style={styles.scoreBlock}>
                  <Text style={[styles.bigScore, { color: tone.text }]}>{formatScore(selected.score, 0)}</Text>
                  <Text style={styles.scoreCaption}>Overall score</Text>
                </View>
              </View>

              <Text style={styles.sectionTitle}>Score breakdown</Text>
              {(selected.breakdown || []).length > 0 &&
              (selected.breakdown || []).every((row) => row.unitsChecked == null) ? (
                <Text style={styles.breakdownNote}>
                  Unit counts were not stored with this scan. Re-analyse the manuscript to generate the full
                  scoring breakdown.
                </Text>
              ) : null}
              <View style={styles.breakdown}>
                {(selected.breakdown || []).map((row) => {
                  const rt = bandTone(scoreBand(row.score));
                  return (
                    <View key={row.section}>
                      <View style={styles.barHead}>
                        <Text style={styles.barLabel}>{row.section}</Text>
                        <Text style={[styles.barScore, { color: rt.text }]}>
                          {row.score == null
                            ? CATEGORY_STATUS_LABEL[row.status] || "Not evaluated"
                            : formatScore(row.score)}
                        </Text>
                      </View>
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.barFill,
                            {
                              backgroundColor: rt.bar,
                              width: `${Math.min(100, Math.max(0, Number(row.score) || 0))}%`,
                            },
                          ]}
                        />
                      </View>
                      {hasValue(row.unitsChecked) ? (
                        <Text style={styles.barMetaLine}>
                          Checked {formatCount(row.unitsChecked)}
                          {hasValue(row.unitsPassed) ? ` · passed ${formatCount(row.unitsPassed)}` : ""}
                          {hasValue(row.unitsFailed) ? ` · failed ${formatCount(row.unitsFailed)}` : ""}
                        </Text>
                      ) : null}
                      {hasValue(row.issueCount) && Number(row.issueCount) > 0 ? (
                        <Text style={styles.barMetaLine}>
                          {formatCount(row.issueCount)} {plural(row.issueCount, "issue")} found in this category
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
              </View>

              <Text style={[styles.sectionTitle, styles.issuesTitle]}>
                Detected issues <Text style={styles.issuesCount}>({issues.length})</Text>
              </Text>
              <Text style={styles.issuesHint}>
                Each card is one rule finding — expand locations to see every page/line hit.
              </Text>

              {issues.length === 0 ? (
                <Text style={[styles.emptyText, { marginTop: 12 }]}>No issues recorded for this version.</Text>
              ) : (
                <View style={styles.issueList}>
                  {issues.map((issue, idx) => (
                    <IssueCard key={`${issue.category}-${idx}`} issue={issue} />
                  ))}
                </View>
              )}

              <View style={styles.footer}>
                {downloadError ? <Text style={styles.downloadError}>{downloadError}</Text> : null}
                <Pressable
                  onPress={onDownload}
                  disabled={downloadBusy}
                  style={({ pressed }) => [
                    styles.downloadBtn,
                    pressed && styles.downloadBtnPressed,
                    downloadBusy && styles.downloadBtnBusy,
                  ]}
                >
                  <DownloadIcon size={14} />
                  <Text style={styles.downloadText}>
                    {downloadBusy ? "Generating report…" : `Download full report · ${versionLabel}`}
                  </Text>
                </Pressable>
              </View>
            </>
          )}
        </ScrollView>

        <ConfirmDialog
          open={Boolean(pendingDeleteId)}
          title="Delete this version?"
          message="The version label will update to match the versions that are still saved."
          confirmLabel="Delete version"
          tone="danger"
          onCancel={() => setPendingDeleteId(null)}
          onConfirm={() => {
            const id = pendingDeleteId;
            setPendingDeleteId(null);
            if (id) onDeleteVersion?.(manuscript.id, id);
          }}
        />
        <UpgradePrompt
          message={upgradeMessage}
          onClose={() => setUpgradeMessage("")}
          onUpgrade={onUpgrade}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerText: { flex: 1, minWidth: 0 },
  kicker: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.muted,
  },
  title: { marginTop: 4, fontSize: 18, fontWeight: "700", color: "#0F1729" },
  subtitle: { marginTop: 4, fontSize: 12, color: colors.slate },
  pillRow: { marginTop: 12, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 },
  pillText: { fontSize: 10, fontWeight: "700" },
  pillNeutral: { borderColor: colors.border, backgroundColor: "#f8fafc" },
  pillNeutralText: { color: "#475569" },
  readOnly: { fontSize: 11, color: colors.muted },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  aside: { borderBottomWidth: 1, borderBottomColor: "#f1f5f9", backgroundColor: "#F8FAFC" },
  asideLabelRow: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 12 },
  asideLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.slate,
  },
  versionScroll: { maxHeight: 176 },
  versionList: { paddingHorizontal: 12, paddingBottom: 12, gap: 4 },
  versionRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  versionBtn: {
    flex: 1,
    minWidth: 0,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.white,
  },
  versionBtnActive: {
    backgroundColor: "#0F1729",
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  versionBtnPressed: { backgroundColor: "#f1f5f9" },
  versionTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  versionNum: { fontSize: 12, fontWeight: "500", color: colors.muted },
  versionMutedActive: { color: "#cbd5e1" },
  latest: { fontSize: 9, fontWeight: "600", letterSpacing: 0.5, textTransform: "uppercase" },
  versionDate: { marginTop: 2, fontSize: 11, color: colors.muted },
  versionScore: { marginTop: 4, fontSize: 10, fontWeight: "600" },
  versionDelete: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  freeNote: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 10,
    lineHeight: 15,
    color: colors.slate,
  },
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: 20, paddingTop: 20 },
  emptyText: { fontSize: 14, color: colors.muted },
  selectedRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 },
  selectedLabel: { fontSize: 12, fontWeight: "600", color: colors.slate },
  selectedMeta: { fontSize: 14, fontWeight: "500", color: colors.muted },
  scoreBlock: { alignItems: "flex-end" },
  bigScore: { fontSize: 30, fontWeight: "700", fontVariant: ["tabular-nums"] },
  scoreCaption: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: colors.muted,
  },
  sectionTitle: { marginTop: 24, fontSize: 14, fontWeight: "700", color: "#0F1729" },
  breakdown: { marginTop: 12, gap: 12 },
  breakdownNote: { marginTop: 4, fontSize: 11, lineHeight: 16, color: "#64748b" },
  barMetaLine: { marginTop: 4, fontSize: 10, color: "#94a3b8" },
  barHead: { marginBottom: 4, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  barLabel: { fontSize: 12, fontWeight: "500", color: "#475569" },
  barScore: { fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] },
  barTrack: { height: 8, borderRadius: 999, overflow: "hidden", backgroundColor: "#f1f5f9" },
  barFill: { height: "100%", borderRadius: 999 },
  issuesTitle: { marginTop: 28 },
  issuesCount: { fontWeight: "400", color: colors.muted },
  issuesHint: { marginTop: 2, fontSize: 11, lineHeight: 16, color: colors.slate },
  issueList: { marginTop: 16, gap: 12 },
  issue: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 },
  issueHead: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  issueHeadText: { flex: 1, minWidth: 0 },
  issueTitle: { fontSize: 14, fontWeight: "700", lineHeight: 19 },
  issueBody: { marginTop: 4, fontSize: 12, lineHeight: 18, opacity: 0.9 },
  severityChip: {
    borderWidth: 1,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.6)",
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  severityText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  fixBox: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "rgba(167,243,208,0.6)",
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.7)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  fixText: { fontSize: 11, fontWeight: "500", lineHeight: 16, color: "#065f46" },
  locWrap: { marginTop: 12 },
  locToggle: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    opacity: 0.8,
  },
  locToggleOpen: { textDecorationLine: "underline" },
  chips: { marginTop: 8, flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    borderWidth: 1,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.8)",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  chipText: { fontFamily: MONO, fontSize: 10, fontWeight: "600" },
  chipMore: { borderRadius: 6, backgroundColor: "rgba(255,255,255,0.6)", paddingHorizontal: 8, paddingVertical: 4 },
  chipMoreText: { fontSize: 10, fontWeight: "600" },
  footer: { marginTop: 32, borderTopWidth: 1, borderTopColor: "#f1f5f9", paddingTop: 20 },
  downloadError: { marginBottom: 8, fontSize: 12, color: "#f43f5e" },
  downloadBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    backgroundColor: "#172033",
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  downloadBtnPressed: { backgroundColor: "#243049" },
  downloadBtnBusy: { opacity: 0.5 },
  downloadText: { fontSize: 12, fontWeight: "700", color: colors.white },
});
