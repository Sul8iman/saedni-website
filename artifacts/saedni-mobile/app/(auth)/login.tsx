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
import ArabicText from "@/components/ArabicText";

type Step = "phone" | "otp" | "pin";

// Production backend — EXPO_PUBLIC_DOMAIN is baked in at EAS build time;
// fall back to Render so dev/web builds also work.
const DOMAIN = process.env.EXPO_PUBLIC_DOMAIN ?? "saedni.onrender.com";
const BASE = `https://${DOMAIN}`;

const FETCH_TIMEOUT_MS = 15_000;

type ApiResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; kind: "network" | "timeout" | "client" | "server"; status?: number; message: string };

async function safeApiFetch(url: string, init: RequestInit): Promise<ApiResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    clearTimeout(timer);
    let data: Record<string, unknown> = {};
    try { data = await res.json(); } catch { /* non-JSON body — keep data empty */ }

    if (res.ok) return { ok: true, data };

    const msg = typeof data.error === "string" ? data.error : "";
    if (res.status >= 500) {
      return { ok: false, kind: "server", status: res.status, message: msg || "خطأ في الخادم، يرجى المحاولة لاحقاً" };
    }
    return { ok: false, kind: "client", status: res.status, message: msg || "حدث خطأ، يرجى المحاولة مجدداً" };
  } catch (err: unknown) {
    clearTimeout(timer);
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, kind: "timeout", message: "انتهت مهلة الاتصال، يرجى المحاولة مجدداً" };
    }
    return { ok: false, kind: "network", message: "تعذر الاتصال بالخادم، يرجى التحقق من اتصالك بالإنترنت" };
  }
}

