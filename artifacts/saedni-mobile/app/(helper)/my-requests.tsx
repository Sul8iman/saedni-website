import React from "react";
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator, RefreshControl,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { getAuthHeaders, useAuth } from "@/contexts/AuthContext";
import { CATEGORIES, STATUS_INFO } from "@/constants/categories";
import { requestQueryKeys } from "@/lib/request-query-keys";

const BASE = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";

interface HelpRequest {
  id: number; category: string; details: string; area: string;
  timeType: string; offeredAmount: number; status: string;
  customerName?: string | null; customerPhone?: string | null;
}

export default function HelperMyRequestsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, activeRole } = useAuth();
  const roleKey = activeRole ?? user?.userType ?? "helper";

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: requestQueryKeys.helperAssigned(user?.id ?? 0, roleKey),
    queryFn: async () => {
      if (!user) return [];
      const r = await fetch(`${BASE}/api/requests?helperId=${user.id}`, {
        credentials: "include",
        headers: await getAuthHeaders(),
      });
      if (!r.ok) throw new Error("تعذر تحميل الطلبات");
      return r.json() as Promise<HelpRequest[]>;
    },
    enabled: !!user && roleKey === "helper",
  });

  useFocusEffect(
    React.useCallback(() => {
      if (user) void refetch();
    }, [refetch, user]),
  );

  const catLabel = (v: string) => CATEGORIES.find(c => c.value === v)?.label ?? v;
  const s = makeStyles(colors, insets.bottom);

  const renderItem = ({ item }: { item: HelpRequest }) => {
    const st = STATUS_INFO[item.status] ?? { label: item.status, color: "#6B7280", bg: "#F3F4F6" };
    return (
      <View style={s.card}>
        <View style={s.cardTop}>
          <View style={[s.statusBadge, { backgroundColor: st.bg }]}>
            <Text style={[s.statusTxt, { color: st.color }]}>{st.label}</Text>
          </View>
          <Text style={s.catTxt}>{catLabel(item.category)}</Text>
        </View>
        <Text style={s.details} numberOfLines={2}>{item.details}</Text>
        {item.customerName && (
          <View style={s.customerRow}>
            <Ionicons name="person-outline" size={13} color={colors.mutedForeground} />
            <Text style={s.metaTxt}>{item.customerName}</Text>
          </View>
        )}
        <View style={s.metaRow}>
          <View style={s.metaChip}>
            <Ionicons name="location-outline" size={13} color={colors.mutedForeground} />
            <Text style={s.metaTxt}>{item.area}</Text>
          </View>
          <View style={[s.metaChip, { backgroundColor: colors.secondary }]}>
            <Ionicons name="cash-outline" size={13} color={colors.primary} />
            <Text style={[s.metaTxt, { color: colors.primary, fontWeight: "700" }]}>{item.offeredAmount} ر.ع.</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={s.container}>
      <SafeAreaView edges={["top"]} style={s.headerSafe}>
        <View style={s.headerInner}>
          <Text style={s.headerTitle}>مهامي</Text>
          {!isLoading && data && (
            <View style={s.countBadge}>
              <Text style={s.countTxt}>{data.length}</Text>
            </View>
          )}
        </View>
      </SafeAreaView>

      {isLoading ? (
        <View style={s.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={i => String(i.id)}
          renderItem={renderItem}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="briefcase-outline" size={56} color={colors.border} />
              <Text style={s.emptyTitle}>لا توجد مهام بعد</Text>
              <Text style={s.emptyHint}>اقبل طلباً من تبويب "الطلبات المتاحة"</Text>
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
    headerSafe: { backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.border },
    headerInner: {
      paddingHorizontal: 20, paddingVertical: 14,
      flexDirection: "row-reverse", alignItems: "center", gap: 10,
    },
    headerTitle: { fontSize: 22, fontWeight: "800", color: c.foreground },
    countBadge: { backgroundColor: c.secondary, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 },
    countTxt: { fontSize: 12, fontWeight: "700", color: c.primary },
    centered: { flex: 1, alignItems: "center", justifyContent: "center" },
    listContent: { padding: 16, paddingBottom: bottomInset + 96 },
    card: {
      backgroundColor: c.card, borderRadius: 16, borderWidth: 1, borderColor: c.border,
      padding: 16, marginBottom: 12,
      shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    },
    cardTop: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
    statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
    statusTxt: { fontSize: 12, fontWeight: "700" },
    catTxt: { fontSize: 16, fontWeight: "700", color: c.foreground },
    details: { fontSize: 14, color: c.mutedForeground, textAlign: "right", lineHeight: 21, marginBottom: 10 },
    customerRow: { flexDirection: "row-reverse", alignItems: "center", gap: 5, marginBottom: 8 },
    metaRow: { flexDirection: "row-reverse", gap: 8, flexWrap: "wrap" },
    metaChip: {
      flexDirection: "row-reverse", alignItems: "center", gap: 4,
      backgroundColor: c.muted, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5,
    },
    metaTxt: { fontSize: 12, color: c.mutedForeground },
    empty: { alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 10 },
    emptyTitle: { fontSize: 18, fontWeight: "700", color: c.foreground },
    emptyHint: { fontSize: 14, color: c.mutedForeground, textAlign: "center" },
  });
