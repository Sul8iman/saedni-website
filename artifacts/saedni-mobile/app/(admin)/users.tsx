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

const BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN ?? "saedni.onrender.com"}`;

interface User {
  id: number; name: string; phone: string; userType: string;
  isActive: boolean; isVerified: boolean; isBlocked: boolean;
  helperActivationCodeActive?: boolean | null; area?: string | null;
}

type Filter = "all" | "customer" | "helper";

export default function AdminUsersScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");

  const { data, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["admin-users", filter],
    queryFn: async () => {
      const q = filter !== "all" ? `?userType=${filter}` : "";
      const r = await fetch(`${BASE}/api/users${q}`, { credentials: "include" });
      return r.json() as Promise<User[]>;
    },
  });

  const verifyMutation = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: "verify" | "block" }) => {
      const r = await fetch(`${BASE}/api/admin/helpers/${id}/verify`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ action }),
      });
      if (!r.ok) throw new Error();
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: () => Alert.alert("خطأ", "تعذر تحديث المستخدم"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`${BASE}/api/admin/users/${id}/delete`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error();
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: () => Alert.alert("خطأ", "تعذر حذف المستخدم"),
  });

  const s = makeStyles(colors, insets.bottom);

  const FILTERS: { v: Filter; label: string }[] = [
    { v: "all", label: "الكل" },
    { v: "customer", label: "العملاء" },
    { v: "helper", label: "المساعدون" },
  ];

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
              Alert.alert("حذف", `حذف ${item.name}؟`, [
                { text: "إلغاء", style: "cancel" },
                { text: "حذف", style: "destructive", onPress: () => deleteMutation.mutate(item.id) },
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
            <RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />
          }
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="people-outline" size={56} color={colors.border} />
              <Text style={s.emptyTxt}>لا يوجد مستخدمون</Text>
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
    backBtn: { padding: 4 },
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
    listContent: { padding: 16, paddingBottom: bottomInset + 24 },
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
  });
