import { useState } from "react";
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { colors } from "../../theme";
import DocumentLoader from "../ui/DocumentLoader";

function fileKind(file) {
  const name = String(file?.name || file?.uri || "").toLowerCase();
  const type = String(file?.mimeType || file?.type || "").toLowerCase();
  if (name.endsWith(".pdf") || type.includes("pdf")) return "pdf";
  if (name.endsWith(".docx") || type.includes("wordprocessingml")) return "docx";
  return "";
}

export function isPdfFile(file) {
  return fileKind(file) === "pdf";
}

function pagesFromPreview(preview) {
  if (!preview) return [];
  if (Array.isArray(preview.pages) && preview.pages.length) {
    return preview.pages
      .map((page, index) => ({
        pageIndex: page.page_index ?? index,
        text: String(page.text || "").trim(),
      }))
      .filter((page) => page.text);
  }
  const fallback = String(preview.text_preview || preview.extracted_text || "").trim();
  return fallback ? [{ pageIndex: 0, text: fallback }] : [];
}

function TextPages({ preview, emptyLabel }) {
  const pages = pagesFromPreview(preview);
  if (!pages.length) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{emptyLabel}</Text>
      </View>
    );
  }
  return (
    <ScrollView style={styles.textScroll} contentContainerStyle={styles.textContent} nestedScrollEnabled>
      {pages.map((page, index) => (
        <View key={`${page.pageIndex}-${index}`} style={styles.page}>
          <Text style={styles.pageLabel}>Page {Math.max(1, Number(page.pageIndex) + 1)}</Text>
          <Text style={styles.pageText}>{page.text}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

/**
 * Shows the original picked PDF/DOCX (iOS WebKit renders both from the local file),
 * falling back to extracted text pages when the file cannot be displayed.
 */
export default function DocumentPreview({ file, preview, emptyLabel = "No preview available yet." }) {
  const [failed, setFailed] = useState(false);
  const native = Platform.OS === "ios" && file?.uri && fileKind(file) && !failed;

  if (!native) return <TextPages preview={preview} emptyLabel={emptyLabel} />;

  const folder = file.uri.slice(0, file.uri.lastIndexOf("/") + 1);
  return (
    <WebView
      key={file.uri}
      source={{ uri: file.uri }}
      originWhitelist={["*"]}
      allowFileAccess
      allowingReadAccessToURL={folder}
      style={styles.web}
      containerStyle={styles.webContainer}
      nestedScrollEnabled
      startInLoadingState
      renderLoading={() => (
        <View style={styles.loading}>
          <ActivityIndicator color={colors.accent} />
        </View>
      )}
      onError={() => setFailed(true)}
      onHttpError={() => setFailed(true)}
    />
  );
}

/** Framed preview card: uppercase label, right-side status, body, optional busy overlay and footer. */
export function PreviewPanel({
  label,
  status,
  statusTone = "muted",
  overlayTitle,
  overlayBody,
  footer,
  height = 460,
  children,
}) {
  return (
    <View style={styles.panel}>
      <View style={styles.panelHead}>
        <Text style={styles.panelLabel}>{label}</Text>
        {status ? (
          <Text style={[styles.panelStatus, statusTone === "accent" && styles.panelStatusAccent]}>{status}</Text>
        ) : null}
      </View>
      <View style={[styles.panelBody, { height }]}>
        {children}
        {overlayTitle ? (
          <View style={styles.overlay}>
            <DocumentLoader size={112} />
            <Text style={styles.overlayTitle}>{overlayTitle}</Text>
            {overlayBody ? <Text style={styles.overlayBody}>{overlayBody}</Text> : null}
          </View>
        ) : null}
      </View>
      {footer ? <Text style={styles.panelFooter}>{footer}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginTop: 12,
    overflow: "hidden",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: "#e8ecf1",
  },
  panelHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(226,232,240,0.8)",
    backgroundColor: colors.pageBg,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  panelLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: colors.slate,
  },
  panelStatus: { flexShrink: 1, fontSize: 10, fontWeight: "600", color: colors.muted, textAlign: "right" },
  panelStatusAccent: { color: "#0d9488" },
  panelBody: { position: "relative" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "rgba(232, 236, 241, 0.92)",
    paddingHorizontal: 24,
  },
  overlayTitle: { fontSize: 14, fontWeight: "700", color: "#1e293b", textAlign: "center" },
  overlayBody: { maxWidth: 256, fontSize: 11, lineHeight: 17, color: colors.slate, textAlign: "center" },
  panelFooter: {
    borderTopWidth: 1,
    borderTopColor: "rgba(226,232,240,0.8)",
    backgroundColor: colors.pageBg,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 10,
    color: colors.muted,
  },
  web: { flex: 1, backgroundColor: colors.white },
  webContainer: { flex: 1, backgroundColor: colors.white },
  loading: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
  },
  textScroll: { flex: 1 },
  textContent: { padding: 12, gap: 12 },
  page: {
    borderRadius: 4,
    backgroundColor: colors.white,
    paddingHorizontal: 18,
    paddingVertical: 20,
    shadowColor: "#0f172a",
    shadowOpacity: 0.12,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  pageLabel: {
    marginBottom: 8,
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.muted,
  },
  pageText: {
    fontSize: 12,
    lineHeight: 18,
    color: "#1e293b",
    fontFamily: Platform.select({ ios: "Times New Roman", default: "serif" }),
  },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  emptyText: { fontSize: 12, color: colors.muted, textAlign: "center" },
});
