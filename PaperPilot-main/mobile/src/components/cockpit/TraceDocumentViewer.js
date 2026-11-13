import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
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

function bytesToBase64(bytes) {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triplet = (a << 16) | (b << 8) | c;
    out += chars[(triplet >> 18) & 63];
    out += chars[(triplet >> 12) & 63];
    out += i + 1 < bytes.length ? chars[(triplet >> 6) & 63] : "=";
    out += i + 2 < bytes.length ? chars[triplet & 63] : "=";
  }
  return out;
}

async function base64FromLocalUri(uri) {
  if (!uri) return "";
  try {
    const fromFile = await new File(uri).base64();
    if (fromFile) return fromFile;
  } catch {
    // Some picker URIs fail with File; fetch works for the same cache copy.
  }
  try {
    const res = await fetch(uri);
    const buffer = await res.arrayBuffer();
    return bytesToBase64(new Uint8Array(buffer));
  } catch {
    return "";
  }
}

async function readDocumentBase64({ file, url, name }) {
  // Prefer remote download when available — same reliable path as Issue Tracing.
  if (url) {
    try {
      const safe = String(name || "document").replace(/[^\w.-]+/g, "_");
      const target = new File(Paths.cache, `trace-${safe}`);
      const downloaded = await File.downloadFileAsync(url, target, { idempotent: true });
      const remote = await downloaded.base64();
      if (remote) return remote;
    } catch {
      // Fall through to local file when the download path fails.
    }
  }
  if (file?.uri) return base64FromLocalUri(file.uri);
  return "";
}

function marginSide(text, extras = {}) {
  const explicit = String(extras.margin_side || extras.marginSide || "").toLowerCase();
  if (explicit === "top" || explicit === "bottom" || explicit === "left" || explicit === "right") {
    return explicit;
  }
  const issueType = String(extras.issue_type || extras.issueType || "").toLowerCase();
  const fromType = issueType.match(/^(top|bottom|left|right)_margin$/);
  if (fromType) return fromType[1];
  const value = String(text || "").toLowerCase();
  if (value.includes("right margin")) return "right";
  if (value.includes("left margin")) return "left";
  if (value.includes("top margin")) return "top";
  if (value.includes("bottom margin")) return "bottom";
  return "";
}

function pageRegion(target = {}) {
  const explicit = String(target.page_region || target.pageRegion || "").toLowerCase();
  if (explicit === "top" || explicit === "bottom") return explicit;
  const text = `${target.finding || ""} ${target.recommendation || ""}`.toLowerCase();
  if (/\bbottom\b/.test(text)) return "bottom";
  if (/\btop\b/.test(text)) return "top";
  return "top";
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
function TextTrace({ preview, pageCount, formatChecks, highlight, scrollTarget, emptyLabel }) {
  const scrollRef = useRef(null);
  const pageOffsets = useRef({});
  const lineOffsets = useRef({});
  const pages = useMemo(
    () => buildDocumentPages({ preview, pageCount, formatChecks }),
    [preview, pageCount, formatChecks]
  );
  const marginTrace = String(highlight?.section || "").toLowerCase() === "margins";
  const paginationBand =
    String(highlight?.section || "").toLowerCase() === "pagination" &&
    !highlight?.bbox &&
    highlight?.line == null;

  const scrollToken = scrollTarget?.token;
  useEffect(() => {
    const target = scrollTarget || highlight;
    if (!target?.page || !scrollRef.current) return;
    const pageY = pageOffsets.current[target.page];
    if (typeof pageY !== "number") return;
    const lineY =
      marginTrace || paginationBand ? 0 : lineOffsets.current[`${target.page}:${target.line}`] || 0;
    scrollRef.current.scrollTo({ y: Math.max(0, pageY + lineY - 80), animated: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlight, scrollToken, pages.length, marginTrace, paginationBand]);

  if (!pages.length) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>
          {emptyLabel || "Document preview will appear when a document URL or upload is available."}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView ref={scrollRef} contentContainerStyle={styles.textContent}>
      {pages.map((page) => {
        const showEdge =
          (marginTrace || paginationBand) && Number(highlight?.page) === page.page;
        return (
          <View
            key={`page-${page.page}`}
            style={styles.textPage}
            onLayout={(e) => {
              pageOffsets.current[page.page] = e.nativeEvent.layout.y;
            }}
          >
            {showEdge ? (
              <MarginBand
                side={
                  marginTrace
                    ? marginSide(highlight.finding, highlight) || pageRegion(highlight)
                    : pageRegion(highlight)
                }
                severity={highlight.severity}
              />
            ) : null}
            <Text style={styles.pageLabel}>Page {page.page}</Text>
            {(page.lines || []).map((line, index) => {
              const lineNum = index + 1;
              const hit =
                !marginTrace &&
                !paginationBand &&
                lineMatchesHighlight(page.page, lineNum, highlight);
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
 * selected issue painted and scrolled into view - the web's paged preview.
 */
export default function TraceDocumentViewer({
  file,
  documentUrl,
  documentName,
  preview,
  pageCount,
  formatChecks,
  highlight,
  scrollTarget = null,
  documentLoading = false,
  emptyLabel,
}) {
  const kind = kindOf(file?.name || documentName, documentUrl);
  const canRender = Boolean(kind && (file?.uri || documentUrl));
  const [failed, setFailed] = useState(!canRender);
  const [ready, setReady] = useState(false);
  const webRef = useRef(null);
  const sendingRef = useRef(false);

  useEffect(() => {
    setFailed(!canRender);
    setReady(false);
    sendingRef.current = false;
  }, [canRender, file?.uri, documentUrl, kind]);

  // Retrace when the highlight changes or the same issue is re-selected (new scroll token).
  const scrollToken = scrollTarget?.token;
  useEffect(() => {
    if (!ready) return;
    const payload = scrollTarget && highlight ? { ...highlight, ...scrollTarget } : highlight || scrollTarget;
    if (!payload) return;
    webRef.current?.injectJavaScript(`window.PP && PP.trace(${JSON.stringify(payload)}); true;`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, highlight, scrollToken]);

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

  // Only block on fetch when nothing can render yet. Otherwise the WebView's
  // own status spinner handles opening — stacking both looked like two loaders.
  if (documentLoading && !canRender) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={[styles.muted, { marginTop: 10 }]}>Loading document…</Text>
      </View>
    );
  }

  if (failed) {
    return (
      <TextTrace
        preview={preview}
        pageCount={pageCount}
        formatChecks={formatChecks}
        highlight={highlight}
        scrollTarget={scrollTarget}
        emptyLabel={emptyLabel}
      />
    );
  }

  // Loading spinner lives only inside the WebView HTML (#status). A second RN
  // overlay stacked with it showed two animations on the full-results preview.
  return (
    <View style={styles.webHost}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  webHost: { flex: 1, backgroundColor: "#e8ecf1" },
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
