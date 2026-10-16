import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { File, Paths } from "expo-file-system";
import { colors } from "../../theme";
import { buildDocumentPages, lineMatchesHighlight } from "../../lib/documentPages";
import { TRACE_VIEWER_HTML } from "./traceViewerHtml";

/** Base64 slice size; a multiple of 4 so every chunk decodes on its own. */
const CHUNK = 1 << 20;

const HIT = {
  critical: { bg: "rgba(244, 63, 94, 0.42)", edge: "#e11d48" },
  moderate: { bg: "rgba(249, 115, 22, 0.42)", edge: "#ea580c" },
  minor: { bg: "rgba(251, 191, 36, 0.55)", edge: "#d97706" },
};

function hitPaint(severity) {
  return HIT[String(severity || "").toLowerCase()] || HIT.minor;
}

function kindOf(name, url) {
  const value = String(name || "").toLowerCase();
  if (value.endsWith(".pdf")) return "pdf";
  if (value.endsWith(".docx")) return "docx";
  const link = String(url || "").toLowerCase();
  if (link.includes(".docx") || link.includes("wordprocessingml")) return "docx";
  if (link.includes(".pdf") || link.includes("/pdf/")) return "pdf";
  return link ? "pdf" : "";
}

async function readDocumentBase64({ file, url, name }) {
  if (file?.uri) return new File(file.uri).base64();
  if (!url) return "";
  const safe = String(name || "document").replace(/[^\w.-]+/g, "_");
  const target = new File(Paths.cache, `trace-${safe}`);
  const downloaded = await File.downloadFileAsync(url, target, { idempotent: true });
  return downloaded.base64();
}

function marginSide(text) {
  const value = String(text || "").toLowerCase();
  if (value.includes("right margin")) return "right";
  if (value.includes("left margin")) return "left";
  if (value.includes("top margin")) return "top";
  if (value.includes("bottom margin")) return "bottom";
  return "";
}

function MarginBand({ side, severity }) {
  const paint = hitPaint(severity);
  const base = { position: "absolute", backgroundColor: paint.bg, borderColor: paint.edge, borderWidth: 2 };
  const place =
    side === "right"
      ? { top: 0, right: 0, bottom: 0, width: "7%" }
      : side === "left"
        ? { top: 0, left: 0, bottom: 0, width: "7%" }
        : side === "top"
          ? { top: 0, left: 0, right: 0, height: "7%" }
          : side === "bottom"
            ? { bottom: 0, left: 0, right: 0, height: "7%" }
            : { top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "transparent", borderWidth: 4 };
  return <View pointerEvents="none" style={[base, place]} />;
}

/** Extracted-text pages, used when the original file cannot be rendered. */
function TextTrace({ preview, pageCount, formatChecks, highlight, emptyLabel }) {
  const scrollRef = useRef(null);
  const pageOffsets = useRef({});
  const lineOffsets = useRef({});
  const pages = useMemo(
    () => buildDocumentPages({ preview, pageCount, formatChecks }),
    [preview, pageCount, formatChecks]
  );
  const marginTrace = String(highlight?.section || "").toLowerCase() === "margins";

  useEffect(() => {
    if (!highlight?.page || !scrollRef.current) return;
    const pageY = pageOffsets.current[highlight.page];
    if (typeof pageY !== "number") return;
    const lineY = marginTrace ? 0 : lineOffsets.current[`${highlight.page}:${highlight.line}`] || 0;
    scrollRef.current.scrollTo({ y: Math.max(0, pageY + lineY - 80), animated: true });
  }, [highlight, pages.length, marginTrace]);

  if (!pages.length) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>
          {emptyLabel || "Document preview will appear when Cloudinary URL or upload is available."}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView ref={scrollRef} contentContainerStyle={styles.textContent}>
      {pages.map((page) => {
        const showMargin = marginTrace && Number(highlight?.page) === page.page;
        return (
          <View
            key={`page-${page.page}`}
            style={styles.textPage}
            onLayout={(e) => {
              pageOffsets.current[page.page] = e.nativeEvent.layout.y;
            }}
          >
            {showMargin ? (
              <MarginBand side={marginSide(highlight.finding)} severity={highlight.severity} />
            ) : null}
            <Text style={styles.pageLabel}>Page {page.page}</Text>
            {(page.lines || []).map((line, index) => {
              const lineNum = index + 1;
              const hit = !marginTrace && lineMatchesHighlight(page.page, lineNum, highlight);
              const paint = hit ? hitPaint(highlight.severity) : null;
              return (
                <Text
                  key={`${page.page}-${lineNum}`}
                  onLayout={(e) => {
                    lineOffsets.current[`${page.page}:${lineNum}`] = e.nativeEvent.layout.y;
                  }}
                  style={[
                    styles.lineText,
                    paint ? { backgroundColor: paint.bg, borderColor: paint.edge, borderWidth: 1.5 } : null,
                  ]}
                >
                  {line || " "}
                </Text>
              );
            })}
          </View>
        );
      })}
    </ScrollView>
  );
}

