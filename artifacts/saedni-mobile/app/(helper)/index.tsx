import React, { useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Linking, ScrollView, Alert,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { getAuthHeaders, useAuth } from "@/contexts/AuthContext";
import { CATEGORIES, AREAS } from "@/constants/categories";
import { useHelperPushRegistration } from "@/hooks/usePushNotifications";
import { requestQueryKeys } from "@/lib/request-query-keys";

const BASE = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";

interface HelpRequest {
  id: number;
  category: string;
  details: string;
  area: string;
  timeType: string;
  scheduledDateTime?: string | null;
  offeredAmount: number;
  status: string;
  createdAt: string;
  customerName?: string | null;
  customerPhone?: string | null;
}

// DD/MM/YYYY - h:mm صباحاً/مساءً  (null-safe, returns "غير متوفر" if missing)
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

// DD/MM/YYYY - h:mm صباحاً/مساءً
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

const CAT_FILTERS = [
  { value: "all", label: "الكل" },
  ...CATEGORIES.map(c => ({ value: c.value, label: c.label })),
];

const AREA_FILTERS = [
  { value: "all", label: "الكل" },
  ...AREAS.map(a => ({ value: a, label: a })),
];

function openWhatsApp(phone: string) {
  Linking.openURL(
    `https://wa.me/${phone}?text=${encodeURIComponent("مرحباً، رأيت طلبك في تطبيق ساعدني وأنا مستعد للمساعدة")}`
  );
}

function openCall(phone: string) {
  Linking.openURL(`tel:${phone}`);
}

export default function HelperRequestsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, activeRole } = useAuth();
  const isBlocked = user?.isBlocked || user?.isActive === false;

  // Register for push notifications once when the helper is active
  useHelperPushRegistration(!isBlocked);

  const [catFilter, setCatFilter] = useState("all");
  const [areaFilter, setAreaFilter] = useState("all");
  const [contactingId, setContactingId] = useState<number | null>(null);
  const roleKey = activeRole ?? user?.userType ?? "helper";

  async function contactAndOpen(item: HelpRequest, method: "phone" | "whatsapp") {
    if (!item.customerPhone) {
      Alert.alert("تعذر التواصل", "رقم العميل غير متوفر لهذا الطلب");
      return;
    }
    setContactingId(item.id);
    try {
      const response = await fetch(`${BASE}/api/requests/${item.id}/contact`, {
        method: "POST",
        credentials: "include",
        headers: { ...(await getAuthHeaders()), "Content-Type": "application/json" },
        body: JSON.stringify({ contactMethod: method }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(typeof body?.error === "string" ? body.error : "تعذر تسجيل التواصل");
      }
      if (method === "whatsapp") openWhatsApp(item.customerPhone);
      else openCall(item.customerPhone);
    } catch (error) {
      Alert.alert("تعذر التواصل", error instanceof Error ? error.message : "حاول مرة أخرى");
    } finally {
      setContactingId(null);
    }
  }

  const { data: allData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: requestQueryKeys.helperAvailable(user?.id ?? 0, roleKey, areaFilter, catFilter),
    queryFn: async () => {
      const query = new URLSearchParams({ status: "available" });
      if (catFilter !== "all") query.set("category", catFilter);
      if (areaFilter !== "all") query.set("area", areaFilter);
      const r = await fetch(`${BASE}/api/requests?${query.toString()}`, {
        credentials: "include",
        headers: await getAuthHeaders(),
      });
      if (!r.ok) throw new Error("تعذر تحميل الطلبات");
      return r.json() as Promise<HelpRequest[]>;
    },
    enabled: !!user && !isBlocked && roleKey === "helper",
  });

  useFocusEffect(
    React.useCallback(() => {
      if (user && !isBlocked) void refetch();
    }, [isBlocked, refetch, user]),
  );

  const data = allData ?? [];

  const catLabel = (v: string) => CATEGORIES.find(c => c.value === v)?.label ?? v;
  const s = makeStyles(colors, insets.bottom);

  // ── Blocked state ──
  if (isBlocked) {
    return (
      <View style={s.container}>
        <SafeAreaView edges={["top"]} style={s.headerSafe}>
          <View style={s.headerInner}>
            <Text style={s.headerTitle}>الطلبات</Text>
          </View>
        </SafeAreaView>
        <View style={s.blockedWrap}>
          <View style={s.blockedIcon}>
            <Ionicons name="shield-outline" size={40} color="#DC2626" />
          </View>
          <Text style={s.blockedTitle}>الحساب معطّل</Text>
          <Text style={s.blockedMsg}>تم تعطيل حسابك، يرجى التواصل مع الإدارة</Text>
        </View>
      </View>
    );
  }

  const renderItem = ({ item }: { item: HelpRequest }) => (
    <View style={s.card}>
      {/* Top: category + amount */}
      <View style={s.cardTop}>
        <Text style={s.amount}>
          {item.offeredAmount}{" "}
          <Text style={s.amountCur}>ر.ع.</Text>
        </Text>
        <View style={s.catBadge}>
          <Text style={s.catTxt}>{catLabel(item.category)}</Text>
        </View>
      </View>

      {/* Details */}
      <Text style={s.details} numberOfLines={3}>{item.details}</Text>

      {/* Meta chips: location + time */}
      <View style={s.metaRow}>
        <View style={s.metaChip}>
          <Ionicons name="location-outline" size={13} color={colors.mutedForeground} />
          <Text style={s.metaTxt}>{item.area}</Text>
        </View>
        <View style={s.metaChip}>
          <Ionicons
            name={item.timeType === "now" ? "flash" : "calendar-outline"}
            size={13}
            color={colors.mutedForeground}
          />
          <Text style={s.metaTxt}>
            {item.timeType === "now"
              ? "الآن"
              : item.scheduledDateTime
                ? fmtScheduled(item.scheduledDateTime)
                : "لاحقاً"}
          </Text>
        </View>
      </View>

      {/* Publish date */}
      <View style={s.publishRow}>
        <Ionicons name="time-outline" size={13} color={colors.mutedForeground} />
        <Text style={s.publishTxt}>
          {"تاريخ نشر الطلب: "}
          <Text style={s.publishVal}>{fmtCreatedAt(item.createdAt)}</Text>
        </Text>
      </View>

      {/* Customer info */}
      {(item.customerName || item.customerPhone) && (
        <View style={s.customerRow}>
          <Ionicons name="person-circle-outline" size={16} color={colors.mutedForeground} />
          <View style={s.customerInfo}>
            {item.customerName ? (
              <Text style={s.customerName}>{item.customerName}</Text>
            ) : null}
            {item.customerPhone ? (
              <Text style={s.customerPhone}>{item.customerPhone}</Text>
            ) : null}
          </View>
        </View>
      )}

      {/* Actions: WhatsApp + Call */}
      <View style={s.actions}>
        <TouchableOpacity
          style={[s.waBtn, !item.customerPhone && s.btnDisabled]}
          onPress={() => contactAndOpen(item, "whatsapp")}
          activeOpacity={0.85}
          disabled={!item.customerPhone || contactingId === item.id}
        >
          <Ionicons name="logo-whatsapp" size={18} color="#fff" />
          <Text style={s.waBtnTxt}>مراسلة</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.callBtn, !item.customerPhone && s.btnDisabled]}
          onPress={() => contactAndOpen(item, "phone")}
          activeOpacity={0.85}
          disabled={!item.customerPhone || contactingId === item.id}
        >
          <Ionicons name="call-outline" size={18} color={colors.primary} />
          <Text style={s.callBtnTxt}>اتصال</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={s.container}>
      {/* Header */}
      <SafeAreaView edges={["top"]} style={s.headerSafe}>
        <View style={s.headerInner}>
          <Text style={s.headerTitle}>الطلبات</Text>
          {!isLoading && (
            <View style={s.countBadge}>
              <Text style={s.countTxt}>{data.length}</Text>
            </View>
          )}
        </View>
      </SafeAreaView>

      {/* ── Filter: نوع المهمة ── */}
      <View style={s.filterSection}>
        <Text style={s.filterLabel}>نوع المهمة</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipsRow}
        >
          {CAT_FILTERS.map(f => (
            <TouchableOpacity
              key={f.value}
              style={[s.chip, catFilter === f.value && s.chipActive]}
              onPress={() => setCatFilter(f.value)}
              activeOpacity={0.8}
            >
              <Text style={[s.chipTxt, catFilter === f.value && s.chipTxtActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ── Filter: الموقع ── */}
      <View style={[s.filterSection, s.filterSectionBorder]}>
        <Text style={s.filterLabel}>الموقع</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.chipsRow}
        >
          {AREA_FILTERS.map(f => (
            <TouchableOpacity
              key={f.value}
              style={[s.chip, areaFilter === f.value && s.chipActive]}
              onPress={() => setAreaFilter(f.value)}
              activeOpacity={0.8}
            >
              <Text style={[s.chipTxt, areaFilter === f.value && s.chipTxtActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* ── List ── */}
      {isLoading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={i => String(i.id)}
          renderItem={renderItem}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="search-outline" size={56} color={colors.border} />
              <Text style={s.emptyTitle}>لا توجد طلبات</Text>
              <Text style={s.emptyHint}>
                {catFilter !== "all" || areaFilter !== "all"
                  ? "لا توجد طلبات تطابق الفلتر المحدد"
                  : "ارجع لاحقاً للاطلاع على الطلبات الجديدة"}
              </Text>
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

    // Header
    headerSafe: { backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.border },
    headerInner: {
      paddingHorizontal: 20, paddingVertical: 14,
      flexDirection: "row-reverse", alignItems: "center", gap: 10,
    },
    headerTitle: { fontSize: 22, fontWeight: "800", color: c.foreground },
    countBadge: {
      backgroundColor: c.secondary, borderRadius: 10,
      paddingHorizontal: 8, paddingVertical: 2,
    },
    countTxt: { fontSize: 12, fontWeight: "700", color: c.primary },

    // Blocked
    blockedWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 14 },
    blockedIcon: {
      width: 80, height: 80, borderRadius: 40,
      backgroundColor: "#FEE2E2", alignItems: "center", justifyContent: "center",
    },
    blockedTitle: { fontSize: 20, fontWeight: "800", color: c.foreground, textAlign: "center" },
    blockedMsg: {
      fontSize: 15, color: c.mutedForeground, textAlign: "center", lineHeight: 24,
    },

    // Filters
    filterSection: {
      backgroundColor: c.card, paddingTop: 10, paddingBottom: 10,
    },
    filterSectionBorder: {
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    filterLabel: {
      fontSize: 12, fontWeight: "700", color: c.mutedForeground,
      textAlign: "right", paddingHorizontal: 16, marginBottom: 6,
    },
    chipsRow: {
      paddingHorizontal: 16, flexDirection: "row-reverse", gap: 8,
    },
    chip: {
      borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
      borderWidth: 1.5, borderColor: c.border, backgroundColor: c.background,
    },
    chipActive: { backgroundColor: c.primary, borderColor: c.primary },
    chipTxt: { fontSize: 13, color: c.mutedForeground, fontWeight: "600" },
    chipTxtActive: { color: c.primaryForeground, fontWeight: "700" },

    // List
    centered: { flex: 1, alignItems: "center", justifyContent: "center" },
    listContent: { padding: 16, paddingBottom: bottomInset + 96 },

    // Card
    card: {
      backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border,
      padding: 16, marginBottom: 12,
      shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    },
    cardTop: {
      flexDirection: "row-reverse", alignItems: "flex-start",
      justifyContent: "space-between", marginBottom: 10,
    },
    catBadge: {
      backgroundColor: c.secondary, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4,
      flexShrink: 1, maxWidth: "60%",
    },
    catTxt: { fontSize: 13, fontWeight: "700", color: c.primary, textAlign: "right" },
    amount: { fontSize: 22, fontWeight: "800", color: c.primary },
    amountCur: { fontSize: 14, fontWeight: "600" },

    details: {
      fontSize: 14, color: c.mutedForeground, textAlign: "right",
      lineHeight: 21, marginBottom: 12,
    },

    publishRow: { flexDirection: "row-reverse", alignItems: "center", gap: 5, marginBottom: 10 },
    publishTxt: { fontSize: 11, color: c.mutedForeground, textAlign: "right" },
    publishVal: { fontSize: 11, color: c.foreground, fontWeight: "600" },
    metaRow: { flexDirection: "row-reverse", gap: 8, marginBottom: 12, flexWrap: "wrap" },
    metaChip: {
      flexDirection: "row-reverse", alignItems: "center", gap: 4,
      backgroundColor: c.muted, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
    },
    metaTxt: { fontSize: 12, color: c.mutedForeground, fontWeight: "500" },

    // Customer
    customerRow: {
      flexDirection: "row-reverse", alignItems: "center", gap: 8,
      backgroundColor: c.muted, borderRadius: 10,
      paddingHorizontal: 12, paddingVertical: 10, marginBottom: 12,
    },
    customerInfo: { flex: 1, alignItems: "flex-end", gap: 2 },
    customerName: { fontSize: 14, fontWeight: "700", color: c.foreground, textAlign: "right" },
    customerPhone: { fontSize: 13, color: c.mutedForeground, fontWeight: "500" },

    // Actions
    actions: { flexDirection: "row-reverse", gap: 10 },
    waBtn: {
      flex: 1, backgroundColor: "#25D366", borderRadius: 10, paddingVertical: 11,
      flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6,
    },
    waBtnTxt: { color: "#fff", fontSize: 14, fontWeight: "700" },
    callBtn: {
      flex: 1, backgroundColor: c.secondary, borderRadius: 10, paddingVertical: 11,
      flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6,
      borderWidth: 1.5, borderColor: c.border,
    },
    callBtnTxt: { color: c.primary, fontSize: 14, fontWeight: "700" },
    btnDisabled: { opacity: 0.4 },

    // Empty
    empty: { alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 10 },
    emptyTitle: { fontSize: 18, fontWeight: "700", color: c.foreground },
    emptyHint: { fontSize: 14, color: c.mutedForeground, textAlign: "center", lineHeight: 22 },
  });
