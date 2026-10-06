import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as WebBrowser from "expo-web-browser";
import { useAppData } from "../context/AppDataContext";
import { decodeFilename, sampleMechanicsUrl } from "../api";
import { colors } from "../theme";
import AppShell from "../components/shell/AppShell";
import UploadJourneyModal, {
  ShowStepsRow,
  markUploadJourneySeen,
  uploadJourneySeen,
} from "../components/cockpit/UploadJourneyModal";
import PrimaryButton from "../components/ui/PrimaryButton";
import UpgradePrompt from "../components/ui/UpgradePrompt";
import ConfirmDialog from "../components/ui/ConfirmDialog";
import SelectField from "../components/ui/SelectField";
import FileTypeIcon from "../components/ui/FileTypeIcon";
import FormatMechanicsFields from "../components/cockpit/FormatMechanicsFields";
import DocumentPreview, { PreviewPanel, isPdfFile } from "../components/cockpit/DocumentPreview";
import {
  emptyMechanicsForm,
  formHasAnyRule,
  formToRules,
  rulesToForm,
  sampleMechanicsForm,
} from "../lib/formatMechanicsForm";
import { formatFileSize, oversizeFileMessage } from "../lib/formatFileSize";
import {
  ACCEPTED_EXTENSIONS,
  ACCEPTED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  fileExtension,
  getFileRejection,
} from "../lib/uploadLimits";
import { isScanReady } from "../lib/scanMapper";
import { normalizeTitle } from "../lib/scannedLibrary";
import AnalyzeProgressBar from "../components/cockpit/AnalyzeProgressBar";
import ScanSummaryModal from "../components/cockpit/ScanSummaryModal";
import { normalizeDetectedIssues } from "../components/cockpit/IssuesDetectedPanel";
import DocumentLoader from "../components/ui/DocumentLoader";
import PaperPlaneLoader from "../components/ui/PaperPlaneLoader";
import { TriangleAlertIcon } from "../components/shell/icons";

const MODES = [
  { id: "saved", label: "Use a Saved Format" },
  { id: "upload", label: "Upload a New Format" },
  { id: "customize", label: "Customize a New Format" },
];

function validateMechanicsFile(file) {
  if (!file) return "Choose a mechanics document.";
  if (!ACCEPTED_EXTENSIONS.includes(fileExtension(file))) return "Mechanics must be a PDF or DOCX file.";
  if (file.size > MAX_FILE_SIZE_BYTES) return "oversize";
  return "";
}

function validateManuscriptFile(file) {
  if (!file) return "Choose a manuscript.";
  if (!ACCEPTED_EXTENSIONS.includes(fileExtension(file))) return "type";
  if (file.size > MAX_FILE_SIZE_BYTES) return "size";
  return "";
}

function rejectionMessage(rejection) {
  if (!rejection) return "";
  if (rejection.kind === "type") {
    return `'${rejection.name}' isn't a supported file type. Please upload a PDF or Word document (${ACCEPTED_EXTENSIONS.join(", ")}).`;
  }
  const max = formatFileSize(MAX_FILE_SIZE_BYTES);
  let actual = formatFileSize(rejection.size);
  if (actual === max) actual = formatFileSize(rejection.size, { roundUp: true });
  return `Your file '${rejection.name}' is ${actual}, but we can only accept files up to ${max}. Please choose a smaller file and try again.`;
}

function formFromSaved(item) {
  if (!item) return emptyMechanicsForm();
  const mapped = rulesToForm(item.rules || {}, item.name || item.source_filename || "");
  // Profiles with almost no stored rules get editable sample values instead of a blank form.
  if (!formHasAnyRule(mapped)) return sampleMechanicsForm(item.name || "Saved Format");
  return mapped;
}

