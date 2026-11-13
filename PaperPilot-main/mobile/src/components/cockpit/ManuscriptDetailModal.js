import { useEffect, useMemo, useState } from "react";
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { colors } from "../../theme";
import { bandTone, scoreBand } from "../../lib/scoreBand";
import { downloadReport } from "../../lib/mockAnalysis";
import { versionScanId, versionToScanResult } from "../../lib/scannedLibrary";
import {
  CATEGORY_STATUS_LABEL,
  compliancePercentFromUnits,
  formatCount,
  formatPct,
  formatScore,
  hasValue,
  resolveCategoryUnitDisplays,
} from "../../lib/scoreFormat";
import { APP_TIME_ZONE } from "../../lib/timeZone";
import { isPaidTier } from "../../lib/plans";
import ConfirmDialog from "../ui/ConfirmDialog";
import UpgradePrompt from "../ui/UpgradePrompt";
import { ChevronDownIcon, ClockIcon, DownloadIcon, LockIcon, TrashIcon } from "../shell/icons";
import { categoryForIssue, normalizeDetectedIssues } from "./IssuesDetectedPanel";

function ringStroke(score) {
  if (!hasValue(score)) return "#cbd5e1";
  if (score >= 80) return "#157347";
  if (score >= 50) return "#B57200";
  return "#B02A37";
}

/** Short subtitle for Manuscript Detail only (Scan Results keeps the longer wording). */
function formatShortCategoryDetail(failed, total) {
  if (!hasValue(total)) return null;
  const units = Math.max(0, Math.round(Number(total)));
  const fail = hasValue(failed) ? Math.max(0, Math.round(Number(failed))) : 0;
  return `Checked ${formatCount(units)} · failed ${formatCount(fail)}`;
}

/**
 * Same ring % math / ring look as Scan Results category cards.
 * Subtitle uses the shorter "Checked X · failed Y" wording on this page only.
 */
