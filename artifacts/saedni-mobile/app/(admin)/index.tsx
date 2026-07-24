import React, { useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { useAdminPushRegistration } from "@/hooks/usePushNotifications";
import { CATEGORIES, STATUS_INFO } from "@/constants/categories";

const BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN ?? "saedni.onrender.com"}`;

interface Stats {
  totalUsers: number; totalHelpers: number; totalCustomers: number;
  totalRequests: number; activeRequests: number; completedRequests: number; cancelledRequests: number;
  helpCompleted: number; helpNotCompleted: number; successRate: number;
}
interface HelpRequest {
  id: number; category: string; details: string; area: string;
  timeType: string; scheduledDateTime?: string | null;
  offeredAmount: number; status: string; customerName?: string | null;
  createdAt: string;
  helpCompleted?: boolean | null;
  completedAt?: string | null;
}

type FeedbackFilter = "all" | "completed" | "not_completed" | "no_rating";
interface AdminNotification {
  id: number; type: string; title: string;
  userId?: number | null; userName?: string | null;
  phone: string; userType?: string | null;
  isRead: boolean; createdAt: string;
}

function fmtScheduled(iso: string) {
  const d = new Date(iso);
  const dd = d.getDate().toString().padStart(2, "0");
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  const yyyy = d.getFullYear();
  let h = d.getHours();
  const min = d.getMinutes().toString().padStart(2, "0");
  const period = h >= 12 ? "مساءً" : "صباحاً";
  h = h % 12 || 12;
  return `${dd}/${mm}/${yyyy} - ${h}:${min} ${period}`;
}

function fmtCreatedAt(iso: string | null | undefined): string {
  if (!iso) return "غير متوفر";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "غير متوفر";
  const dd = d.getDate().toString().padStart(2, "0");
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  const yyyy = d.getFullYear();
  let h = d.getHours();
  const min = d.getMinutes().toString().padStart(2, "0");
  const period = h >= 12 ? "مساءً" : "صباحاً";
  h = h % 12 || 12;
  return `${dd}/${mm}/${yyyy} - ${h}:${min} ${period}`;
}

const USER_TYPE_LABEL: Record<string, string> = {
  customer: "عميل",
  helper: "مساعد",
  admin: "مدير",
};

type Tab = "requests" | "notifications";

function helpBadgeInfo(helpCompleted: boolean | null | undefined): { label: string; color: string; bg: string } {
  if (helpCompleted === true)  return { label: "تمت المساعدة",    color: "#059669", bg: "#D1FAE5" };
  if (helpCompleted === false) return { label: "لم تتم المساعدة", color: "#DC2626", bg: "#FEE2E2" };
  return { label: "لم يتم التقييم", color: "#6B7280", bg: "#F3F4F6" };
}

export default function AdminDashboard() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { logout } = useAuth();
  const qc = useQueryClient();
  useAdminPushRegistration(true);
  const [activeTab, setActiveTab] = useState<Tab>("requests");
  const [feedbackFilter, setFeedbackFilter] = useState<FeedbackFilter>("all");

  const { data: stats, refetch: refetchStats } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/admin/stats`, { credentials: "include" });
      return r.json() as Promise<Stats>;
    },
  });

  const { data: requests, isLoading: reqLoading, refetch: refetchReqs, isRefetching: reqRefetching } = useQuery({
    queryKey: ["admin-requests"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/requests`, { credentials: "include" });
      return r.json() as Promise<HelpRequest[]>;
    },
  });

  const { data: notifications, isLoading: notifLoading, refetch: refetchNotifs, isRefetching: notifRefetching } = useQuery({
    queryKey: ["admin-notifications"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/admin/notifications`, { credentials: "include" });
      return r.json() as Promise<AdminNotification[]>;
    },
    refetchInterval: 30_000,
  });

  const unreadCount = notifications?.filter(n => !n.isRead).length ?? 0;

  const filteredRequests = (requests ?? []).filter(req => {
    if (feedbackFilter === "all") return true;
    if (feedbackFilter === "completed") return req.helpCompleted === true;
    if (feedbackFilter === "not_completed") return req.helpCompleted === false;
    if (feedbackFilter === "no_rating") return req.helpCompleted == null;
    return true;
  });

  const deleteReqMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${BASE}/api/requests/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error();
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["admin-requests"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: () => Alert.alert("خطأ", "تعذر حذف الطلب"),
  });

  const endReqMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${BASE}/api/requests/${id}/complete`, { method: "PATCH", credentials: "include" });
      if (!r.ok) throw new Error();
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["admin-requests"] });
      qc.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: () => Alert.alert("خطأ", "تعذر إنهاء الطلب"),
  });

  const markReadMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${BASE}/api/admin/notifications/${id}/read`, {
        method: "PATCH",
        credentials: "include",
      });
      if (!r.ok) throw new Error();
      return r.json() as Promise<AdminNotification>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-notifications"] });
    },
  });

  function handleLogout() {
    Alert.alert("تسجيل الخروج", "هل تريد الخروج؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "خروج", style: "destructive", onPress: async () => { await logout(); router.replace("/(auth)/welcome"); } },
    ]);
  }

  function handleNotifPress(notif: AdminNotification) {
    if (!notif.isRead) markReadMutation.mutate(notif.id);
    if (notif.userId) {
      router.push(`/(admin)/user-detail?id=${notif.userId}`);
    } else {
      const q = new URLSearchParams({ id: "0", fallbackPhone: notif.phone, fallbackTime: notif.createdAt });
      router.push(`/(admin)/user-detail?${q.toString()}`);
    }
  }

  const catLabel = (v: string) => CATEGORIES.find(c => c.value === v)?.label ?? v;
  const s = makeStyles(colors, insets.bottom);

  // ── Stat definitions: main grid + feedback row ──
  const mainStats = [
    { label: "المستخدمون",  val: stats?.totalUsers ?? 0,       icon: "people-outline",           color: colors.primary },
    { label: "العملاء",     val: stats?.totalCustomers ?? 0,   icon: "person-outline",           color: "#6366F1" },
    { label: "المساعدون",   val: stats?.totalHelpers ?? 0,     icon: "hand-right-outline",       color: "#F59E0B" },
    { label: "الطلبات",     val: stats?.totalRequests ?? 0,    icon: "document-text-outline",    color: "#10B981" },
    { label: "النشطة",      val: stats?.activeRequests ?? 0,   icon: "flash-outline",            color: colors.primary },
    { label: "المنتهية",    val: stats?.completedRequests ?? 0, icon: "checkmark-done-outline",  color: "#6B7280" },
  ];

  const feedbackStats = [
    { label: "تمت المساعدة",      val: stats?.helpCompleted ?? 0,    icon: "checkmark-circle-outline", color: "#059669", bg: "#D1FAE5" },
    { label: "لم تتم المساعدة",   val: stats?.helpNotCompleted ?? 0, icon: "close-circle-outline",     color: "#DC2626", bg: "#FEE2E2" },
    { label: "نسبة النجاح",       val: `${stats?.successRate ?? 0}%`, icon: "stats-chart-outline",     color: "#6366F1", bg: "#EEF2FF" },
  ];

  const renderRequest = ({ item }: { item: HelpRequest }) => {
    const st = STATUS_INFO[item.status] ?? { label: item.status, color: "#6B7280", bg: "#F3F4F6" };
    return (
      <View style={s.reqCard}>
        <View style={s.reqTop}>
          <View style={s.reqLeft}>
            <View style={[s.statusBadge, { backgroundColor: st.bg }]}>
              <Text style={[s.statusTxt, { color: st.color }]}>{st.label}</Text>
            </View>
            <Text style={s.reqAmount}>{item.offeredAmount} ر.ع.</Text>
          </View>
          <Text style={s.reqCat}>{catLabel(item.category)}</Text>
        </View>
        {(() => { const hb = helpBadgeInfo(item.helpCompleted); return (
          <View style={[s.helpBadge, { backgroundColor: hb.bg }]}>
            <Text style={[s.helpBadgeTxt, { color: hb.color }]}>{hb.label}</Text>
          </View>
        ); })()}
        <Text style={s.reqDetails} numberOfLines={1}>{item.details}</Text>
        <View style={s.reqActions}>
          {item.status !== "completed" && (
            <TouchableOpacity
              style={s.endBtn}
              onPress={() =>
                Alert.alert("إنهاء الطلب", "سيتم إنهاء هذا الطلب وإخفاؤه عن المساعدين.", [
                  { text: "رجوع", style: "cancel" },
                  { text: "إنهاء", onPress: () => endReqMutation.mutate(item.id) },
                ])
              }
              disabled={endReqMutation.isPending}
              hitSlop={8}
            >
              <Ionicons name="checkmark-circle-outline" size={15} color={colors.primary} />
              <Text style={s.endTxt}>إنهاء الطلب</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() =>
              Alert.alert("حذف الطلب", "سيتم حذف الطلب نهائياً ولا يمكن التراجع.", [
                { text: "إلغاء", style: "cancel" },
                { text: "حذف", style: "destructive", onPress: () => deleteReqMutation.mutate(item.id) },
              ])
            }
            style={s.deleteBtn}
            disabled={deleteReqMutation.isPending}
            hitSlop={8}
          >
            <Ionicons name="trash-outline" size={15} color="#DC2626" />
            <Text style={s.deleteTxt}>حذف</Text>
          </TouchableOpacity>
        </View>
        <View style={s.reqMeta}>
          <Ionicons name="location-outline" size={12} color={colors.mutedForeground} />
          <Text style={s.metaTxt}>{item.area}</Text>
          <View style={s.dot} />
          <Ionicons
            name={item.timeType === "now" ? "flash" : "calendar-outline"}
            size={12}
            color={colors.mutedForeground}
          />
          <Text style={s.metaTxt}>
            {item.timeType === "now"
              ? "الآن"
              : item.scheduledDateTime
                ? fmtScheduled(item.scheduledDateTime)
                : "لاحقاً"}
          </Text>
          {item.customerName && (
            <>
              <View style={s.dot} />
              <Text style={s.metaTxt}>{item.customerName}</Text>
            </>
          )}
        </View>
        <View style={s.publishRow}>
          <Ionicons name="time-outline" size={11} color={colors.mutedForeground} />
          <Text style={s.publishTxt}>
            {"تاريخ نشر الطلب: "}
            <Text style={s.publishVal}>{fmtCreatedAt(item.createdAt)}</Text>
          </Text>
        </View>
      </View>
    );
  };

  const renderNotification = ({ item }: { item: AdminNotification }) => (
    <TouchableOpacity
      style={[s.notifCard, !item.isRead && s.notifCardUnread]}
      onPress={() => handleNotifPress(item)}
      activeOpacity={0.8}
    >
      <View style={s.notifRow}>
        <View style={s.notifRight}>
          <View style={[s.notifIcon, !item.isRead && s.notifIconUnread]}>
            <Ionicons
              name="key-outline"
              size={18}
              color={item.isRead ? colors.mutedForeground : colors.primary}
            />
          </View>
          <View style={s.notifText}>
            <View style={s.notifTitleRow}>
              {!item.isRead && <View style={s.unreadDot} />}
              <Text style={[s.notifTitle, !item.isRead && s.notifTitleUnread]}>
                {item.title}
              </Text>
            </View>
            {item.userName && (
              <Text style={s.notifMeta}>
                <Text style={s.notifMetaKey}>الاسم: </Text>
                {item.userName}
              </Text>
            )}
            <Text style={s.notifMeta}>
              <Text style={s.notifMetaKey}>الهاتف: </Text>
              {item.phone}
            </Text>
            {item.userType && (
              <Text style={s.notifMeta}>
                <Text style={s.notifMetaKey}>نوع الحساب: </Text>
                {USER_TYPE_LABEL[item.userType] ?? item.userType}
              </Text>
            )}
            <Text style={s.notifTime}>{fmtCreatedAt(item.createdAt)}</Text>
          </View>
        </View>
        {item.userId && (
          <View style={s.notifAction}>
            <Ionicons name="chevron-back" size={14} color={colors.mutedForeground} />
          </View>
        )}
      </View>
      {item.type === "otp_request" && (
        <View style={s.viewUserBtn}>
          <Ionicons name="person-outline" size={13} color={colors.primary} />
          <Text style={s.viewUserTxt}>{item.userId ? "عرض المستخدم" : "عرض التفاصيل"}</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  const isLoading = activeTab === "requests" ? reqLoading : notifLoading;
  const isRefetching = activeTab === "requests" ? reqRefetching : notifRefetching;

  return (
    <View style={s.container}>
      <SafeAreaView edges={["top"]} style={s.headerSafe}>
        <View style={s.headerInner}>
          <TouchableOpacity onPress={handleLogout} style={s.headerAction}>
            <Ionicons name="log-out-outline" size={22} color={colors.mutedForeground} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>لوحة الإدارة</Text>
          <TouchableOpacity onPress={() => router.push("/(admin)/users")} style={s.headerAction}>
            <Ionicons name="people-outline" size={22} color={colors.primary} />
          </TouchableOpacity>
        </View>

        <View style={s.tabs}>
          <TouchableOpacity
            style={[s.tab, activeTab === "notifications" && s.tabActive]}
            onPress={() => { Haptics.selectionAsync(); setActiveTab("notifications"); }}
          >
            <View style={s.tabInner}>
              <Ionicons
                name="notifications-outline"
                size={16}
                color={activeTab === "notifications" ? colors.primary : colors.mutedForeground}
              />
              <Text style={[s.tabTxt, activeTab === "notifications" && s.tabTxtActive]}>
                الإشعارات
              </Text>
              {unreadCount > 0 && (
                <View style={s.badge}>
                  <Text style={s.badgeTxt}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.tab, activeTab === "requests" && s.tabActive]}
            onPress={() => { Haptics.selectionAsync(); setActiveTab("requests"); }}
          >
            <View style={s.tabInner}>
              <Ionicons
                name="document-text-outline"
                size={16}
                color={activeTab === "requests" ? colors.primary : colors.mutedForeground}
              />
              <Text style={[s.tabTxt, activeTab === "requests" && s.tabTxtActive]}>
                الطلبات
              </Text>
            </View>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {isLoading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : activeTab === "requests" ? (
        <FlatList
          data={filteredRequests}
          keyExtractor={i => String(i.id)}
          renderItem={renderRequest}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => { refetchStats(); refetchReqs(); }}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            <View>
              {/* Main stats grid */}
              <View style={s.statsGrid}>
                {mainStats.map((st, i) => (
                  <View key={i} style={s.statCard}>
                    <View style={[s.statIcon, { backgroundColor: st.color + "18" }]}>
                      <Ionicons name={st.icon as any} size={20} color={st.color} />
                    </View>
                    <Text style={s.statVal}>{st.val}</Text>
                    <Text style={s.statLabel}>{st.label}</Text>
                  </View>
                ))}
              </View>

              {/* Feedback stats row */}
              <Text style={s.feedbackTitle}>إحصائيات المساعدة</Text>
              <View style={s.feedbackRow}>
                {feedbackStats.map((fs, i) => (
                  <View key={i} style={[s.feedbackCard, { borderColor: fs.color + "30" }]}>
                    <View style={[s.feedbackIcon, { backgroundColor: fs.bg }]}>
                      <Ionicons name={fs.icon as any} size={18} color={fs.color} />
                    </View>
                    <Text style={[s.feedbackVal, { color: fs.color }]}>{fs.val}</Text>
                    <Text style={s.feedbackLabel}>{fs.label}</Text>
                  </View>
                ))}
              </View>

              <Text style={s.filterTitle}>تصفية حسب نتيجة المساعدة</Text>
              <View style={s.filterRow}>
                {([ ["all","الكل"], ["completed","تمت المساعدة"], ["not_completed","لم تتم"], ["no_rating","لم يتم التقييم"] ] as [FeedbackFilter, string][]).map(([key, label]) => (
                  <TouchableOpacity
                    key={key}
                    style={[s.filterBtn, feedbackFilter === key && s.filterBtnActive]}
                    onPress={() => { Haptics.selectionAsync(); setFeedbackFilter(key); }}
                  >
                    <Text style={[s.filterBtnTxt, feedbackFilter === key && s.filterBtnTxtActive]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.sectionTitle}>
                {feedbackFilter === "all" ? "جميع الطلبات" : `الطلبات (${filteredRequests.length})`}
              </Text>
            </View>
          }
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="document-text-outline" size={56} color={colors.border} />
              <Text style={s.emptyTxt}>لا توجد طلبات</Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={notifications ?? []}
          keyExtractor={i => String(i.id)}
          renderItem={renderNotification}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={() => refetchNotifs()}
              tintColor={colors.primary}
            />
          }
          ListHeaderComponent={
            unreadCount > 0 ? (
              <View style={s.notifHeader}>
                <Ionicons name="ellipse" size={8} color={colors.primary} />
                <Text style={s.notifHeaderTxt}>
                  {unreadCount} إشعار{unreadCount === 1 ? "" : "ات"} غير مقروء{unreadCount === 1 ? "" : "ة"}
                </Text>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="notifications-off-outline" size={56} color={colors.border} />
              <Text style={s.emptyTxt}>لا توجد إشعارات</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const makeStyles = (c: ReturnType<typeof useColors>, bottomInset: number) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    centered: { flex: 1, alignItems: "center", justifyContent: "center" },
    headerSafe: { backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.border },
    headerInner: {
      paddingHorizontal: 16, paddingVertical: 12,
      flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    },
    headerTitle: { fontSize: 20, fontWeight: "800", color: c.foreground },
    headerAction: { padding: 4 },
    tabs: {
      flexDirection: "row-reverse",
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.border,
    },
    tab: {
      flex: 1, paddingVertical: 11, alignItems: "center",
      borderBottomWidth: 2, borderBottomColor: "transparent",
    },
    tabActive: { borderBottomColor: c.primary },
    tabInner: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
    tabTxt: { fontSize: 14, fontWeight: "600", color: c.mutedForeground },
    tabTxtActive: { color: c.primary },
    badge: {
      backgroundColor: "#EF4444", borderRadius: 10,
      minWidth: 20, height: 20, alignItems: "center", justifyContent: "center",
      paddingHorizontal: 5,
    },
    badgeTxt: { fontSize: 11, fontWeight: "800", color: "#fff" },
    listContent: { padding: 16, paddingBottom: bottomInset + 24 },

    // Main stats grid
    statsGrid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 10, marginBottom: 16 },
    statCard: {
      width: "31%", backgroundColor: c.card, borderRadius: 14, borderWidth: 1,
      borderColor: c.border, padding: 14, alignItems: "flex-end",
      shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    },
    statIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 8 },
    statVal: { fontSize: 24, fontWeight: "800", color: c.foreground },
    statLabel: { fontSize: 11, color: c.mutedForeground, textAlign: "right", marginTop: 2 },

    // Feedback stats
    feedbackTitle: { fontSize: 15, fontWeight: "700", color: c.foreground, textAlign: "right", marginBottom: 10 },
    feedbackRow: { flexDirection: "row-reverse", gap: 8, marginBottom: 20 },
    feedbackCard: {
      flex: 1, backgroundColor: c.card, borderRadius: 14, borderWidth: 1.5,
      padding: 12, alignItems: "flex-end",
      shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
    },
    feedbackIcon: {
      width: 34, height: 34, borderRadius: 10,
      alignItems: "center", justifyContent: "center", marginBottom: 6,
    },
    feedbackVal: { fontSize: 20, fontWeight: "800", marginBottom: 2 },
    feedbackLabel: { fontSize: 10, color: c.mutedForeground, textAlign: "right" },

    sectionTitle: { fontSize: 17, fontWeight: "700", color: c.foreground, textAlign: "right", marginBottom: 12 },

    // Help badge on request cards
    helpBadge: { alignSelf: "flex-end", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginBottom: 6 },
    helpBadgeTxt: { fontSize: 11, fontWeight: "700" },

    // Feedback filter buttons
    filterTitle: { fontSize: 13, fontWeight: "600", color: c.mutedForeground, textAlign: "right", marginBottom: 8 },
    filterRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 6, marginBottom: 14 },
    filterBtn: {
      borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6,
      backgroundColor: c.muted, borderWidth: 1, borderColor: c.border,
    },
    filterBtnActive: { backgroundColor: c.primary, borderColor: c.primary },
    filterBtnTxt: { fontSize: 12, fontWeight: "600", color: c.mutedForeground },
    filterBtnTxtActive: { color: c.primaryForeground },

    // Request cards
    reqCard: {
      backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.border,
      padding: 14, marginBottom: 10,
      shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
    },
    reqTop: { flexDirection: "row-reverse", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 6 },
    reqLeft: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
    reqCat: { fontSize: 15, fontWeight: "700", color: c.foreground, flex: 1, textAlign: "right" },
    reqAmount: { fontSize: 14, fontWeight: "700", color: c.primary },
    statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
    statusTxt: { fontSize: 11, fontWeight: "700" },
    reqDetails: { fontSize: 13, color: c.mutedForeground, textAlign: "right", marginBottom: 8 },
    reqActions: { flexDirection: "row-reverse", gap: 8, marginBottom: 10 },
    endBtn: {
      flex: 1, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center",
      gap: 5, backgroundColor: c.secondary, borderRadius: 8,
      paddingHorizontal: 10, paddingVertical: 7, borderWidth: 1, borderColor: c.border,
    },
    endTxt: { fontSize: 12, color: c.primary, fontWeight: "700" },
    deleteBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 4, backgroundColor: "#FEF2F2", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
    deleteTxt: { fontSize: 12, color: "#DC2626", fontWeight: "600" },
    reqMeta: { flexDirection: "row-reverse", alignItems: "center", gap: 5, marginBottom: 6 },
    metaTxt: { fontSize: 12, color: c.mutedForeground },
    dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: c.mutedForeground },
    publishRow: { flexDirection: "row-reverse", alignItems: "center", gap: 5 },
    publishTxt: { fontSize: 11, color: c.mutedForeground },
    publishVal: { fontSize: 11, color: c.foreground, fontWeight: "600" },

    // Notification cards
    notifHeader: {
      flexDirection: "row-reverse", alignItems: "center", gap: 8,
      marginBottom: 12, backgroundColor: c.primary + "12",
      borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
    },
    notifHeaderTxt: { fontSize: 13, color: c.primary, fontWeight: "700" },
    notifCard: {
      backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.border,
      padding: 14, marginBottom: 10,
      shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
    },
    notifCardUnread: {
      borderColor: c.primary + "40",
      backgroundColor: c.primary + "06",
    },
    notifRow: { flexDirection: "row-reverse", alignItems: "flex-start", justifyContent: "space-between" },
    notifRight: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 12, flex: 1 },
    notifIcon: {
      width: 40, height: 40, borderRadius: 12,
      backgroundColor: c.muted, alignItems: "center", justifyContent: "center",
    },
    notifIconUnread: { backgroundColor: c.primary + "18" },
    notifText: { flex: 1 },
    notifTitleRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6, marginBottom: 4 },
    unreadDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: c.primary },
    notifTitle: { fontSize: 14, fontWeight: "700", color: c.foreground, textAlign: "right" },
    notifTitleUnread: { color: c.primary },
    notifMeta: { fontSize: 13, color: c.mutedForeground, textAlign: "right", marginBottom: 2 },
    notifMetaKey: { fontWeight: "600", color: c.foreground },
    notifTime: { fontSize: 11, color: c.mutedForeground, textAlign: "right", marginTop: 4 },
    notifAction: { paddingTop: 2 },
    viewUserBtn: {
      marginTop: 10, flexDirection: "row-reverse", alignItems: "center", gap: 6,
      alignSelf: "flex-end", backgroundColor: c.secondary,
      borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6,
    },
    viewUserTxt: { fontSize: 12, color: c.primary, fontWeight: "700" },

    empty: { alignItems: "center", paddingTop: 60, gap: 10 },
    emptyTxt: { fontSize: 16, color: c.mutedForeground, fontWeight: "600" },
  });
