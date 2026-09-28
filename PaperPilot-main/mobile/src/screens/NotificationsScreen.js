import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAppData } from "../context/AppDataContext";
import { colors } from "../theme";
import { groupNotifications, relativeTime } from "../lib/notifications";

const TYPE_STYLES = {
  scan_complete: { bg: "#d1fae5", text: "#059669", glyph: "✓" },
  scan_fail: { bg: "#ffe4e6", text: "#e11d48", glyph: "×" },
  scan_review: { bg: "#fef3c7", text: "#d97706", glyph: "!" },
  payment: { bg: "#ccfbf1", text: "#0f766e", glyph: "₱" },
  password: { bg: "#f1f5f9", text: "#64748b", glyph: "🔒" },
  upload: { bg: "#f1f5f9", text: "#64748b", glyph: "↑" },
};

function TypeIcon({ type }) {
  const tone = TYPE_STYLES[type] || { bg: "#f1f5f9", text: "#94a3b8", glyph: "•" };
  return (
    <View style={[styles.typeIcon, { backgroundColor: tone.bg }]}>
      <Text style={[styles.typeGlyph, { color: tone.text }]}>{tone.glyph}</Text>
    </View>
  );
}

function NotificationRow({ item, open, onToggle, onDelete }) {
  const body = item.body || "";
  const canFold = body.length > 90;
  return (
    <View style={styles.row}>
      <View style={styles.unreadSlot}>
        {!item.read ? <View style={styles.unreadDot} accessibilityLabel="Unread" /> : null}
      </View>
      <Pressable
        style={styles.rowMain}
        onPress={() => onToggle(item.id)}
        accessibilityState={{ expanded: open }}
      >
        <TypeIcon type={item.type} />
        <View style={styles.rowBody}>
          <View style={styles.rowHead}>
            <Text style={[styles.rowTitle, item.read ? styles.rowTitleRead : null]}>{item.title}</Text>
            <Text style={styles.rowTime}>{relativeTime(item.createdAt)}</Text>
          </View>
          {body ? (
            <Text style={styles.rowText} numberOfLines={open ? undefined : 2}>
              {body}
            </Text>
          ) : null}
          {canFold ? (
            <Text style={styles.fold}>{open ? "See less" : "See more"}</Text>
          ) : null}
        </View>
      </Pressable>
      <Pressable
        style={styles.deleteBtn}
        onPress={() => onDelete(item.id)}
        accessibilityLabel="Delete notification"
        hitSlop={6}
      >
        <Text style={styles.deleteGlyph}>×</Text>
      </Pressable>
    </View>
  );
}

function Section({ label, items, openId, onToggle, onDelete }) {
  if (!items?.length) return null;
  return (
    <View>
      <Text style={styles.sectionLabel}>{label}</Text>
      {items.map((item) => (
        <NotificationRow
          key={item.id}
          item={item}
          open={openId === item.id}
          onToggle={onToggle}
          onDelete={onDelete}
        />
      ))}
    </View>
  );
}

export default function NotificationsScreen() {
  const {
    notifications,
    notificationUnread,
    markNotificationsAllRead,
    markNotificationRead,
    deleteNotification,
  } = useAppData();
  const [filter, setFilter] = useState("all");
  const [openId, setOpenId] = useState(null);
  const visible = filter === "unread" ? notifications.filter((item) => !item.read) : notifications;
  const groups = groupNotifications(visible);

  function toggle(id) {
    setOpenId((current) => (current === id ? null : id));
    markNotificationRead?.(id);
  }

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>Notifications</Text>
        <Pressable onPress={markNotificationsAllRead} disabled={notificationUnread === 0}>
          <Text style={[styles.markAll, notificationUnread === 0 && styles.markAllDisabled]}>
            Mark all as read
          </Text>
        </Pressable>
      </View>
      <View style={styles.tabs}>
        {[
          { id: "all", label: "All" },
          { id: "unread", label: "Unread" },
        ].map((tab) => (
          <Pressable
            key={tab.id}
            onPress={() => setFilter(tab.id)}
            style={[styles.tab, filter === tab.id && styles.tabActive]}
          >
            <Text style={[styles.tabText, filter === tab.id && styles.tabTextActive]}>{tab.label}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        {visible.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {filter === "unread" ? "No unread notifications" : "No notifications yet"}
            </Text>
            <Text style={styles.emptyBody}>
              Scan results, uploads, and subscription updates will show up here.
            </Text>
          </View>
        ) : (
          <>
            <Section label="New" items={groups.today} openId={openId} onToggle={toggle} onDelete={deleteNotification} />
            <Section
              label="Yesterday"
              items={groups.yesterday}
              openId={openId}
              onToggle={toggle}
              onDelete={deleteNotification}
            />
            <Section
              label="Earlier"
              items={groups.earlier}
              openId={openId}
              onToggle={toggle}
              onDelete={deleteNotification}
            />
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.card },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  title: { fontSize: 16, fontWeight: "700", color: "#1a2333" },
  markAll: { fontSize: 12, fontWeight: "600", color: colors.accentText },
  markAllDisabled: { color: "#cbd5e1" },
  tabs: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  tab: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  tabActive: { backgroundColor: "#e7f8f5" },
  tabText: { fontSize: 12, fontWeight: "600", color: colors.slate },
  tabTextActive: { color: "#0f766e" },
  scroll: { paddingBottom: 32 },
  empty: { paddingHorizontal: 20, paddingVertical: 56, alignItems: "center" },
  emptyTitle: { fontSize: 14, fontWeight: "600", color: "#475569" },
  emptyBody: { marginTop: 6, fontSize: 12, lineHeight: 18, color: colors.muted, textAlign: "center" },
  sectionLabel: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 6,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: colors.muted,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  unreadSlot: { width: 8, marginTop: 16 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  typeIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  typeGlyph: { fontSize: 16, fontWeight: "700" },
  rowBody: { flex: 1, paddingTop: 2 },
  rowHead: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  rowTitle: { flex: 1, fontSize: 13, fontWeight: "700", lineHeight: 18, color: "#1a2333" },
  rowTitleRead: { fontWeight: "500", color: "#475569" },
  rowTime: { fontSize: 11, color: colors.muted },
  rowText: { marginTop: 4, fontSize: 12, lineHeight: 18, color: colors.slate },
  fold: { marginTop: 4, fontSize: 11, fontWeight: "600", color: colors.accentText },
  deleteBtn: {
    width: 28,
    height: 28,
    marginTop: 4,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteGlyph: { fontSize: 18, color: colors.muted, lineHeight: 20 },
});
