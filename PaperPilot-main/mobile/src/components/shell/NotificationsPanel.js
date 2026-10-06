import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { colors } from "../../theme";
import { groupNotifications, relativeTime } from "../../lib/notifications";

const PREVIEW_LIMIT = 10;

const TYPE_TONES = {
  scan_complete: { bg: "#d1fae5", fg: "#059669" },
  scan_fail: { bg: "#ffe4e6", fg: "#f43f5e" },
  scan_review: { bg: "#fef3c7", fg: "#d97706" },
  payment: { bg: "#ccfbf1", fg: "#0d9488" },
  password: { bg: "#f1f5f9", fg: "#64748b" },
  upload: { bg: "#f1f5f9", fg: "#64748b" },
};

function TypeGlyph({ type, color }) {
  const stroke = { stroke: color, strokeLinecap: "round", strokeLinejoin: "round", fill: "none" };
  if (type === "scan_complete") return <Path d="M4.5 12.75l6 6 9-13.5" strokeWidth={2.2} {...stroke} />;
  if (type === "scan_fail") return <Path d="M6 18 18 6M6 6l12 12" strokeWidth={2.2} {...stroke} />;
  if (type === "scan_review") return <Path d="M12 9v4m0 4h.01M12 3 2.5 20h19L12 3Z" strokeWidth={2.2} {...stroke} />;
  if (type === "payment") {
    return (
      <>
        <Rect x={2.5} y={5.5} width={19} height={13} rx={2} strokeWidth={1.8} {...stroke} />
        <Path d="M2.5 10h19M7 15h3" strokeWidth={1.8} {...stroke} />
      </>
    );
  }
  if (type === "password") {
    return (
      <>
        <Path d="M16.5 10.5V7.5a4.5 4.5 0 1 0-9 0v3" strokeWidth={1.8} {...stroke} />
        <Rect x={5} y={10.5} width={14} height={9} rx={2} strokeWidth={1.8} {...stroke} />
      </>
    );
  }
  return (
    <Path
      d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M7.5 9.75 12 5.25m0 0 4.5 4.5M12 5.25v12"
      strokeWidth={1.8}
      {...stroke}
    />
  );
}

function TypeIcon({ type }) {
  const tone = TYPE_TONES[type];
  if (!tone) {
    return (
      <View style={[styles.typeIcon, { backgroundColor: "#f1f5f9" }]}>
        <Text style={styles.typeDot}>•</Text>
      </View>
    );
  }
  return (
    <View style={[styles.typeIcon, { backgroundColor: tone.bg }]}>
      <Svg width={20} height={20} viewBox="0 0 24 24">
        <TypeGlyph type={type} color={tone.fg} />
      </Svg>
    </View>
  );
}

function NotificationRow({ item, open, onToggle, onDelete, last }) {
  const body = item.body || "";
  const canFold = body.length > 90;
  return (
    <View style={[styles.row, last && styles.rowLast]}>
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
          <Text style={[styles.rowTitle, item.read && styles.rowTitleRead]}>{item.title}</Text>
          <Text style={styles.rowTime}>{relativeTime(item.createdAt)}</Text>
          {body ? (
            <Text style={styles.rowText} numberOfLines={open ? undefined : 2}>
              {body}
            </Text>
          ) : null}
          {canFold ? <Text style={styles.fold}>{open ? "See less" : "See more"}</Text> : null}
        </View>
      </Pressable>
      <Pressable
        style={({ pressed }) => [styles.deleteBtn, pressed && styles.deleteBtnPressed]}
        onPress={() => onDelete(item.id)}
        accessibilityLabel="Delete notification"
        hitSlop={6}
      >
        {({ pressed }) => <Text style={[styles.deleteGlyph, pressed && styles.deleteGlyphPressed]}>×</Text>}
      </Pressable>
    </View>
  );
}

function Section({ label, items, openId, onToggle, onDelete }) {
  if (!items?.length) return null;
  return (
    <View>
      <Text style={styles.sectionLabel}>{label}</Text>
      {items.map((item, index) => (
        <NotificationRow
          key={item.id}
          item={item}
          open={openId === item.id}
          onToggle={onToggle}
          onDelete={onDelete}
          last={index === items.length - 1}
        />
      ))}
    </View>
  );
}

