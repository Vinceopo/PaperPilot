import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { File, Paths } from "expo-file-system";
import { colors } from "../../theme";
import { buildDocumentPages, lineMatchesHighlight } from "../../lib/documentPages";
import DocumentLoader from "../ui/DocumentLoader";
import { TRACE_VIEWER_HTML } from "./traceViewerHtml";

/** Base64 slice size (multiple of 4). Smaller chunks + yields keep the Android bridge alive. */
const CHUNK = 256 * 1024;

function yieldBridge() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const HIT = {
  critical: { bg: "rgba(244, 63, 94, 0.42)", edge: "#e11d48" },
  moderate: { bg: "rgba(249, 115, 22, 0.42)", edge: "#ea580c" },
  minor: { bg: "rgba(251, 191, 36, 0.55)", edge: "#d97706" },
};

function hitPaint(severity) {
  return HIT[String(severity || "").toLowerCase()] || HIT.minor;
}

/**
 * Center the document loader in the preview pane, then lift ~10% of the pane
 * height so it reads as visually centered in the display division.
 */
function CenteredDocumentLoader({ size = 112, style }) {
  const [paneH, setPaneH] = useState(0);
  const lift = paneH > 0 ? -Math.round(paneH * 0.1) : 0;
  return (
    <View
      style={[styles.loaderPane, style]}
      onLayout={(e) => {
        const next = Math.round(e.nativeEvent.layout.height || 0);
        if (next > 0 && next !== paneH) setPaneH(next);
      }}
    >
      <View style={lift ? { transform: [{ translateY: lift }] } : null}>
        <DocumentLoader size={size} />
      </View>
    </View>
  );
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
  // Prefer the local picker/cache file first — remote download + base64 bridge is slow
  // on Android and was leaving Issue Tracing blank for a long time after analyse.
  if (file?.uri) {
    const local = await base64FromLocalUri(file.uri);
    if (local) return local;
  }
  if (url) {
    try {
      const safe = String(name || "document").replace(/[^\w.-]+/g, "_");
      const target = new File(Paths.cache, `trace-${safe}`);
      const downloaded = await File.downloadFileAsync(url, target, { idempotent: true });
      const remote = await downloaded.base64();
      if (remote) return remote;
    } catch {
      // Remote path failed; nothing else to try.
    }
  }
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
  /** Pixel height required — WebView inside ScrollView collapses with flex-only sizing on Android. */
  height,
  /** When true, parent shows the loading UI — avoid a second DocumentLoader blink. */
  suppressLoader = false,
  onReady,
  emptyLabel,
}) {
  const kind = kindOf(file?.name || documentName, documentUrl) || (file?.uri || documentUrl ? "pdf" : "");
  const canRender = Boolean(kind && (file?.uri || documentUrl));
  // Never start in TextTrace — wait for URL/file backfill, then try WebView.
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const webRef = useRef(null);
  const sendingRef = useRef(false);
  const nativeFallbackRef = useRef(false);
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const frameHeight = Math.max(160, Number(height) || 320);

  useEffect(() => {
    setFailed(false);
    setReady(false);
    sendingRef.current = false;
    nativeFallbackRef.current = false;
  }, [canRender, file?.uri, documentUrl, kind]);

  // Waiting for URL/file backfill — do not sit on the loader forever.
  useEffect(() => {
    if (canRender || documentLoading || failed) return undefined;
    const timer = setTimeout(() => setFailed(true), 4000);
    return () => clearTimeout(timer);
  }, [canRender, documentLoading, failed]);

  // Large manuscripts need a long window; only fail after a real attempt with a source.
  useEffect(() => {
    if (!canRender || ready || failed) return undefined;
    const waitMs = file?.uri ? 90000 : 120000;
    const timer = setTimeout(() => setFailed(true), waitMs);
    return () => clearTimeout(timer);
  }, [canRender, ready, failed, file?.uri, documentUrl, kind]);

  useEffect(() => {
    if (ready) onReadyRef.current?.();
  }, [ready]);

  useEffect(() => {
    if (failed) onReadyRef.current?.();
  }, [failed]);

  // Retrace when the highlight changes or the same issue is re-selected (new scroll token).
  const scrollToken = scrollTarget?.token;
  useEffect(() => {
    if (!ready) return;
    const payload = scrollTarget && highlight ? { ...highlight, ...scrollTarget } : highlight || scrollTarget;
    if (!payload) return;
    webRef.current?.injectJavaScript(`window.PP && PP.trace(${JSON.stringify(payload)}); true;`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, highlight, scrollToken]);

  async function sendDocumentViaBase64(web) {
    const b64 = await readDocumentBase64({ file, url: documentUrl, name: documentName });
    if (!b64 || !web) throw new Error("empty");
    web.injectJavaScript(`PP.begin(${JSON.stringify(kind || "pdf")}); true;`);
    for (let i = 0; i < b64.length; i += CHUNK) {
      web.injectJavaScript(`PP.chunk("${b64.slice(i, i + CHUNK)}"); true;`);
      // Yield so Android's JS bridge does not drop the document mid-transfer.
      if (i > 0 && i % (CHUNK * 4) === 0) await yieldBridge();
    }
    web.injectJavaScript("PP.end(); true;");
  }

  async function sendDocument() {
    if (sendingRef.current) return;
    sendingRef.current = true;
    try {
      const web = webRef.current;
      if (!web) throw new Error("empty");

      // Prefer local file bytes. Remote-only: try in-WebView fetch first (fast), then native.
      if (!file?.uri && documentUrl && !nativeFallbackRef.current) {
        web.injectJavaScript(
          `window.PP && PP.openUrl(${JSON.stringify(documentUrl)}, ${JSON.stringify(kind || "pdf")}); true;`
        );
        return;
      }

      await sendDocumentViaBase64(web);
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
      // WebView CORS/fetch failed — fall back to native download + base64 once.
      if (
        String(msg?.reason || "").includes("fetch") &&
        documentUrl &&
        !nativeFallbackRef.current
      ) {
        nativeFallbackRef.current = true;
        sendingRef.current = false;
        void (async () => {
          try {
            const web = webRef.current;
            if (!web) throw new Error("empty");
            sendingRef.current = true;
            await sendDocumentViaBase64(web);
          } catch {
            setFailed(true);
          } finally {
            sendingRef.current = false;
          }
        })();
        return;
      }
      setFailed(true);
    }
  }

  // No source yet (URL still backfilling) — keep the loader, never the TextTrace placeholders.
  if (!canRender) {
    if (suppressLoader) return <View style={[styles.webHost, { height: frameHeight }]} />;
    return (
      <View style={[styles.webHost, { height: frameHeight }]}>
        <CenteredDocumentLoader />
      </View>
    );
  }

  if (failed) {
    return (
      <View style={{ height: frameHeight }}>
        <TextTrace
          preview={preview}
          pageCount={pageCount}
          formatChecks={formatChecks}
          highlight={highlight}
          scrollTarget={scrollTarget}
          emptyLabel={emptyLabel}
        />
      </View>
    );
  }

  // Explicit pixel size — flex:1 WebViews inside Results ScrollView often paint at 0 height on Android.
  const webStyle = { width: "100%", height: frameHeight, backgroundColor: "#e8ecf1" };

  return (
    <View style={[styles.webHost, { height: frameHeight }]}>
      <WebView
        ref={webRef}
        source={{ html: TRACE_VIEWER_HTML, baseUrl: "https://cdnjs.cloudflare.com/" }}
        originWhitelist={["*"]}
        onMessage={onMessage}
        onError={() => setFailed(true)}
        onHttpError={() => setFailed(true)}
        onContentProcessDidTerminate={() => webRef.current?.reload()}
        javaScriptEnabled
        domStorageEnabled
        allowFileAccess
        allowUniversalAccessFromFileURLs
        mixedContentMode="always"
        androidLayerType="hardware"
        setSupportMultipleWindows={false}
        scrollEnabled={false}
        bounces={false}
        nestedScrollEnabled
        style={[webStyle, !ready && styles.webHidden]}
        containerStyle={webStyle}
      />
      {!ready && !suppressLoader ? (
        <CenteredDocumentLoader style={styles.loaderOverlay} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  webHost: { width: "100%", backgroundColor: "#e8ecf1", overflow: "hidden" },
  webHidden: { opacity: 0 },
  loaderPane: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#e8ecf1",
    paddingHorizontal: 20,
  },
  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 2,
  },
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
