import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors } from "../../theme";
import PaperPilotLogo from "./PaperPilotLogo";
import { MenuIcon, UploadIcon } from "./icons";

const SIDEBAR_MAX_WIDTH = 320;

function NavItem({
  icon,
  iconNode,
  iconAccent,
  label,
  active,
  onPress,
  tone = "dashboard",
  first,
  nested = false,
  hideIcon = false,
}) {
  const idle = tone === "settings" ? styles.itemTextSettings : styles.itemTextIdle;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [
        styles.item,
        first ? styles.itemFirst : styles.itemNext,
        nested && styles.itemNested,
        active && styles.itemActive,
        pressed && !active && styles.itemPressed,
      ]}
    >
      {hideIcon ? null : iconNode ? (
        <View style={styles.itemIconWrap}>{iconNode}</View>
      ) : (
        <Text
          style={[
            styles.itemIcon,
            tone === "settings" && styles.itemTextSettings,
            iconAccent ? styles.itemIconAccent : active && styles.itemTextActive,
          ]}
        >
          {icon}
        </Text>
      )}
      <Text style={[styles.itemText, active ? styles.itemTextActive : idle]}>{label}</Text>
    </Pressable>
  );
}

export default function Sidebar({
  visible,
  active,
  onClose,
  onUpload,
  onManuscripts,
  onComplianceResult,
  showComplianceResult = false,
  onAccount,
  onSignOut,
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const panelWidth = Math.min(SIDEBAR_MAX_WIDTH, Math.round(width * 0.84));
  const progress = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.timing(progress, { toValue: 1, duration: 240, useNativeDriver: true }).start();
    } else {
      Animated.timing(progress, { toValue: 0, duration: 200, useNativeDriver: true }).start(
        ({ finished }) => {
          if (finished) setMounted(false);
        }
      );
    }
  }, [visible, progress]);

  const translateX = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-panelWidth, 0],
  });

  function select(action) {
    onClose();
    action?.();
  }

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View style={[styles.backdrop, { opacity: progress }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
        </Animated.View>

        <Animated.View
          style={[
            styles.panel,
            {
              width: panelWidth,
              paddingTop: insets.top + 24,
              paddingBottom: insets.bottom + 24,
              transform: [{ translateX }],
            },
          ]}
        >
          <View style={styles.brandRow}>
            <Pressable
              style={styles.brandBtn}
              onPress={() => select(onManuscripts)}
              accessibilityLabel="PaperPilot, go to My Manuscripts"
            >
              <PaperPilotLogo tone="dark" />
            </Pressable>
            <Pressable
              style={styles.closeBtn}
              onPress={onClose}
              accessibilityLabel="Hide sidebar"
              hitSlop={6}
            >
              <MenuIcon size={16} color="#cbd5e1" />
            </Pressable>
          </View>

          <View style={styles.navTop}>
            <Text style={styles.sectionLabel}>Dashboard</Text>
            <NavItem
              first
              icon="▣"
              label="My Manuscripts"
              active={active === "manuscripts"}
              onPress={() => select(onManuscripts)}
            />
            {showComplianceResult ? (
              <NavItem
                nested
                hideIcon
                label="Compliance Result"
                active={active === "results"}
                onPress={() => select(onComplianceResult)}
              />
            ) : null}
            <NavItem
              iconAccent
              iconNode={
                <UploadIcon size={16} color={active === "upload" ? "#ffffff" : "#22c9b4"} />
              }
              label="Upload & Analyze"
              active={active === "upload"}
              onPress={() => select(onUpload)}
            />
          </View>

          <View style={styles.navBottom}>
            <Text style={styles.sectionLabel}>Settings</Text>
            <NavItem
              first
              tone="settings"
              icon="♟"
              label="Account"
              active={active === "account"}
              onPress={() => select(onAccount)}
            />
            <Pressable
              style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.7 }]}
              onPress={() => select(onSignOut)}
              accessibilityRole="button"
            >
              <Text style={styles.signOutText}>↪ Sign Out</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.5)",
  },
  panel: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colors.sidebar,
    paddingHorizontal: 20,
  },
  brandRow: { position: "relative", paddingHorizontal: 8 },
  brandBtn: { alignItems: "center", borderRadius: 12, paddingTop: 4, paddingBottom: 8, paddingHorizontal: 4 },
  closeBtn: {
    position: "absolute",
    top: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(71, 85, 105, 0.6)",
    backgroundColor: colors.sidebarActive,
    alignItems: "center",
    justifyContent: "center",
  },
  navTop: { marginTop: 40 },
  navBottom: { marginTop: "auto" },
  sectionLabel: {
    paddingHorizontal: 12,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: "#475569",
  },
  itemNested: {
    marginTop: 2,
    paddingLeft: 44,
    paddingVertical: 10,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderLeftWidth: 2,
    borderLeftColor: "transparent",
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
  },
  itemFirst: { marginTop: 8 },
  itemNext: { marginTop: 4 },
  itemActive: { borderLeftColor: colors.accent, backgroundColor: colors.sidebarActive },
  itemPressed: { backgroundColor: "rgba(255, 255, 255, 0.05)" },
  itemIcon: { fontSize: 14, color: "#94a3b8" },
  itemIconWrap: { width: 18, alignItems: "center", justifyContent: "center" },
  itemIconAccent: { color: "#22c9b4" },
  itemText: { fontSize: 14, fontWeight: "600" },
  itemTextIdle: { color: "#94a3b8" },
  itemTextSettings: { color: "#cbd5e1" },
  itemTextActive: { color: colors.white },
  signOut: { marginTop: 24, paddingHorizontal: 12, paddingVertical: 8 },
  signOutText: { fontSize: 14, fontWeight: "500", color: "#fb7185" },
});
