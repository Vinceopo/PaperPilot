import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { colors } from "../../theme";
import DocumentLoader from "../ui/DocumentLoader";
import TraceDocumentViewer from "./TraceDocumentViewer";

/** Fallback when a screen cannot read window size. */
export const DOCUMENT_PREVIEW_HEIGHT = 400;

/** Scale the document pane to the phone height so it stays usable on small and tall screens. */
export function useDocumentPreviewHeight() {
  const { height } = useWindowDimensions();
  const scaled = Math.round(height * 0.42);
  return Math.max(240, Math.min(480, scaled || DOCUMENT_PREVIEW_HEIGHT));
}

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

/** Picked files sometimes lack an extension; the viewer picks its renderer from the name. */
function namedFile(file) {
  if (!file?.uri) return null;
  const kind = fileKind(file);
  const name = String(file.name || "document");
  if (!kind || name.toLowerCase().endsWith(`.${kind}`)) return file;
  return { ...file, name: `${name}.${kind}` };
}

/**
 * Same PDF/DOCX display as Issue Tracing & XAI (TraceDocumentViewer / pdf.js / docx-preview),
 * without highlights, issues, or XAI — display only.
 *
 * Prefer the public cloudinary/document URL when available (same reliable path Issue Tracing
 * uses). Local picker URIs are only used while that URL is still preparing.
 */
export default function DocumentPreview({
  file,
  preview,
  documentUrl = "",
  documentName = "",
  documentLoading = false,
  emptyLabel = "No preview available yet.",
}) {
  const local = namedFile(file);
  const remoteUrl = String(documentUrl || preview?.cloudinary_url || preview?.public_url || "").trim();
  const useRemote = Boolean(remoteUrl);
  const viewerFile = useRemote ? null : local;
  const viewerKey = useRemote
    ? `remote:${remoteUrl}`
    : local?.uri
      ? `local:${local.uri}`
      : "empty";

  return (
    <TraceDocumentViewer
      key={viewerKey}
      file={viewerFile}
      documentUrl={useRemote ? remoteUrl : ""}
      documentName={local?.name || documentName || preview?.filename || ""}
      documentLoading={documentLoading}
      preview={preview}
      pageCount={preview?.page_count}
      emptyLabel={emptyLabel}
    />
  );
}

/**
 * Display frame matching Issue Tracing’s document pane (gray pad + rounded viewport).
 * No findings / XAI — only the manuscript view.
 */
export function DocumentDisplayFrame({ height, children, style }) {
  const responsiveHeight = useDocumentPreviewHeight();
  const frameHeight = height ?? responsiveHeight;
  return (
    <View style={[styles.displayWrap, style]}>
      <View style={[styles.displayFrame, { height: frameHeight }]}>{children}</View>
    </View>
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
  height,
  children,
}) {
  const responsiveHeight = useDocumentPreviewHeight();
  const frameHeight = height ?? responsiveHeight;
  return (
    <View style={styles.panel}>
      <View style={styles.panelHead}>
        <Text style={styles.panelLabel}>{label}</Text>
        {status ? (
          <Text style={[styles.panelStatus, statusTone === "accent" && styles.panelStatusAccent]}>{status}</Text>
        ) : null}
      </View>
      <View style={styles.panelBody} pointerEvents={overlayTitle ? "box-none" : "auto"}>
        <DocumentDisplayFrame height={frameHeight}>
          <View
            style={overlayTitle ? styles.previewLocked : styles.previewFill}
            pointerEvents={overlayTitle ? "none" : "auto"}
          >
            {children}
          </View>
          {overlayTitle ? (
            <View style={styles.overlay} pointerEvents="auto">
              <DocumentLoader size={112} />
              <Text style={styles.overlayTitle}>{overlayTitle}</Text>
              {overlayBody ? <Text style={styles.overlayBody}>{overlayBody}</Text> : null}
            </View>
          ) : null}
        </DocumentDisplayFrame>
      </View>
      {footer ? <Text style={styles.panelFooter}>{footer}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    marginTop: 12,
    overflow: "hidden",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  panelHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
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
  displayWrap: {
    backgroundColor: "#e8ecf1",
    padding: 12,
  },
  displayFrame: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 12,
    backgroundColor: "#e8ecf1",
  },
  previewFill: { flex: 1 },
  previewLocked: { flex: 1, overflow: "hidden" },
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
    borderTopColor: "#f1f5f9",
    backgroundColor: colors.pageBg,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 10,
    color: colors.muted,
  },
});
