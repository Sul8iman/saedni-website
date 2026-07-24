import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";

const EXAMPLES = [
  { emoji: "🚚", text: "أحتاج بيكب لنقل أغراض من بوشر إلى الخوير", amount: "15" },
  { emoji: "🏛️", text: "أحتاج تخليص معاملة في جهة حكومية",          amount: "20" },
  { emoji: "🔧", text: "أحتاج شخص لتركيب أثاث منزلي",               amount: "25" },
] as const;

export default function WelcomeScreen() {
  const colors = useColors();
  const router = useRouter();
  const { enterGuestMode } = useAuth();
  const s = makeStyles(colors);

  function handleGuestMode() {
    enterGuestMode();
    router.replace("/");
  }

  return (
    <SafeAreaView style={s.safe} edges={["top", "bottom"]}>
      <ScrollView
        style={s.scroll}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero */}
        <View style={s.hero}>
          <View style={s.logoCircle}>
            <Ionicons name="hand-left" size={44} color={colors.primaryForeground} />
          </View>
          <Text style={s.appName}>ساعدني</Text>
          <Text style={s.tagline}>منصة المساعدة اليومية في عُمان</Text>
        </View>

        {/* Examples section */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>اطلب أي مساعدة بسهولة</Text>
          <Text style={s.sectionSub}>أمثلة على الطلبات</Text>

          {EXAMPLES.map((ex, i) => (
            <View key={i} style={s.card}>
              <View style={s.cardRight}>
                <Text style={s.cardEmoji}>{ex.emoji}</Text>
                <Text style={s.cardText}>{ex.text}</Text>
              </View>
              <View style={s.amountBadge}>
                <Text style={s.amountTxt}>{ex.amount}</Text>
                <Text style={s.amountCur}>ر.ع</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Action buttons */}
        <View style={s.actions}>
          <TouchableOpacity
            style={s.primaryBtn}
            onPress={() => router.push("/(auth)/login")}
            activeOpacity={0.85}
          >
            <Text style={s.primaryBtnTxt}>تسجيل الدخول</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.secondaryBtn}
            onPress={() => router.push("/(auth)/register")}
            activeOpacity={0.85}
          >
            <Text style={s.secondaryBtnTxt}>إنشاء حساب جديد</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={s.guestBtn}
            onPress={handleGuestMode}
            activeOpacity={0.7}
          >
            <Ionicons name="eye-outline" size={16} color={colors.mutedForeground} />
            <Text style={s.guestBtnTxt}>تصفح كضيف</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (c: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    scroll: { flex: 1 },
    content: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 32, gap: 18 },

    hero: { alignItems: "center", gap: 10 },
    logoCircle: {
      width: 88, height: 88, borderRadius: 44,
      backgroundColor: c.primary, alignItems: "center", justifyContent: "center",
      marginBottom: 4,
      shadowColor: c.primary, shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.3, shadowRadius: 14, elevation: 8,
    },
    appName: {
      fontSize: 38, fontWeight: "800", color: c.foreground,
      letterSpacing: -1, textAlign: "center",
    },
    tagline: {
      fontSize: 15, color: c.mutedForeground, fontWeight: "500",
      textAlign: "center",
    },

    section: { gap: 10 },
    sectionTitle: {
      fontSize: 18, fontWeight: "700", color: c.foreground,
      textAlign: "right", marginBottom: 2,
    },
    sectionSub: {
      fontSize: 13, color: c.mutedForeground,
      textAlign: "right", marginBottom: 6,
    },
    card: {
      backgroundColor: c.card, borderRadius: 14,
      borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 14, paddingVertical: 12,
      flexDirection: "row-reverse", alignItems: "center",
      justifyContent: "space-between", gap: 10,
      shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    },
    cardRight: {
      flexDirection: "row-reverse", alignItems: "center",
      gap: 10, flex: 1,
    },
    cardEmoji: { fontSize: 22 },
    cardText: {
      fontSize: 13, color: c.foreground, textAlign: "right",
      flex: 1, lineHeight: 20,
    },
    amountBadge: {
      backgroundColor: c.secondary, borderRadius: 8,
      paddingHorizontal: 8, paddingVertical: 4,
      alignItems: "center", borderWidth: 1, borderColor: c.border,
      minWidth: 44,
    },
    amountTxt: { fontSize: 13, fontWeight: "700", color: c.primary },
    amountCur: { fontSize: 10, color: c.mutedForeground, fontWeight: "500" },

    actions: { gap: 12, alignItems: "stretch" },
    primaryBtn: {
      backgroundColor: c.primary, borderRadius: 14,
      paddingVertical: 17, alignItems: "center",
      shadowColor: c.primary, shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.25, shadowRadius: 8, elevation: 5,
    },
    primaryBtnTxt: { color: c.primaryForeground, fontSize: 17, fontWeight: "700" },
    secondaryBtn: {
      backgroundColor: c.card, borderRadius: 14,
      paddingVertical: 17, alignItems: "center",
      borderWidth: 1.5, borderColor: c.border,
    },
    secondaryBtnTxt: { color: c.foreground, fontSize: 17, fontWeight: "600" },
    guestBtn: {
      borderRadius: 14, paddingVertical: 14, alignItems: "center",
      flexDirection: "row-reverse", justifyContent: "center", gap: 8,
    },
    guestBtnTxt: { color: c.mutedForeground, fontSize: 15, fontWeight: "500" },
  });
