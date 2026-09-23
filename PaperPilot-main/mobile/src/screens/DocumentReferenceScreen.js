import { useEffect, useMemo, useRef } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAppData } from "../context/AppDataContext";
import { colors } from "../theme";
import { buildDocumentPages, lineMatchesHighlight } from "../lib/documentPages";
import IssuesDetectedPanel from "../components/cockpit/IssuesDetectedPanel";
import PrimaryButton from "../components/ui/PrimaryButton";

export default function DocumentReferenceScreen({ navigation }) {
  const { scanFlow } = useAppData();
  const result = scanFlow?.result;
  const scrollRef = useRef(null);
  const pageOffsets = useRef({});

  const pages = useMemo(
    () =>
      buildDocumentPages({
        preview: result?.documentPreview,
        pageCount: result?.pageCount,
        formatChecks: result?.formatChecks,
      }),
    [result]
  );

  const highlight = scanFlow?.traceHighlight;

  useEffect(() => {
    if (!highlight?.page || !scrollRef.current) return;
    const y = pageOffsets.current[highlight.page];
    if (typeof y === "number") {
      scrollRef.current.scrollTo({ y: Math.max(0, y - 24), animated: true });
    }
  }, [highlight?.page, highlight?.line, highlight?.id, pages.length]);

  if (!result) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>No scan to trace</Text>
        <PrimaryButton title="Back to Upload" onPress={() => navigation.navigate("MainTabs", { screen: "Upload" })} />
      </View>
    );
  }

  function onIssuePress(entry) {
    scanFlow.selectTraceIssue(entry);
  }

  return (
    <View style={styles.root}>
      <View style={styles.toolbar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
          <Text style={styles.back}>← Back</Text>
        </Pressable>
        <Text style={styles.toolbarTitle} numberOfLines={1}>
          Reference · {result.documentTitle}
        </Text>
        <Pressable
          onPress={() => {
            scanFlow.openFullResult();
            navigation.navigate("MainTabs", { screen: "Results" });
          }}
        >
          <Text style={styles.fullResult}>Full result</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.docScroll}
        contentContainerStyle={styles.docContent}
        keyboardShouldPersistTaps="handled"
      >
        {pages.map((page) => (
          <View
            key={`page-${page.page}`}
            style={styles.pageCard}
            onLayout={(e) => {
              pageOffsets.current[page.page] = e.nativeEvent.layout.y;
            }}
          >
            <Text style={styles.pageLabel}>Page {page.page}</Text>
            {(page.lines || []).map((line, index) => {
              const lineNum = index + 1;
              const active = lineMatchesHighlight(page.page, lineNum, highlight);
              return (
                <Text
                  key={`${page.page}-${lineNum}`}
                  style={[styles.lineText, active ? styles.lineHighlight : null]}
                >
                  {line || " "}
                </Text>
              );
            })}
          </View>
        ))}
        {!pages.length ? (
          <Text style={styles.muted}>
            Document preview is not available. Use the issues list below to jump by page and line.
          </Text>
        ) : null}
      </ScrollView>

      <View style={styles.issuesPane}>
        <Text style={styles.issuesTitle}>Issues · tap to scroll</Text>
        <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
          <IssuesDetectedPanel
            formatChecks={result.formatChecks}
            pageCount={result.pageCount}
            onIssuePress={onIssuePress}
            selectedIssueId={highlight?.id}
            compact
          />
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.pageBg },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: 12 },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  back: { fontSize: 13, fontWeight: "600", color: colors.accentText },
  toolbarTitle: { flex: 1, fontSize: 14, fontWeight: "700", color: colors.text },
  fullResult: { fontSize: 12, fontWeight: "700", color: colors.emerald },
  docScroll: { flex: 1, maxHeight: "42%" },
  docContent: { padding: 14, gap: 12, paddingBottom: 20 },
  pageCard: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    padding: 14,
  },
  pageLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.muted,
    marginBottom: 8,
  },
  lineText: {
    fontSize: 13,
    lineHeight: 20,
    color: "#334155",
    fontFamily: "Georgia",
  },
  lineHighlight: {
    backgroundColor: "rgba(254,226,226,0.85)",
    textDecorationLine: "underline",
    textDecorationColor: colors.rose,
  },
  muted: { fontSize: 12, color: colors.muted, paddingHorizontal: 4 },
  issuesPane: {
    flex: 1,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    padding: 12,
    paddingBottom: 20,
  },
  issuesTitle: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: colors.muted,
    marginBottom: 8,
  },
});