export default function LoginScreen() {
  const colors = useColors();
  const router = useRouter();
  const { setSession } = useAuth();

  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [pin, setPin] = useState("");
  const [isUnverified, setIsUnverified] = useState(false);
  // "whatsapp" = customer (OTP sent via WhatsApp), "admin" = helper/manual flow
  const [otpDelivery, setOtpDelivery] = useState<"whatsapp" | "admin">("admin");
  const [loading, setLoading] = useState(false);

  async function handlePhoneSubmit() {
    if (!phone.trim()) return;
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const result = await safeApiFetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ phone: phone.trim() }),
    });

    setLoading(false);

    if (!result.ok) {
      if (result.kind === "network" || result.kind === "timeout") {
        Alert.alert("خطأ في الاتصال", result.message);
      } else {
        Alert.alert("خطأ", result.message);
      }
      return;
    }

    const { data } = result;
    if (data.isAdmin) {
      setStep("pin");
    } else {
      setIsUnverified(data.isVerified === false);
      // Server sends otpDelivery: "whatsapp" | "admin"; fall back to "admin" for old server
      setOtpDelivery((data.otpDelivery as "whatsapp" | "admin") ?? "admin");
      setStep("otp");
    }
  }

  async function handleOtpSubmit() {
    if (otp.length < 6) return;
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const result = await safeApiFetch(`${BASE}/api/auth/verify-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ phone: phone.trim(), otp }),
    });

    setLoading(false);

    if (!result.ok) {
      if (result.kind === "network" || result.kind === "timeout") {
        Alert.alert("خطأ في الاتصال", result.message);
      } else {
        Alert.alert("رمز التحقق", result.message);
      }
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const token = result.data.token as string | undefined;
    const user  = result.data.user  as AuthUser | undefined;
    if (!token || !user) {
      Alert.alert("خطأ", "حدث خطأ غير متوقع، يرجى المحاولة مجدداً");
      return;
    }
    const saveResult = await setSession(user, token);
    if (!saveResult) return;
    router.replace("/");
  }

  async function handlePinSubmit() {
    if (!pin.trim()) return;
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const result = await safeApiFetch(`${BASE}/api/auth/admin-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ phone: phone.trim(), pin }),
    });

    setLoading(false);

    if (!result.ok) {
      if (result.kind === "network" || result.kind === "timeout") {
        Alert.alert("خطأ في الاتصال", result.message);
      } else {
        Alert.alert("خطأ", result.message);
      }
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const token = result.data.token as string | undefined;
    const user  = result.data.user  as AuthUser | undefined;
    if (!token || !user) {
      Alert.alert("خطأ", "حدث خطأ غير متوقع، يرجى المحاولة مجدداً");
      return;
    }
    const saveResult = await setSession(user, token);
    if (!saveResult) return;
    router.replace("/");
  }

  function openWhatsAppAdmin() {
    Linking.openURL(
      `https://wa.me/96892771450?text=${encodeURIComponent("مرحباً، أحتاج رمز التحقق للدخول إلى تطبيق ساعدني")}`
    );
  }

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
        {/* Logo */}
        <View style={s.logoSection}>
          <View style={s.logoCircle}>
            <Ionicons name="hand-left" size={38} color={colors.primaryForeground} />
          </View>
          <Text style={s.appName}>ساعدني</Text>
          <Text style={s.tagline}>منصة المساعدة اليومية في عُمان</Text>
        </View>

        {/* Card */}
        <View style={s.card}>

          {/* ── Phone step ── */}
          {step === "phone" && (
            <>
              <ArabicText style={s.cardTitle}>تسجيل الدخول</ArabicText>
              <ArabicText style={s.fieldLabel}>رقم الهاتف</ArabicText>
              <TextInput
                style={s.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="96891000001"
                keyboardType="phone-pad"
                textAlign="right"
                placeholderTextColor={colors.mutedForeground}
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handlePhoneSubmit}
              />
              <TouchableOpacity
                style={[s.primaryBtn, !phone.trim() && s.btnDisabled]}
                onPress={handlePhoneSubmit}
                disabled={loading || !phone.trim()}
                activeOpacity={0.85}
              >
                {loading
                  ? <ActivityIndicator color={colors.primaryForeground} />
                  : <Text style={s.primaryBtnTxt}>التالي</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => router.push("/(auth)/register")} style={s.ghostBtn}>
                <Text style={s.ghostTxt}>
                  ليس لديك حساب؟{" "}
                  <Text style={s.ghostLink}>سجّل الآن</Text>
                </Text>
              </TouchableOpacity>
            </>
          )}

          {/* ── OTP step ── */}
          {step === "otp" && (
            <>
              <ArabicText style={s.cardTitle}>رمز التحقق</ArabicText>

              {isUnverified && (
                <View style={s.warnBox}>
                  <Ionicons name="warning-outline" size={16} color="#92400E" />
                  <ArabicText style={s.warnTxt}>حسابك غير مفعّل — أدخل رمز التحقق لتفعيله</ArabicText>
                </View>
              )}

              <ArabicText style={s.subLabel}>
                الرقم: <Text style={s.subLabelBold}>{phone}</Text>
              </ArabicText>

              {otpDelivery === "whatsapp" ? (
                // Customer: OTP sent via WhatsApp automatically
                <View style={s.waInfoBox}>
                  <Ionicons name="logo-whatsapp" size={18} color="#25D366" />
                  <ArabicText style={s.waInfoTxt}>أدخل رمز التحقق المرسل إلى رقم واتساب المسجل.</ArabicText>
                </View>
              ) : (
                // Helper / manual flow: contact admin
                <>
                  <Text style={s.adminHint}>يرجى التواصل مع الإدارة للحصول على رمز التفعيل.</Text>
                  <TouchableOpacity style={s.waBtn} onPress={openWhatsAppAdmin} activeOpacity={0.85}>
                    <Ionicons name="logo-whatsapp" size={20} color="#fff" />
                    <Text style={s.waBtnTxt}>تواصل مع الإدارة</Text>
                  </TouchableOpacity>
                </>
              )}

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
                onPress={handleOtpSubmit}
                disabled={loading || otp.length < 6}
                activeOpacity={0.85}
              >
                {loading
                  ? <ActivityIndicator color={colors.primaryForeground} />
                  : <Text style={s.primaryBtnTxt}>تأكيد الدخول</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setStep("phone"); setOtp(""); }} style={s.ghostBtn}>
                <Text style={[s.ghostTxt, { color: colors.mutedForeground }]}>تعديل رقم الهاتف</Text>
              </TouchableOpacity>
            </>
          )}

          {/* ── Admin PIN step ── */}
          {step === "pin" && (
            <>
              <View style={s.adminBadge}>
                <Ionicons name="shield-checkmark" size={16} color={colors.primary} />
                <Text style={s.adminBadgeTxt}>دخول المدير</Text>
              </View>
              <ArabicText style={s.fieldLabel}>رمز PIN</ArabicText>
              <TextInput
                style={[s.input, s.otpInput]}
                value={pin}
                onChangeText={t => setPin(t.replace(/\D/g, "").slice(0, 6))}
                placeholder="• • • •"
                keyboardType="number-pad"
                secureTextEntry
                textAlign="center"
                placeholderTextColor={colors.mutedForeground}
                returnKeyType="done"
                onSubmitEditing={handlePinSubmit}
              />
              <TouchableOpacity
                style={[s.primaryBtn, !pin && s.btnDisabled]}
                onPress={handlePinSubmit}
                disabled={loading || !pin}
                activeOpacity={0.85}
              >
                {loading
                  ? <ActivityIndicator color={colors.primaryForeground} />
                  : <Text style={s.primaryBtnTxt}>دخول</Text>}
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setStep("phone"); setPin(""); }} style={s.ghostBtn}>
                <Text style={[s.ghostTxt, { color: colors.mutedForeground }]}>تعديل رقم الهاتف</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* ── DIAGNOSTIC: RTL test navigation — remove before production ── */}
        <TouchableOpacity
          onPress={() => router.push("/rtl-test" as never)}
          style={{ alignItems: "center", paddingVertical: 16, marginTop: 8 }}
        >
          <Text style={{ fontSize: 11, color: "#9CA3AF" }}>
            [RTL Test Screen]
          </Text>
        </TouchableOpacity>
        {/* ──────────────────────────────────────────────────────────────── */}

      </KeyboardAwareScrollViewCompat>
    </SafeAreaView>
  );
}

