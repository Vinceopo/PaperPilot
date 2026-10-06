import { useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppData } from "../../context/AppDataContext";
import { auth } from "../../firebase";
import { signOutUser } from "../../services/auth";
import { colors } from "../../theme";
import Sidebar from "./Sidebar";
import NotificationsPanel from "./NotificationsPanel";
import { ArrowLeftIcon, BellIcon, MenuIcon } from "./icons";

/**
 * Dashboard chrome shared by the main screens: the header (menu toggle, plan,
 * subscription button, notifications) and the slide-in sidebar.
 */
export default function AppShell({ active, breadcrumb, title, onBack, backLabel, children }) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsAnchor, setNotificationsAnchor] = useState(null);
  const bellRef = useRef(null);
  const {
    tier,
    remaining,
    limit,
    notifications,
    notificationUnread,
    markNotificationsAllRead,
    markNotificationRead,
    deleteNotification,
    handleBackToDashboard,
    scanFlow,
    uploadWizardStep,
    manuscriptReady,
    currentVersion,
    resetUploadWizard,
  } = useAppData();

  const unreadLabel = notificationUnread > 9 ? "9+" : String(notificationUnread);
  const showHeading = Boolean(title);
  const notificationsOpen = Boolean(notificationsAnchor);
  const panelWidth = Math.min(384, screenWidth - 24);
  const panelTop = notificationsAnchor?.top ?? insets.top + 60;
  const listMaxHeight = Math.max(
    160,
    Math.min(512, screenHeight * 0.7, screenHeight - panelTop - insets.bottom - 150)
  );

  function toggleNotifications() {
    if (notificationsOpen) {
      setNotificationsAnchor(null);
      return;
    }
    const fallback = { top: insets.top + 60 };
    if (!bellRef.current?.measureInWindow) {
      setNotificationsAnchor(fallback);
      return;
    }
    bellRef.current.measureInWindow((x, y, w, h) => {
      setNotificationsAnchor(Number.isFinite(y) && h ? { top: y + h + 8 } : fallback);
    });
  }

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <View style={styles.topRow}>
          <Pressable
            style={styles.menuBtn}
            onPress={() => setMenuOpen(true)}
            accessibilityLabel="Show sidebar"
            hitSlop={4}
          >
            <MenuIcon size={16} />
          </Pressable>

          <View style={styles.planWrap}>
            <Text style={styles.plan} numberOfLines={1}>
              {tier} plan
            </Text>
            <Text style={styles.remaining} numberOfLines={2}>
              {remaining} of {limit} scans remaining
            </Text>
          </View>

          <Pressable
            style={({ pressed }) => [styles.subscribeBtn, pressed && styles.subscribeBtnPressed]}
            onPress={() => navigation.navigate("Subscription")}
            accessibilityRole="button"
          >
            <Text style={styles.subscribeText} numberOfLines={1}>
              {tier === "premium" ? "Manage subscription" : "Subscribe to Premium"}
            </Text>
          </Pressable>

          <Pressable
            ref={bellRef}
            style={[styles.bellBtn, notificationsOpen && styles.bellBtnOpen]}
            onPress={toggleNotifications}
            accessibilityState={{ expanded: notificationsOpen }}
            accessibilityLabel={
              notificationsOpen
                ? "Close notifications"
                : notificationUnread
                  ? `Open notifications, ${notificationUnread} unread`
                  : "Open notifications"
            }
            hitSlop={4}
          >
            <BellIcon size={20} color={notificationsOpen ? "#d97706" : "#475569"} />
            {notificationUnread > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{unreadLabel}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        {showHeading ? (
          <View style={styles.heading}>
            {breadcrumb ? <Text style={styles.breadcrumb}>{breadcrumb}</Text> : null}
            <Text style={styles.title}>{title}</Text>
            {onBack ? (
              <Pressable
                style={({ pressed }) => [styles.backBtn, pressed && styles.backBtnPressed]}
                onPress={onBack}
                hitSlop={6}
              >
                <ArrowLeftIcon size={14} />
                <Text style={styles.backText}>{backLabel || "Back to Dashboard"}</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={styles.body}>{children}</View>

      <Modal
        visible={notificationsOpen}
        transparent
        statusBarTranslucent
        animationType="fade"
        onRequestClose={() => setNotificationsAnchor(null)}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => setNotificationsAnchor(null)}
          accessibilityLabel="Close notifications"
        />
        <View style={[styles.popover, { top: panelTop, width: panelWidth }]}>
          <NotificationsPanel
            items={notifications}
            unread={notificationUnread}
            onMarkAllRead={markNotificationsAllRead}
            onMarkRead={markNotificationRead}
            onDelete={deleteNotification}
            maxListHeight={listMaxHeight}
          />
        </View>
      </Modal>

      <Sidebar
        visible={menuOpen}
        active={active}
        onClose={() => setMenuOpen(false)}
        onUpload={() => {
          // Leave results and analysis, and don't resume File details after the manuscript is gone.
          if (scanFlow.step !== "idle" && scanFlow.step !== "fileSelected") {
            handleBackToDashboard();
          } else if (uploadWizardStep === 3 && !(manuscriptReady && (currentVersion || scanFlow.file))) {
            resetUploadWizard(1);
          }
          navigation.navigate("Upload");
        }}
        onManuscripts={() => navigation.navigate("Library")}
        onAccount={() => navigation.navigate("Account")}
        onSignOut={() => signOutUser(auth)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.pageBg },
  body: { flex: 1 },
  header: {
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  topRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  menuBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0f172a",
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  planWrap: { flex: 1, minWidth: 0, alignItems: "flex-end" },
  plan: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "capitalize",
    color: "#334155",
    textAlign: "right",
  },
  remaining: { fontSize: 10, color: colors.muted, textAlign: "right" },
  subscribeBtn: {
    borderRadius: 6,
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 9,
    shadowColor: "#0f172a",
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  subscribeBtnPressed: { backgroundColor: colors.accentHover },
  subscribeText: { fontSize: 11, fontWeight: "700", color: "#092823" },
  bellBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f1f5f9",
    alignItems: "center",
    justifyContent: "center",
  },
  bellBtnOpen: { backgroundColor: "#fef3c7" },
  popover: {
    position: "absolute",
    right: 12,
    borderRadius: 16,
    backgroundColor: colors.white,
    shadowColor: "#0f172a",
    shadowOpacity: 0.18,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 16,
  },
  badge: {
    position: "absolute",
    top: 0,
    right: 0,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 3,
    backgroundColor: "#f43f5e",
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { fontSize: 9, fontWeight: "700", color: colors.white },
  heading: { marginTop: 12 },
  breadcrumb: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.muted,
  },
  title: { marginTop: 2, fontSize: 20, fontWeight: "700", letterSpacing: -0.3, color: colors.text },
  backBtn: {
    marginTop: 8,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#bfeee5",
    backgroundColor: "#f0fbf9",
    paddingVertical: 6,
    paddingLeft: 10,
    paddingRight: 14,
    shadowColor: "#0f172a",
    shadowOpacity: 0.05,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  backBtnPressed: { borderColor: colors.accent, backgroundColor: "#dcf7f2" },
  backText: { fontSize: 12, fontWeight: "700", color: "#109b89" },
});
