import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAppData } from "../context/AppDataContext";
import { colors } from "../theme";
import { relativeTime } from "../lib/notifications";

export default function NotificationsScreen() {
  const {
    notifications,
    markNotificationsAllRead,
    markNotificationRead,
  } = useAppData();

  if (!notifications.length) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyTitle}>Notifications</Text>
        <Text style={styles.emptyBody}>
          You’re all caught up. Uploads, scans, and plan updates will appear here.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.kicker}>Notification</Text>
          <Text style={styles.title}>Notifications</Text>
        </View>
        <Pressable onPress={markNotificationsAllRead}>
          <Text style={styles.markAll}>Mark all read</Text>
        </Pressable>
      </View>

      {notifications.map((item) => (
        <Pressable
          key={item.id}
          style={[styles.card, !item.read && styles.cardUnread]}
          onPress={() => markNotificationRead(item.id)}
        >
          <View style={styles.row}>
            <Text style={styles.cardTitle}>{item.title}</Text>
            {!item.read ? <View style={styles.dot} /> : null}
          </View>
          {item.body ? <Text style={styles.body}>{item.body}</Text> : null}
          <Text style={styles.time}>
            {item.createdAt ? relativeTime(item.createdAt) || new Date(item.createdAt).toLocaleString() : ""}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.pageBg },
  scroll: { padding: 16, paddingBottom: 40 },
  emptyWrap: {
    flex: 1,
    backgroundColor: colors.pageBg,
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: colors.text },
  emptyBody: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: colors.muted,
    textAlign: "center",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: 16,
  },
  kicker: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: colors.accent,
  },
  title: { marginTop: 4, fontSize: 22, fontWeight: "700", color: colors.text },
  markAll: { fontSize: 13, fontWeight: "600", color: colors.accentText },
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  cardUnread: { borderColor: colors.accent, backgroundColor: colors.accentSoft },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: "700", color: colors.text },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  body: { marginTop: 6, fontSize: 13, lineHeight: 19, color: colors.slate },
  time: { marginTop: 8, fontSize: 11, color: colors.muted },
});
