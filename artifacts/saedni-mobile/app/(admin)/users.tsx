import React, { useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert, TextInput, Modal, ScrollView,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { getAuthHeaders } from "@/contexts/AuthContext";
import {
  getListUsersQueryKey,
  useListServiceAreas,
  useListUserAreaCounts,
  useListUsers,
} from "@workspace/api-client-react";

const BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN ?? "saedni.onrender.com"}`;

interface User {
  id: number; name: string; phone: string; userType: string;
  isActive: boolean; isVerified: boolean; isBlocked: boolean;
  helperActivationCodeActive?: boolean | null; area?: string | null;
  serviceAreas?: string[];
}

type Filter = "all" | "customer" | "helper";
type StatusFilter = "all" | "active" | "blocked";
type ServiceArea = { name: string; isActive: boolean };
type AreaCount = { area: string; helperCount: number; customerCount: number };
type AreaCounts = {
  areas: AreaCount[];
  totalHelperCount: number;
  totalCustomerCount: number;
  noAreaHelperCount: number;
  noAreaCustomerCount: number;
};
const PAGE_SIZE = 50;

export default function AdminUsersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [includeNoArea, setIncludeNoArea] = useState(false);
  const [areaSheetVisible, setAreaSheetVisible] = useState(false);
  const [areaDraft, setAreaDraft] = useState<string[]>([]);
  const [includeNoAreaDraft, setIncludeNoAreaDraft] = useState(false);
  const [page, setPage] = useState(1);

  const { data: serviceAreas, isLoading: isLoadingAreas, isError: isAreasError } =
    useListServiceAreas();
  const activeAreas = (serviceAreas as ServiceArea[] | undefined)?.filter((area) => area.isActive) ?? [];
  const areaCountsStatus = statusFilter === "active"
    ? "active"
    : statusFilter === "blocked"
      ? "blocked"
      : "all";
  const {
    data: areaCounts,
    isLoading: isLoadingCounts,
    isFetching: isFetchingCounts,
    isError: isCountsError,
    refetch: refetchAreaCounts,
  } = useListUserAreaCounts<AreaCounts>({ status: areaCountsStatus });
  const listParams = {
    ...(filter !== "all" ? { userType: filter } : {}),
    ...(selectedAreas.length > 0 ? { area: selectedAreas } : {}),
    ...(includeNoArea ? { includeNoArea: true } : {}),
    ...(statusFilter !== "all" ? { isActive: statusFilter === "active" } : {}),
    ...(searchQuery.trim() ? { search: searchQuery.trim() } : {}),
    page,
    pageSize: PAGE_SIZE,
  };

  const {
    data,
    isLoading,
    isFetching,
    refetch,
  } = useListUsers<User[]>(listParams, {
    query: {
      queryKey: getListUsersQueryKey(listParams),
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: "verify" | "block" }) => {
      const r = await fetch(`${BASE}/api/admin/helpers/${id}/verify`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...(await getAuthHeaders()) },
        credentials: "include",
        body: JSON.stringify({ action }),
      });
      if (!r.ok) throw new Error();
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["/api/users/area-counts"] });
    },
    onError: () => Alert.alert("خطأ", "تعذر تحديث المستخدم"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${BASE}/api/admin/users/${id}/delete`, {
        method: "DELETE",
        credentials: "include",
        headers: await getAuthHeaders(),
      });
      if (!r.ok) throw new Error();
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      qc.invalidateQueries({ queryKey: ["/api/users/area-counts"] });
    },
    onError: () => Alert.alert("خطأ", "تعذر تعطيل المستخدم"),
  });

  const s = makeStyles(colors, insets.bottom);

  const FILTERS: { v: Filter; label: string }[] = [
    { v: "all", label: "الكل" },
    { v: "customer", label: "العملاء" },
    { v: "helper", label: "المساعدون" },
  ];

  const STATUS_FILTERS: { v: StatusFilter; label: string }[] = [
    { v: "all", label: "كل الحالات" },
    { v: "active", label: "مفعّل" },
    { v: "blocked", label: "معطّل" },
  ];

  const openAreaSheet = () => {
    setAreaDraft(selectedAreas);
    setIncludeNoAreaDraft(includeNoArea);
    setAreaSheetVisible(true);
  };

  const applyAreaFilter = () => {
    setSelectedAreas(areaDraft);
    setIncludeNoArea(includeNoAreaDraft);
    setPage(1);
    setAreaSheetVisible(false);
  };

  const areaSummary = selectedAreas.length === 0 && !includeNoArea
    ? "كل المناطق"
    : [
        selectedAreas.length > 0 ? `${selectedAreas.length} مناطق` : "",
        includeNoArea ? "بدون منطقة" : "",
      ].filter(Boolean).join(" + ");

  const renderAreaLabel = (item: User) => {
    if (item.userType === "helper") {
      return item.serviceAreas?.length ? item.serviceAreas.join("، ") : "بدون مناطق خدمة";
    }
    return item.area ?? "بدون منطقة محددة";
  };

  const countsByArea = new Map((areaCounts?.areas ?? []).map((item) => [item.area, item]));
  const formatCountLine = (helperCount: number, customerCount: number, total = false) =>
    `${helperCount} مساعدًا · ${customerCount} ${total ? "عميلًا" : "عملاء"}`;
  const getAreaCountLine = (areaName: string) => {
    const count = countsByArea.get(areaName);
    if (count) return formatCountLine(count.helperCount, count.customerCount);
    if (isCountsError) return "تعذر تحميل الأعداد";
    return "جارٍ تحميل الأعداد...";
  };
  const handleRefresh = () => {
    void Promise.all([refetch(), refetchAreaCounts()]);
  };

  const renderItem = ({ item }: { item: User }) => (
    <View style={s.card}>
      <View style={s.cardTop}>
        {/* Tappable info area → navigate to user detail */}
        <TouchableOpacity
          style={s.infoArea}
          onPress={() => router.push({ pathname: "/(admin)/user-detail", params: { id: item.id } })}
          activeOpacity={0.7}
        >
          <View style={[s.avatar, item.userType === "helper" && s.avatarHelper]}>
            <Text style={s.avatarTxt}>{item.name?.[0] ?? "؟"}</Text>
          </View>
          <View style={s.info}>
            <View style={s.nameRow}>
              <Text style={s.userName}>{item.name}</Text>
              <Ionicons name="chevron-back" size={14} color={colors.mutedForeground} style={s.chevron} />
            </View>
            <Text style={s.userPhone}>{item.phone}</Text>
            <Text style={s.userArea} numberOfLines={2}>{renderAreaLabel(item)}</Text>
            {item.userType === "helper" && item.helperActivationCodeActive === true && !item.isVerified && (
              <View style={s.otpChip}>
                <Ionicons name="key-outline" size={11} color={colors.mutedForeground} />
                <Text style={s.otpTxt}>رمز تفعيل نشط</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>

        {/* Action buttons (independent column, not nested inside nav TouchableOpacity) */}
        <View style={s.actions}>
          {item.userType === "helper" && (
            <TouchableOpacity
              style={[s.actionBtn, item.isBlocked ? s.actionBtnVerify : s.actionBtnBlock]}
              onPress={() => verifyMutation.mutate({ id: item.id, action: item.isBlocked ? "verify" : "block" })}
              hitSlop={4}
            >
              <Ionicons
                name={item.isBlocked ? "checkmark-circle-outline" : "ban-outline"}
                size={16}
                color={item.isBlocked ? colors.primary : "#DC2626"}
              />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={s.deleteBtn}
            onPress={() =>
              Alert.alert("تعطيل الحساب", `سيتم تعطيل ${item.name} وأرشفة طلباته. لن تُحذف البيانات نهائياً.`, [
                { text: "إلغاء", style: "cancel" },
                { text: "تعطيل", style: "destructive", onPress: () => deleteMutation.mutate(item.id) },
              ])
            }
            hitSlop={4}
          >
            <Ionicons name="trash-outline" size={16} color="#DC2626" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Tags */}
      <View style={s.tags}>
        <View style={[s.tag, item.userType === "helper" ? s.tagHelper : s.tagCustomer]}>
          <Text style={[s.tagTxt, item.userType === "helper" ? s.tagTxtHelper : s.tagTxtCustomer]}>
            {item.userType === "helper" ? "مساعد" : item.userType === "customer" ? "عميل" : "مدير"}
          </Text>
        </View>
        {item.userType === "helper" && (
          <View style={[s.tag, item.isBlocked ? s.tagBlocked : item.isVerified ? s.tagVerified : s.tagPending]}>
            <Text style={[s.tagTxt, item.isBlocked ? s.tagTxtBlocked : item.isVerified ? s.tagTxtVerified : s.tagTxtPending]}>
              {item.isBlocked ? "محظور" : item.isVerified ? "موثّق" : "قيد المراجعة"}
            </Text>
          </View>
        )}
        {!item.isActive && item.userType !== "helper" && (
          <View style={[s.tag, s.tagBlocked]}>
            <Text style={[s.tagTxt, s.tagTxtBlocked]}>معطّل</Text>
          </View>
        )}
      </View>
    </View>
  );

  return (
    <View style={s.container}>
      <SafeAreaView edges={["top"]} style={s.headerSafe}>
        <View style={s.headerInner}>
          <Text style={s.headerTitle}>المستخدمون</Text>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-forward" size={22} color={colors.foreground} />
          </TouchableOpacity>
        </View>
        <View style={s.searchRow}>
          <View style={s.searchBox}>
            <Ionicons name="search-outline" size={19} color={colors.mutedForeground} />
            <TextInput
              value={searchQuery}
              onChangeText={(value) => {
                setSearchQuery(value);
                setPage(1);
              }}
              placeholder="ابحث بالاسم أو رقم الهاتف"
              placeholderTextColor={colors.mutedForeground}
              style={s.searchInput}
              textAlign="right"
              accessibilityLabel="ابحث بالاسم أو رقم الهاتف"
            />
          </View>
        </View>
        {/* Filter tabs */}
        <View style={s.filterRow}>
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f.v}
              style={[s.filterTab, filter === f.v && s.filterTabActive]}
              onPress={() => setFilter(f.v)}
              activeOpacity={0.8}
            >
              <Text style={[s.filterTxt, filter === f.v && s.filterTxtActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={s.filterRow}>
          {STATUS_FILTERS.map(f => (
            <TouchableOpacity
              key={f.v}
              style={[s.filterTab, statusFilter === f.v && s.filterTabActive]}
              onPress={() => {
                setStatusFilter(f.v);
                setPage(1);
              }}
              activeOpacity={0.8}
              testID={`admin-users-status-${f.v}`}
            >
              <Text style={[s.filterTxt, statusFilter === f.v && s.filterTxtActive]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          style={s.areaFilterButton}
          onPress={openAreaSheet}
          activeOpacity={0.8}
          testID="admin-users-area-filter"
        >
          <View style={s.areaFilterIcon}>
            <Ionicons name="location-outline" size={18} color={colors.primary} />
          </View>
          <View style={s.areaFilterText}>
            <Text style={s.areaFilterTitle}>المنطقة</Text>
            <Text style={s.areaFilterValue} numberOfLines={1}>{areaSummary}</Text>
          </View>
          <Ionicons name="chevron-down" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
      </SafeAreaView>

      {isLoading ? (
        <View style={s.centered}><ActivityIndicator size="large" color={colors.primary} /></View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={i => String(i.id)}
          renderItem={renderItem}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isFetching || isFetchingCounts} onRefresh={handleRefresh} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="people-outline" size={56} color={colors.border} />
              <Text style={s.emptyTxt}>لا يوجد مستخدمون</Text>
            </View>
          }
        />
      )}

      <View style={s.pagination}>
        <TouchableOpacity
          style={[s.pageButton, page === 1 && s.pageButtonDisabled]}
          disabled={page === 1}
          onPress={() => setPage((current) => Math.max(1, current - 1))}
          testID="admin-users-prev-page"
        >
          <Ionicons name="chevron-forward" size={17} color={page === 1 ? colors.border : colors.foreground} />
          <Text style={s.pageButtonText}>السابق</Text>
        </TouchableOpacity>
        <Text style={s.pageText}>صفحة {page}</Text>
        <TouchableOpacity
          style={[s.pageButton, (data?.length ?? 0) < PAGE_SIZE && s.pageButtonDisabled]}
          disabled={(data?.length ?? 0) < PAGE_SIZE}
          onPress={() => setPage((current) => current + 1)}
          testID="admin-users-next-page"
        >
          <Text style={s.pageButtonText}>التالي</Text>
          <Ionicons name="chevron-back" size={17} color={(data?.length ?? 0) < PAGE_SIZE ? colors.border : colors.foreground} />
        </TouchableOpacity>
      </View>

      <Modal
        visible={areaSheetVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAreaSheetVisible(false)}
      >
        <View style={s.modalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            activeOpacity={1}
            onPress={() => setAreaSheetVisible(false)}
            accessibilityLabel="إغلاق اختيار المناطق"
          />
          <View style={[s.areaSheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={s.sheetHandle} />
            <View style={s.sheetHeader}>
              <TouchableOpacity onPress={() => setAreaSheetVisible(false)} style={s.sheetIconButton}>
                <Ionicons name="close" size={22} color={colors.foreground} />
              </TouchableOpacity>
              <Text style={s.sheetTitle}>اختيار المناطق</Text>
              <TouchableOpacity onPress={applyAreaFilter} style={s.sheetDoneButton} testID="admin-users-area-apply">
                <Text style={s.sheetDoneText}>تطبيق</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              contentContainerStyle={s.areaOptions}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {isLoadingCounts ? (
                <View style={s.countStatus}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={s.countStatusText}>جارٍ تحميل أعداد المستخدمين...</Text>
                </View>
              ) : isCountsError ? (
                <TouchableOpacity style={s.countError} onPress={() => void refetchAreaCounts()}>
                  <Ionicons name="refresh-outline" size={16} color={colors.destructive} />
                  <Text style={s.countErrorText}>تعذر تحميل الأعداد — اضغط لإعادة المحاولة</Text>
                </TouchableOpacity>
              ) : isFetchingCounts ? (
                <View style={s.countStatus}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={s.countStatusText}>يتم تحديث الأعداد...</Text>
                </View>
              ) : null}
              <TouchableOpacity
                style={[s.areaOption, areaDraft.length === 0 && !includeNoAreaDraft && s.areaOptionActive]}
                onPress={() => {
                  setAreaDraft([]);
                  setIncludeNoAreaDraft(false);
                }}
                testID="admin-users-area-all"
              >
                <Ionicons
                  name={areaDraft.length === 0 && !includeNoAreaDraft ? "checkmark-circle" : "ellipse-outline"}
                  size={21}
                  color={areaDraft.length === 0 && !includeNoAreaDraft ? colors.primary : colors.mutedForeground}
                />
                <View style={s.areaOptionLabels}>
                  <Text style={[s.areaOptionText, areaDraft.length === 0 && !includeNoAreaDraft && s.areaOptionTextActive]}>
                    جميع المناطق
                  </Text>
                  <Text style={s.areaCountText}>
                    {areaCounts
                      ? formatCountLine(areaCounts.totalHelperCount, areaCounts.totalCustomerCount, true)
                      : getAreaCountLine("")}
                  </Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.areaOption, includeNoAreaDraft && s.areaOptionActive]}
                onPress={() => setIncludeNoAreaDraft((current) => !current)}
                testID="admin-users-area-none"
              >
                <Ionicons
                  name={includeNoAreaDraft ? "checkmark-circle" : "ellipse-outline"}
                  size={21}
                  color={includeNoAreaDraft ? colors.primary : colors.mutedForeground}
                />
                <View style={s.areaOptionLabels}>
                  <Text style={[s.areaOptionText, includeNoAreaDraft && s.areaOptionTextActive]}>
                    بدون منطقة محددة
                  </Text>
                  <Text style={s.areaCountText}>
                    {areaCounts
                      ? formatCountLine(areaCounts.noAreaHelperCount, areaCounts.noAreaCustomerCount, true)
                      : getAreaCountLine("")}
                  </Text>
                </View>
              </TouchableOpacity>
              {isLoadingAreas ? (
                <ActivityIndicator color={colors.primary} style={s.areaLoading} />
              ) : isAreasError ? (
                <Text style={s.areaError}>تعذر تحميل المناطق</Text>
              ) : (
                activeAreas.map((area) => {
                  const selected = areaDraft.includes(area.name);
                  return (
                    <TouchableOpacity
                      key={area.name}
                      style={[s.areaOption, selected && s.areaOptionActive]}
                      onPress={() => setAreaDraft((current) =>
                        selected
                          ? current.filter((item) => item !== area.name)
                          : [...current, area.name]
                      )}
                      testID={`admin-users-area-${area.name}`}
                    >
                      <Ionicons
                        name={selected ? "checkmark-circle" : "ellipse-outline"}
                        size={21}
                        color={selected ? colors.primary : colors.mutedForeground}
                      />
                      <View style={s.areaOptionLabels}>
                        <Text style={[s.areaOptionText, selected && s.areaOptionTextActive]}>{area.name}</Text>
                        <Text style={s.areaCountText}>{getAreaCountLine(area.name)}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
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
    backBtn: { padding: 4 },
    searchRow: { paddingHorizontal: 16, paddingBottom: 4 },
    searchBox: {
      minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: c.border,
      backgroundColor: c.background, flexDirection: "row-reverse",
      alignItems: "center", paddingHorizontal: 12, gap: 8,
    },
    searchInput: {
      flex: 1, minHeight: 42, color: c.foreground, fontSize: 14,
      textAlign: "right", writingDirection: "rtl",
    },
    filterRow: {
      flexDirection: "row-reverse", paddingHorizontal: 16, paddingVertical: 10, gap: 8,
    },
    filterTab: {
      flex: 1, paddingVertical: 8, borderRadius: 10, alignItems: "center",
      backgroundColor: c.muted,
    },
    filterTabActive: { backgroundColor: c.primary },
    filterTxt: { fontSize: 13, color: c.mutedForeground, fontWeight: "600" },
    filterTxtActive: { color: c.primaryForeground, fontWeight: "700" },
    areaFilterButton: {
      marginHorizontal: 16, marginBottom: 10, minHeight: 52, borderRadius: 12,
      borderWidth: 1, borderColor: c.border, backgroundColor: c.background,
      flexDirection: "row-reverse", alignItems: "center", paddingHorizontal: 12, gap: 10,
    },
    areaFilterIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: c.secondary, alignItems: "center", justifyContent: "center" },
    areaFilterText: { flex: 1, alignItems: "flex-end" },
    areaFilterTitle: { fontSize: 11, color: c.mutedForeground, fontWeight: "600" },
    areaFilterValue: { fontSize: 14, color: c.foreground, fontWeight: "700", marginTop: 1 },
    listContent: { padding: 16, paddingBottom: bottomInset + 84 },
    card: {
      backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border,
      padding: 14, marginBottom: 10,
      shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    },
    cardTop: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 12, marginBottom: 10 },
    infoArea: { flex: 1, flexDirection: "row-reverse", alignItems: "flex-start", gap: 12 },
    avatar: {
      width: 46, height: 46, borderRadius: 23, backgroundColor: c.muted,
      alignItems: "center", justifyContent: "center", flexShrink: 0,
    },
    avatarHelper: { backgroundColor: c.primary },
    avatarTxt: { fontSize: 19, fontWeight: "800", color: c.primaryForeground },
    info: { flex: 1 },
    nameRow: { flexDirection: "row-reverse", alignItems: "center", gap: 4 },
    userName: { fontSize: 15, fontWeight: "700", color: c.foreground, textAlign: "right" },
    chevron: { marginTop: 1 },
    userPhone: { fontSize: 13, color: c.mutedForeground, textAlign: "right", marginTop: 2 },
    userArea: { fontSize: 12, color: c.primary, textAlign: "right", marginTop: 5, lineHeight: 17 },
    otpChip: {
      flexDirection: "row-reverse", alignItems: "center", gap: 4,
      marginTop: 6, backgroundColor: c.muted, borderRadius: 6,
      paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-end",
    },
    otpTxt: { fontSize: 11, color: c.mutedForeground, fontWeight: "600" },
    actions: { flexDirection: "column", gap: 6 },
    actionBtn: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
    actionBtnVerify: { backgroundColor: c.secondary },
    actionBtnBlock: { backgroundColor: "#FEF2F2" },
    deleteBtn: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: "#FEF2F2" },
    tags: { flexDirection: "row-reverse", gap: 8, flexWrap: "wrap" },
    tag: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
    tagCustomer: { backgroundColor: "#EFF6FF" },
    tagHelper: { backgroundColor: c.secondary },
    tagVerified: { backgroundColor: c.secondary },
    tagPending: { backgroundColor: "#FEF3C7" },
    tagBlocked: { backgroundColor: "#FEE2E2" },
    tagTxt: { fontSize: 11, fontWeight: "700" },
    tagTxtCustomer: { color: "#1D4ED8" },
    tagTxtHelper: { color: c.primary },
    tagTxtVerified: { color: c.primary },
    tagTxtPending: { color: "#92400E" },
    tagTxtBlocked: { color: "#DC2626" },
    empty: { alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 10 },
    emptyTxt: { fontSize: 16, color: c.mutedForeground },
    pagination: {
      flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: 16, paddingTop: 8, paddingBottom: bottomInset + 10, backgroundColor: c.background,
    },
    pageButton: {
      minHeight: 38, borderRadius: 10, borderWidth: 1, borderColor: c.border,
      flexDirection: "row-reverse", alignItems: "center", gap: 4, paddingHorizontal: 10,
    },
    pageButtonDisabled: { opacity: 0.45 },
    pageButtonText: { fontSize: 13, color: c.foreground, fontWeight: "600" },
    pageText: { fontSize: 13, color: c.mutedForeground, fontWeight: "600" },
    modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15, 23, 41, 0.35)" },
    areaSheet: {
      maxHeight: "86%", backgroundColor: c.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
      paddingTop: 10,
    },
    sheetHandle: { alignSelf: "center", width: 42, height: 4, borderRadius: 2, backgroundColor: c.border, marginBottom: 6 },
    sheetHeader: {
      minHeight: 52, paddingHorizontal: 16, flexDirection: "row-reverse",
      alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: c.border,
    },
    sheetIconButton: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
    sheetTitle: { flex: 1, textAlign: "center", fontSize: 17, color: c.foreground, fontWeight: "800" },
    sheetDoneButton: { minWidth: 52, alignItems: "flex-end", paddingVertical: 8 },
    sheetDoneText: { fontSize: 14, color: c.primary, fontWeight: "800" },
    areaOptions: { padding: 16, paddingBottom: 8 },
    areaOption: {
      minHeight: 48, borderRadius: 12, flexDirection: "row-reverse", alignItems: "center",
      gap: 10, paddingHorizontal: 12, marginBottom: 6,
    },
    areaOptionActive: { backgroundColor: c.secondary },
    areaOptionLabels: { flex: 1, alignItems: "flex-end", gap: 2 },
    areaOptionText: { textAlign: "right", fontSize: 15, color: c.foreground, fontWeight: "600" },
    areaOptionTextActive: { color: c.primary, fontWeight: "800" },
    areaCountText: { textAlign: "right", fontSize: 12, color: c.mutedForeground, fontWeight: "500" },
    areaLoading: { marginVertical: 24 },
    areaError: { textAlign: "center", color: c.destructive, fontSize: 14, paddingVertical: 24 },
    countStatus: {
      minHeight: 36, borderRadius: 10, backgroundColor: c.muted,
      flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8,
      marginBottom: 8, paddingHorizontal: 10,
    },
    countStatusText: { color: c.mutedForeground, fontSize: 12, fontWeight: "600" },
    countError: {
      minHeight: 36, borderRadius: 10, backgroundColor: "#FEF2F2",
      flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6,
      marginBottom: 8, paddingHorizontal: 10,
    },
    countErrorText: { color: c.destructive, fontSize: 12, fontWeight: "600", textAlign: "center" },
  });
