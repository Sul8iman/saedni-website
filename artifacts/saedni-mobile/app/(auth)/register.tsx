import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useColors } from "@/hooks/useColors";
import { useAuth, type AuthUser } from "@/contexts/AuthContext";

type Step = "form" | "otp";
type UserType = "customer" | "helper";

// Production backend — EXPO_PUBLIC_DOMAIN is baked in at EAS build time;
// fall back to Render so dev/web builds also work.
const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN ?? "saedni.onrender.com";
const BASE = `https://${DOMAIN}`;

export default function RegisterScreen() {
  const colors = useColors();
  const router = useRouter();
  const { setSession } = useAuth();

  const [step, setStep] = useState<Step>("form");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [userType, setUserType] = useState<UserType>("customer");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);

  async function handleRegister() {
    if (!name.trim() || !phone.trim()) return;
    if (!termsAccepted) {
      Alert.alert("الشروط والأحكام", "يرجى الموافقة على الشروط والأحكام أولاً");
      return;
    }
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const res = await fetch(`${BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: name.trim(), phone: phone.trim(), userType }),
      });
      const data = await res.json();
      if (!res.ok) { Alert.alert("خطأ", data.error || "فشل التسجيل"); return; }
      setStep("otp");
    } catch { Alert.alert("خطأ", "تعذر الاتصال بالخادم"); }
    finally { setLoading(false); }
  }

  async function handleVerify() {
    if (otp.length < 6) return;
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 15_000);
      let res: Response;
      try {
        res = await fetch(`${BASE}/api/auth/verify-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ phone: phone.trim(), otp }),
          signal: controller.signal,
        });
      } finally { clearTimeout(timer); }
      let data: Record<string, unknown> = {};
      try { data = await res.json(); } catch {}
      if (!res.ok) {
        const msg = typeof data.error === "string" ? data.error : res.status >= 500 ? "خطأ في الخادم، يرجى المحاولة لاحقاً" : "رمز التحقق غير صحيح";
        Alert.alert("خطأ", msg);
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await setSession(data.user as AuthUser, data.token as string);
      router.replace("/");
    } catch (err: unknown) {
      const isTimeout = err instanceof Error && err.name === "AbortError";
      Alert.alert("خطأ في الاتصال", isTimeout ? "انتهت مهلة الاتصال، يرجى المحاولة مجدداً" : "تعذر الاتصال بالخادم، يرجى التحقق من اتصالك بالإنترنت");
    }
    finally { setLoading(false); }
  }

  function openWhatsApp() {
    Linking.openURL(
      `https://wa.me/96892771450?text=${encodeURIComponent("مرحباً، قمت بإنشاء حساب جديد في تطبيق ساعدني وأحتاج رمز التحقق")}`
    );
  }

  const canSubmit = !!name.trim() && !!phone.trim() && termsAccepted;
  const s = makeStyles(colors);

  return (
    <SafeAreaView style={s.safe} edges={["top", "bottom"]}>
      <KeyboardAwareScrollViewCompat
        style={s.scroll}
        contentContainerStyle={s.content}
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={s.logoSection}>
          <View style={s.logoCircle}>
            <Ionicons name="hand-left" size={38} color={colors.primaryForeground} />
          </View>
          <Text style={s.appName}>{step === "form" ? "حساب جديد" : "تفعيل الحساب"}</Text>
          <Text style={s.tagline}>
            {step === "form"
            ? "انضم إلى ساعدني اليوم"
            : userType === "customer"
              ? "أدخل رمز التحقق من واتساب"
              : "تواصل مع الإدارة للتفعيل"}
          </Text>
        </View>

        <View style={s.card}>
          {step === "form" && (
            <>
              {/* Role selector */}
              <Text style={s.fieldLabel}>نوع الحساب</Text>
              <View style={s.roleRow}>
                {(["customer", "helper"] as const).map((v) => (
                  <TouchableOpacity
                    key={v}
                    style={[s.roleCard, userType === v && s.roleCardActive]}
                    onPress={() => setUserType(v)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name={v === "customer" ? "person-outline" : "hand-right-outline"}
                      size={26}
                      color={userType === v ? colors.primary : colors.mutedForeground}
                    />
                    <Text style={[s.roleLabel, userType === v && s.roleLabelActive]}>
                      {v === "customer" ? "أحتاج مساعدة" : "أريد أساعد"}
                    </Text>
                    <Text style={[s.roleHint, userType === v && s.roleHintActive]}>
                      {v === "customer" ? "عميل" : "مساعد"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.fieldLabel}>الاسم الكامل</Text>
              <TextInput
                style={s.input}
                value={name}
                onChangeText={setName}
                placeholder="مثال: أحمد الريامي"
                textAlign="right"
                placeholderTextColor={colors.mutedForeground}
                returnKeyType="next"
              />

              <Text style={s.fieldLabel}>رقم الهاتف</Text>
              <TextInput
                style={s.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="96891000001"
                keyboardType="phone-pad"
                textAlign="right"
                placeholderTextColor={colors.mutedForeground}
                returnKeyType="done"
                onSubmitEditing={handleRegister}
              />

              {/* Terms & Conditions checkbox */}
              <TouchableOpacity
                style={s.termsRow}
                onPress={() => setTermsAccepted(v => !v)}
                activeOpacity={0.7}
              >
                <View style={[s.checkbox, termsAccepted && s.checkboxChecked]}>
                  {termsAccepted && (
                    <Ionicons name="checkmark" size={14} color={colors.primaryForeground} />
                  )}
                </View>
                <Text style={s.termsTxt}>
                  {"أوافق على "}
                  <Text
                    style={s.termsLink}
                    onPress={(e) => {
                      e.stopPropagation();
                      router.push("/(auth)/terms");
                    }}
                  >
                    الشروط والأحكام وسياسة الخصوصية
                  </Text>
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[s.primaryBtn, !canSubmit && s.btnDisabled]}
                onPress={handleRegister}
                disabled={loading || !canSubmit}
                activeOpacity={0.85}
              >
                {loading
                  ? <ActivityIndicator color={colors.primaryForeground} />
                  : <Text style={s.primaryBtnTxt}>إنشاء الحساب</Text>}
              </TouchableOpacity>

              <TouchableOpacity onPress={() => router.back()} style={s.ghostBtn}>
                <Text style={s.ghostTxt}>
                  لديك حساب؟ <Text style={s.ghostLink}>سجّل دخولك</Text>
                </Text>
              </TouchableOpacity>
            </>
          )}

          {step === "otp" && (
            <>
              {userType === "customer" ? (
                // Customer: OTP sent automatically via WhatsApp
                <View style={s.waInfoBox}>
                  <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
                  <Text style={s.waInfoTxt}>أدخل رمز التحقق المرسل إلى رقم واتساب المسجل.</Text>
                </View>
              ) : (
                // Helper: manual activation via admin
                <>
                  <View style={s.successBox}>
                    <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                    <Text style={s.successTxt}>
                      يرجى التواصل مع الإدارة للحصول على رمز التفعيل.
                    </Text>
                  </View>
                  <TouchableOpacity style={s.waBtn} onPress={openWhatsApp} activeOpacity={0.85}>
                    <Ionicons name="logo-whatsapp" size={20} color="#fff" />
                    <Text style={s.waBtnTxt}>تواصل مع الإدارة</Text>
                  </TouchableOpacity>
                </>
              )}
              <Text style={s.fieldLabel}>رمز التحقق</Text>
              <TextInput
                style={[s.input, s.otpInput]}
                value={otp}
                onChangeText={t => setOtp(t.replace(/\D/g, "").slice(0, 6))}
                placeholder="- - - - - -"
                keyboardType="number-pad"
                maxLength={6}
                textAlign="center"
                placeholderTextColor={colors.mutedForeground}
                autoFocus
              />
              <TouchableOpacity
                style={[s.primaryBtn, otp.length < 6 && s.btnDisabled]}
                onPress={handleVerify}
                disabled={loading || otp.length < 6}
                activeOpacity={0.85}
              >
                {loading
                  ? <ActivityIndicator color={colors.primaryForeground} />
                  : <Text style={s.primaryBtnTxt}>تفعيل الحساب والدخول</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setStep("form"); setOtp(""); }} style={s.ghostBtn}>
                <Text style={[s.ghostTxt, { color: colors.mutedForeground }]}>تعديل البيانات</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAwareScrollViewCompat>
    </SafeAreaView>
  );
}

const makeStyles = (c: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    scroll: { flex: 1 },
    content: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 28, paddingBottom: 24 },
    logoSection: { alignItems: "center", marginBottom: 32 },
    logoCircle: {
      width: 72, height: 72, borderRadius: 36,
      backgroundColor: c.primary, alignItems: "center", justifyContent: "center",
      marginBottom: 14,
      shadowColor: c.primary, shadowOffset: { width: 0, height: 5 },
      shadowOpacity: 0.28, shadowRadius: 10, elevation: 7,
    },
    appName: { fontSize: 26, fontWeight: "800", color: c.foreground },
    tagline: { fontSize: 14, color: c.mutedForeground, marginTop: 4, textAlign: "center" },
    card: {
      backgroundColor: c.card, borderRadius: 20, borderWidth: 1, borderColor: c.border,
      padding: 24,
      shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
    },
    fieldLabel: {
      fontSize: 14, fontWeight: "600", color: c.foreground,
      textAlign: "right", marginBottom: 10,
    },
    input: {
      borderWidth: 1.5, borderColor: c.border, borderRadius: 12,
      paddingHorizontal: 16, paddingVertical: 14,
      fontSize: 16, color: c.foreground, backgroundColor: c.background,
      textAlign: "right", marginBottom: 16,
    },
    otpInput: {
      textAlign: "center", fontSize: 28, letterSpacing: 10, fontWeight: "800",
      paddingVertical: 18,
    },
    roleRow: { flexDirection: "row-reverse", gap: 12, marginBottom: 20 },
    roleCard: {
      flex: 1, borderWidth: 2, borderColor: c.border, borderRadius: 14,
      padding: 16, alignItems: "center", gap: 6, backgroundColor: c.background,
    },
    roleCardActive: { borderColor: c.primary, backgroundColor: c.secondary },
    roleLabel: { fontSize: 14, color: c.mutedForeground, fontWeight: "700", textAlign: "center" },
    roleLabelActive: { color: c.primary },
    roleHint: { fontSize: 11, color: c.mutedForeground, textAlign: "center" },
    roleHintActive: { color: c.secondaryForeground },

    // Terms checkbox
    termsRow: {
      flexDirection: "row-reverse", alignItems: "center", gap: 10,
      marginBottom: 18, paddingVertical: 4,
    },
    checkbox: {
      width: 22, height: 22, borderRadius: 6,
      borderWidth: 2, borderColor: c.border,
      backgroundColor: c.background,
      alignItems: "center", justifyContent: "center",
    },
    checkboxChecked: { backgroundColor: c.primary, borderColor: c.primary },
    termsTxt: { flex: 1, fontSize: 13, color: c.mutedForeground, textAlign: "right", lineHeight: 20 },
    termsLink: { color: c.primary, fontWeight: "700", textDecorationLine: "underline" },

    primaryBtn: {
      backgroundColor: c.primary, borderRadius: 12, paddingVertical: 16,
      alignItems: "center", marginBottom: 12,
    },
    btnDisabled: { opacity: 0.4 },
    primaryBtnTxt: { color: c.primaryForeground, fontSize: 16, fontWeight: "700" },
    ghostBtn: { alignItems: "center", paddingVertical: 10 },
    ghostTxt: { fontSize: 14, color: c.mutedForeground, textAlign: "center" },
    ghostLink: { color: c.primary, fontWeight: "700" },
    waBtn: {
      backgroundColor: "#25D366", borderRadius: 12, paddingVertical: 13,
      flexDirection: "row-reverse", alignItems: "center", justifyContent: "center",
      gap: 10, marginBottom: 16,
    },
    waBtnTxt: { color: "#fff", fontSize: 14, fontWeight: "700" },
    waInfoBox: {
      flexDirection: "row-reverse", alignItems: "center", gap: 8,
      backgroundColor: "#F0FDF4", borderRadius: 10, padding: 12,
      borderWidth: 1, borderColor: "#BBF7D0",
      marginBottom: 16,
    },
    waInfoTxt: { color: "#166534", fontSize: 13, textAlign: "right", flex: 1, lineHeight: 18 },
    successBox: {
      backgroundColor: c.secondary, borderRadius: 12, padding: 14,
      flexDirection: "row-reverse", alignItems: "flex-start", gap: 10, marginBottom: 16,
    },
    successTxt: {
      color: c.secondaryForeground, fontSize: 13, textAlign: "right",
      flex: 1, lineHeight: 20,
    },
  });
