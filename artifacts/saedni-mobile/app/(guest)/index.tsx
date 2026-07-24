import React, { useState } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, ScrollView,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { CATEGORIES, AREAS } from "@/constants/categories";
import GuestWall from "@/components/GuestWall";

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

function fmtScheduled(iso: string) {
  return fmtCreatedAt(iso);
}

const CAT_FILTERS = [
  { value: "all", label: "الكل" },
  ...CATEGORIES.map(c => ({ value: c.value, label: c.label })),
];

const AREA_FILTERS = [
  { value: "all", label: "الكل" },
  ...AREAS.map(a => ({ value: a, label: a })),
];

export default function GuestBrowseScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { exitGuestMode } = useAuth();
  const s = makeStyles(colors, insets.bottom);

  const [catFilter, setCatFilter] = useState("all");
  const [areaFilter, setAreaFilter] = useState("all");
  const [wallVisible, setWallVisible] = useState(false);
  const [wallMessage, setWallMessage] = useState<string | undefined>();

  const { data: allData, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["guest-available-requests"],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/requests?status=available`);
      return r.json() as Promise<HelpRequest[]>;
    },
  });

  const data = (allData ?? []).filter(item => {
    const catMatch = catFilter === "all" || item.category === catFilter;
    const areaMatch = areaFilter === "all" || item.area === areaFilter;
    return catMatch && areaMatch;
  });

  const catLabel = (v: string) => CATEGORIES.find(c => c.value === v)?.label ?? v;

  function showWall(msg?: string) {
    setWallMessage(msg);
    setWallVisible(true);
  }

  function handleLogin() {
    exitGuestMode();
    router.replace("/(auth)/login");
  }

  function handleRegister() {
    exitGuestMode();
    router.replace("/(auth)/register");
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

      {/* Meta chips */}
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

      {/* Locked contact action */}
      <TouchableOpacity
        style={s.lockedBtn}
        onPress={() => showWall("سجّل الدخول للتواصل مع صاحب الطلب وقبوله")}
        activeOpacity={0.85}
      >
        <Ionicons name="lock-closed-outline" size={16} color={colors.mutedForeground} />
        <Text style={s.lockedBtnTxt}>سجّل الدخول للتواصل مع صاحب الطلب</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={s.container}>
      {/* Header */}
      <SafeAreaView edges={["top"]} style={s.headerSafe}>
        <View style={s.headerInner}>
          <View style={s.headerRight}>
            <Text style={s.headerTitle}>تصفح الطلبات</Text>
            {!isLoading && (
              <View style={s.countBadge}>
                <Text style={s.countTxt}>{data.length}</Text>
              </View>
            )}
          </View>
          <View style={s.headerActions}>
            <TouchableOpacity style={s.loginBtn} onPress={handleLogin} activeOpacity={0.85}>
              <Text style={s.loginBtnTxt}>تسجيل الدخول</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Guest banner */}
        <TouchableOpacity style={s.guestBanner} onPress={() => showWall()} activeOpacity={0.85}>
          <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
          <Text style={s.guestBannerTxt}>
            أنت تتصفح كضيف — سجّل الدخول للتواصل مع أصحاب الطلبات
          </Text>
          <Ionicons name="chevron-back" size={14} color={colors.primary} />
        </TouchableOpacity>
      </SafeAreaView>

      {/* Filter: نوع المهمة */}
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

      {/* Filter: الموقع */}
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

      {/* List */}
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
          ListFooterComponent={
            data.length > 0 ? (
              <TouchableOpacity style={s.footerCta} onPress={() => showWall()} activeOpacity={0.85}>
                <Ionicons name="person-add-outline" size={18} color={colors.primaryForeground} />
                <Text style={s.footerCtaTxt}>سجّل الدخول لقبول الطلبات والكسب منها</Text>
              </TouchableOpacity>
            ) : null
          }
        />
      )}

      <GuestWall
        visible={wallVisible}
        onClose={() => setWallVisible(false)}
        message={wallMessage}
      />
    </View>
  );
}

const makeStyles = (c: ReturnType<typeof useColors>, bottomInset: number) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },

    headerSafe: { backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.border },
    headerInner: {
      paddingHorizontal: 16, paddingVertical: 12,
      flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    },
    headerRight: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
    headerTitle: { fontSize: 20, fontWeight: "800", color: c.foreground },
    countBadge: {
      backgroundColor: c.secondary, borderRadius: 10,
      paddingHorizontal: 8, paddingVertical: 2,
    },
    countTxt: { fontSize: 12, fontWeight: "700", color: c.primary },
    headerActions: { flexDirection: "row-reverse", gap: 8 },
    loginBtn: {
      backgroundColor: c.primary, borderRadius: 10,
      paddingHorizontal: 14, paddingVertical: 8,
    },
    loginBtnTxt: { color: c.primaryForeground, fontSize: 13, fontWeight: "700" },

    guestBanner: {
      flexDirection: "row-reverse", alignItems: "center", gap: 8,
      backgroundColor: c.secondary,
      paddingHorizontal: 16, paddingVertical: 10,
      borderTopWidth: 1, borderTopColor: c.border,
    },
    guestBannerTxt: {
      flex: 1, fontSize: 12, color: c.primary,
      fontWeight: "600", textAlign: "right",
    },

    filterSection: { backgroundColor: c.card, paddingTop: 10, paddingBottom: 10 },
    filterSectionBorder: { borderBottomWidth: 1, borderBottomColor: c.border },
    filterLabel: {
      fontSize: 12, fontWeight: "700", color: c.mutedForeground,
      textAlign: "right", paddingHorizontal: 16, marginBottom: 6,
    },
    chipsRow: { paddingHorizontal: 16, flexDirection: "row-reverse", gap: 8 },
    chip: {
      borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7,
      borderWidth: 1.5, borderColor: c.border, backgroundColor: c.background,
    },
    chipActive: { backgroundColor: c.primary, borderColor: c.primary },
    chipTxt: { fontSize: 13, color: c.mutedForeground, fontWeight: "600" },
    chipTxtActive: { color: c.primaryForeground, fontWeight: "700" },

    centered: { flex: 1, alignItems: "center", justifyContent: "center" },
    listContent: { padding: 16, paddingBottom: bottomInset + 32 },

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
    publishRow: { flexDirection: "row-reverse", alignItems: "center", gap: 5, marginBottom: 12 },
    publishTxt: { fontSize: 11, color: c.mutedForeground, textAlign: "right" },
    publishVal: { fontSize: 11, color: c.foreground, fontWeight: "600" },
    metaRow: { flexDirection: "row-reverse", gap: 8, marginBottom: 12, flexWrap: "wrap" },
    metaChip: {
      flexDirection: "row-reverse", alignItems: "center", gap: 4,
      backgroundColor: c.muted, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
    },
    metaTxt: { fontSize: 12, color: c.mutedForeground, fontWeight: "500" },

    lockedBtn: {
      flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8,
      backgroundColor: c.muted, borderRadius: 10, paddingVertical: 11,
      borderWidth: 1, borderColor: c.border,
    },
    lockedBtnTxt: { fontSize: 13, color: c.mutedForeground, fontWeight: "600" },

    empty: { alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 10 },
    emptyTitle: { fontSize: 18, fontWeight: "700", color: c.foreground },
    emptyHint: { fontSize: 14, color: c.mutedForeground, textAlign: "center", lineHeight: 22 },

    footerCta: {
      backgroundColor: c.primary, borderRadius: 14, marginHorizontal: 4, marginTop: 8,
      paddingVertical: 16, flexDirection: "row-reverse", alignItems: "center",
      justifyContent: "center", gap: 10,
    },
    footerCtaTxt: { color: c.primaryForeground, fontSize: 15, fontWeight: "700" },
  });
