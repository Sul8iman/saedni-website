import React, { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useFocusEffect, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listRequestLifecycleEvents,
  useCompleteRequest,
  useDeleteRequest,
  useListAdminActiveRequests,
  useListAdminArchiveRequests,
  useListDeletedRequests,
  useRestoreRequest,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { getAuthHeaders, useAuth } from "@/contexts/AuthContext";
import { useAdminPushRegistration } from "@/hooks/usePushNotifications";
import { CATEGORIES, STATUS_INFO, AREAS } from "@/constants/categories";
import AdminAreaFilter from "@/components/AdminAreaFilter";

const BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN ?? "saedni.onrender.com"}`;
const PAGE_SIZE = 20;

interface RequestItem {
  id: number;
  category: string;
  details: string;
  area: string;
  timeType: string;
  scheduledDateTime?: string | null;
  offeredAmount: number;
  status: string;
  customerName?: string | null;
  customerPhone?: string | null;
  helperName?: string | null;
  helperPhone?: string | null;
  createdAt: string;
  completedAt?: string | null;
  helpCompleted?: boolean | null;
  deletedAt?: string | null;
  deletedReason?: string | null;
}

interface ActiveResponse {
  items: RequestItem[];
  total: number;
  page: number;
  pageSize: number;
  activeCount: number;
}

interface ArchiveResponse {
  items: RequestItem[];
  total: number;
  helpedCount: number;
  notHelpedCount: number;
  archiveCount: number;
  page: number;
  pageSize: number;
}

interface AdminNotification {
  id: number;
  type: string;
  title: string;
  userId?: number | null;
  userName?: string | null;
  phone: string;
  userType?: string | null;
  isRead: boolean;
  createdAt: string;
}

type Tab = "requests" | "archive" | "notifications";
type ArchiveResult = "helped" | "not_helped" | "deleted";

async function readResponse<T>(response: Response, fallback: string): Promise<T> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = body && typeof body === "object" && "error" in body && typeof body.error === "string"
      ? body.error
      : fallback;
    throw new Error(message);
  }
  return body as T;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "غير متوفر";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "غير متوفر";
  const day = d.getDate().toString().padStart(2, "0");
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  let hour = d.getHours();
  const minute = d.getMinutes().toString().padStart(2, "0");
  const period = hour >= 12 ? "مساءً" : "صباحاً";
  hour = hour % 12 || 12;
  return `${day}/${month}/${d.getFullYear()} - ${hour}:${minute} ${period}`;
}

function statusInfo(status: string) {
  return STATUS_INFO[status] ?? { label: status, color: "#6B7280", bg: "#F3F4F6" };
}

function resultInfo(result: boolean | null | undefined) {
  return result === true
    ? { label: "تمت المساعدة", color: "#059669", bg: "#D1FAE5", icon: "checkmark-circle-outline" as const }
    : { label: "لم تتم المساعدة", color: "#DC2626", bg: "#FEE2E2", icon: "close-circle-outline" as const };
}

export default function AdminDashboard() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { logout } = useAuth();
  const qc = useQueryClient();
  useAdminPushRegistration(true);

  const [activeTab, setActiveTab] = useState<Tab>("requests");
  const [activeAreas, setActiveAreas] = useState<string[]>([]);
  const [archiveAreas, setArchiveAreas] = useState<string[]>([]);
  const [activeSearch, setActiveSearch] = useState("");
  const [archiveSearch, setArchiveSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("");
  const [archiveCategory, setArchiveCategory] = useState("");
  const [archivePeriod, setArchivePeriod] = useState<"all" | "7d" | "30d" | "month">("all");
  const archiveFrom = useMemo(
    () => archivePeriod === "all" ? undefined : periodStart(archivePeriod).toISOString(),
    [archivePeriod],
  );
  const [activePage, setActivePage] = useState(1);
  const [archivePage, setArchivePage] = useState(1);
  const [archiveResult, setArchiveResult] = useState<ArchiveResult>("helped");

  const activeParams = {
    ...(activeAreas.length > 0 ? { area: activeAreas } : {}),
    ...(activeSearch.trim() ? { search: activeSearch.trim() } : {}),
    ...(activeCategory ? { category: activeCategory } : {}),
    page: activePage,
    pageSize: PAGE_SIZE,
  };
  const archiveParams = {
    ...(archiveAreas.length > 0 ? { area: archiveAreas } : {}),
    ...(archiveSearch.trim() ? { search: archiveSearch.trim() } : {}),
    ...(archiveCategory ? { category: archiveCategory } : {}),
    ...(archiveFrom ? { from: archiveFrom } : {}),
    result: archiveResult === "deleted" ? "helped" as const : archiveResult,
    page: archivePage,
    pageSize: PAGE_SIZE,
  };

  const activeQuery = useListAdminActiveRequests<ActiveResponse>(activeParams, {
    query: { queryKey: ["/api/admin/requests/active", activeParams], enabled: activeTab === "requests" },
  });
  const archiveQuery = useListAdminArchiveRequests<ArchiveResponse>(archiveParams, {
    query: { queryKey: ["/api/admin/requests/archive", archiveParams], enabled: activeTab === "archive" && archiveResult !== "deleted" },
  });
  const deletedQuery = useListDeletedRequests({
    query: { queryKey: ["admin-deleted-requests"], enabled: activeTab === "archive" && archiveResult === "deleted" },
  });
  const { data: notifications, refetch: refetchNotifications, isFetching: notificationsFetching } = useNotifications();

  useFocusEffect(
    useCallback(() => {
      void activeQuery.refetch();
      void archiveQuery.refetch();
      void refetchNotifications();
      return undefined;
    }, [activeQuery.refetch, archiveQuery.refetch, refetchNotifications]),
  );

  const activeItems = activeQuery.data?.items ?? [];
  const archiveItems = archiveQuery.data?.items ?? [];
  const deletedItems = Array.isArray(deletedQuery.data) ? deletedQuery.data as RequestItem[] : [];
  const notificationItems = Array.isArray(notifications) ? notifications : [];
  const unreadCount = notificationItems.filter((notification) => !notification.isRead).length;

  const completeMutation = useCompleteRequest();
  const deleteMutation = useDeleteRequest();
  const restoreMutation = useRestoreRequest();

  const invalidateAdminData = () => {
    void qc.invalidateQueries({ queryKey: ["/api/admin/requests/active"] });
    void qc.invalidateQueries({ queryKey: ["/api/admin/requests/archive"] });
    void qc.invalidateQueries({ queryKey: ["/api/admin/requests/deleted"] });
    void qc.invalidateQueries({ queryKey: ["/api/admin/statistics"] });
  };

  const completeRequest = (id: number) => {
    completeMutation.mutate({ id, data: {} }, {
      onSuccess: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        invalidateAdminData();
      },
      onError: () => Alert.alert("خطأ", "تعذر إنهاء الطلب"),
    });
  };

  const archiveRequest = (id: number) => {
    deleteMutation.mutate({ id }, {
      onSuccess: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        invalidateAdminData();
      },
      onError: () => Alert.alert("خطأ", "تعذر نقل الطلب إلى المحذوفات"),
    });
  };

  const restoreRequest = (id: number) => {
    restoreMutation.mutate({ id }, {
      onSuccess: () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        invalidateAdminData();
      },
      onError: () => Alert.alert("خطأ", "تعذر استعادة الطلب"),
    });
  };

  async function showHistory(id: number) {
    try {
      const events = await listRequestLifecycleEvents(id);
      const summary = events.slice(0, 8).map((event) => `${fmtDate(event.createdAt)} — ${event.action}`).join("\n");
      Alert.alert("سجل الطلب", summary || "لا توجد أحداث مسجلة لهذا الطلب.");
    } catch {
      Alert.alert("خطأ", "تعذر تحميل سجل الطلب");
    }
  }

  const markReadMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`${BASE}/api/admin/notifications/${id}/read`, {
        method: "PATCH",
        credentials: "include",
        headers: await getAuthHeaders(),
      });
      return readResponse<AdminNotification>(response, "تعذر تحديث الإشعار");
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["admin-notifications"] }); },
  });

  const handleNotificationPress = (item: AdminNotification) => {
    if (!item.isRead) markReadMutation.mutate(item.id);
    if (item.userId) {
      router.push(`/(admin)/user-detail?id=${item.userId}`);
    } else {
      const query = new URLSearchParams({ id: "0", fallbackPhone: item.phone, fallbackTime: item.createdAt });
      router.push(`/(admin)/user-detail?${query.toString()}`);
    }
  };

  const handleLogout = () => {
    Alert.alert("تسجيل الخروج", "هل تريد الخروج؟", [
      { text: "إلغاء", style: "cancel" },
      { text: "خروج", style: "destructive", onPress: async () => { await logout(); router.replace("/(auth)/welcome"); } },
    ]);
  };

  const setAreaFilter = (areas: string[]) => {
    setActiveAreas(areas);
    setActivePage(1);
  };
  const setArchiveAreaFilter = (areas: string[]) => {
    setArchiveAreas(areas);
    setArchivePage(1);
  };

  const renderActiveRequest = ({ item }: { item: RequestItem }) => {
    const status = statusInfo(item.status);
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.cardTop}>
          <View style={styles.cardTitleCopy}>
            <Text style={[styles.category, { color: colors.foreground }]}>{catLabel(item.category)}</Text>
            <Text style={[styles.details, { color: colors.mutedForeground }]} numberOfLines={2}>{item.details}</Text>
          </View>
          <View style={[styles.status, { backgroundColor: status.bg }]}>
            <Text style={[styles.statusText, { color: status.color }]}>{status.label}</Text>
          </View>
        </View>
        <View style={styles.amountRow}>
          <Text style={[styles.amount, { color: colors.primary }]}>{Number(item.offeredAmount).toFixed(3)} ر.ع.</Text>
          <View style={styles.metaItem}>
            <Ionicons name="location-outline" size={14} color={colors.mutedForeground} />
            <Text style={[styles.meta, { color: colors.foreground }]}>{item.area}</Text>
          </View>
        </View>
        <View style={styles.metaRow}>
          <Text style={[styles.meta, { color: colors.mutedForeground }]}>{item.customerName ?? "عميل غير معروف"}</Text>
          <Text style={[styles.meta, { color: colors.mutedForeground }]}>{fmtDate(item.createdAt)}</Text>
        </View>
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.secondary, borderColor: colors.border }]}
            onPress={() => Alert.alert("إنهاء الطلب", "سيتم إنهاء هذا الطلب وإخفاؤه عن المساعدين.", [
              { text: "رجوع", style: "cancel" },
              { text: "إنهاء", onPress: () => completeRequest(item.id) },
            ])}
            disabled={completeMutation.isPending}
          >
            <Ionicons name="checkmark-circle-outline" size={16} color={colors.primary} />
            <Text style={[styles.actionText, { color: colors.primary }]}>إنهاء</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.deleteButton, { backgroundColor: "#FEF2F2" }]}
            onPress={() => Alert.alert("نقل إلى المحذوفات", "سيبقى الطلب محفوظاً ويمكن للمدير استعادته لاحقاً.", [
              { text: "إلغاء", style: "cancel" },
              { text: "نقل", style: "destructive", onPress: () => archiveRequest(item.id) },
            ])}
            disabled={deleteMutation.isPending}
          >
            <Ionicons name="trash-outline" size={16} color="#DC2626" />
            <Text style={styles.deleteText}>المحذوفات</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderArchiveRequest = ({ item }: { item: RequestItem }) => {
    const result = resultInfo(item.helpCompleted);
    return (
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.cardTop}>
          <View style={styles.cardTitleCopy}>
            <Text style={[styles.category, { color: colors.foreground }]}>{catLabel(item.category)}</Text>
            <Text style={[styles.details, { color: colors.mutedForeground }]} numberOfLines={2}>{item.details}</Text>
          </View>
          <View style={[styles.resultBadge, { backgroundColor: result.bg }]}>
            <Ionicons name={result.icon} size={14} color={result.color} />
            <Text style={[styles.statusText, { color: result.color }]}>{result.label}</Text>
          </View>
        </View>
        <View style={styles.archiveMeta}>
          <Text style={[styles.archiveMetaText, { color: colors.foreground }]}>{item.area}</Text>
          <Text style={[styles.archiveMetaText, { color: colors.mutedForeground }]}>{item.customerName ?? "عميل غير معروف"}</Text>
          <Text style={[styles.archiveMetaText, { color: colors.primary }]}>{Number(item.offeredAmount).toFixed(3)} ر.ع.</Text>
        </View>
        <Text style={[styles.completedText, { color: colors.mutedForeground }]}>
          تاريخ الإنهاء: {fmtDate(item.completedAt)}
        </Text>
        {item.helperName && (
          <View style={styles.helperRow}>
            <Ionicons name="person-outline" size={14} color={colors.primary} />
            <Text style={[styles.meta, { color: colors.foreground }]}>{item.helperName}</Text>
            {item.helperPhone && <Text style={[styles.meta, { color: colors.mutedForeground }]}>{item.helperPhone}</Text>}
          </View>
        )}
      </View>
    );
  };

  const renderDeletedRequest = ({ item }: { item: RequestItem }) => (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardTop}>
        <View style={styles.cardTitleCopy}>
          <Text style={[styles.category, { color: colors.foreground }]}>{catLabel(item.category)}</Text>
          <Text style={[styles.details, { color: colors.mutedForeground }]} numberOfLines={2}>{item.details}</Text>
        </View>
        <View style={[styles.status, { backgroundColor: "#F3F4F6" }]}>
          <Text style={[styles.statusText, { color: "#6B7280" }]}>محذوف</Text>
        </View>
      </View>
      <View style={styles.archiveMeta}>
        <Text style={[styles.archiveMetaText, { color: colors.foreground }]}>{item.area}</Text>
        <Text style={[styles.archiveMetaText, { color: colors.mutedForeground }]}>حُذف في {fmtDate(item.deletedAt)}</Text>
      </View>
      <View style={styles.actionRow}>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: colors.secondary, borderColor: colors.border }]}
          onPress={() => void showHistory(item.id)}
        >
          <Ionicons name="time-outline" size={16} color={colors.primary} />
          <Text style={[styles.actionText, { color: colors.primary }]}>السجل</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionButton, { backgroundColor: colors.secondary, borderColor: colors.border }]}
          onPress={() => Alert.alert("استعادة الطلب", "سيعود الطلب إلى القائمة النشطة وفق حالته السابقة.", [
            { text: "إلغاء", style: "cancel" },
            { text: "استعادة", onPress: () => restoreRequest(item.id) },
          ])}
          disabled={restoreMutation.isPending}
        >
          <Ionicons name="refresh-outline" size={16} color={colors.primary} />
          <Text style={[styles.actionText, { color: colors.primary }]}>استعادة</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderNotification = ({ item }: { item: AdminNotification }) => (
    <TouchableOpacity
      style={[styles.notificationCard, { backgroundColor: colors.card, borderColor: item.isRead ? colors.border : `${colors.primary}55` }]}
      onPress={() => handleNotificationPress(item)}
      activeOpacity={0.8}
    >
      <View style={[styles.notificationIcon, { backgroundColor: item.isRead ? colors.muted : `${colors.primary}18` }]}>
        <Ionicons name="notifications-outline" size={19} color={item.isRead ? colors.mutedForeground : colors.primary} />
      </View>
      <View style={styles.notificationCopy}>
        <View style={styles.notificationTitleRow}>
          {!item.isRead && <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />}
          <Text style={[styles.notificationTitle, { color: item.isRead ? colors.foreground : colors.primary }]}>{item.title}</Text>
        </View>
        {item.userName && <Text style={[styles.notificationMeta, { color: colors.mutedForeground }]}>الاسم: {item.userName}</Text>}
        <Text style={[styles.notificationMeta, { color: colors.mutedForeground }]}>الهاتف: {item.phone}</Text>
        <Text style={[styles.notificationTime, { color: colors.mutedForeground }]}>{fmtDate(item.createdAt)}</Text>
      </View>
      <Ionicons name="chevron-back" size={15} color={colors.mutedForeground} />
    </TouchableOpacity>
  );

  const activeLoading = activeQuery.isLoading || activeQuery.isFetching;
  const archiveLoading = archiveResult === "deleted" ? deletedQuery.isLoading : archiveQuery.isLoading;
  const listLoading = activeTab === "requests" ? activeLoading : activeTab === "archive" ? archiveLoading : false;
  const listRefreshing = activeTab === "requests"
    ? activeQuery.isRefetching
    : activeTab === "archive"
      ? archiveResult === "deleted" ? deletedQuery.isFetching : archiveQuery.isRefetching
      : notificationsFetching;
  const archiveCount = archiveQuery.data?.archiveCount ?? 0;
  const helpedCount = archiveQuery.data?.helpedCount ?? 0;
  const notHelpedCount = archiveQuery.data?.notHelpedCount ?? 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView edges={["top"]} style={[styles.headerSafe, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={handleLogout} style={styles.headerAction} accessibilityLabel="تسجيل الخروج">
            <Ionicons name="log-out-outline" size={22} color={colors.mutedForeground} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>{activeTab === "notifications" ? "الإشعارات" : "لوحة الإدارة"}</Text>
          <TouchableOpacity onPress={() => setActiveTab("notifications")} style={styles.headerAction} accessibilityLabel="الإشعارات">
            <Ionicons name="notifications-outline" size={22} color={activeTab === "notifications" ? colors.primary : colors.mutedForeground} />
            {unreadCount > 0 && (
              <View style={[styles.headerBadge, { backgroundColor: "#EF4444" }]}>
                <Text style={styles.headerBadgeText}>{unreadCount > 99 ? "99+" : unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
        <View style={styles.tabs}>
          <AdminTab label="الطلبات" icon="document-text-outline" active={activeTab === "requests"} onPress={() => setActiveTab("requests")} colors={colors} />
          <AdminTab label="الأرشيف" icon="archive-outline" active={activeTab === "archive"} onPress={() => setActiveTab("archive")} colors={colors} count={archiveCount} />
          <AdminTab label="المستخدمون" icon="people-outline" onPress={() => router.push("/(admin)/users")} colors={colors} />
          <AdminTab label="الإحصائيات" icon="stats-chart-outline" onPress={() => router.push("/(admin)/statistics")} colors={colors} />
        </View>
      </SafeAreaView>

      {activeTab === "requests" && (
        <FlatList
          data={activeItems}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderActiveRequest}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 34 }]}
          refreshControl={<RefreshControl refreshing={listRefreshing} onRefresh={() => void activeQuery.refetch()} tintColor={colors.primary} />}
          ListHeaderComponent={
            <View>
              <View style={styles.listHeading}>
                <View>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>الطلبات ({activeQuery.data?.activeCount ?? 0})</Text>
                  <Text style={[styles.sectionHint, { color: colors.mutedForeground }]}>الطلبات المتاحة أو الجارية فقط</Text>
                </View>
                <View style={[styles.countPill, { backgroundColor: colors.secondary }]}>
                  <Ionicons name="flash-outline" size={16} color={colors.primary} />
                  <Text style={[styles.countPillText, { color: colors.primary }]}>{activeQuery.data?.activeCount ?? 0}</Text>
                </View>
              </View>
              <SearchBox value={activeSearch} onChange={(value) => { setActiveSearch(value); setActivePage(1); }} colors={colors} />
              <CategoryFilter value={activeCategory} onChange={(value) => { setActiveCategory(value); setActivePage(1); }} colors={colors} />
              <AdminAreaFilter areas={AREAS} selectedAreas={activeAreas} onChange={setAreaFilter} />
            </View>
          }
          ListEmptyComponent={listLoading ? <ActivityIndicator color={colors.primary} style={styles.loadingInline} /> : <EmptyState text="لا توجد طلبات نشطة" icon="document-text-outline" colors={colors} />}
          ListFooterComponent={<Pagination page={activePage} hasNext={activeItems.length >= PAGE_SIZE} onPrevious={() => setActivePage((page) => Math.max(1, page - 1))} onNext={() => setActivePage((page) => page + 1)} colors={colors} />}
        />
      )}

      {activeTab === "archive" && (
        <FlatList
          data={archiveResult === "deleted" ? deletedItems : archiveItems}
          keyExtractor={(item) => String(item.id)}
          renderItem={archiveResult === "deleted" ? renderDeletedRequest : renderArchiveRequest}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 34 }]}
          refreshControl={<RefreshControl refreshing={listRefreshing} onRefresh={() => void (archiveResult === "deleted" ? deletedQuery.refetch() : archiveQuery.refetch())} tintColor={colors.primary} />}
          ListHeaderComponent={
            <View>
              <View style={styles.listHeading}>
                <View>
                  <Text style={[styles.sectionTitle, { color: colors.foreground }]}>الأرشيف ({archiveResult === "deleted" ? deletedItems.length : archiveCount})</Text>
                  <Text style={[styles.sectionHint, { color: colors.mutedForeground }]}>الطلبات المكتملة فقط</Text>
                </View>
                <View style={[styles.countPill, { backgroundColor: "#ECFDF5" }]}>
                  <Ionicons name="checkmark-done-outline" size={16} color="#059669" />
                  <Text style={[styles.countPillText, { color: "#059669" }]}>{archiveCount}</Text>
                </View>
              </View>
              <View style={styles.archiveTabs}>
                <ArchiveTab label={`تمت المساعدة (${helpedCount})`} active={archiveResult === "helped"} onPress={() => { setArchiveResult("helped"); setArchivePage(1); }} colors={colors} tone="success" />
                <ArchiveTab label={`لم تتم المساعدة (${notHelpedCount})`} active={archiveResult === "not_helped"} onPress={() => { setArchiveResult("not_helped"); setArchivePage(1); }} colors={colors} tone="danger" />
              </View>
              <TouchableOpacity style={styles.deletedLink} onPress={() => setArchiveResult("deleted")}>
                <Ionicons name="trash-outline" size={14} color={colors.mutedForeground} />
                <Text style={[styles.deletedLinkText, { color: colors.mutedForeground }]}>المحذوفات منفصلة عن الأرشيف</Text>
              </TouchableOpacity>
              <SearchBox value={archiveSearch} onChange={(value) => { setArchiveSearch(value); setArchivePage(1); }} colors={colors} />
              <CategoryFilter value={archiveCategory} onChange={(value) => { setArchiveCategory(value); setArchivePage(1); }} colors={colors} />
              <PeriodFilter value={archivePeriod} onChange={(value) => { setArchivePeriod(value); setArchivePage(1); }} colors={colors} />
              <AdminAreaFilter areas={AREAS} selectedAreas={archiveAreas} onChange={setArchiveAreaFilter} />
            </View>
          }
          ListEmptyComponent={listLoading ? <ActivityIndicator color={colors.primary} style={styles.loadingInline} /> : <EmptyState text={archiveResult === "deleted" ? "لا توجد طلبات محذوفة" : archiveResult === "not_helped" ? "لا توجد طلبات لم تتم مساعدتها" : "لا توجد طلبات تمت مساعدتها"} icon="archive-outline" colors={colors} />}
          ListFooterComponent={archiveResult === "deleted" ? null : <Pagination page={archivePage} hasNext={archiveItems.length >= PAGE_SIZE} onPrevious={() => setArchivePage((page) => Math.max(1, page - 1))} onNext={() => setArchivePage((page) => page + 1)} colors={colors} />}
        />
      )}

      {activeTab === "notifications" && (
        <FlatList
          data={notificationItems}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderNotification}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 34 }]}
          refreshControl={<RefreshControl refreshing={listRefreshing} onRefresh={() => void refetchNotifications()} tintColor={colors.primary} />}
          ListHeaderComponent={unreadCount > 0 ? <Text style={[styles.notificationHeader, { color: colors.primary }]}>{unreadCount} إشعار غير مقروء</Text> : null}
          ListEmptyComponent={<EmptyState text="لا توجد إشعارات" icon="notifications-off-outline" colors={colors} />}
        />
      )}
    </View>
  );
}

function useNotifications() {
  return useQuery<AdminNotification[]>({
    queryKey: ["admin-notifications"],
    queryFn: async () => {
      const response = await fetch(`${BASE}/api/admin/notifications`, { credentials: "include", headers: await getAuthHeaders() });
      const data = await readResponse<unknown>(response, "تعذر تحميل الإشعارات");
      if (!Array.isArray(data)) throw new Error("استجابة الإشعارات غير صالحة");
      return data as AdminNotification[];
    },
    refetchInterval: 30_000,
  });
}

function catLabel(value: string) {
  return CATEGORIES.find((category) => category.value === value)?.label ?? value;
}

function periodStart(period: "7d" | "30d" | "month"): Date {
  const start = new Date();
  if (period === "7d") start.setDate(start.getDate() - 7);
  else if (period === "30d") start.setDate(start.getDate() - 30);
  else {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  }
  return start;
}

function CategoryFilter({
  value,
  onChange,
  colors,
}: {
  value: string;
  onChange: (value: string) => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.filterWrapper}>
      <Text style={[styles.filterLabel, { color: colors.foreground }]}>نوع الخدمة</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        <TouchableOpacity
          style={[styles.filterChip, { backgroundColor: colors.muted, borderColor: colors.border }, !value && { backgroundColor: colors.primary, borderColor: colors.primary }]}
          onPress={() => onChange("")}
        >
          <Text style={[styles.filterChipText, { color: value ? colors.mutedForeground : colors.primaryForeground }]}>كل الخدمات</Text>
        </TouchableOpacity>
        {CATEGORIES.map((category) => (
          <TouchableOpacity
            key={category.value}
            style={[styles.filterChip, { backgroundColor: colors.muted, borderColor: colors.border }, value === category.value && { backgroundColor: colors.secondary, borderColor: colors.primary }]}
            onPress={() => onChange(category.value)}
          >
            <Text style={[styles.filterChipText, { color: value === category.value ? colors.primary : colors.mutedForeground }]}>{category.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

function PeriodFilter({
  value,
  onChange,
  colors,
}: {
  value: "all" | "7d" | "30d" | "month";
  onChange: (value: "all" | "7d" | "30d" | "month") => void;
  colors: ReturnType<typeof useColors>;
}) {
  const options: Array<["all" | "7d" | "30d" | "month", string]> = [
    ["all", "كل الوقت"],
    ["7d", "7 أيام"],
    ["30d", "30 يوماً"],
    ["month", "هذا الشهر"],
  ];
  return (
    <View style={styles.filterWrapper}>
      <Text style={[styles.filterLabel, { color: colors.foreground }]}>تاريخ إنشاء الطلب</Text>
      <View style={styles.filterRow}>
        {options.map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[styles.filterChip, { backgroundColor: colors.muted, borderColor: colors.border }, value === key && { backgroundColor: colors.secondary, borderColor: colors.primary }]}
            onPress={() => onChange(key)}
          >
            <Text style={[styles.filterChipText, { color: value === key ? colors.primary : colors.mutedForeground }]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function AdminTab({
  label,
  icon,
  active = false,
  count,
  onPress,
  colors,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active?: boolean;
  count?: number;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <TouchableOpacity style={[styles.tab, active && { borderBottomColor: colors.primary }]} onPress={() => { Haptics.selectionAsync(); onPress(); }}>
      <Ionicons name={icon} size={16} color={active ? colors.primary : colors.mutedForeground} />
      <Text style={[styles.tabText, { color: active ? colors.primary : colors.mutedForeground }]}>{label}</Text>
      {count !== undefined && count > 0 && <Text style={[styles.tabCount, { color: colors.primary }]}>{count}</Text>}
    </TouchableOpacity>
  );
}

function ArchiveTab({
  label,
  active,
  tone,
  onPress,
  colors,
}: {
  label: string;
  active: boolean;
  tone: "success" | "danger";
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const color = tone === "success" ? "#059669" : "#DC2626";
  return (
    <TouchableOpacity
      style={[styles.archiveTab, { borderColor: colors.border, backgroundColor: colors.muted }, active && { backgroundColor: `${color}16`, borderColor: color }]}
      onPress={onPress}
    >
      <Text style={[styles.archiveTabText, { color: active ? color : colors.mutedForeground }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function SearchBox({ value, onChange, colors }: { value: string; onChange: (value: string) => void; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.searchBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Ionicons name="search-outline" size={18} color={colors.mutedForeground} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="ابحث باسم العميل أو تفاصيل الطلب"
        placeholderTextColor={colors.mutedForeground}
        style={[styles.searchInput, { color: colors.foreground }]}
        textAlign="right"
      />
    </View>
  );
}

function Pagination({
  page,
  hasNext,
  onPrevious,
  onNext,
  colors,
}: {
  page: number;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.pagination}>
      <TouchableOpacity style={[styles.pageButton, { borderColor: colors.border }, page === 1 && styles.disabledButton]} disabled={page === 1} onPress={onPrevious}>
        <Ionicons name="chevron-forward" size={16} color={page === 1 ? colors.border : colors.foreground} />
        <Text style={[styles.pageButtonText, { color: page === 1 ? colors.border : colors.foreground }]}>السابق</Text>
      </TouchableOpacity>
      <Text style={[styles.pageText, { color: colors.mutedForeground }]}>صفحة {page}</Text>
      <TouchableOpacity style={[styles.pageButton, { borderColor: colors.border }, !hasNext && styles.disabledButton]} disabled={!hasNext} onPress={onNext}>
        <Text style={[styles.pageButtonText, { color: !hasNext ? colors.border : colors.foreground }]}>التالي</Text>
        <Ionicons name="chevron-back" size={16} color={!hasNext ? colors.border : colors.foreground} />
      </TouchableOpacity>
    </View>
  );
}

function EmptyState({ text, icon, colors }: { text: string; icon: keyof typeof Ionicons.glyphMap; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={52} color={colors.border} />
      <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerSafe: { borderBottomWidth: 1 },
  header: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 12 },
  headerTitle: { fontSize: 20, fontWeight: "800" },
  headerAction: { padding: 5, minWidth: 32, position: "relative" },
  headerBadge: { position: "absolute", top: -4, end: -3, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  headerBadgeText: { color: "#FFFFFF", fontSize: 10, fontWeight: "800" },
  tabs: { flexDirection: "row-reverse", borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#E5E7EB" },
  tab: { flex: 1, minHeight: 48, paddingHorizontal: 3, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 4, borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabText: { fontSize: 11, fontWeight: "700" },
  tabCount: { fontSize: 10, fontWeight: "800" },
  listContent: { padding: 15 },
  listHeading: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  sectionTitle: { fontSize: 19, fontWeight: "800", textAlign: "right" },
  sectionHint: { fontSize: 11, textAlign: "right", marginTop: 3 },
  countPill: { minWidth: 52, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 8, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 5 },
  countPillText: { fontSize: 16, fontWeight: "800" },
  searchBox: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 13 },
  searchInput: { flex: 1, fontSize: 13, paddingVertical: 9 },
  filterWrapper: { gap: 7, marginBottom: 12 },
  filterLabel: { fontSize: 12, fontWeight: "800", textAlign: "right" },
  filterRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 7 },
  filterChip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 7 },
  filterChipText: { fontSize: 11, fontWeight: "700" },
  card: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 10 },
  cardTop: { flexDirection: "row-reverse", alignItems: "flex-start", justifyContent: "space-between", gap: 10 },
  cardTitleCopy: { flex: 1, alignItems: "flex-end" },
  category: { fontSize: 15, fontWeight: "800", textAlign: "right" },
  details: { fontSize: 13, lineHeight: 20, textAlign: "right", marginTop: 4 },
  status: { borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: "800" },
  resultBadge: { flexDirection: "row-reverse", alignItems: "center", gap: 4, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 5 },
  amountRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginTop: 12 },
  amount: { fontSize: 15, fontWeight: "800" },
  metaItem: { flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  metaRow: { flexDirection: "row-reverse", justifyContent: "space-between", gap: 10, marginTop: 8 },
  meta: { fontSize: 12, textAlign: "right" },
  actionRow: { flexDirection: "row-reverse", gap: 8, marginTop: 12 },
  actionButton: { flex: 1, minHeight: 36, borderWidth: 1, borderRadius: 9, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 5 },
  actionText: { fontSize: 12, fontWeight: "800" },
  deleteButton: { minHeight: 36, borderRadius: 9, paddingHorizontal: 11, flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 5 },
  deleteText: { color: "#DC2626", fontSize: 12, fontWeight: "700" },
  archiveMeta: { flexDirection: "row-reverse", justifyContent: "space-between", gap: 8, marginTop: 12 },
  archiveMetaText: { fontSize: 12, fontWeight: "600", textAlign: "right", flexShrink: 1 },
  completedText: { fontSize: 11, textAlign: "right", marginTop: 8 },
  helperRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6, marginTop: 10 },
  archiveTabs: { flexDirection: "row-reverse", gap: 8, marginBottom: 8 },
  archiveTab: { flex: 1, minHeight: 42, borderWidth: 1, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  archiveTabText: { fontSize: 11, fontWeight: "800", textAlign: "center" },
  deletedLink: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "flex-start", gap: 5, marginBottom: 13, paddingVertical: 3 },
  deletedLinkText: { fontSize: 11, textDecorationLine: "underline" },
  notificationHeader: { fontSize: 13, fontWeight: "800", textAlign: "right", marginBottom: 10 },
  notificationCard: { borderWidth: 1, borderRadius: 14, padding: 13, marginBottom: 9, flexDirection: "row-reverse", alignItems: "flex-start", gap: 10 },
  notificationIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  notificationCopy: { flex: 1, alignItems: "flex-end" },
  notificationTitleRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  unreadDot: { width: 7, height: 7, borderRadius: 4 },
  notificationTitle: { fontSize: 14, fontWeight: "800", textAlign: "right" },
  notificationMeta: { fontSize: 12, textAlign: "right", marginTop: 4 },
  notificationTime: { fontSize: 10, textAlign: "right", marginTop: 5 },
  loadingInline: { paddingVertical: 40 },
  empty: { alignItems: "center", paddingTop: 55, gap: 10 },
  emptyText: { fontSize: 15, fontWeight: "700" },
  pagination: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, gap: 8 },
  pageButton: { minHeight: 36, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  pageButtonText: { fontSize: 12, fontWeight: "700" },
  pageText: { fontSize: 12, fontWeight: "700" },
  disabledButton: { opacity: 0.55 },
});