async function pickDocument() {
  const res = await DocumentPicker.getDocumentAsync({
    type: ACCEPTED_MIME_TYPES,
    copyToCacheDirectory: true,
  });
  if (res.canceled || !res.assets?.length) return null;
  const asset = res.assets[0];
  return {
    uri: asset.uri,
    name: decodeFilename(asset.name || "document"),
    mimeType: asset.mimeType || "application/octet-stream",
    size: asset.size || 0,
  };
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
    uploadWizardStep,
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
    onMechanicsUpdateProfile,
    onPreviewManuscript,
    onMechanicsRename,
    onMechanicsDelete,
    onManuscriptUpload,
    uploadTargets,
    selectUploadTarget,
    scanFlow,
  } = useAppData();

  const [mode, setMode] = useState(mechanics.length ? "saved" : "upload");
  const [mechError, setMechError] = useState("");
  const [mechSuccess, setMechSuccess] = useState("");
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [mechFile, setMechFile] = useState(null);
  const [uploadForm, setUploadForm] = useState(() => emptyMechanicsForm());
  const [customizeForm, setCustomizeForm] = useState(() => sampleMechanicsForm("My Custom Format"));
  const [savedForm, setSavedForm] = useState(() =>
    formFromSaved(mechanics.find((item) => item.id === selectedMechanicsId) || mechanics[0])
  );
  const [oversizeBytes, setOversizeBytes] = useState(null);
  const [rejection, setRejection] = useState(null);
  const [extractMeta, setExtractMeta] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [sampleBusy, setSampleBusy] = useState(false);
  const [journeyOpen, setJourneyOpen] = useState(false);
  const [nameError, setNameError] = useState("");
  const [confirm, setConfirm] = useState(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const scrollRef = useRef(null);
  const nameInputRef = useRef(null);

  const [msFile, setMsFile] = useState(null);
  const [msTitle, setMsTitle] = useState("");
  const [manuscriptId, setManuscriptId] = useState("");
  const [msError, setMsError] = useState("");
  const [msSuccess, setMsSuccess] = useState("");
  const [preview, setPreview] = useState(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [titleOpen, setTitleOpen] = useState(false);
  const [titleMode, setTitleMode] = useState("new");
  const [existingId, setExistingId] = useState("");
  const [titleError, setTitleError] = useState("");
  const previewRequest = useRef(0);
  const pickRequest = useRef(0);

  const selectedMechanics = mechanics.find((item) => item.id === selectedMechanicsId);
  const scanReady = isScanReady(currentVersion, currentManuscript);
  const form = mode === "upload" ? uploadForm : mode === "customize" ? customizeForm : savedForm;
  const setForm =
    mode === "upload" ? setUploadForm : mode === "customize" ? setCustomizeForm : setSavedForm;
  const selectedRulesKey = JSON.stringify(selectedMechanics?.rules || {});
  const mechBusy = extracting || mechanicsBusy || confirmBusy;

  const mechanicsSelected = Boolean(selectedMechanicsId);
  const msUploading = Boolean(manuscriptBusy || (confirmBusy && uploadWizardStep === 2));
  const msPreparing = Boolean(previewBusy && msFile && !msUploading);
  const msPanelBusy = manuscriptBusy || previewBusy || confirmBusy;
  const canPickManuscript = mechanicsSelected && !msPanelBusy;
  const showMsPreview = Boolean(msFile) && !validateManuscriptFile(msFile);
  const mechanicsOptions = mechanics.map((item) => ({
    value: item.id,
    label: item.name || item.source_filename,
  }));
  const titleOptions = uploadTargets.map((item) => {
    const versionCount = Number(
      item.version_count ?? item.current_version_number ?? item.versions?.length ?? 0
    );
    return { value: item.id, label: `${item.title} · version ${versionCount + 1}` };
  });

  useEffect(() => {
    previewRequest.current += 1;
    setMsFile(null);
    setPreview(null);
    setPreviewBusy(false);
    setMsError("");
    setMsSuccess("");
    setMsTitle("");
    setTitleOpen(false);
    setTitleError("");
  }, [uploadCancelKey]);

  // Keep Format Fields in sync with the selected saved mechanics.
  useEffect(() => {
    if (mode !== "saved") return;
    setSavedForm(selectedMechanics ? formFromSaved(selectedMechanics) : emptyMechanicsForm());
    setEditing(false);
  }, [mode, selectedMechanicsId, selectedRulesKey]);

  useEffect(() => {
    if (scanFlow.step === "results" && scanFlow.result) {
      navigation.navigate("Results");
    }
    if (scanFlow.step === "documentTrace" && scanFlow.result) {
      navigation.navigate("DocumentReference");
    }
  }, [scanFlow.step, scanFlow.result, navigation]);

  const showingUploadFace = scanFlow.step === "idle" || scanFlow.step === "fileSelected";

  useEffect(() => {
    if (!showingUploadFace || uploadJourneySeen()) return;
    setJourneyOpen(true);
  }, [showingUploadFace]);

  function dismissJourney() {
    markUploadJourneySeen();
    setJourneyOpen(false);
  }

  async function runConfirm() {
    const action = confirm?.onConfirm;
    if (!action) return;
    setConfirmBusy(true);
    try {
      await action();
    } finally {
      setConfirmBusy(false);
      setConfirm(null);
    }
  }

  async function onDownloadSample() {
    setSampleBusy(true);
    setMechError("");
    try {
      await WebBrowser.openBrowserAsync(sampleMechanicsUrl());
    } catch (err) {
      setMechError(err?.message || "Could not download the sample format guide.");
    } finally {
      setSampleBusy(false);
    }
  }

  function updateForm(next) {
    setForm(next);
    if (nameError && next.name?.trim()) {
      setNameError("");
      setMechError("");
    }
  }

  function revealNameField() {
    const scroll = scrollRef.current;
    const input = nameInputRef.current;
    if (!scroll || !input) return;
    const target = scroll.getInnerViewRef?.() ?? scroll;
    input.measureLayout(
      target,
      (_x, y) => scroll.scrollTo({ y: Math.max(0, y - 60), animated: true }),
      () => scroll.scrollTo({ y: 0, animated: true })
    );
    setTimeout(() => input.focus(), 350);
  }

  function switchMode(next) {
    if (next === mode) return;
    setMode(next);
    setMechError("");
    setMechSuccess("");
    setNameError("");
    setEditing(false);
  }

  function clearUploadDraft() {
    setMechFile(null);
    setExtractMeta(null);
    setUploadForm(emptyMechanicsForm());
    setNameError("");
  }

  async function runExtract(file) {
    setMechError("");
    setMechSuccess("");
    setNameError("");
    setMechFile(file);
    setExtractMeta(null);
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
        page_count: data.page_count || (data.pages || []).length || 0,
        pages: Array.isArray(data.pages) ? data.pages : [],
      });
      setUploadForm(
        rulesToForm(data.rules || {}, data.name || file.name.replace(/\.(pdf|docx)$/i, ""))
      );
      setMechSuccess("Format fields extracted from your guide — review and edit below, then save.");
    } catch (err) {
      setMechError(err.message || "Extraction failed.");
    } finally {
      setExtracting(false);
    }
  }

  function requestExtract(file) {
    if (!file) return;
    const issue = validateMechanicsFile(file);
    if (issue === "oversize") {
      setMechFile(null);
      setMechError("");
      setMechSuccess("");
      setOversizeBytes(file.size);
      return;
    }
    if (issue) {
      setMechError(issue);
      setMechSuccess("");
      setMechFile(file);
      return;
    }
    setConfirm({
      title: "Extract format fields?",
      message: `PaperPilot will analyze “${file.name}” and fill Format Fields from the rules in that guide. You can edit any value before saving.`,
      confirmLabel: "Extract fields",
      onConfirm: () => {
        void runExtract(file);
      },
    });
  }

  async function pickMechanics() {
    const file = await pickDocument();
    if (file) requestExtract(file);
  }

  function buildCreatePayload() {
    const name = String(form.name || "").trim();
    if (!name) {
      const message = "Enter a profile name before saving.";
      setNameError(message);
      setMechError(message);
      revealNameField();
      return null;
    }
    if (mechanics.some((item) => String(item.name || "").toLowerCase() === name.toLowerCase())) {
      setMechError("A mechanics document with this name already exists.");
      return null;
    }
    if (!formHasAnyRule(form)) {
      setMechError("Add at least one format rule before saving.");
      return null;
    }
    const fromUpload = mode === "upload";
    return {
      name,
      rules: formToRules(form),
      source_filename:
        fromUpload && extractMeta?.source_filename ? extractMeta.source_filename : `${name}.docx`,
      file_type: fromUpload && extractMeta?.file_type ? extractMeta.file_type : "docx",
      extracted_text: fromUpload ? extractMeta?.extracted_text || "" : "",
    };
  }

  function requestSaveProfile() {
    setMechError("");
    setMechSuccess("");
    const payload = buildCreatePayload();
    if (!payload) return;
    const savingMode = mode;
    setConfirm({
      title: "Save format mechanics?",
      message: `Save “${payload.name}” to Saved Mechanics and continue to Upload Manuscript?`,
      confirmLabel: "Save and Continue",
      onConfirm: async () => {
        try {
          await onSaveMechanicsProfile(payload);
          if (savingMode === "upload") clearUploadDraft();
          else setCustomizeForm(sampleMechanicsForm("My Custom Format"));
          advanceUploadWizard(2);
        } catch (err) {
          setMechError(err.message || "Could not save format mechanics. Please try again.");
        }
      },
    });
  }

  function buildUpdatePayload() {
    if (!selectedMechanicsId || !selectedMechanics) {
      setMechError("Select a saved format first.");
      return null;
    }
    const name = String(savedForm.name || "").trim();
    if (!name) {
      setMechError("Enter a profile name before saving.");
      return null;
    }
    if (
      mechanics.some(
        (item) =>
          item.id !== selectedMechanicsId &&
          String(item.name || "").toLowerCase() === name.toLowerCase()
      )
    ) {
      setMechError("A mechanics document with this name already exists.");
      return null;
    }
    if (!formHasAnyRule(savedForm)) {
      setMechError("Add at least one format rule before saving.");
      return null;
    }
    return { name, rules: formToRules(savedForm) };
  }

  function requestUpdateSaved() {
    setMechError("");
    setMechSuccess("");
    const payload = buildUpdatePayload();
    if (!payload) return;
    const mechanicsId = selectedMechanicsId;
    setConfirm({
      title: "Use this format?",
      message: `Select “${payload.name}” and continue to Upload Manuscript? Any edits to the Format Fields will be saved to this format.`,
      confirmLabel: "Select and Continue",
      onConfirm: async () => {
        try {
          await onMechanicsUpdateProfile(mechanicsId, payload);
          setMechSuccess("Format mechanics updated.");
          advanceUploadWizard(2);
        } catch (err) {
          setMechError(err.message || "Could not update format mechanics. Please try again.");
        }
      },
    });
  }

  function submitRename() {
    const nextName = editName.trim();
    if (!nextName) {
      setMechError("Enter a mechanics name.");
      return;
    }
    if (
      mechanics.some(
        (item) =>
          item.id !== selectedMechanicsId &&
          String(item.name || "").toLowerCase() === nextName.toLowerCase()
      )
    ) {
      setMechError("A mechanics document with this name already exists.");
      return;
    }
    setMechError("");
    setConfirm({
      title: "Rename format mechanics?",
      message: `Rename “${selectedMechanics?.name}” to “${nextName}”?`,
      confirmLabel: "Save name",
      onConfirm: async () => {
        const ok = await onMechanicsRename(selectedMechanicsId, nextName);
        if (ok) {
          setEditing(false);
          setEditName("");
        }
      },
    });
  }

  function removeSelected() {
    if (!selectedMechanics) return;
    setConfirm({
      title: "Delete format mechanics?",
      message: `“${selectedMechanics.name}” will be removed permanently. Manuscripts that used it will keep their files, but this format profile will be gone.`,
      confirmLabel: "Delete",
      tone: "danger",
      onConfirm: async () => {
        const ok = await onMechanicsDelete(selectedMechanics.id);
        if (ok !== false) {
          setMechSuccess("Format mechanics deleted.");
          setSavedForm(emptyMechanicsForm());
        } else {
          setMechError("Could not delete this format. It may still be linked to a manuscript — try again.");
        }
      },
    });
  }

  async function loadPreview(file) {
    const requestId = ++previewRequest.current;
    setPreview(null);
    setPreviewBusy(true);
    try {
      const data = await onPreviewManuscript(file);
      if (previewRequest.current !== requestId) return;
      setPreview(data);
    } catch {
      if (previewRequest.current !== requestId) return;
      setPreview({ filename: file.name, text_preview: "", page_count: 0 });
    } finally {
      if (previewRequest.current === requestId) setPreviewBusy(false);
    }
  }

  function rejectManuscript(file, kind) {
    previewRequest.current += 1;
    setMsFile(null);
    setPreview(null);
    setPreviewBusy(false);
    setMsError("");
    setMsSuccess("");
    setRejection({ kind, name: file.name, size: file.size });
  }

  async function pickManuscript() {
    if (!canPickManuscript) return;
    const file = await pickDocument();
    if (!file) return;
    const pickId = ++pickRequest.current;
    const issue = await getFileRejection(file);
    if (pickRequest.current !== pickId) return;
    setManuscriptReady(false);
    setFileDetailsNotice("");
    scanFlow.selectFile(null);
    if (issue) {
      rejectManuscript(file, issue);
      return;
    }
    setMsFile(file);
    setMsError("");
    setMsSuccess("");
    void loadPreview(file);
  }

  function chooseAnotherFile() {
    setRejection(null);
    // iOS cannot present the document picker until the dialog has finished closing.
    setTimeout(() => void pickManuscript(), 450);
  }

  function onCancelManuscript() {
    if (!msFile) {
      goToUploadWizardStep(1);
      return;
    }
    setConfirm({
      title: "Go back to the previous step?",
      message:
        "Your selected manuscript will be discarded and you will return to Step 1. Your chosen format stays selected.",
      confirmLabel: "Cancel and go back",
      cancelLabel: "Stay here",
      tone: "danger",
      onConfirm: () => {
        previewRequest.current += 1;
        cancelManuscriptUpload();
        goToUploadWizardStep(1);
      },
    });
  }

  function queueUpload(pending) {
    setConfirm({
      title: pending.manuscriptId ? "Upload new version?" : "Upload manuscript?",
      message: `Save “${pending.file?.name}” as “${pending.title}” on the server? File Details opens only after the upload finishes.`,
      confirmLabel: pending.manuscriptId ? "Upload version" : "Upload & continue",
      onConfirm: async () => {
        const ok = await onManuscriptUpload({
          file: pending.file,
          title: pending.title,
          manuscriptId: pending.manuscriptId || undefined,
        });
        if (ok) {
          setMsFile(null);
          setPreview(null);
          setMsTitle("");
          setMsSuccess("Manuscript uploaded completely.");
        }
      },
    });
  }

  function useExistingManuscript(id) {
    const selected = uploadTargets.find((item) => item.id === id);
    if (!selected) {
      setTitleError("Choose a manuscript to add this version to.");
      return;
    }
    setManuscriptId(selected.id);
    selectUploadTarget(selected.id);
    setMsTitle("");
    setTitleError("");
    setMsError("");
    setTitleOpen(false);
    queueUpload({ file: msFile, title: selected.title, manuscriptId: selected.id });
  }

  function submitTitle() {
    if (titleMode === "existing") {
      useExistingManuscript(existingId);
      return;
    }
    const resolvedTitle = msTitle.trim();
    if (!resolvedTitle) {
      setTitleError("Enter a title for a new manuscript.");
      return;
    }
    const match = uploadTargets.find(
      (item) => normalizeTitle(item.title) === normalizeTitle(resolvedTitle)
    );
    if (match) {
      setExistingId(match.id);
      setTitleMode("existing");
      setTitleError(
        "That title is already in your library. Continue to save this file as a new version, or enter a different name."
      );
      return;
    }
    setTitleError("");
    setMsError("");
    setTitleOpen(false);
    setManuscriptId("");
    selectUploadTarget("");
    queueUpload({ file: msFile, title: resolvedTitle, manuscriptId: "" });
  }

  function requestManuscriptUpload() {
    const issue = validateManuscriptFile(msFile);
    if ((issue === "type" || issue === "size") && msFile) {
      rejectManuscript(msFile, issue);
      return;
    }
    setMsError(issue);
    setMsSuccess("");
    if (issue) return;
    setManuscriptId("");
    setMsTitle("");
    setTitleError("");
    setTitleMode(uploadTargets.length ? "existing" : "new");
    setExistingId(uploadTargets[0]?.id || "");
    setTitleOpen(true);
  }

  function onAnalyse() {
    if (!scanReady || !selectedMechanicsId) return;
    if (remaining <= 0) {
      setUpgradeMessage(
        `You have used all ${limit} scans included in your ${tier} plan this month.`
      );
      return;
    }
    setConfirm({
      title: "Analyse this document?",
      message: `Check “${currentManuscript?.title || "this manuscript"}” against the selected format mechanics? This uses 1 scan from your plan.`,
      confirmLabel: "Start analysis",
      onConfirm: () => {
        void scanFlow.analyze();
      },
    });
  }

  function onCancelUpload() {
    setConfirm({
      title: "Cancel this upload?",
      message:
        "The staged manuscript will be discarded and you will return to Upload Manuscript. This cannot be undone.",
      confirmLabel: "Cancel upload",
      tone: "danger",
      onConfirm: () => cancelManuscriptUpload(),
    });
  }

  const activeNav = showingUploadFace ? "upload" : null;

  if (scanFlow.step === "analyzing") {
    return (
      <AppShell active={activeNav}>
        <AnalyzeProgressBar
          progress={scanFlow.analyzeProgress}
          resultReady={Boolean(scanFlow.result)}
          onReveal={scanFlow.revealSummary}
        />
      </AppShell>
    );
  }

  if (scanFlow.step === "error") {
    return (
      <AppShell active={activeNav} breadcrumb="Dashboard" title="Analysis Failed">
        <View style={styles.fullCenter}>
          <Text style={styles.errorTitle}>Analysis failed</Text>
          <Text style={styles.errorBody}>{scanFlow.error || "Something went wrong."}</Text>
          <PrimaryButton title="Retry" onPress={scanFlow.retry} style={{ marginTop: 16, minWidth: 140 }} />
        </View>
      </AppShell>
    );
  }

  if (scanFlow.step === "results" || scanFlow.step === "documentTrace") {
    return <AppShell active={activeNav} />;
  }

  return (
    <AppShell active={activeNav}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
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
            <PaperPlaneLoader />
            <Text style={styles.muted}>Loading your compliance workspace…</Text>
          </View>
        ) : (
          <>
            {uploadWizardStep === 1 && (
              <View style={styles.card}>
                <ShowStepsRow step={1} onShowSteps={() => setJourneyOpen(true)} />
                <Text style={styles.cardTitle}>Upload Format Mechanics</Text>
                <Text style={styles.cardHint}>
                  Choose a saved format, upload a guide for extraction, or customize fields manually.
                  Format Fields always reflect the rules inside the mechanics you select or upload.
                </Text>

                <View style={styles.sampleBanner}>
                  <View>
                    <Text style={styles.sampleTitle}>Don’t have a format guide yet?</Text>
                    <Text style={styles.sampleBody}>
                      Download a sample DOCX, then upload it here or use Customize to edit the
                      starter rules.
                    </Text>
                  </View>
                  <Pressable
                    style={({ pressed }) => [
                      styles.sampleBtn,
                      pressed && styles.sampleBtnPressed,
                      (sampleBusy || mechBusy) && styles.disabled,
                    ]}
                    disabled={sampleBusy || mechBusy}
                    onPress={onDownloadSample}
                  >
                    {sampleBusy ? (
                      <>
                        <ActivityIndicator size="small" color={colors.accentText} />
                        <Text style={styles.sampleBtnText}>Downloading…</Text>
                      </>
                    ) : (
                      <Text style={styles.sampleBtnText}>⬇ Download sample format</Text>
                    )}
                  </Pressable>
                </View>

                <View style={styles.segment}>
                  {MODES.map((item) => {
                    const active = mode === item.id;
                    return (
                      <Pressable
                        key={item.id}
                        style={[styles.segmentBtn, active && styles.segmentBtnActive]}
                        onPress={() => switchMode(item.id)}
                        disabled={mechBusy}
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
                  <View style={{ marginTop: 16 }}>
                    {mechanics.length ? (
                      <>
                        <Text style={styles.label}>Saved mechanics</Text>
                        <SelectField
                          title="Saved mechanics"
                          value={selectedMechanicsId}
                          options={mechanicsOptions}
                          placeholder="Select a mechanics document"
                          disabled={mechBusy}
                          onChange={(value) => {
                            setSelectedMechanicsId(value);
                            setEditing(false);
                            setMechError("");
                            setMechSuccess("");
                          }}
                        />

                        {selectedMechanics && !editing ? (
                          <View style={styles.selectedBar}>
                            <FileTypeIcon
                              fileType={selectedMechanics.file_type}
                              filename={selectedMechanics.source_filename || selectedMechanics.name}
                              width={20}
                              height={24}
                            />
                            <Text style={styles.selectedFile} numberOfLines={1}>
                              {selectedMechanics.source_filename || selectedMechanics.name}
                            </Text>
                            <View style={styles.rowActions}>
                              <Pressable
                                disabled={mechBusy}
                                onPress={() => {
                                  setEditName(selectedMechanics.name || "");
                                  setEditing(true);
                                }}
                              >
                                <Text style={styles.rename}>Rename</Text>
                              </Pressable>
                              <Pressable disabled={mechBusy} onPress={removeSelected}>
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
                              disabled={mechBusy || !editName.trim()}
                              onPress={submitRename}
                            >
                              <Text style={styles.saveBtnText}>Save</Text>
                            </Pressable>
                            <Pressable style={styles.cancelBtn} onPress={() => setEditing(false)}>
                              <Text style={styles.cancelText}>Cancel</Text>
                            </Pressable>
                          </View>
                        ) : null}

                        {selectedMechanics ? (
                          <>
                            <Text style={styles.savedHint}>
                              Format Fields below show the rules stored in{" "}
                              <Text style={styles.savedHintName}>
                                {selectedMechanics.name || selectedMechanics.source_filename}
                              </Text>
                              . Edit them, then save changes or continue.
                            </Text>
                            <View style={{ marginTop: 14 }}>
                              <FormatMechanicsFields
                                form={savedForm}
                                onChange={setSavedForm}
                                disabled={mechBusy}
                                title="Format Fields (from saved mechanics)"
                              />
                            </View>
                          </>
                        ) : null}

                        <PrimaryButton
                          title={mechanicsBusy ? "Saving…" : "Select and Continue"}
                          onPress={requestUpdateSaved}
                          busy={mechanicsBusy}
                          disabled={!selectedMechanicsId || mechBusy}
                          style={{ marginTop: 14 }}
                        />
                      </>
                    ) : (
                      <Text style={styles.muted}>
                        No saved formats yet. Download the sample, upload a guide, or customize a new format.
                      </Text>
                    )}
                  </View>
                )}

                {mode === "upload" && (
                  <View style={{ marginTop: 16 }}>
                    <Pressable
                      style={[styles.dropzone, { marginTop: 0 }]}
                      onPress={pickMechanics}
                      disabled={mechBusy}
                    >
                      {extracting ? (
                        <View style={styles.dropBusy}>
                          <DocumentLoader size={96} />
                          <Text style={styles.dropTitle}>Extracting format fields…</Text>
                        </View>
                      ) : (
                        <>
                          <View style={styles.dropIcon}>
                            <Text style={styles.dropIconText}>↑</Text>
                          </View>
                          <Text style={styles.dropTitle}>
                            {mechFile?.name || "Drop your format guide here"}
                          </Text>
                          <Text style={styles.dropSub}>
                            {mechFile
                              ? `${formatFileSize(mechFile.size)} · Confirm extraction to fill Format Fields below`
                              : `Tap to browse · .pdf and .docx · Max ${formatFileSize(MAX_FILE_SIZE_BYTES)}`}
                          </Text>
                          <View style={styles.browsePill}>
                            <Text style={styles.browseText}>Browse files</Text>
                          </View>
                        </>
                      )}
                    </Pressable>

                    {extractMeta && !extracting ? (
                      <PreviewPanel
                        label="Mechanics preview"
                        status={
                          isPdfFile(mechFile) && extractMeta.page_count
                            ? `${extractMeta.page_count} page${extractMeta.page_count === 1 ? "" : "s"} · scroll to read`
                            : "Original document · scroll to read"
                        }
                      >
                        <DocumentPreview
                          file={mechFile}
                          preview={extractMeta}
                          emptyLabel="No mechanics preview available yet."
                        />
                      </PreviewPanel>
                    ) : null}

                    {extractMeta ? (
                      <View style={{ marginTop: 16 }}>
                        <FormatMechanicsFields
                          form={uploadForm}
                          onChange={updateForm}
                          disabled={mechBusy}
                          title="Format Fields (from uploaded guide)"
                          nameError={nameError}
                          nameInputRef={nameInputRef}
                        />
                        <View style={styles.editorActions}>
                          <PrimaryButton
                            title={mechanicsBusy ? "Saving…" : "Save and Continue"}
                            onPress={requestSaveProfile}
                            busy={mechanicsBusy}
                            disabled={mechBusy}
                            style={{ flex: 1 }}
                          />
                          <Pressable
                            style={[styles.clearBtn, mechBusy && styles.disabled]}
                            disabled={mechBusy}
                            onPress={() => {
                              clearUploadDraft();
                              setMechError("");
                              setMechSuccess("");
                            }}
                          >
                            <Text style={styles.clearBtnText}>Clear draft</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : null}
                  </View>
                )}

                {mode === "customize" && (
                  <View style={{ marginTop: 16 }}>
                    <Text style={[styles.cardHint, { marginTop: 0, marginBottom: 14 }]}>
                      Starter format rules are loaded below — edit any field to match your
                      requirements, then save the profile for reuse.
                    </Text>
                    <FormatMechanicsFields
                      form={customizeForm}
                      onChange={updateForm}
                      disabled={mechBusy}
                      title="Format Fields"
                      nameError={nameError}
                      nameInputRef={nameInputRef}
                    />
                    <PrimaryButton
                      title={mechanicsBusy ? "Saving…" : "Save customized format & continue"}
                      onPress={requestSaveProfile}
                      busy={mechanicsBusy}
                      disabled={mechBusy}
                      style={{ marginTop: 12 }}
                    />
                  </View>
                )}

                {mechError ? <Text style={styles.fieldError}>{mechError}</Text> : null}
                {mechSuccess && !mechError ? (
                  <Text style={styles.fieldSuccess}>{mechSuccess}</Text>
                ) : null}

                {mechanicsBusy && !confirmBusy ? (
                  <View style={styles.processingOverlay}>
                    <DocumentLoader size={112} />
                    <Text style={styles.processingText}>Processing…</Text>
                  </View>
                ) : null}
              </View>
            )}

            {uploadWizardStep === 2 && (
              <View style={[styles.card, !mechanicsSelected && styles.cardDisabled]}>
                <ShowStepsRow step={2} onShowSteps={() => setJourneyOpen(true)} />
                <Text style={styles.cardTitle}>Upload Manuscript</Text>
                <Text style={styles.cardHint}>
                  Upload the manuscript you want to check against the confirmed format guide.
                </Text>

                <Pressable
                  style={[styles.dropzone, !mechanicsSelected && styles.dropzoneDisabled]}
                  onPress={pickManuscript}
                  disabled={!canPickManuscript}
                >
                  <View style={styles.dropIcon}>
                    <Text style={styles.dropIconText}>↑</Text>
                  </View>
                  <Text style={styles.dropTitle}>
                    {msFile?.name || "Drop your manuscript here"}
                  </Text>
                  <Text style={styles.dropSub}>
                    {msFile
                      ? msPreparing
                        ? `${formatFileSize(msFile.size)} · Preparing document preview below…`
                        : msUploading
                          ? `${formatFileSize(msFile.size)} · Uploading — see progress below`
                          : `${formatFileSize(msFile.size)} · Preview appears below — confirm Upload when ready`
                      : `Tap to browse · .pdf and .docx · Max ${formatFileSize(MAX_FILE_SIZE_BYTES)}`}
                  </Text>
                  <View style={styles.browsePill}>
                    <Text style={styles.browseText}>Browse files</Text>
                  </View>
                </Pressable>

                {showMsPreview ? (
                  <PreviewPanel
                    label="Manuscript preview"
                    status={
                      msUploading
                        ? "Uploading…"
                        : msPreparing
                          ? "Preparing…"
                          : preview?.page_count && isPdfFile(msFile)
                            ? `${preview.page_count} page${preview.page_count === 1 ? "" : "s"} · scroll to read`
                            : "Original document · scroll to read"
                    }
                    statusTone={msUploading || msPreparing ? "accent" : "muted"}
                    overlayTitle={
                      msUploading
                        ? "Uploading manuscript…"
                        : msPreparing
                          ? "Opening manuscript preview…"
                          : ""
                    }
                    overlayBody={
                      msUploading
                        ? "Please wait while your academic document is saved. The upload button unlocks when this finishes."
                        : "Please wait while your academic document is prepared for display."
                    }
                    footer={
                      msUploading
                        ? "Uploading in progress — stay on this page until it completes."
                        : msPreparing
                          ? "Preparing live preview of your academic document…"
                          : "Live preview of your uploaded manuscript — scroll to see pages below."
                    }
                  >
                    <DocumentPreview
                      file={msFile}
                      preview={preview}
                      emptyLabel="No manuscript preview available yet."
                    />
                  </PreviewPanel>
                ) : null}

                {msError ? <Text style={styles.fieldError}>{msError}</Text> : null}
                {msSuccess && !msError ? (
                  <Text style={styles.fieldSuccess}>{msSuccess}</Text>
                ) : null}

                <View style={styles.msActions}>
                  <Pressable
                    style={[styles.msCancelBtn, msUploading && styles.disabled]}
                    onPress={onCancelManuscript}
                    disabled={msUploading}
                  >
                    <Text style={styles.secondaryBtnText}>Cancel</Text>
                  </Pressable>
                  <PrimaryButton
                    title={
                      msUploading
                        ? "Uploading…"
                        : msPreparing
                          ? "Preparing preview…"
                          : "Upload manuscript"
                    }
                    onPress={requestManuscriptUpload}
                    busy={msUploading || msPreparing}
                    disabled={!mechanicsSelected || !msFile || msPanelBusy}
                    style={{ flex: 1 }}
                  />
                </View>
              </View>
            )}

            {uploadWizardStep === 3 && manuscriptReady && (currentVersion || scanFlow.file) && (
              <View style={[styles.card, fileDetailsNotice ? styles.cardAccent : null]}>
                <ShowStepsRow step={3} onShowSteps={() => setJourneyOpen(true)} />
                <View style={styles.detailsHead}>
                  <Text style={[styles.cardTitle, { marginTop: 0 }]}>File details</Text>
                  <Text style={styles.cardHint}>
                    Review attached files then run compliance analysis
                  </Text>
                </View>

                {fileDetailsNotice ? (
                  <View style={styles.readyBanner}>
                    <Text style={styles.readyBannerTitle}>{fileDetailsNotice}</Text>
                    <Text style={styles.readyBannerBody}>
                      Review the files below, then click Upload & Analyse to scan — or Cancel upload
                      to discard.
                    </Text>
                  </View>
                ) : null}

                <Text style={[styles.label, { marginTop: 16 }]}>Files attached</Text>

                <Text style={styles.fileGroupLabel}>Format Mechanics</Text>
                <View style={styles.fileRow}>
                  <FileTypeIcon
                    fileType={selectedMechanics?.file_type}
                    filename={
                      selectedMechanics?.source_filename ||
                      selectedMechanics?.filename ||
                      selectedMechanics?.name
                    }
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fileName} numberOfLines={1}>
                      {selectedMechanics?.source_filename ||
                        selectedMechanics?.filename ||
                        selectedMechanics?.name ||
                        "No format guide selected"}
                    </Text>
                    <Text style={styles.fileMeta} numberOfLines={1}>
                      {selectedMechanics?.name || "Format guide"}
                    </Text>
                  </View>
                  <Text style={selectedMechanics ? styles.badgeReady : styles.badgePending}>
                    {selectedMechanics ? "✓ Ready" : "Needed"}
                  </Text>
                </View>

                <Text style={styles.fileGroupLabel}>Academic Document</Text>
                <View style={styles.fileRow}>
                  <FileTypeIcon
                    fileType={currentVersion?.file_type}
                    filename={
                      scanFlow.file?.name ||
                      currentVersion?.source_filename ||
                      currentVersion?.filename
                    }
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fileName} numberOfLines={1}>
                      {scanFlow.file?.name ||
                        currentVersion?.source_filename ||
                        currentVersion?.filename ||
                        "No manuscript uploaded"}
                    </Text>
                    <Text style={styles.fileMeta} numberOfLines={1}>
                      {scanFlow.file?.size ? `${formatFileSize(scanFlow.file.size)} · ` : ""}
                      {currentManuscript?.title || "Manuscript"}
                    </Text>
                  </View>
                  <Text style={scanReady ? styles.badgeReady : styles.badgePending}>
                    {scanReady ? "✓ Ready to scan" : "Needed"}
                  </Text>
                </View>

                {currentVersion ? (
                  <View style={{ marginTop: 10 }}>
                    <Text style={styles.fileGroupLabel}>Version label</Text>
                    <View style={styles.versionBox}>
                      <Text style={styles.versionText}>
                        v{currentVersion.version_number || scanFlow.versionNumber || "1.0"}
                      </Text>
                    </View>
                  </View>
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
                      !scanReady || !selectedMechanicsId ? { opacity: 0.4 } : null,
                    ]}
                    onPress={onAnalyse}
                    disabled={!scanReady || !selectedMechanicsId}
                  >
                    <Text style={styles.primaryBtnText}>Analyse document</Text>
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

      <Modal
        visible={titleOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setTitleOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Manuscript title</Text>
            <Text style={styles.modalBody}>
              {uploadTargets.length
                ? "Save this file as a new version of a title you already have, or give it a new title."
                : "This name must be unique. You can still change the file before you confirm the upload."}
            </Text>
            {uploadTargets.length > 0 ? (
              <View style={styles.modeRow}>
                <Pressable
                  style={[styles.modeBtn, titleMode === "existing" && styles.modeBtnActive]}
                  onPress={() => {
                    setTitleMode("existing");
                    setTitleError("");
                    if (!existingId) setExistingId(uploadTargets[0]?.id || "");
                  }}
                >
                  <Text style={[styles.modeBtnText, titleMode === "existing" && styles.modeBtnTextActive]}>
                    Use an existing title
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.modeBtn, titleMode === "new" && styles.modeBtnActive]}
                  onPress={() => {
                    setTitleMode("new");
                    setTitleError("");
                  }}
                >
                  <Text style={[styles.modeBtnText, titleMode === "new" && styles.modeBtnTextActive]}>
                    New title
                  </Text>
                </Pressable>
              </View>
            ) : null}
            {titleMode === "existing" && uploadTargets.length > 0 ? (
              <View style={{ marginTop: 16 }}>
                <Text style={styles.modalLabel}>Existing title</Text>
                <SelectField
                  title="Existing title"
                  value={existingId}
                  options={titleOptions}
                  onChange={(value) => {
                    setExistingId(value);
                    setTitleError("");
                  }}
                  style={{ marginTop: 8 }}
                />
              </View>
            ) : (
              <TextInput
                style={[styles.input, { marginTop: 16 }]}
                value={msTitle}
                onChangeText={(value) => {
                  setMsTitle(value);
                  setTitleError("");
                }}
                placeholder="Enter a title"
                placeholderTextColor={colors.muted}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={submitTitle}
              />
            )}
            {titleError ? <Text style={styles.fieldError}>{titleError}</Text> : null}
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setTitleOpen(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.modalContinue} onPress={submitTitle}>
                <Text style={styles.modalContinueText}>Continue</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        cancelLabel={confirm?.cancelLabel ?? "Cancel"}
        tone={confirm?.tone || "primary"}
        busy={confirmBusy}
        onConfirm={runConfirm}
        onCancel={() => {
          if (!confirmBusy) setConfirm(null);
        }}
      />

      <ConfirmDialog
        open={oversizeBytes != null}
        title="File Too Large"
        message={oversizeFileMessage(oversizeBytes, MAX_FILE_SIZE_BYTES)}
        confirmLabel="OK"
        cancelLabel=""
        onCancel={() => setOversizeBytes(null)}
        onConfirm={() => setOversizeBytes(null)}
      />

      <ConfirmDialog
        open={rejection != null}
        icon={
          <View style={styles.alertIcon}>
            <TriangleAlertIcon size={24} />
          </View>
        }
        title={rejection?.kind === "type" ? "Unsupported File Type" : "File Too Large"}
        message={rejectionMessage(rejection)}
        confirmLabel="Choose Another File"
        cancelLabel=""
        onCancel={() => setRejection(null)}
        onConfirm={chooseAnotherFile}
      />

      <ScanSummaryModal
        visible={scanFlow.step === "summary" && Boolean(scanFlow.result)}
        result={scanFlow.result}
        onViewDocument={() => {
          const { entries } = normalizeDetectedIssues(
            scanFlow.result?.formatChecks,
            scanFlow.result?.pageCount
          );
          const first = entries[0];
          if (first) scanFlow.selectTraceIssue(first);
          scanFlow.openDocumentTrace(first || null);
        }}
        onViewFullResult={() => scanFlow.openFullResult()}
        onDismiss={() => scanFlow.dismissSummary()}
      />

      <UploadJourneyModal open={journeyOpen} current={uploadWizardStep} onClose={dismissJourney} />
    </AppShell>
  );
}

const styles = StyleSheet.create({
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
  cardTitle: { marginTop: 4, fontSize: 18, fontWeight: "700", color: colors.text },
  cardHint: { marginTop: 4, fontSize: 12, lineHeight: 18, color: colors.muted },
  sampleBanner: {
    marginTop: 16,
    gap: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(24, 189, 169, 0.6)",
    backgroundColor: colors.accentSoft,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  sampleTitle: { fontSize: 12, fontWeight: "600", color: "#334155" },
  sampleBody: { marginTop: 2, fontSize: 11, lineHeight: 16, color: colors.muted },
  sampleBtn: {
    height: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: colors.white,
    borderRadius: 8,
    paddingHorizontal: 16,
  },
  sampleBtnPressed: { backgroundColor: "#eefbf8" },
  sampleBtnText: { fontSize: 11, fontWeight: "700", color: colors.accentText },
  disabled: { opacity: 0.4 },
  segment: {
    marginTop: 20,
    flexDirection: "row",
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    padding: 4,
  },
  segmentBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 8,
    justifyContent: "center",
  },
  segmentBtnActive: {
    backgroundColor: colors.white,
    shadowColor: "#0f172a",
    shadowOpacity: 0.08,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  segmentText: {
    fontSize: 11,
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
    backgroundColor: "#fafbfc",
    borderRadius: 8,
    padding: 14,
    marginBottom: 14,
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(15,23,42,0.4)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    width: "100%",
    maxWidth: 420,
    borderRadius: 16,
    backgroundColor: colors.white,
    padding: 22,
  },
  modalTitle: { fontSize: 18, fontWeight: "700", color: colors.text },
  modalBody: { marginTop: 6, fontSize: 12, lineHeight: 18, color: colors.slate },
  modeRow: { marginTop: 16, flexDirection: "row", gap: 8 },
  modeBtn: {
    flex: 1,
    borderRadius: 10,
    backgroundColor: colors.fileBg,
    paddingHorizontal: 10,
    paddingVertical: 10,
    alignItems: "center",
  },
  modeBtnActive: { backgroundColor: "#e7f8f5", borderWidth: 1, borderColor: colors.accent },
  modeBtnText: { fontSize: 12, fontWeight: "600", color: colors.slate, textAlign: "center" },
  modeBtnTextActive: { color: "#0f766e" },
  titleList: { maxHeight: 180, marginTop: 8 },
  modalActions: {
    marginTop: 20,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  modalLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: colors.muted,
  },
  modalCancel: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  modalCancelText: { fontSize: 12, fontWeight: "600", color: colors.slate },
  modalContinue: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  modalContinueText: { fontSize: 12, fontWeight: "700", color: "#092823" },
  cardDisabled: { opacity: 0.5 },
  dropzoneDisabled: { borderColor: "#cbd5e1", backgroundColor: "#f8fafc" },
  dropBusy: { alignItems: "center", gap: 4 },
  editorActions: { marginTop: 12, flexDirection: "row", gap: 8, alignItems: "stretch" },
  clearBtn: {
    minHeight: 44,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: 8,
    paddingHorizontal: 18,
  },
  clearBtnText: { fontSize: 12, fontWeight: "600", color: colors.slate },
  detailsHead: {
    marginTop: 4,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  fileGroupLabel: { marginBottom: 8, fontSize: 12, fontWeight: "600", color: "#475569" },
  fileMeta: { marginTop: 2, fontSize: 11, color: colors.muted },
  versionText: { fontSize: 12, fontWeight: "500", color: colors.muted },
  savedHint: { marginTop: 12, fontSize: 11, lineHeight: 17, color: colors.muted },
  savedHintName: { fontWeight: "600", color: "#475569" },
  msActions: { marginTop: 12, flexDirection: "row", gap: 12, alignItems: "stretch" },
  msCancelBtn: {
    minHeight: 44,
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    borderRadius: 8,
    paddingHorizontal: 24,
  },
  processingOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.75)",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  processingText: { fontSize: 14, fontWeight: "700", color: "#334155" },
  alertIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#fffbeb",
    alignItems: "center",
    justifyContent: "center",
  },
});