function CategoryRingCard({
  metric,
  score,
  status,
  displayTotal,
  displayNonCompliant,
  displayIssueCount,
  displayScore,
}) {
  // Same issue count used for ring % as on Scan Results.
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
  // Match Scan Results ring geometry (56×56, r=22, stroke 5).
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (safe / 100) * circumference;
  const stroke = ringStroke(evaluated ? safe : null);
  const detail =
    formatShortCategoryDetail(issueCount, displayTotal) ||
    (evaluated ? null : CATEGORY_STATUS_LABEL[status] || "Not evaluated") ||
    (evaluated ? "Checked 0 · failed 0" : "Not evaluated");

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

/** Build the same category card rows used on the full results screen. */
function buildCategoryCards(manuscript, version) {
  const result = versionToScanResult(manuscript, version) || {};
  const breakdown = Array.isArray(result.scoreBreakdown) ? result.scoreBreakdown : [];
  const categoryDisplays = resolveCategoryUnitDisplays(breakdown);
  const tracedEntries = normalizeDetectedIssues(
    result.formatChecks || [],
    result.pageCount || 0
  ).entries;
  const tracedByCategory = {};
  tracedEntries.forEach((entry) => {
    const key = entry.category || categoryForIssue(entry) || "Other";
    tracedByCategory[key] = (tracedByCategory[key] || 0) + 1;
  });
  return categoryDisplays.map((row) => {
    const name = String(row.metric || row.section || "").trim();
    const traced = name ? tracedByCategory[name] : null;
    const displayIssueCount = hasValue(traced)
      ? traced
      : hasValue(row.displayIssueCount)
        ? row.displayIssueCount
        : row.displayNonCompliant;
    const total = row.displayTotal;
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
}

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

/** Date and time of a scan; older entries only stored the day. */
function formatDateTime(iso) {
  if (!iso || iso.length <= 10) return formatDate(iso);
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return formatDate(iso);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: APP_TIME_ZONE,
    });
  } catch {
    return formatDate(iso);
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

/** Trimmed / server summaries need a refetch so Score Breakdown + issues can render here. */
function needsScanHydration(version) {
  if (!version || !versionScanId(version)) return false;
  if (version.trimmed) return true;
  if (!(version.breakdown || []).length) return true;
  if ((version.issues || []).length) return false;
  return (version.breakdown || []).some((row) => Number(row.issueCount) > 0);
}

/**
 * Dedicated manuscript detail page (versions + score breakdown).
 * Free plan: only the latest scanned version is accessible. Premium: all versions.
 * Selecting a version updates this short summary in place; "View full results" opens Scan Results.
 */
export default function ManuscriptDetailModal({
  manuscript,
  tier = "free",
  onUpgrade,
  onDeleteVersion,
  onOpenResult,
  resolveResult,
}) {
  const isPremium = isPaidTier(tier);

  const versionsDesc = useMemo(() => {
    const list = [...(manuscript?.versions || [])];
    list.sort((a, b) => (b.versionNumber || 0) - (a.versionNumber || 0));
    return list;
  }, [manuscript]);

  const latestId = versionsDesc[0]?.id || "";

  const [selectedId, setSelectedId] = useState(latestId);
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [downloadBusy, setDownloadBusy] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [openingResult, setOpeningResult] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [upgradeMessage, setUpgradeMessage] = useState("");
  const [hydrating, setHydrating] = useState(false);
  const [hydrateError, setHydrateError] = useState("");

  useEffect(() => {
    setSelectedId(latestId);
    setVersionsOpen(false);
  }, [manuscript?.id, latestId]);

  const selectedFromLibrary =
    versionsDesc.find((v) => v.id === selectedId) ||
    versionsDesc.find((v) => v.id === latestId) ||
    versionsDesc[0] ||
    null;

  useEffect(() => {
    if (!manuscript || !selectedFromLibrary || !resolveResult) return undefined;
    if (!needsScanHydration(selectedFromLibrary)) {
      setHydrating(false);
      setHydrateError("");
      return undefined;
    }
    let cancelled = false;
    setHydrating(true);
    setHydrateError("");
    void (async () => {
      try {
        const payload = await resolveResult(manuscript, selectedFromLibrary);
        if (cancelled) return;
        if (!payload) {
          setHydrateError("Could not load the full scan for this version. Check your connection, then try again.");
        }
      } catch (err) {
        if (!cancelled) {
          setHydrateError(err?.message || "Could not load the full scan for this version.");
        }
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    manuscript,
    resolveResult,
    selectedFromLibrary?.id,
    selectedFromLibrary?.trimmed,
    (selectedFromLibrary?.issues || []).length,
    (selectedFromLibrary?.breakdown || []).length,
  ]);

  if (!manuscript) return null;

  const selected = selectedFromLibrary;
  const band = scoreBand(selected?.score);
  const tone = bandTone(band);
  const versionLabel = selected ? `v${selected.versionNumber}.0` : "—";

  async function openFullResult(ver) {
    if (!ver || !onOpenResult || openingResult) return;
    setOpeningResult(true);
    try {
      await onOpenResult(ver);
    } finally {
      setOpeningResult(false);
    }
  }

  function selectVersion(ver) {
    const isLatest = ver.id === latestId;
    if (!isPremium && !isLatest) {
      setUpgradeMessage(
        "Free plan can only open the most recent scanned version. Upgrade to Premium to access all versions."
      );
      return;
    }
    // Short summary only — full Scan Results open via "View full results".
    setSelectedId(ver.id);
    setVersionsOpen(false);
  }

  async function onDownload() {
    if (!selected || downloadBusy) return;
    setDownloadBusy(true);
    setDownloadError("");
    try {
      const payload = resolveResult
        ? await resolveResult(manuscript, selected)
        : versionToScanResult(manuscript, selected);
      if (!payload) throw new Error("This version’s report could not be loaded. Check your connection, then try again.");
      const report = await downloadReport(payload, { versionNumber: selected.versionNumber });
      if (report?.downloaded || report?.shared) return;
      if (report?.summary) Alert.alert("Analysis report", report.summary);
    } catch (err) {
      if (err?.code === "cancelled") return;
      setDownloadError(err?.message || "The report could not be downloaded. Try again in a moment.");
    } finally {
      setDownloadBusy(false);
    }
  }

  const issues = [...(selected?.issues || [])].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
  );
  const categoryCards = selected ? buildCategoryCards(manuscript, selected) : [];

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.kicker}>Manuscript detail</Text>
          <View style={styles.headerRow}>
            <Text style={styles.title} numberOfLines={2}>
              {manuscript.title}
            </Text>
            <Text style={styles.subtitle}>
              {manuscript.institution || "—"} · {manuscript.citationStyle}
            </Text>
            <View style={[styles.pill, { backgroundColor: tone.pillBg, borderColor: tone.pillBorder }]}>
              <Text style={[styles.pillText, { color: tone.pillText }]}>
                {formatScore(selected?.score, 0)} · {band.label}
              </Text>
            </View>
            <View style={[styles.pill, styles.pillNeutral]}>
              <Text style={[styles.pillText, styles.pillNeutralText]}>{versionLabel}</Text>
            </View>
          </View>
        </View>

        <View style={styles.versionBlock}>
          <View style={styles.asideLabelRow}>
            <ClockIcon size={14} />
            <Text style={styles.asideLabel}>Version</Text>
          </View>

          {selected ? (
            <Pressable
              onPress={() => setVersionsOpen((open) => !open)}
              style={({ pressed }) => [styles.versionPicker, pressed && styles.versionPickerPressed]}
              accessibilityRole="button"
              accessibilityState={{ expanded: versionsOpen }}
              accessibilityLabel="Choose manuscript version"
            >
              <View style={styles.versionPickerText}>
                <Text style={styles.versionPickerNum}>{versionLabel}</Text>
                <Text style={styles.versionPickerDate}>
                  {formatDateTime(selected.scannedAt || selected.scannedDate)}
                </Text>
                <Text style={[styles.versionPickerScore, { color: colors.accent }]}>
                  Score {formatScore(selected.score, 0)}
                </Text>
              </View>
              {onDeleteVersion ? (
                <Pressable
                  style={({ pressed }) => [
                    styles.versionDeleteBtn,
                    pressed && styles.versionDeleteBtnPressed,
                  ]}
                  onPress={() => setPendingDeleteId(selected.id)}
                  accessibilityLabel={`Delete version ${selected.versionNumber}`}
                  hitSlop={6}
                >
                  <TrashIcon size={15} color="#94a3b8" />
                </Pressable>
              ) : null}
              <View
                style={[
                  styles.versionChevron,
                  versionsOpen && { transform: [{ rotate: "180deg" }] },
                ]}
              >
                <ChevronDownIcon size={16} color="#cbd5e1" />
              </View>
            </Pressable>
          ) : null}

          {versionsOpen ? (
            <View style={styles.versionMenu}>
              {versionsDesc.map((ver) => {
                const vb = scoreBand(ver.score);
                const active = ver.id === selected?.id;
                const isLatest = ver.id === latestId;
                const locked = !isPremium && !isLatest;
                return (
                  <Pressable
                    key={ver.id}
                    onPress={() => selectVersion(ver)}
                    style={({ pressed }) => [
                      styles.versionOption,
                      active && styles.versionOptionActive,
                      pressed && !active && styles.versionOptionPressed,
                    ]}
                  >
                    <View style={styles.versionTop}>
                      <Text style={[styles.versionOptionNum, active && styles.versionMutedActive]}>
                        v{ver.versionNumber}.0
                      </Text>
                      {locked ? <LockIcon size={14} /> : null}
                    </View>
                    <Text style={[styles.versionOptionDate, active && styles.versionMutedActive]}>
                      {formatDateTime(ver.scannedAt || ver.scannedDate)}
                    </Text>
                    <Text
                      style={[
                        styles.versionOptionScore,
                        {
                          color: active
                            ? colors.accent
                            : locked
                              ? colors.muted
                              : bandTone(vb).text,
                        },
                      ]}
                    >
                      {locked ? "Premium only" : `Score ${formatScore(ver.score, 0)}`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {!isPremium && versionsDesc.length > 1 ? (
            <Text style={styles.freeNote}>
              Free plan: only the latest version is viewable. Upgrade for full history.
            </Text>
          ) : null}
        </View>

        {!selected ? (
          <Text style={styles.emptyText}>No versions available.</Text>
        ) : (
          <>
            <View style={styles.selectedRow}>
              <View style={{ flex: 1, minWidth: 140 }}>
                <Text style={styles.selectedLabel}>Short result</Text>
                <Text style={styles.selectedMeta}>
                  {versionLabel} · {formatDateTime(selected.scannedAt || selected.scannedDate)}
                </Text>
              </View>
              <View style={styles.footerActions}>
                {onOpenResult ? (
                  <Pressable
                    onPress={() => void openFullResult(selected)}
                    disabled={openingResult}
                    style={({ pressed }) => [
                      styles.downloadBtn,
                      { backgroundColor: "#16bfa8" },
                      pressed && styles.downloadBtnPressed,
                      openingResult && styles.downloadBtnBusy,
                    ]}
                  >
                    <Text style={[styles.downloadText, { color: "#fff" }]}>
                      {openingResult ? "Opening…" : "View full results"}
                    </Text>
                  </Pressable>
                ) : null}
                <Pressable
                  onPress={onDownload}
                  disabled={downloadBusy}
                  style={({ pressed }) => [
                    styles.downloadBtn,
                    styles.downloadBtnOutline,
                    pressed && styles.downloadBtnOutlinePressed,
                    downloadBusy && styles.downloadBtnBusy,
                  ]}
                >
                  <DownloadIcon size={14} color="#334155" />
                  <Text style={[styles.downloadText, styles.downloadTextOutline]}>
                    {downloadBusy ? "Generating PDF…" : `Download full report · ${versionLabel}`}
                  </Text>
                </Pressable>
              </View>
            </View>
            {downloadError ? <Text style={styles.downloadError}>{downloadError}</Text> : null}

            <View style={styles.overallCard}>
              <Text style={styles.overallKicker}>Overall compliance score</Text>
              <View style={styles.overallScoreLine}>
                <Text style={[styles.overallScoreValue, { color: tone.text }]}>
                  {formatScore(selected.score, 0)}
                </Text>
                {selected.score != null ? (
                  <Text style={[styles.overallScorePct, { color: tone.text }]}>%</Text>
                ) : null}
              </View>
              <View
                style={[
                  styles.pill,
                  {
                    marginTop: 12,
                    alignSelf: "flex-start",
                    backgroundColor: tone.pillBg,
                    borderColor: tone.pillBorder,
                  },
                ]}
              >
                <Text style={[styles.pillText, { color: tone.pillText }]}>{band.label}</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Score Breakdown</Text>
            {hydrating && !categoryCards.length ? (
              <Text style={[styles.emptyText, { marginTop: 8 }]}>Loading score breakdown…</Text>
            ) : null}
            {categoryCards.length > 0 &&
            categoryCards.every((row) => row.displayTotal == null && row.unitsChecked == null) ? (
              <Text style={styles.breakdownNote}>
                Unit counts were not stored with this scan. Re-analyse the manuscript to generate the full
                scoring breakdown.
              </Text>
            ) : null}
            <View style={styles.ringGrid}>
              {categoryCards.map((item) => (
                <CategoryRingCard
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
            {!hydrating && !categoryCards.length ? (
              <Text style={[styles.emptyText, { marginTop: 8 }]}>
                No score breakdown recorded for this version.
              </Text>
            ) : null}

            <Text style={[styles.sectionTitle, styles.issuesTitle]}>
              Detected issues <Text style={styles.issuesCount}>({issues.length})</Text>
            </Text>
            <Text style={styles.issuesHint}>
              Each card is one rule finding — expand locations to see every page/line hit.
            </Text>

            {hydrateError ? (
              <Text style={[styles.emptyText, { marginTop: 12, color: colors.rose }]}>{hydrateError}</Text>
            ) : null}

            {hydrating && issues.length === 0 ? (
              <Text style={[styles.emptyText, { marginTop: 12 }]}>Loading detected issues…</Text>
            ) : issues.length === 0 ? (
              <Text style={[styles.emptyText, { marginTop: 12 }]}>No issues recorded for this version.</Text>
            ) : (
              <View style={styles.issueList}>
                {issues.map((issue, idx) => (
                  <IssueCard key={`${issue.category}-${idx}`} issue={issue} />
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

        <ConfirmDialog
          open={Boolean(pendingDeleteId)}
          title="Delete this version?"
          message="It will be removed on web and mobile. The other versions keep their numbers."
          confirmLabel="Delete version"
          tone="danger"
          busy={deleteBusy}
          onCancel={() => setPendingDeleteId(null)}
          onConfirm={async () => {
            const id = pendingDeleteId;
            if (!id) return;
            setDeleteBusy(true);
            try {
              await onDeleteVersion?.(manuscript.id, id);
            } catch (err) {
              setDeleteError(err?.message || "Could not delete this version.");
            } finally {
              setDeleteBusy(false);
              setPendingDeleteId(null);
            }
          }}
        />
        <ConfirmDialog
          open={Boolean(deleteError)}
          title="Something went wrong"
          message={deleteError}
          confirmLabel="OK"
          cancelLabel={null}
          tone="danger"
          onConfirm={() => setDeleteError("")}
          onCancel={() => setDeleteError("")}
        />
        <UpgradePrompt
          message={upgradeMessage}
          onClose={() => setUpgradeMessage("")}
          onUpgrade={onUpgrade}
        />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    overflow: "hidden",
    shadowColor: "#0F1729",
    shadowOpacity: 0.04,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  header: {
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  kicker: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.muted,
  },
  headerRow: {
    marginTop: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  title: { maxWidth: "100%", fontSize: 18, fontWeight: "700", color: "#0F1729" },
  subtitle: { fontSize: 12, color: colors.slate },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  pillText: { fontSize: 11, fontWeight: "700" },
  pillNeutral: { borderColor: colors.border, backgroundColor: "#f8fafc" },
  pillNeutralText: { color: "#475569" },
  versionBlock: {
    marginTop: 18,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e8eef4",
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
  },
  asideLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  asideLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.slate,
  },
  versionPicker: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    backgroundColor: "#0F1729",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  versionPickerPressed: { opacity: 0.92 },
  versionPickerText: { flex: 1, minWidth: 0 },
  versionPickerNum: { fontSize: 13, fontWeight: "700", color: colors.white },
  versionPickerDate: { marginTop: 2, fontSize: 11, color: "#94a3b8" },
  versionPickerScore: { marginTop: 4, fontSize: 11, fontWeight: "700" },
  versionChevron: { padding: 2 },
  versionDeleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(148,163,184,0.12)",
  },
  versionDeleteBtnPressed: { backgroundColor: "rgba(244,63,94,0.18)" },
  versionMenu: {
    marginTop: 8,
    gap: 4,
  },
  versionOption: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
  },
  versionOptionActive: {
    backgroundColor: "#0F1729",
    borderColor: "#0F1729",
  },
  versionOptionPressed: { backgroundColor: "#f1f5f9" },
  versionTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  versionOptionNum: { fontSize: 12, fontWeight: "600", color: colors.slate },
  versionMutedActive: { color: "#cbd5e1" },
  versionOptionDate: { marginTop: 2, fontSize: 11, color: colors.muted },
  versionOptionScore: { marginTop: 4, fontSize: 10, fontWeight: "600" },
  freeNote: {
    marginTop: 10,
    fontSize: 10,
    lineHeight: 15,
    color: colors.slate,
  },
  body: { flex: 1, minHeight: 0 },
  bodyContent: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 24 },
  emptyText: { fontSize: 13, color: colors.muted },
  selectedRow: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
  },
  selectedLabel: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.muted,
  },
  selectedMeta: { marginTop: 3, fontSize: 13, fontWeight: "700", color: colors.text },
  footerActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 6 },
  overallCard: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    padding: 14,
    shadowColor: "#0F1729",
    shadowOpacity: 0.04,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  overallKicker: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.muted,
  },
  overallScoreLine: { marginTop: 6, flexDirection: "row", alignItems: "flex-end", gap: 2 },
  overallScoreValue: { fontSize: 36, fontWeight: "800", fontVariant: ["tabular-nums"], lineHeight: 40 },
  overallScorePct: { fontSize: 18, fontWeight: "800", fontVariant: ["tabular-nums"], paddingBottom: 4 },
  sectionTitle: { marginTop: 18, fontSize: 13, fontWeight: "700", color: "#0F1729" },
  breakdown: { marginTop: 10, gap: 10 },
  breakdownNote: { marginTop: 4, fontSize: 11, lineHeight: 15, color: "#64748b" },
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
    borderColor: colors.accent,
    borderRadius: 8,
    backgroundColor: colors.white,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  fixText: { fontSize: 11, fontWeight: "600", lineHeight: 16, color: colors.accentText },
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
  ringGrid: { marginTop: 10, gap: 8 },
  // Match Scan Results category card styles so the ring + % sit identically.
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
  downloadError: { marginTop: 8, marginBottom: 4, fontSize: 12, color: "#f43f5e" },
  downloadBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    backgroundColor: "#172033",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  downloadBtnPressed: { backgroundColor: "#243049" },
  downloadBtnBusy: { opacity: 0.5 },
  downloadBtnOutline: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white },
  downloadBtnOutlinePressed: { backgroundColor: "#f8fafc" },
  downloadText: { fontSize: 11, fontWeight: "700", color: colors.white },
  downloadTextOutline: { color: "#334155" },
});
