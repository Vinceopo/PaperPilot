import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useAppData } from "../context/AppDataContext";
import { colors } from "../theme";
import PrimaryButton from "../components/ui/PrimaryButton";
import UpgradePrompt from "../components/ui/UpgradePrompt";
import VersionHistoryModal from "../components/ui/VersionHistoryModal";

const ACCEPTED = [".pdf", ".docx"];
const MIME = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

function validateFile(file) {
  if (!file) return "Choose a file.";
  const name = file.name || "";
  const ext = `.${name.split(".").pop()?.toLowerCase()}`;
  if (!ACCEPTED.includes(ext)) return "File must be a PDF or DOCX.";
  if (file.size > 25_000_000) return "File must be 25 MB or smaller.";
  return "";
}

async function pickDocument() {
  const res = await DocumentPicker.getDocumentAsync({
    type: MIME,
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0];
  return {
    uri: asset.uri,
    name: asset.name || "document",
    mimeType: asset.mimeType || "application/octet-stream",
    size: asset.size || 0,
  };
}

export default function UploadScreen({ navigation }) {
  const {
    mechanics,
    selectedMechanicsId,
    setSelectedMechanicsId,
    manuscripts,
    currentManuscript,
    currentVersion,
    result,
    error,
    setError,
    loading,
    mechanicsBusy,
    manuscriptBusy,
    scanBusy,
    upgradeMessage,
    setUpgradeMessage,
    tier,
    remaining,
    limit,
    onMechanicsUpload,
    onMechanicsRename,
    onMechanicsDelete,
    onManuscriptUpload,
    onScan,
    onLoadHistory,
    versions,
  } = useAppData();

  const [mechFile, setMechFile] = useState(null);
  const [mechError, setMechError] = useState("");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [msFile, setMsFile] = useState(null);
  const [msTitle, setMsTitle] = useState("");
  const [manuscriptId, setManuscriptId] = useState("");
  const [msError, setMsError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);

  const mechanicsSelected = Boolean(selectedMechanicsId);
  const selectedMechanics = mechanics.find((item) => item.id === selectedMechanicsId);

  async function pickMechanics() {
    const file = await pickDocument();
    if (!file) return;
    setMechFile(file);
    setMechError(validateFile(file));
  }

  async function addMechanics() {
    const issue = validateFile(mechFile);
    setMechError(issue);
    if (issue) return;
    const fileName = mechFile.name.replace(/\.(pdf|docx)$/i, "");
    if (mechanics.some((item) => item.name?.toLowerCase() === fileName.toLowerCase())) {
      setMechError("A mechanics document with this name already exists.");
      return;
    }
    const ok = await onMechanicsUpload(mechFile, "");
    if (ok) setMechFile(null);
  }

  async function submitRename() {
    if (!editName.trim()) {
      setMechError("Enter a mechanics name.");
      return;
    }
    if (
      mechanics.some(
        (item) =>
          item.id !== selectedMechanicsId &&
          item.name?.toLowerCase() === editName.trim().toLowerCase()
      )
    ) {
      setMechError("A mechanics document with this name already exists.");
      return;
    }
    const ok = await onMechanicsRename(selectedMechanicsId, editName.trim());
    if (ok) {
      setEditing(false);
      setEditName("");
      setMechError("");
    }
  }

  function removeSelected() {
    if (!selectedMechanics) return;
    Alert.alert("Delete mechanics", `Delete “${selectedMechanics.name}”? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => onMechanicsDelete(selectedMechanics.id),
      },
    ]);
  }

  async function pickManuscript() {
    if (!mechanicsSelected) return;
    const file = await pickDocument();
    if (!file) return;
    setMsFile(file);
    setMsError(validateFile(file));
  }

  async function uploadManuscript() {
    const issue = validateFile(msFile);
    if (!manuscriptId && !msTitle.trim()) {
      setMsError("Enter a title for a new manuscript.");
      return;
    }
    setMsError(issue);
    if (issue) return;
    const ok = await onManuscriptUpload({
      file: msFile,
      title: msTitle || msFile.name.replace(/\.(pdf|docx)$/i, ""),
      manuscriptId,
    });
    if (ok) setMsFile(null);
  }

  async function openHistory() {
    const ok = await onLoadHistory();
    if (ok) setHistoryOpen(true);
  }

  async function runScan() {
    if (remaining <= 0) {
      setUpgradeMessage(
        `You have used all ${limit} scans included in your ${tier} plan this month.`
      );
      return;
    }
    const scan = await onScan();
    if (scan) navigation.navigate("Results");
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>Dashboard</Text>
          <Text style={styles.h1}>Upload Manuscript</Text>
        </View>
        <View style={styles.headerRight}>
          <View>
            <Text style={styles.plan}>{tier} plan</Text>
            <Text style={styles.remaining}>
              {remaining} of {limit} scans remaining
            </Text>
          </View>
          <Pressable
            style={styles.gear}
            onPress={() => navigation.navigate("Subscription")}
            accessibilityLabel="Subscription settings"
          >
            <Text style={styles.gearText}>⚙</Text>
          </Pressable>
          <Pressable
            style={styles.gear}
            onPress={() => navigation.navigate("Notifications")}
            accessibilityLabel="Notifications"
          >
            <Text style={styles.gearText}>🔔</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {error ? (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => setError("")} hitSlop={8}>
              <Text style={styles.dismiss}>✕</Text>
            </Pressable>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator color={colors.accent} />
            <Text style={styles.muted}>Loading your compliance workspace…</Text>
          </View>
        ) : (
          <>
            {/* Step 1 — Mechanics */}
            <View style={styles.card}>
              <Text style={styles.step}>Step 1</Text>
              <Text style={styles.cardTitle}>Upload Format Mechanics</Text>
              <Text style={styles.cardHint}>
                Upload the formatting guide or template your manuscript should follow.
              </Text>

              <Pressable style={styles.dropzone} onPress={pickMechanics}>
                <View style={styles.dropIcon}>
                  <Text style={styles.dropIconText}>↑</Text>
                </View>
                <Text style={styles.dropTitle}>
                  {mechFile?.name || "Drop your format guide here"}
                </Text>
                <Text style={styles.dropSub}>Supports .pdf and .docx · Max 25 MB</Text>
                <View style={styles.browsePill}>
                  <Text style={styles.browseText}>Browse files</Text>
                </View>
              </Pressable>

              <PrimaryButton
                title={mechanicsBusy ? "Adding format mechanics…" : "Add format mechanics"}
                onPress={addMechanics}
                busy={mechanicsBusy}
                disabled={!mechFile || Boolean(mechError)}
                style={{ marginTop: 12 }}
              />
              {mechError ? <Text style={styles.fieldError}>{mechError}</Text> : null}

              <View style={styles.divider}>
                {mechanics.length ? (
                  <>
                    <Text style={styles.label}>Saved mechanics</Text>
                    {mechanics.map((item) => {
                      const active = item.id === selectedMechanicsId;
                      return (
                        <Pressable
                          key={item.id}
                          style={[styles.listRow, active && styles.listRowActive]}
                          onPress={() => {
                            setSelectedMechanicsId(item.id);
                            setEditing(false);
                            setMechError("");
                          }}
                        >
                          <Text style={styles.listRowText} numberOfLines={1}>
                            {item.name || item.source_filename}
                          </Text>
                          {active ? <Text style={styles.check}>✓</Text> : null}
                        </Pressable>
                      );
                    })}

                    {selectedMechanics && !editing ? (
                      <View style={styles.selectedBar}>
                        <Text style={styles.selectedFile} numberOfLines={1}>
                          {selectedMechanics.source_filename}
                        </Text>
                        <View style={styles.rowActions}>
                          <Pressable
                            disabled={mechanicsBusy}
                            onPress={() => {
                              setEditName(selectedMechanics.name || "");
                              setEditing(true);
                            }}
                          >
                            <Text style={styles.rename}>Rename</Text>
                          </Pressable>
                          <Pressable disabled={mechanicsBusy} onPress={removeSelected}>
                            <Text style={styles.delete}>Delete</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : null}

                    {selectedMechanics && editing ? (
                      <View style={styles.renameRow}>
                        <TextInput
                          style={styles.renameInput}
                          value={editName}
                          onChangeText={setEditName}
                          maxLength={200}
                          autoFocus
                          placeholder="Mechanics name"
                          placeholderTextColor={colors.muted}
                        />
                        <Pressable
                          style={styles.saveBtn}
                          disabled={mechanicsBusy || !editName.trim()}
                          onPress={submitRename}
                        >
                          <Text style={styles.saveBtnText}>Save</Text>
                        </Pressable>
                        <Pressable style={styles.cancelBtn} onPress={() => setEditing(false)}>
                          <Text style={styles.cancelText}>Cancel</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </>
                ) : (
                  <Text style={styles.muted}>Upload your first mechanics guide to continue.</Text>
                )}
              </View>
            </View>

            {/* Step 2 — Manuscript */}
            <View
              style={[styles.card, !mechanicsSelected && styles.cardLocked]}
              pointerEvents={mechanicsSelected ? "auto" : "none"}
            >
              <Text style={styles.step}>Step 2</Text>
              <Text style={styles.cardTitle}>Upload Manuscript</Text>
              <Text style={styles.cardHint}>
                {mechanicsSelected
                  ? "Upload the manuscript you want to check against the selected format guide."
                  : "Select formatting mechanics first to unlock this upload."}
              </Text>

              {manuscripts.length ? (
                <>
                  <Text style={styles.label}>Upload to</Text>
                  <Pressable
                    style={[styles.listRow, !manuscriptId && styles.listRowActive]}
                    onPress={() => setManuscriptId("")}
                  >
                    <Text style={styles.listRowText}>Create a new manuscript</Text>
                  </Pressable>
                  {manuscripts.map((item) => {
                    const active = manuscriptId === item.id;
                    const next =
                      Number(item.version_count || item.current_version_number || 0) + 1;
                    return (
                      <Pressable
                        key={item.id}
                        style={[styles.listRow, active && styles.listRowActive]}
                        onPress={() => {
                          setManuscriptId(item.id);
                          setMsTitle("");
                        }}
                      >
                        <Text style={styles.listRowText} numberOfLines={1}>
                          {item.title} · upload version {next}
                        </Text>
                      </Pressable>
                    );
                  })}
                </>
              ) : null}

              {!manuscriptId ? (
                <TextInput
                  style={styles.input}
                  value={msTitle}
                  onChangeText={setMsTitle}
                  placeholder="Manuscript title"
                  placeholderTextColor={colors.muted}
                  editable={mechanicsSelected && !manuscriptBusy}
                />
              ) : null}

              <Pressable
                style={[styles.dropzone, !mechanicsSelected && styles.dropzoneLocked]}
                onPress={pickManuscript}
                disabled={!mechanicsSelected || manuscriptBusy}
              >
                <View style={styles.dropIcon}>
                  <Text style={styles.dropIconText}>↑</Text>
                </View>
                <Text style={styles.dropTitle}>
                  {msFile?.name || "Drop your manuscript here"}
                </Text>
                <Text style={styles.dropSub}>Supports .pdf and .docx · Max 25 MB</Text>
                <View style={styles.browsePill}>
                  <Text style={styles.browseText}>Browse files</Text>
                </View>
              </Pressable>

              {msError ? <Text style={styles.fieldError}>{msError}</Text> : null}

              <PrimaryButton
                title={
                  manuscriptBusy
                    ? "Uploading and parsing…"
                    : manuscriptId
                      ? "Upload new version"
                      : "Upload manuscript"
                }
                onPress={uploadManuscript}
                busy={manuscriptBusy}
                disabled={!mechanicsSelected || !msFile}
                style={{ marginTop: 12 }}
              />

              {currentVersion ? (
                <View style={styles.versionReady}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.readyText}>
                      ✓ Version {currentVersion.version_number} ready
                    </Text>
                    <Text style={styles.dropSub}>
                      {currentVersion.source_filename || currentVersion.filename} ·{" "}
                      {currentVersion.page_count ||
                        currentVersion.parsed_data?.metadata?.page_count ||
                        currentVersion.parsed_data?.pages?.length ||
                        1}{" "}
                      page(s)
                    </Text>
                  </View>
                  <Pressable onPress={openHistory}>
                    <Text style={styles.link}>Version history</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>

            {/* File details */}
            {currentVersion ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>File details</Text>
                <Text style={styles.cardHint}>Provide metadata for compliance checking</Text>
                <Text style={[styles.label, { marginTop: 16 }]}>Files attached</Text>

                <View style={styles.fileRow}>
                  <View style={styles.fileIcon} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fileName} numberOfLines={1}>
                      {selectedMechanics?.source_filename ||
                        selectedMechanics?.filename ||
                        selectedMechanics?.name}
                    </Text>
                    <Text style={styles.dropSub}>Format guide</Text>
                  </View>
                  <Text style={styles.badgeReady}>✓ Ready</Text>
                </View>

                <View style={styles.fileRow}>
                  <View style={styles.fileIcon} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fileName} numberOfLines={1}>
                      {currentVersion.source_filename || currentVersion.filename}
                    </Text>
                    <Text style={styles.dropSub}>
                      {currentManuscript?.title} · Manuscript
                    </Text>
                  </View>
                  <Text style={result ? styles.badgeReady : styles.badgePending}>
                    {result ? "✓ Scanned" : "• Pending scan"}
                  </Text>
                </View>

                <Text style={[styles.label, { marginTop: 12 }]}>Version label</Text>
                <View style={styles.versionBox}>
                  <Text style={styles.fileName}>v{currentVersion.version_number || "1.0"}</Text>
                </View>

                <View style={styles.footerActions}>
                  <Pressable style={styles.secondaryBtn} onPress={openHistory}>
                    <Text style={styles.secondaryBtnText}>View versions</Text>
                  </Pressable>
                  <Pressable
                    style={[styles.primaryBtn, scanBusy && { opacity: 0.4 }]}
                    onPress={runScan}
                    disabled={scanBusy}
                  >
                    <Text style={styles.primaryBtnText}>
                      {scanBusy
                        ? "Analysing…"
                        : remaining <= 0
                          ? "Upgrade to scan"
                          : "Upload & Analyse"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>

      <VersionHistoryModal
        open={historyOpen}
        manuscript={currentManuscript}
        versions={versions}
        tier={tier}
        onClose={() => setHistoryOpen(false)}
      />
      <UpgradePrompt message={upgradeMessage} onClose={() => setUpgradeMessage("")} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.pageBg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  kicker: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.muted,
  },
  h1: { fontSize: 20, fontWeight: "700", color: colors.text },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  plan: { fontSize: 12, fontWeight: "600", textTransform: "capitalize", color: "#334155", textAlign: "right" },
  remaining: { fontSize: 10, color: colors.muted, textAlign: "right" },
  gear: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.inputBg,
    alignItems: "center",
    justifyContent: "center",
  },
  gearText: { fontSize: 16 },
  scroll: { padding: 16, paddingBottom: 40, gap: 16 },
  errorBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    borderWidth: 1,
    borderColor: colors.roseBorder,
    backgroundColor: colors.roseBg,
    borderRadius: 12,
    padding: 14,
  },
  errorText: { flex: 1, color: colors.rose, fontSize: 13 },
  dismiss: { color: colors.rose, fontSize: 16, padding: 2 },
  loadingBox: {
    minHeight: 180,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    padding: 18,
    shadowColor: "#0f172a",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardLocked: { opacity: 0.5 },
  step: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.accent,
  },
  cardTitle: { marginTop: 4, fontSize: 17, fontWeight: "700", color: colors.text },
  cardHint: { marginTop: 4, fontSize: 12, lineHeight: 18, color: colors.muted },
  dropzone: {
    marginTop: 16,
    minHeight: 150,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: "#18bda9",
    backgroundColor: colors.accentSoft,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  dropzoneLocked: { borderColor: "#cbd5e1", backgroundColor: "#f8fafc" },
  dropIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accentMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  dropIconText: { fontSize: 24, fontWeight: "300", color: colors.accent },
  dropTitle: { marginTop: 10, fontSize: 14, fontWeight: "700", color: "#334155", textAlign: "center" },
  dropSub: { marginTop: 4, fontSize: 11, color: colors.muted },
  browsePill: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.white,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 6,
  },
  browseText: { fontSize: 11, fontWeight: "600", color: colors.accentText },
  fieldError: { marginTop: 8, fontSize: 12, color: colors.rose },
  divider: { marginTop: 16, borderTopWidth: 1, borderTopColor: "#f1f5f9", paddingTop: 14 },
  label: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.muted,
    marginBottom: 8,
  },
  listRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    marginBottom: 6,
  },
  listRowActive: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  listRowText: { flex: 1, fontSize: 13, fontWeight: "500", color: "#334155" },
  check: { color: colors.accent, fontWeight: "700" },
  selectedBar: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    backgroundColor: colors.fileBg,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectedFile: { flex: 1, fontSize: 12, color: colors.slate },
  rowActions: { flexDirection: "row", gap: 12 },
  rename: { fontSize: 11, fontWeight: "700", color: "#129c8a" },
  delete: { fontSize: 11, fontWeight: "700", color: colors.rose },
  renameRow: { marginTop: 8, flexDirection: "row", gap: 8, alignItems: "center" },
  renameInput: {
    flex: 1,
    height: 38,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 10,
    fontSize: 13,
    color: colors.text,
    backgroundColor: colors.white,
  },
  saveBtn: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  saveBtnText: { color: colors.white, fontSize: 11, fontWeight: "700" },
  cancelBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  cancelText: { fontSize: 11, fontWeight: "600", color: colors.slate },
  muted: { fontSize: 12, color: colors.muted },
  input: {
    marginTop: 8,
    height: 42,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 13,
    color: colors.text,
  },
  versionReady: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  readyText: { fontSize: 12, fontWeight: "600", color: colors.emerald },
  link: { fontSize: 12, fontWeight: "700", color: "#16a994" },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.fileBg,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  fileIcon: {
    width: 18,
    height: 24,
    borderRadius: 2,
    borderWidth: 2,
    borderColor: "#cbd5e1",
    backgroundColor: colors.white,
  },
  fileName: { fontSize: 13, fontWeight: "600", color: "#334155" },
  badgeReady: {
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: "#d1fae5",
    color: "#047857",
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 10,
    fontWeight: "700",
  },
  badgePending: {
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: "#fef3c7",
    color: "#b45309",
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 10,
    fontWeight: "700",
  },
  versionBox: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  footerActions: {
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#f1f5f9",
    flexDirection: "row",
    justifyContent: "flex-end",
    flexWrap: "wrap",
    gap: 10,
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  secondaryBtnText: { fontSize: 12, fontWeight: "600", color: colors.slate },
  primaryBtn: {
    minWidth: 140,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryBtnText: { fontSize: 12, fontWeight: "700", color: colors.white },
});
