import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";

export default function CustomerProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, logout } = useAuth();

  function handleLogout() {
    Alert.alert("تسجيل الخروج", "هل تريد الخروج من حسابك؟", [
      { text: "إلغاء", style: "cancel" },
      {
        text: "خروج", style: "destructive",
        onPress: async () => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          await logout();
          router.replace("/(auth)/welcome");
        },
      },
    ]);
  }

  const s = makeStyles(colors, insets.bottom);

  return (
    <View style={s.container}>
      <SafeAreaView edges={["top"]} style={s.headerSafe}>
        <View style={s.headerInner}>
          <Text style={s.headerTitle}>حسابي</Text>
        </View>
      </SafeAreaView>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Avatar */}
        <View style={s.avatarSection}>
          <View style={s.avatar}>
            <Text style={s.avatarTxt}>{user?.name?.[0] ?? "؟"}</Text>
          </View>
          <Text style={s.name}>{user?.name}</Text>
          <Text style={s.phone}>{user?.phone}</Text>
          <View style={s.rolePill}>
            <Ionicons name="person-outline" size={14} color={colors.primary} />
            <Text style={s.roleTxt}>عميل</Text>
          </View>
        </View>

        {/* Info card */}
        <View style={s.infoCard}>
          <View style={s.infoRow}>
            <Text style={s.infoVal}>{user?.name}</Text>
            <Text style={s.infoKey}>الاسم</Text>
          </View>
          <View style={s.divider} />
          <View style={s.infoRow}>
            <Text style={s.infoVal}>{user?.phone}</Text>
            <Text style={s.infoKey}>رقم الهاتف</Text>
          </View>
          <View style={s.divider} />
          <View style={s.infoRow}>
            <View style={[s.statusDot, { backgroundColor: user?.isActive !== false ? "#16A34A" : "#DC2626" }]} />
            <Text style={s.infoVal}>{user?.isActive !== false ? "نشط" : "معطّل"}</Text>
            <Text style={s.infoKey}>حالة الحساب</Text>
          </View>
        </View>

        {/* Logout */}
        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.85}>
          <Ionicons name="log-out-outline" size={20} color="#DC2626" />
          <Text style={s.logoutTxt}>تسجيل الخروج</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const makeStyles = (c: ReturnType<typeof useColors>, bottomInset: number) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    headerSafe: { backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.border },
    headerInner: { paddingHorizontal: 20, paddingVertical: 14 },
    headerTitle: { fontSize: 22, fontWeight: "800", color: c.foreground, textAlign: "right" },
    scroll: { flex: 1 },
    content: { padding: 20, paddingBottom: bottomInset + 100, alignItems: "center" },
    avatarSection: { alignItems: "center", paddingVertical: 28 },
    avatar: {
      width: 92, height: 92, borderRadius: 46, backgroundColor: c.primary,
      alignItems: "center", justifyContent: "center", marginBottom: 14,
      shadowColor: c.primary, shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25, shadowRadius: 10, elevation: 6,
    },
    avatarTxt: { fontSize: 38, fontWeight: "800", color: c.primaryForeground },
    name: { fontSize: 24, fontWeight: "800", color: c.foreground, marginBottom: 4 },
    phone: { fontSize: 15, color: c.mutedForeground, marginBottom: 12 },
    rolePill: {
      flexDirection: "row-reverse", alignItems: "center", gap: 6,
      backgroundColor: c.secondary, borderRadius: 20,
      paddingHorizontal: 16, paddingVertical: 7,
    },
    roleTxt: { fontSize: 14, color: c.primary, fontWeight: "700" },
    infoCard: {
      width: "100%", backgroundColor: c.card, borderRadius: 16,
      borderWidth: 1, borderColor: c.border, marginBottom: 20,
      shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    },
    infoRow: {
      flexDirection: "row-reverse", justifyContent: "space-between", alignItems: "center",
      paddingHorizontal: 18, paddingVertical: 16,
    },
    infoKey: { fontSize: 14, color: c.mutedForeground, fontWeight: "500" },
    infoVal: { fontSize: 15, fontWeight: "600", color: c.foreground },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: c.border, marginHorizontal: 18 },
    statusDot: { width: 8, height: 8, borderRadius: 4, marginStart: 6 },
    logoutBtn: {
      width: "100%", flexDirection: "row-reverse", alignItems: "center", gap: 12,
      backgroundColor: "#FEF2F2", borderRadius: 14, paddingVertical: 16, paddingHorizontal: 20,
      borderWidth: 1, borderColor: "#FECACA",
    },
    logoutTxt: { fontSize: 16, color: "#DC2626", fontWeight: "700" },
  });