const makeStyles = (c: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.background },
    scroll: { flex: 1 },
    content: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 32, paddingBottom: 24 },
    logoSection: { alignItems: "center", marginBottom: 36 },
    logoCircle: {
      width: 80, height: 80, borderRadius: 40,
      backgroundColor: c.primary, alignItems: "center", justifyContent: "center",
      marginBottom: 16,
      shadowColor: c.primary, shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.3, shadowRadius: 12, elevation: 8,
    },
    appName: { fontSize: 32, fontWeight: "800", color: c.foreground, letterSpacing: -0.5 },
    tagline: { fontSize: 14, color: c.mutedForeground, marginTop: 6, textAlign: "center" },
    card: {
      backgroundColor: c.card, borderRadius: 20, borderWidth: 1, borderColor: c.border,
      padding: 24,
      shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
    },
    cardTitle: {
      fontSize: 20, fontWeight: "700", color: c.foreground,
      textAlign: "right", marginBottom: 20,
    },
    fieldLabel: {
      fontSize: 14, fontWeight: "600", color: c.foreground,
      textAlign: "right", marginBottom: 8,
    },
    subLabel: { fontSize: 13, color: c.mutedForeground, textAlign: "right", marginBottom: 12 },
    subLabelBold: { fontWeight: "700", color: c.foreground },
    input: {
      borderWidth: 1.5, borderColor: c.border, borderRadius: 12,
      paddingHorizontal: 16, paddingVertical: 14,
      fontSize: 16, color: c.foreground, backgroundColor: c.background,
      textAlign: "right", marginBottom: 16,
    },
    otpInput: {
      textAlign: "center", fontSize: 24, letterSpacing: 8, fontWeight: "800",
      paddingVertical: 18,
    },
    primaryBtn: {
      backgroundColor: c.primary, borderRadius: 12, paddingVertical: 16,
      alignItems: "center", marginBottom: 12,
    },
    btnDisabled: { opacity: 0.4 },
    primaryBtnTxt: { color: c.primaryForeground, fontSize: 16, fontWeight: "700" },
    ghostBtn: { alignItems: "center", paddingVertical: 10 },
    ghostTxt: { fontSize: 14, color: c.mutedForeground, textAlign: "center" },
    ghostLink: { color: c.primary, fontWeight: "700" },
    adminHint: {
      fontSize: 13, color: c.mutedForeground, textAlign: "center",
      marginBottom: 12, lineHeight: 20,
    },
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
    warnBox: {
      backgroundColor: "#FEF3C7", borderRadius: 10, padding: 12,
      flexDirection: "row-reverse", alignItems: "flex-start", gap: 8, marginBottom: 16,
    },
    warnTxt: { color: "#92400E", fontSize: 13, textAlign: "right", flex: 1, lineHeight: 18 },
    adminBadge: {
      flexDirection: "row-reverse", alignItems: "center", gap: 6,
      backgroundColor: c.secondary, borderRadius: 10, padding: 10,
      alignSelf: "flex-end", marginBottom: 16,
    },
    adminBadgeTxt: { color: c.primary, fontWeight: "700", fontSize: 13 },
  });