/**
 * Original PDF/DOCX rendered in a WebView (pdf.js / docx-preview) with the
 * selected issue painted and scrolled into view — the web's paged preview.
 */
export default function TraceDocumentViewer({
  file,
  documentUrl,
  documentName,
  preview,
  pageCount,
  formatChecks,
  highlight,
  emptyLabel,
}) {
  const kind = kindOf(file?.name || documentName, file ? "" : documentUrl);
  const canRender = Boolean(kind && (file?.uri || documentUrl));
  const [failed, setFailed] = useState(!canRender);
  const [ready, setReady] = useState(false);
  const webRef = useRef(null);
  const sendingRef = useRef(false);

  useEffect(() => {
    setFailed(!canRender);
    setReady(false);
  }, [canRender, file?.uri, documentUrl]);

  useEffect(() => {
    if (!ready || !highlight) return;
    webRef.current?.injectJavaScript(`window.PP && PP.trace(${JSON.stringify(highlight)}); true;`);
  }, [ready, highlight]);

  async function sendDocument() {
    if (sendingRef.current) return;
    sendingRef.current = true;
    try {
      const b64 = await readDocumentBase64({ file, url: documentUrl, name: documentName });
      const web = webRef.current;
      if (!b64 || !web) throw new Error("empty");
      web.injectJavaScript(`PP.begin(${JSON.stringify(kind)}); true;`);
      for (let i = 0; i < b64.length; i += CHUNK) {
        web.injectJavaScript(`PP.chunk("${b64.slice(i, i + CHUNK)}"); true;`);
      }
      web.injectJavaScript("PP.end(); true;");
    } catch {
      setFailed(true);
    } finally {
      sendingRef.current = false;
    }
  }

  function onMessage(event) {
    let msg = null;
    try {
      msg = JSON.parse(event.nativeEvent.data);
    } catch {
      return;
    }
    if (msg?.type === "booted") {
      setReady(false);
      void sendDocument();
    } else if (msg?.type === "ready") {
      setReady(true);
    } else if (msg?.type === "error") {
      setFailed(true);
    }
  }

  if (failed) {
    return (
      <TextTrace
        preview={preview}
        pageCount={pageCount}
        formatChecks={formatChecks}
        highlight={highlight}
        emptyLabel={emptyLabel}
      />
    );
  }

  return (
    <WebView
      ref={webRef}
      source={{ html: TRACE_VIEWER_HTML, baseUrl: "https://paperpilot.local/" }}
      originWhitelist={["*"]}
      onMessage={onMessage}
      onError={() => setFailed(true)}
      onContentProcessDidTerminate={() => webRef.current?.reload()}
      javaScriptEnabled
      domStorageEnabled
      scrollEnabled={false}
      bounces={false}
      nestedScrollEnabled
      style={styles.web}
      containerStyle={styles.web}
    />
  );
}

const styles = StyleSheet.create({
  web: { flex: 1, backgroundColor: "#e8ecf1" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 20 },
  muted: { fontSize: 12, color: colors.muted, textAlign: "center" },
  textContent: { padding: 12, gap: 16 },
  textPage: {
    position: "relative",
    backgroundColor: colors.white,
    paddingHorizontal: "11%",
    paddingVertical: 28,
    shadowColor: "#0f172a",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  pageLabel: {
    marginBottom: 12,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: "#94a3b8",
  },
  lineText: {
    fontSize: 11,
    lineHeight: 19,
    color: "#1a1a1a",
    borderRadius: 2,
    fontFamily: Platform.select({ ios: "Times New Roman", default: "serif" }),
  },
});
