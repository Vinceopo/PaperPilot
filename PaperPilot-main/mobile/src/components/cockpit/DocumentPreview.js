import { StyleSheet, Text, View } from "react-native";
import { colors } from "../../theme";
import DocumentLoader from "../ui/DocumentLoader";
import TraceDocumentViewer from "./TraceDocumentViewer";

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
 * Original PDF/DOCX rendered page by page (pdf.js / docx-preview), the same paged,
 * orientation-aware preview as the web upload step. Falls back to extracted text pages.
 */
export default function DocumentPreview({ file, preview, emptyLabel = "No preview available yet." }) {
  const local = namedFile(file);
  return (
    <TraceDocumentViewer
      key={local?.uri || preview?.cloudinary_url || "empty"}
      file={local}
      documentUrl={local ? "" : preview?.cloudinary_url || ""}
      documentName={local?.name || preview?.filename || ""}
      preview={preview}
      pageCount={preview?.page_count}
      emptyLabel={emptyLabel}
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
      <View style={[styles.panelBody, { height }]} pointerEvents={overlayTitle ? "box-none" : "auto"}>
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
  panelBody: { position: "relative", overflow: "hidden" },
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
    borderTopColor: "rgba(226,232,240,0.8)",
    backgroundColor: colors.pageBg,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 10,
    color: colors.muted,
  },
});
