import React from "react";
import { Redirect } from "expo-router";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

export default function Index() {
  const { user, loading, activeRole, setActiveRole, isGuest } = useAuth();
  const colors = useColors();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (isGuest) return <Redirect href="/(guest)" />;
  if (!user) return <Redirect href="/(auth)/welcome" />;
  if (user.userType === "admin") return <Redirect href="/(admin)" />;

  const roles = user.roles ?? [user.userType];
  const isDualRole = roles.includes("customer") && roles.includes("helper");

  // Dual-role user with no active role selected yet → show picker
  if (isDualRole && !activeRole) {
    return <RoleSelector colors={colors} onSelect={setActiveRole} name={user.name} />;
  }

  const effectiveRole = activeRole ?? user.userType;
  if (effectiveRole === "customer") return <Redirect href="/(customer)" />;
  return <Redirect href="/(helper)" />;
}

function RoleSelector({
  colors,
  onSelect,
  name,
}: {
  colors: ReturnType<typeof useColors>;
  onSelect: (role: string) => Promise<void>;
  name: string;
}) {
  const s = makeStyles(colors);

  async function pick(role: string) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await onSelect(role);
  }

  return (
    <SafeAreaView style={s.safe} edges={["top", "bottom"]}>
      <View style={s.container}>
        <View style={s.logoCircle}>
          <Ionicons name="hand-left" size={38} color={colors.primaryForeground} />
        </View>
        <Text style={s.title}>مرحباً، {name}</Text>
        <Text style={s.subtitle}>كيف تريد الدخول؟</Text>

        <View style={s.cards}>
          <TouchableOpacity style={s.roleCard} onPress={() => pick("customer")} activeOpacity={0.85}>
            <View style={[s.roleIcon, { backgroundColor: colors.primary + "18" }]}>
              <Ionicons name="person-outline" size={34} color={colors.primary} />
            </View>
            <Text style={s.roleTitle}>أحتاج مساعدة</Text>
            <Text style={s.roleHint}>نشر طلبات وإدارتها</Text>
            <View style={s.roleArrow}>
              <Ionicons name="chevron-back" size={18} color={colors.primary} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={s.roleCard} onPress={() => pick("helper")} activeOpacity={0.85}>
            <View style={[s.roleIcon, { backgroundColor: "#F59E0B18" }]}>
              <Ionicons name="hand-right-outline" size={34} color="#F59E0B" />
            </View>
            <Text style={s.roleTitle}>أريد أساعد</Text>
            <Text style={s.roleHint}>تصفح الطلبات وقبولها</Text>
            <View style={s.roleArrow}>
              <Ionicons name="chevron-back" size={18} color="#F59E0B" />
            </View>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const makeStyles = (c: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    container: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
    logoCircle: {
      width: 80, height: 80, borderRadius: 40,
      backgroundColor: c.primary, alignItems: "center", justifyContent: "center",
      marginBottom: 20,
      shadowColor: c.primary, shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
    },
    title: { fontSize: 24, fontWeight: "800", color: c.foreground, textAlign: "center", marginBottom: 6 },
    subtitle: { fontSize: 16, color: c.mutedForeground, textAlign: "center", marginBottom: 36 },
    cards: { width: "100%", gap: 14 },
    roleCard: {
      backgroundColor: c.card, borderRadius: 18, borderWidth: 1.5, borderColor: c.border,
      padding: 20, alignItems: "flex-end",
      shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
    },
    roleIcon: {
      width: 60, height: 60, borderRadius: 18,
      alignItems: "center", justifyContent: "center", marginBottom: 12,
    },
    roleTitle: { fontSize: 18, fontWeight: "800", color: c.foreground, textAlign: "right", marginBottom: 4 },
    roleHint: { fontSize: 13, color: c.mutedForeground, textAlign: "right" },
    roleArrow: {
      position: "absolute", start: 20, top: "50%",
      width: 32, height: 32, borderRadius: 16,
      backgroundColor: c.muted, alignItems: "center", justifyContent: "center",
    },
  });