/** Recent-activity dropdown shown from the header bell (mirrors the web panel). */
export default function NotificationsPanel({ items = [], unread = 0, onMarkAllRead, onMarkRead, onDelete, maxListHeight }) {
  const [filter, setFilter] = useState("all");
  const [openId, setOpenId] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const visible = filter === "unread" ? items.filter((item) => !item.read) : items;
  const listed = showAll ? visible : visible.slice(0, PREVIEW_LIMIT);
  const hasMore = visible.length > PREVIEW_LIMIT;
  const groups = groupNotifications(listed);

  useEffect(() => {
    setShowAll(false);
  }, [filter]);

  function toggle(id) {
    setOpenId((current) => (current === id ? null : id));
    onMarkRead?.(id);
  }

  return (
    <View style={styles.panel} accessibilityLabel="Notifications">
      <View style={styles.header}>
        <Text style={styles.title}>Notifications</Text>
        <Pressable onPress={onMarkAllRead} disabled={unread === 0} hitSlop={6}>
          <Text style={[styles.markAll, unread === 0 && styles.markAllDisabled]}>Mark all as read</Text>
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

      <ScrollView style={{ maxHeight: maxListHeight }} showsVerticalScrollIndicator>
        {visible.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>
              {filter === "unread" ? "No unread notifications" : "No notifications yet"}
            </Text>
            <Text style={styles.emptyBody}>Scan results, uploads, and subscription updates will show up here.</Text>
          </View>
        ) : (
          <>
            <Section label="New" items={groups.today} openId={openId} onToggle={toggle} onDelete={onDelete} />
            <Section label="Yesterday" items={groups.yesterday} openId={openId} onToggle={toggle} onDelete={onDelete} />
            <Section label="Earlier" items={groups.earlier} openId={openId} onToggle={toggle} onDelete={onDelete} />
          </>
        )}
      </ScrollView>

      {hasMore && !showAll ? (
        <View style={styles.showAllWrap}>
          <Pressable
            onPress={() => setShowAll(true)}
            style={({ pressed }) => [styles.showAllBtn, pressed && styles.showAllBtnPressed]}
          >
            <Text style={styles.showAllText}>Show All</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    overflow: "hidden",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: { fontSize: 16, fontWeight: "700", color: "#1a2333" },
  markAll: { fontSize: 12, fontWeight: "600", color: colors.accentText },
  markAllDisabled: { color: "#cbd5e1" },
  tabs: {
    flexDirection: "row",
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  tab: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 },
  tabActive: { backgroundColor: "#e7f8f5" },
  tabText: { fontSize: 12, fontWeight: "600", color: colors.slate },
  tabTextActive: { color: "#0f766e" },
  empty: { paddingHorizontal: 20, paddingVertical: 56, alignItems: "center" },
  emptyTitle: { fontSize: 14, fontWeight: "600", color: "#475569" },
  emptyBody: { marginTop: 4, fontSize: 12, lineHeight: 18, color: colors.muted, textAlign: "center" },
  sectionLabel: {
    backgroundColor: "#fbfbfc",
    paddingHorizontal: 20,
    paddingVertical: 10,
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.6,
    textTransform: "uppercase",
    color: colors.muted,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  rowLast: { borderBottomWidth: 0 },
  unreadSlot: { width: 8, marginTop: 14 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
  rowMain: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "flex-start", gap: 12 },
  typeIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  typeDot: { fontSize: 16, color: colors.muted },
  rowBody: { flex: 1, minWidth: 0, paddingTop: 2 },
  rowTitle: { fontSize: 13, fontWeight: "600", lineHeight: 18, color: "#1a2333" },
  rowTitleRead: { fontWeight: "500", color: "#475569" },
  rowTime: { marginTop: 4, fontSize: 11, color: colors.muted },
  rowText: { marginTop: 4, fontSize: 12, lineHeight: 18, color: colors.slate },
  fold: { marginTop: 4, fontSize: 11, fontWeight: "600", color: colors.accentText },
  deleteBtn: {
    marginTop: 4,
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteBtnPressed: { backgroundColor: "#fff1f2" },
  deleteGlyph: { fontSize: 16, lineHeight: 18, color: colors.muted },
  deleteGlyphPressed: { color: "#e11d48" },
  showAllWrap: { borderTopWidth: 1, borderTopColor: "#f1f5f9", paddingHorizontal: 16, paddingVertical: 10 },
  showAllBtn: { borderRadius: 8, paddingVertical: 8, alignItems: "center" },
  showAllBtnPressed: { backgroundColor: "#f3fbf9" },
  showAllText: { fontSize: 12, fontWeight: "600", color: colors.accentText },
});
