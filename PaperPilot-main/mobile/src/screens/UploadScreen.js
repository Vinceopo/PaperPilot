import { useEffect, useState } from "react";
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
import FormatMechanicsFields from "../components/cockpit/FormatMechanicsFields";
import {
  emptyMechanicsForm,
  formHasAnyRule,
  formToRules,
  rulesToForm,
} from "../lib/formatMechanicsForm";
import { ACCEPTED_EXTENSIONS, MAX_FILE_BYTES } from "../lib/mockAnalysis";

const MIME = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

const MODES = [
  { id: "saved", label: "Use a Saved Format" },
  { id: "upload", label: "Upload a New Format" },
  { id: "customize", label: "Customize a New Format" },
];

const WIZARD_STEPS = [
  { step: 1, label: "Format" },
  { step: 2, label: "Manuscript" },
  { step: 3, label: "Details" },
];

function validateFile(file) {
  if (!file) return "Choose a file.";
  const ext = `.${(file.name || "").split(".").pop()?.toLowerCase()}`;
  if (!ACCEPTED_EXTENSIONS.includes(ext)) return "File must be a PDF or DOCX.";
  if (file.size > MAX_FILE_BYTES) return `File must be ${MAX_FILE_BYTES / 1_000_000} MB or smaller.`;
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

function titleForStep(step) {
  if (step === 1) return "Upload Format Mechanics";
  if (step === 2) return "Upload Manuscript";
  return "File Details";
}

export default function UploadScreen({ navigation }) {
  const {
    mechanics,
    selectedMechanicsId,
    setSelectedMechanicsId,
    currentManuscript,
    currentVersion,
    error,
    setError,
    loading,
    mechanicsBusy,
    manuscriptBusy,
    upgradeMessage,
    setUpgradeMessage,
    tier,
    remaining,
    limit,
    used,
    uploadWizardStep,
    wizardMaxStep,
    advanceUploadWizard,
    goToUploadWizardStep,
    manuscriptReady,
    setManuscriptReady,
    fileDetailsNotice,
    setFileDetailsNotice,
    uploadCancelKey,
    cancelManuscriptUpload,
    onExtractMechanics,
    onSaveMechanicsProfile,
    onPreviewManuscript,
    onMechanicsRename,
    onMechanicsDelete,
    onManuscriptUpload,
    uploadTargets,
    selectUploadTarget,
    scanFlow,
  } = useAppData();

  const [mode, setMode] = useState(mechanics.length ? "saved" : "upload");
  const [mechFile, setMechFile] = useState(null);
  const [mechError, setMechError] = useState("");
  const [mechSuccess, setMechSuccess] = useState("");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [form, setForm] = useState(() => emptyMechanicsForm());
  const [extractMeta, setExtractMeta] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);

  const [msFile, setMsFile] = useState(null);
  const [msTitle, setMsTitle] = useState("");
  const [manuscriptId, setManuscriptId] = useState("");
  const [msError, setMsError] = useState("");
  const [preview, setPreview] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  const selectedMechanics = mechanics.find((item) => item.id === selectedMechanicsId);

  useEffect(() => {
    setMsFile(null);
    setPreview(null);
    setMsError("");
  }, [uploadCancelKey]);

  useEffect(() => {
    if (scanFlow.step === "results" && scanFlow.result) {
      navigation.navigate("Results");
    }
  }, [scanFlow.step, scanFlow.result, navigation]);

  function switchMode(next) {
    setMode(next);
    setMechError("");
    setMechSuccess("");
    setEditing(false);
    if (next === "customize") {
      setForm(emptyMechanicsForm());
      setExtractMeta(null);
      setMechFile(null);
    }
    if (next === "upload") {
      setForm(emptyMechanicsForm());
      setExtractMeta(null);
    }
  }

  async function runExtract(file) {
    const issue = validateFile(file);
    setMechError(issue);
    setMechSuccess("");
    setMechFile(file);
    setExtractMeta(null);
    if (issue || !file) return;
    setExtracting(true);
    try {
      const data = await onExtractMechanics(file);
      if (!data) {
        setMechError("Could not extract format mechanics from this file.");
        return;
      }
      setExtractMeta({
        source_filename: data.source_filename,
        file_type: data.file_type,
        extracted_text: data.extracted_text || "",
        text_preview: data.text_preview || "",
      });
      setForm(
        rulesToForm(data.rules || {}, data.name || file.name.replace(/\.(pdf|docx)$/i, ""))
      );
      setMechSuccess("Format fields extracted — review and edit below, then save.");
    } catch (err) {
      setMechError(err.message || "Extraction failed.");
    } finally {
      setExtracting(false);
    }
  }

  async function pickMechanics() {
    const file = await pickDocument();
    if (!file) return;
    await runExtract(file);
  }

  async function saveAndContinue() {
    if (!form.name?.trim()) {
      setMechError("Enter a profile name.");
      return;
    }
    if (!formHasAnyRule(form)) {
      setMechError("Fill in at least one formatting rule before saving.");
      return;
    }
    setSaveBusy(true);
    setMechError("");
    try {
      await onSaveMechanicsProfile({
        name: form.name.trim(),
        rules: formToRules(form),
        source_filename: extractMeta?.source_filename || mechFile?.name,
        file_type: extractMeta?.file_type,
        extracted_text: extractMeta?.extracted_text,
      });
      setMechSuccess("Format profile saved.");
      advanceUploadWizard(2);
    } catch (err) {
      setMechError(err.message || "Could not save format profile.");
    } finally {
      setSaveBusy(false);
    }
  }

  function continueSaved() {
    if (!selectedMechanicsId) {
      Alert.alert("Select a format", "Choose a saved format mechanics profile to continue.");
      return;
    }
    advanceUploadWizard(2);
  }

  function submitRename() {
    if (!editName.trim()) {
      setMechError("Enter a mechanics name.");
      return;
    }
    Alert.alert("Rename format", `Rename to “${editName.trim()}”?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Rename",
        onPress: async () => {
          const ok = await onMechanicsRename(selectedMechanicsId, editName.trim());
          if (ok) {
            setEditing(false);
            setEditName("");
            setMechError("");
          }
        },
      },
    ]);
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
    setManuscriptReady(false);
    setFileDetailsNotice("");
    scanFlow.selectFile(null);
    const file = await pickDocument();
    if (!file) return;
    const issue = validateFile(file);
    setMsFile(file);
    setMsError(issue);
    setPreview(null);
    if (issue) return;
    setPreviewBusy(true);
    try {
      const data = await onPreviewManuscript(file);
      setPreview(data);
    } catch (err) {
      setMsError(err.message || "Preview failed.");
    } finally {
      setPreviewBusy(false);
    }
  }

  async function confirmManuscriptUpload() {
    const issue = validateFile(msFile);
    if (!manuscriptId && !msTitle.trim()) {
      setMsError("Enter a unique title for a new manuscript.");
      return;
    }
    setMsError(issue);
    if (issue) return;
    const ok = await onManuscriptUpload({
      file: msFile,
      title: msTitle || msFile.name.replace(/\.(pdf|docx)$/i, ""),
      manuscriptId: manuscriptId || undefined,
    });
    if (ok) {
      setMsFile(null);
      setPreview(null);
    }
  }

  function onAnalyse() {
    if (remaining <= 0) {
      setUpgradeMessage(
        `You have used all ${limit} scans included in your ${tier} plan this month.`
      );
      return;
    }
    Alert.alert("Analyse document", "Run a formatting compliance scan on this manuscript?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Analyse",
        onPress: async () => {
          await scanFlow.analyze();
        },
      },
    ]);
  }

  function onCancelUpload() {
    Alert.alert("Cancel upload", "Discard this staged manuscript and return to Step 2?", [
      { text: "Keep", style: "cancel" },
      {
        text: "Cancel upload",
        style: "destructive",
        onPress: cancelManuscriptUpload,
      },
    ]);
  }

  if (scanFlow.step === "analyzing") {
    return (
      <View style={styles.fullCenter}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.analyseTitle}>Analysing…</Text>
        <Text style={styles.analyseSub}>Checking formatting against your mechanics profile.</Text>
      </View>
    );
  }

  if (scanFlow.step === "error") {
    return (
      <View style={styles.fullCenter}>
        <Text style={styles.errorTitle}>Analysis failed</Text>
        <Text style={styles.errorBody}>{scanFlow.error || "Something went wrong."}</Text>
        <PrimaryButton title="Retry" onPress={scanFlow.retry} style={{ marginTop: 16, minWidth: 140 }} />
      </View>
    );
  }

  if (scanFlow.step === "results") {
    return null;
  }

  const scansUsedLabel = `${used} of ${limit} scans`;

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>Dashboard</Text>
          <Text style={styles.h1}>{titleForStep(uploadWizardStep)}</Text>
        </View>
        <View style={styles.headerRight}>
          <View>
            <Text style={styles.plan}>{tier} plan</Text>
            <Text style={styles.remaining}>{scansUsedLabel}</Text>
          </View>
          <Pressable
            style={styles.iconBtn}
            onPress={() => navigation.navigate("Subscription")}
            accessibilityLabel="Subscription settings"
          >
            <Text style={styles.iconBtnText}>⚙</Text>
          </Pressable>
          <Pressable
            style={styles.iconBtn}
            onPress={() => navigation.navigate("Notifications")}
            accessibilityLabel="Notifications"
          >
            <Text style={styles.iconBtnText}>🔔</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.stepChips}>
        {WIZARD_STEPS.filter((item) => item.step <= wizardMaxStep).map((item) => {
          const current = item.step === uploadWizardStep;
          const canJump = !current && item.step <= wizardMaxStep;
          return (
            <Pressable
              key={item.step}
              disabled={!canJump}
              onPress={() => goToUploadWizardStep(item.step)}
              style={[styles.stepChip, current && styles.stepChipActive]}
            >
              <Text style={[styles.stepChipText, current && styles.stepChipTextActive]}>
                {item.step}. {item.label}
              </Text>
            </Pressable>
          );
        })}
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
            {uploadWizardStep === 1 && (
              <View style={styles.card}>
                <Text style={styles.step}>Step 1 of 3</Text>
                <Text style={styles.cardTitle}>Upload Format Mechanics</Text>
                <Text style={styles.cardHint}>
                  Choose a saved profile, upload a guide, or customize rules manually.
                </Text>

                <View style={styles.segment}>
                  {MODES.map((item) => {
                    const active = mode === item.id;
                    return (
                      <Pressable
                        key={item.id}
                        style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                        onPress={() => switchMode(item.id)}
                      >
                        <Text
                          style={[styles.segmentText, active && styles.segmentTextActive]}
                          numberOfLines={2}
                        >
                          {item.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {mode === "saved" && (
                  <View style={{ marginTop: 14 }}>
                    {mechanics.length ? (
                      <>
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
                              {selectedMechanics.source_filename || selectedMechanics.name}
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

                        <PrimaryButton
                          title="Continue to Upload Manuscript"
                          onPress={continueSaved}
                          disabled={!selectedMechanicsId}
                          style={{ marginTop: 14 }}
                        />
                      </>
                    ) : (
                      <Text style={styles.muted}>
                        No saved formats yet. Upload or customize a new format.
                      </Text>
                    )}
                  </View>
                )}

                {mode === "upload" && (
                  <View style={{ marginTop: 14 }}>
                    <Pressable style={styles.dropzone} onPress={pickMechanics} disabled={extracting}>
                      <View style={styles.dropIcon}>
                        <Text style={styles.dropIconText}>↑</Text>
                      </View>
                      <Text style={styles.dropTitle}>
                        {mechFile?.name || "Drop your format guide here"}
                      </Text>
                      <Text style={styles.dropSub}>Supports .pdf and .docx · Max 25 MB</Text>
                      <View style={styles.browsePill}>
                        <Text style={styles.browseText}>
                          {extracting ? "Extracting…" : "Browse files"}
                        </Text>
                      </View>
                    </Pressable>

                    {extracting ? (
                      <View style={styles.inlineBusy}>
                        <ActivityIndicator color={colors.accent} />
                        <Text style={styles.muted}>Reading format guide…</Text>
                      </View>
                    ) : null}

                    {extractMeta?.text_preview ? (
                      <View style={styles.previewBox}>
                        <Text style={styles.label}>Guide preview</Text>
                        <Text style={styles.previewText} numberOfLines={8}>
                          {extractMeta.text_preview}
                        </Text>
                      </View>
                    ) : null}

                    {(extractMeta || formHasAnyRule(form)) && (
                      <View style={{ marginTop: 12 }}>
                        <FormatMechanicsFields
                          form={form}
                          onChange={setForm}
                          disabled={extracting || saveBusy || mechanicsBusy}
                        />
                        <PrimaryButton
                          title={saveBusy ? "Saving…" : "Save & Continue"}
                          onPress={saveAndContinue}
                          busy={saveBusy || mechanicsBusy}
                          style={{ marginTop: 12 }}
                        />
                      </View>
                    )}
                  </View>
                )}

                {mode === "customize" && (
                  <View style={{ marginTop: 14 }}>
                    <FormatMechanicsFields
                      form={form}
                      onChange={setForm}
                      disabled={saveBusy || mechanicsBusy}
                    />
                    <PrimaryButton
                      title={saveBusy ? "Saving…" : "Save & Continue"}
                      onPress={saveAndContinue}
                      busy={saveBusy || mechanicsBusy}
                      style={{ marginTop: 12 }}
                    />
                  </View>
                )}

                {mechError ? <Text style={styles.fieldError}>{mechError}</Text> : null}
                {mechSuccess ? <Text style={styles.fieldSuccess}>{mechSuccess}</Text> : null}
              </View>
            )}

            {uploadWizardStep === 2 && (
              <View style={styles.card}>
                <Text style={styles.step}>Step 2 of 3</Text>
                <Text style={styles.cardTitle}>Upload Manuscript</Text>
                <Text style={styles.cardHint}>
                  Give the manuscript a unique title, or upload a new version of an existing one.
                </Text>

                {uploadTargets.length ? (
                  <>
                    <Text style={[styles.label, { marginTop: 14 }]}>Upload to</Text>
                    <Pressable
                      style={[styles.listRow, !manuscriptId && styles.listRowActive]}
                      onPress={() => {
                        setManuscriptId("");
                        selectUploadTarget("");
                      }}
                    >
                      <Text style={styles.listRowText}>Create a new manuscript</Text>
                    </Pressable>
                    {uploadTargets.map((item) => {
                      const active = manuscriptId === item.id;
                      const next = Number(item.current_version_number || item.version_count || 0) + 1;
                      return (
                        <Pressable
                          key={item.id}
                          style={[styles.listRow, active && styles.listRowActive]}
                          onPress={() => {
                            setManuscriptId(item.id);
                            setMsTitle("");
                            selectUploadTarget(item.id);
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
                    placeholder="Unique manuscript title"
                    placeholderTextColor={colors.muted}
                    editable={!manuscriptBusy}
                  />
                ) : null}

                <Pressable
                  style={styles.dropzone}
                  onPress={pickManuscript}
                  disabled={manuscriptBusy || previewBusy}
                >
                  <View style={styles.dropIcon}>
                    <Text style={styles.dropIconText}>↑</Text>
                  </View>
                  <Text style={styles.dropTitle}>
                    {msFile?.name || "Drop your manuscript here"}
                  </Text>
                  <Text style={styles.dropSub}>Supports .pdf and .docx · Max 25 MB</Text>
                  <View style={styles.browsePill}>
                    <Text style={styles.browseText}>
                      {previewBusy ? "Previewing…" : "Browse files"}
                    </Text>
                  </View>
                </Pressable>

                {preview ? (
                  <View style={styles.previewBox}>
                    <Text style={styles.label}>Manuscript preview</Text>
                    <Text style={styles.previewText} numberOfLines={10}>
                      {preview.text_preview ||
                        preview.preview ||
                        preview.excerpt ||
                        `${preview.page_count || "?"} page(s) · ${msFile?.name || "document"}`}
                    </Text>
                  </View>
                ) : null}

                {msError ? <Text style={styles.fieldError}>{msError}</Text> : null}

                <PrimaryButton
                  title={
                    manuscriptBusy
                      ? "Uploading…"
                      : manuscriptId
                        ? "Confirm upload (new version)"
                        : "Confirm upload"
                  }
                  onPress={confirmManuscriptUpload}
                  busy={manuscriptBusy}
                  disabled={!msFile || previewBusy}
                  style={{ marginTop: 12 }}
                />
              </View>
            )}

            {uploadWizardStep === 3 && manuscriptReady && (currentVersion || scanFlow.file) && (
              <View style={[styles.card, fileDetailsNotice ? styles.cardAccent : null]}>
                <Text style={styles.step}>Step 3 of 3</Text>
                <Text style={styles.cardTitle}>File details</Text>
                <Text style={styles.cardHint}>
                  Review attached files then run compliance analysis
                </Text>

                {fileDetailsNotice ? (
                  <View style={styles.readyBanner}>
                    <Text style={styles.readyBannerTitle}>{fileDetailsNotice}</Text>
                    <Text style={styles.readyBannerBody}>
                      Review the files below, then Analyse — or Cancel upload to discard.
                    </Text>
                  </View>
                ) : null}

                <Text style={[styles.label, { marginTop: 14 }]}>Files attached</Text>

                <View style={styles.fileRow}>
                  <View style={styles.fileIcon} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fileName} numberOfLines={1}>
                      {selectedMechanics?.source_filename ||
                        selectedMechanics?.filename ||
                        selectedMechanics?.name ||
                        "No format guide selected"}
                    </Text>
                    <Text style={styles.dropSub}>
                      {selectedMechanics?.name || "Format guide"}
                    </Text>
                  </View>
                  <Text style={selectedMechanics ? styles.badgeReady : styles.badgePending}>
                    {selectedMechanics ? "✓ Ready" : "Needed"}
                  </Text>
                </View>

                <View style={styles.fileRow}>
                  <View style={styles.fileIcon} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fileName} numberOfLines={1}>
                      {scanFlow.file?.name ||
                        currentVersion?.source_filename ||
                        currentVersion?.filename ||
                        "No manuscript"}
                    </Text>
                    <Text style={styles.dropSub}>
                      {currentManuscript?.title || "Manuscript"}
                    </Text>
                  </View>
                  <Text style={styles.badgeReady}>✓ Ready</Text>
                </View>

                {currentVersion ? (
                  <>
                    <Text style={[styles.label, { marginTop: 8 }]}>Version label</Text>
                    <View style={styles.versionBox}>
                      <Text style={styles.fileName}>
                        v{currentVersion.version_number || scanFlow.versionNumber || "1.0"}
                      </Text>
                    </View>
                  </>
                ) : null}

                {scanFlow.fileError ? (
                  <Text style={styles.fieldError}>{scanFlow.fileError}</Text>
                ) : null}

                <View style={styles.footerActions}>
                  <Pressable style={styles.secondaryBtn} onPress={onCancelUpload}>
                    <Text style={styles.secondaryBtnText}>Cancel upload</Text>
                  </Pressable>
                  <Pressable
                    style={[
                      styles.primaryBtn,
                      (!scanFlow.file && !currentVersion) || !selectedMechanicsId
                        ? { opacity: 0.4 }
                        : null,
                    ]}
                    onPress={onAnalyse}
                    disabled={(!scanFlow.file && !currentVersion) || !selectedMechanicsId}
                  >
                    <Text style={styles.primaryBtnText}>
                      {remaining <= 0 ? "Upgrade to scan" : "Analyse document"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}

            {uploadWizardStep === 3 && !(manuscriptReady && (currentVersion || scanFlow.file)) && (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>No manuscript ready yet</Text>
                <Text style={styles.cardHint}>Upload a manuscript in Step 2 to continue.</Text>
                <PrimaryButton
                  title="Back to Upload Manuscript"
                  onPress={() => goToUploadWizardStep(2)}
                  style={{ marginTop: 14 }}
                />
              </View>
            )}
          </>
        )}
      </ScrollView>

      <UpgradePrompt
        message={upgradeMessage}
        onClose={() => setUpgradeMessage("")}
        onUpgrade={() => {
          setUpgradeMessage("");
          navigation.navigate("Subscription");
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.pageBg },
  fullCenter: {
    flex: 1,
    backgroundColor: colors.pageBg,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  analyseTitle: { marginTop: 16, fontSize: 18, fontWeight: "700", color: colors.text },
  analyseSub: { marginTop: 6, fontSize: 13, color: colors.muted, textAlign: "center" },
  errorTitle: { fontSize: 18, fontWeight: "700", color: colors.rose },
  errorBody: { marginTop: 8, fontSize: 14, color: colors.slate, textAlign: "center" },
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
  plan: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "capitalize",
    color: "#334155",
    textAlign: "right",
  },
  remaining: { fontSize: 10, color: colors.muted, textAlign: "right" },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.inputBg,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnText: { fontSize: 16 },
  stepChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  stepChip: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  stepChipActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentMuted,
  },
  stepChipText: { fontSize: 11, fontWeight: "700", color: colors.slate },
  stepChipTextActive: { color: colors.accentText },
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
  },
  cardAccent: {
    borderColor: colors.accent,
  },
  step: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.accent,
  },
  cardTitle: { marginTop: 4, fontSize: 17, fontWeight: "700", color: colors.text },
  cardHint: { marginTop: 4, fontSize: 12, lineHeight: 18, color: colors.muted },
  segment: {
    marginTop: 14,
    flexDirection: "row",
    gap: 6,
  },
  segmentBtn: {
    flex: 1,
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 8,
    justifyContent: "center",
  },
  segmentBtnActive: {
    borderColor: colors.accent,
    backgroundColor: colors.accentSoft,
  },
  segmentText: {
    fontSize: 10,
    fontWeight: "700",
    color: colors.slate,
    textAlign: "center",
  },
  segmentTextActive: { color: colors.accentText },
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
  dropIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.accentMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  dropIconText: { fontSize: 24, fontWeight: "300", color: colors.accent },
  dropTitle: {
    marginTop: 10,
    fontSize: 14,
    fontWeight: "700",
    color: "#334155",
    textAlign: "center",
  },
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
  fieldSuccess: { marginTop: 8, fontSize: 12, color: colors.emerald },
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
  previewBox: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.fileBg,
    borderRadius: 10,
    padding: 12,
  },
  previewText: { fontSize: 12, lineHeight: 18, color: colors.slate },
  inlineBusy: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  readyBanner: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#a7f3d0",
    backgroundColor: colors.emeraldBg,
    borderRadius: 12,
    padding: 12,
  },
  readyBannerTitle: { fontSize: 13, fontWeight: "700", color: "#065f46" },
  readyBannerBody: { marginTop: 4, fontSize: 11, color: "#047857", lineHeight: 16 },
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
    backgroundColor: "#f1f5f9",
    color: colors.slate,
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
