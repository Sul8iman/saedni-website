import React, { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Modal, FlatList, Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/contexts/AuthContext";
import { CATEGORIES, AREAS } from "@/constants/categories";
import type { CategoryValue } from "@/constants/categories";
import ArabicText from "@/components/ArabicText";

const BASE = process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}` : "";

// Gregorian DD/MM/YYYY — never use ar-SA (produces Hijri)
function formatDate(d: Date) {
  const dd = d.getDate().toString().padStart(2, "0");
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  return `${dd}/${mm}/${d.getFullYear()}`;
}
// HH:MM 24-hour
function formatTime(d: Date) {
  const hh = d.getHours().toString().padStart(2, "0");
  const min = d.getMinutes().toString().padStart(2, "0");
  return `${hh}:${min}`;
}

export default function CustomerHomeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isBlocked = user?.isBlocked || user?.isActive === false;

  const [category, setCategory] = useState<CategoryValue | "">("");
  const [details, setDetails] = useState("");
  const [timeType, setTimeType] = useState<"now" | "scheduled">("now");
  const [scheduledDate, setScheduledDate] = useState<Date | null>(null);
  const [scheduledTime, setScheduledTime] = useState<Date | null>(null);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [timePickerVisible, setTimePickerVisible] = useState(false);
  const [area, setArea] = useState("");
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [areaPickerVisible, setAreaPickerVisible] = useState(false);

  // Temporary picker state (user hasn't hit "Done" yet on iOS)
  const [tempDate, setTempDate] = useState<Date>(new Date());
  const [tempTime, setTempTime] = useState<Date>(new Date());

  function openDatePicker() {
    setTempDate(scheduledDate ?? new Date());
    setDatePickerVisible(true);
  }
  function openTimePicker() {
    setTempTime(scheduledTime ?? new Date());
    setTimePickerVisible(true);
  }
  function confirmDate() {
    setScheduledDate(tempDate);
    setDatePickerVisible(false);
  }
  function confirmTime() {
    setScheduledTime(tempTime);
    setTimePickerVisible(false);
  }

  function resetForm() {
    setCategory(""); setDetails(""); setArea(""); setAmount("");
    setTimeType("now"); setScheduledDate(null); setScheduledTime(null);
    setSubmitted(false);
  }

  async function handleSubmit() {
    if (!category || !details.trim() || !area || !amount) {
      Alert.alert("تنبيه", "يرجى تعبئة جميع الحقول");
      return;
    }
    if (timeType === "scheduled" && (!scheduledDate || !scheduledTime)) {
      Alert.alert("تنبيه", "يرجى اختيار التاريخ والوقت");
      return;
    }
    if (!user || isBlocked) {
      Alert.alert("تعطيل الحساب", "تم تعطيل حسابك. يرجى التواصل مع الإدارة");
      return;
    }
    setLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      // Merge date + time into ISO string and send as scheduledDateTime (DB field name)
      let scheduledDateTime: string | null = null;
      if (timeType === "scheduled" && scheduledDate && scheduledTime) {
        const merged = new Date(scheduledDate);
        merged.setHours(scheduledTime.getHours(), scheduledTime.getMinutes(), 0, 0);
        scheduledDateTime = merged.toISOString();
      }
      const res = await fetch(`${BASE}/api/requests`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          customerId: user.id, category, details, timeType, area,
          offeredAmount: parseFloat(amount),
          ...(scheduledDateTime ? { scheduledDateTime } : {}),
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        Alert.alert("خطأ", d.error || "فشل نشر الطلب");
        return;
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setSubmitted(true);
      setCategory(""); setDetails(""); setArea(""); setAmount("");
      setTimeType("now"); setScheduledDate(null); setScheduledTime(null);
    } catch { Alert.alert("خطأ", "تعذر الاتصال بالخادم"); }
    finally { setLoading(false); }
  }

  const s = makeStyles(colors, insets.bottom);

  // ─── RTL category order: row-reverse already handles RTL positioning.
  // Row 1 data [transport, delivery, government] → transport=right, government=left
  // Row 2 data [shopping, home_services, labor]  → shopping=right, labor("أخرى")=left ✓
  const catRows = [CATEGORIES.slice(0, 3), CATEGORIES.slice(3, 6)] as const;

  return (
    <View style={s.container}>
      {/* Header */}
      <SafeAreaView edges={["top"]} style={s.headerSafe}>
        <View style={s.headerInner}>
          <ArabicText style={s.headerSub}>ماذا تحتاج اليوم؟</ArabicText>
          <ArabicText style={s.headerTitle}>ساعدني</ArabicText>
        </View>
      </SafeAreaView>

      <KeyboardAwareScrollViewCompat
        style={s.scroll}
        contentContainerStyle={s.content}
        bottomOffset={24}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Blocked banner */}
        {isBlocked && (
          <View style={s.alertBox}>
            <Ionicons name="shield-outline" size={18} color="#DC2626" />
            <ArabicText style={s.alertTxt}>تم تعطيل حسابك. يرجى التواصل مع الإدارة</ArabicText>
          </View>
        )}

        {/* Success banner */}
        {submitted && !isBlocked && (
          <View style={s.successBox}>
            <View style={s.successLeft}>
              <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
              <Text style={s.successTxt}>تم نشر طلبك بنجاح</Text>
            </View>
            <TouchableOpacity onPress={resetForm}>
              <Text style={s.newReqBtn}>+ طلب جديد</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Categories: 2 rows × 3 columns, RTL ── */}
        <ArabicText style={s.sectionLabel}>ساعدني في:</ArabicText>
        <View style={s.catGrid}>
          {catRows.map((row, rowIdx) => (
            <View key={rowIdx} style={s.catRow}>
              {/* flexDirection:"row-reverse" positions first item rightmost → natural RTL */}
              {row.map((cat) => (
                <TouchableOpacity
                  key={cat.value}
                  style={[s.catCard, category === cat.value && s.catCardActive]}
                  onPress={() => !isBlocked && setCategory(cat.value as CategoryValue)}
                  activeOpacity={0.8}
                  disabled={!!isBlocked}
                >
                  <View style={[s.catIconWrap, category === cat.value && s.catIconWrapActive]}>
                    <Ionicons
                      name={cat.icon as any}
                      size={26}
                      color={category === cat.value ? colors.primary : colors.mutedForeground}
                    />
                  </View>
                  <Text style={[s.catLabel, category === cat.value && s.catLabelActive]} numberOfLines={2}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>

        {/* Details */}
        <ArabicText style={s.sectionLabel}>تفاصيل الطلب</ArabicText>
        <TextInput
          style={[s.textarea, isBlocked && s.disabled]}
          value={details}
          onChangeText={setDetails}
          placeholder="مثال: أحتاج شخص ينقل أغراض من بوشر إلى الخوير"
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          textAlign="right"
          placeholderTextColor={colors.mutedForeground}
          editable={!isBlocked}
        />

        {/* Time type toggle */}
        <ArabicText style={s.sectionLabel}>الوقت</ArabicText>
        <View style={s.segmented}>
          {(["now", "scheduled"] as const).map((t) => (
            <TouchableOpacity
              key={t}
              style={[s.segBtn, timeType === t && s.segBtnActive]}
              onPress={() => { if (!isBlocked) { setTimeType(t); setScheduledDate(null); setScheduledTime(null); } }}
              activeOpacity={0.8}
              disabled={!!isBlocked}
            >
              <Ionicons
                name={t === "now" ? "flash" : "calendar-outline"}
                size={16}
                color={timeType === t ? colors.primaryForeground : colors.mutedForeground}
              />
              <Text style={[s.segTxt, timeType === t && s.segTxtActive]}>
                {t === "now" ? "الآن" : "لاحقاً"}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Date & time pickers (shown when "لاحقاً" selected) ── */}
        {timeType === "scheduled" && (
          <View style={s.scheduledCard}>
            <View style={s.scheduledHeader}>
              <Ionicons name="calendar" size={16} color={colors.primary} />
              <ArabicText style={[s.scheduledHeaderTxt, { flex: 1 }]}>اختر موعد الطلب</ArabicText>
            </View>

            {/* Date row */}
            <TouchableOpacity
              style={[s.dtBtn, scheduledDate && s.dtBtnFilled]}
              onPress={openDatePicker}
              activeOpacity={0.8}
            >
              <Ionicons
                name={scheduledDate ? "calendar" : "calendar-outline"}
                size={18}
                color={scheduledDate ? colors.primary : colors.mutedForeground}
              />
              <Text style={[s.dtTxt, !scheduledDate && s.dtPlaceholder]}>
                {scheduledDate ? formatDate(scheduledDate) : "اختر التاريخ"}
              </Text>
              <Ionicons name="chevron-down" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>

            {/* Time row */}
            <TouchableOpacity
              style={[s.dtBtn, scheduledTime && s.dtBtnFilled]}
              onPress={openTimePicker}
              activeOpacity={0.8}
            >
              <Ionicons
                name={scheduledTime ? "time" : "time-outline"}
                size={18}
                color={scheduledTime ? colors.primary : colors.mutedForeground}
              />
              <Text style={[s.dtTxt, !scheduledTime && s.dtPlaceholder]}>
                {scheduledTime ? formatTime(scheduledTime) : "اختر الوقت"}
              </Text>
              <Ionicons name="chevron-down" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>

            {/* Hint if missing */}
            {(!scheduledDate || !scheduledTime) && (
              <View style={s.dtHint}>
                <Ionicons name="information-circle-outline" size={14} color={colors.mutedForeground} />
                <Text style={s.dtHintTxt}>كلا الحقلين مطلوبان</Text>
              </View>
            )}
          </View>
        )}

        {/* Android: DateTimePicker renders as system dialog directly */}
        {Platform.OS === "android" && datePickerVisible && (
          <DateTimePicker
            value={tempDate}
            mode="date"
            display="default"
            minimumDate={new Date()}
            onChange={(_: DateTimePickerEvent, date?: Date) => {
              setDatePickerVisible(false);
              if (date) setScheduledDate(date);
            }}
          />
        )}
        {Platform.OS === "android" && timePickerVisible && (
          <DateTimePicker
            value={tempTime}
            mode="time"
            display="default"
            is24Hour={false}
            onChange={(_: DateTimePickerEvent, date?: Date) => {
              setTimePickerVisible(false);
              if (date) setScheduledTime(date);
            }}
          />
        )}

        {/* Area */}
        <ArabicText style={s.sectionLabel}>المنطقة</ArabicText>
        <TouchableOpacity
          style={[s.picker, isBlocked && s.disabled]}
          onPress={() => !isBlocked && setAreaPickerVisible(true)}
          activeOpacity={0.8}
        >
          <Ionicons name="chevron-down" size={18} color={colors.mutedForeground} />
          <Text style={[s.pickerTxt, !area && s.pickerPlaceholder]}>
            {area || "اختر المنطقة"}
          </Text>
          <Ionicons name="location-outline" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>

        {/* Amount */}
        <ArabicText style={s.sectionLabel}>المبلغ المدفوع</ArabicText>
        <View style={[s.amountRow, isBlocked && s.disabled]}>
          <Text style={s.currencyLabel}>ر.ع.</Text>
          <TextInput
            style={s.amountInput}
            value={amount}
            onChangeText={t => setAmount(t.replace(/[^0-9.]/g, ""))}
            placeholder="0.000"
            keyboardType="decimal-pad"
            textAlign="right"
            placeholderTextColor={colors.mutedForeground}
            editable={!isBlocked}
          />
        </View>

        {/* Submit */}
        <TouchableOpacity
          style={[s.submitBtn, (loading || !!isBlocked) && s.submitDisabled]}
          onPress={handleSubmit}
          disabled={loading || !!isBlocked}
          activeOpacity={0.85}
        >
          {loading
            ? <ActivityIndicator color={colors.primaryForeground} />
            : (
              <View style={s.submitInner}>
                <Ionicons name="arrow-up-circle" size={20} color={colors.primaryForeground} />
                <Text style={s.submitTxt}>{isBlocked ? "الحساب معطّل" : "انشر الطلب"}</Text>
              </View>
            )}
        </TouchableOpacity>
      </KeyboardAwareScrollViewCompat>

      {/* ── iOS Date picker modal (spinner style) ── */}
      <Modal
        visible={Platform.OS === "ios" && datePickerVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
      >
        <TouchableOpacity style={s.overlay} onPress={() => setDatePickerVisible(false)} activeOpacity={1} />
        <SafeAreaView edges={["bottom"]} style={s.dtSheet}>
          <View style={s.dtSheetHandle} />
          <View style={s.dtSheetToolbar}>
            <TouchableOpacity onPress={() => setDatePickerVisible(false)} style={s.dtDismissBtn}>
              <Text style={s.dtDismissTxt}>إلغاء</Text>
            </TouchableOpacity>
            <Text style={s.dtSheetTitle}>اختر التاريخ</Text>
            <TouchableOpacity onPress={confirmDate} style={s.dtConfirmBtn}>
              <Text style={s.dtConfirmTxt}>تأكيد</Text>
            </TouchableOpacity>
          </View>
          <DateTimePicker
            value={tempDate}
            mode="date"
            display="spinner"
            minimumDate={new Date()}
            onChange={(_: DateTimePickerEvent, date?: Date) => { if (date) setTempDate(date); }}
            style={s.dtPicker}
            textColor={colors.foreground}
          />
        </SafeAreaView>
      </Modal>

      {/* ── iOS Time picker modal (spinner style) ── */}
      <Modal
        visible={Platform.OS === "ios" && timePickerVisible}
        transparent
        animationType="slide"
        statusBarTranslucent
      >
        <TouchableOpacity style={s.overlay} onPress={() => setTimePickerVisible(false)} activeOpacity={1} />
        <SafeAreaView edges={["bottom"]} style={s.dtSheet}>
          <View style={s.dtSheetHandle} />
          <View style={s.dtSheetToolbar}>
            <TouchableOpacity onPress={() => setTimePickerVisible(false)} style={s.dtDismissBtn}>
              <Text style={s.dtDismissTxt}>إلغاء</Text>
            </TouchableOpacity>
            <Text style={s.dtSheetTitle}>اختر الوقت</Text>
            <TouchableOpacity onPress={confirmTime} style={s.dtConfirmBtn}>
              <Text style={s.dtConfirmTxt}>تأكيد</Text>
            </TouchableOpacity>
          </View>
          <DateTimePicker
            value={tempTime}
            mode="time"
            display="spinner"
            is24Hour={false}
            onChange={(_: DateTimePickerEvent, date?: Date) => { if (date) setTempTime(date); }}
            style={s.dtPicker}
            textColor={colors.foreground}
          />
        </SafeAreaView>
      </Modal>

      {/* Area picker modal */}
      <Modal visible={areaPickerVisible} transparent animationType="slide" statusBarTranslucent>
        <TouchableOpacity style={s.overlay} onPress={() => setAreaPickerVisible(false)} activeOpacity={1} />
        <SafeAreaView edges={["bottom"]} style={s.sheet}>
          <View style={s.sheetHandle} />
          <Text style={s.sheetTitle}>اختر المنطقة</Text>
          <FlatList
            data={AREAS}
            keyExtractor={i => i}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[s.areaRow, area === item && s.areaRowActive]}
                onPress={() => { setArea(item); setAreaPickerVisible(false); }}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={area === item ? "checkmark-circle" : "location-outline"}
                  size={18}
                  color={area === item ? colors.primary : colors.mutedForeground}
                />
                <Text style={[s.areaTxt, area === item && s.areaTxtActive]}>{item}</Text>
              </TouchableOpacity>
            )}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const makeStyles = (c: ReturnType<typeof useColors>, bottomInset: number) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    headerSafe: { backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.border },
    headerInner: { paddingHorizontal: 20, paddingVertical: 14 },
    headerTitle: { fontSize: 26, fontWeight: "800", color: c.primary, textAlign: "right" },
    headerSub: { fontSize: 13, color: c.mutedForeground, textAlign: "right" },
    scroll: { flex: 1 },
    content: { padding: 16, paddingBottom: bottomInset + 100 },

    alertBox: {
      backgroundColor: "#FEE2E2", borderRadius: 12, padding: 14,
      flexDirection: "row-reverse", alignItems: "center", gap: 10, marginBottom: 16,
    },
    alertTxt: { color: "#DC2626", fontSize: 14, fontWeight: "600", flex: 1, textAlign: "right" },
    successBox: {
      backgroundColor: c.secondary, borderRadius: 12, padding: 14,
      flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 16,
    },
    successLeft: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
    successTxt: { color: c.secondaryForeground, fontSize: 14, fontWeight: "600" },
    newReqBtn: { color: c.primary, fontSize: 14, fontWeight: "700" },

    sectionLabel: {
      fontSize: 14, fontWeight: "700", color: c.foreground,
      textAlign: "right", marginBottom: 10, marginTop: 4,
    },

    // ── Category grid ──
    catGrid: { gap: 10, marginBottom: 20 },
    catRow: { flexDirection: "row-reverse", gap: 10 },
    catCard: {
      flex: 1, borderWidth: 2, borderColor: c.border, borderRadius: 16,
      paddingVertical: 14, paddingHorizontal: 6,
      alignItems: "center", gap: 8, backgroundColor: c.card,
    },
    catCardActive: { borderColor: c.primary, backgroundColor: c.secondary },
    catIconWrap: {
      width: 48, height: 48, borderRadius: 14,
      backgroundColor: c.muted, alignItems: "center", justifyContent: "center",
    },
    catIconWrapActive: { backgroundColor: c.secondary },
    catLabel: { fontSize: 11, color: c.mutedForeground, textAlign: "center", fontWeight: "600", lineHeight: 14 },
    catLabelActive: { color: c.primary, fontWeight: "700" },

    textarea: {
      borderWidth: 1.5, borderColor: c.border, borderRadius: 14, padding: 14,
      fontSize: 15, color: c.foreground, backgroundColor: c.card,
      minHeight: 110, textAlign: "right", marginBottom: 20, lineHeight: 22,
    },
    disabled: { opacity: 0.4 },

    // ── Time toggle ──
    segmented: {
      flexDirection: "row-reverse", backgroundColor: c.muted, borderRadius: 12,
      padding: 4, marginBottom: 16,
    },
    segBtn: {
      flex: 1, paddingVertical: 10, borderRadius: 10,
      flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 6,
    },
    segBtnActive: { backgroundColor: c.primary },
    segTxt: { fontSize: 14, color: c.mutedForeground, fontWeight: "600" },
    segTxtActive: { color: c.primaryForeground, fontWeight: "700" },

    // ── Scheduled date/time card ──
    scheduledCard: {
      backgroundColor: c.card, borderRadius: 16, borderWidth: 1.5,
      borderColor: c.border, padding: 14, gap: 10, marginBottom: 20,
    },
    scheduledHeader: {
      flexDirection: "row-reverse", alignItems: "center", gap: 8,
      paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: c.border,
    },
    scheduledHeaderTxt: { fontSize: 14, fontWeight: "700", color: c.foreground, textAlign: "right" },

    dtBtn: {
      flexDirection: "row-reverse", alignItems: "center", gap: 10,
      backgroundColor: c.muted, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14,
      borderWidth: 1.5, borderColor: c.border,
    },
    dtBtnFilled: { borderColor: c.primary, backgroundColor: c.secondary },
    dtTxt: { flex: 1, fontSize: 14, fontWeight: "600", color: c.foreground, textAlign: "right" },
    dtPlaceholder: { color: c.mutedForeground, fontWeight: "400" },

    dtHint: { flexDirection: "row-reverse", alignItems: "center", gap: 5, paddingTop: 2 },
    dtHintTxt: { fontSize: 12, color: c.mutedForeground },

    // ── iOS picker sheet ──
    dtSheet: {
      backgroundColor: c.card,
      borderTopLeftRadius: 24, borderTopRightRadius: 24,
      paddingTop: 8,
    },
    dtSheetHandle: {
      width: 36, height: 4, borderRadius: 2, backgroundColor: c.border,
      alignSelf: "center", marginBottom: 4,
    },
    dtSheetToolbar: {
      flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: 20, paddingVertical: 12,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    dtSheetTitle: { fontSize: 16, fontWeight: "700", color: c.foreground },
    dtConfirmBtn: { paddingHorizontal: 4, paddingVertical: 4 },
    dtConfirmTxt: { fontSize: 16, fontWeight: "700", color: c.primary },
    dtDismissBtn: { paddingHorizontal: 4, paddingVertical: 4 },
    dtDismissTxt: { fontSize: 15, color: c.mutedForeground },
    dtPicker: { width: "100%", height: 200 },

    // ── Area picker ──
    picker: {
      borderWidth: 1.5, borderColor: c.border, borderRadius: 14, paddingHorizontal: 16,
      paddingVertical: 14, flexDirection: "row-reverse", alignItems: "center",
      backgroundColor: c.card, gap: 8, marginBottom: 20,
    },
    pickerTxt: { flex: 1, fontSize: 15, color: c.foreground, textAlign: "right", fontWeight: "500" },
    pickerPlaceholder: { color: c.mutedForeground, fontWeight: "400" },

    amountRow: {
      flexDirection: "row-reverse", alignItems: "center", borderWidth: 1.5,
      borderColor: c.border, borderRadius: 14, backgroundColor: c.card, marginBottom: 24, overflow: "hidden",
    },
    currencyLabel: {
      paddingHorizontal: 16, fontSize: 14, color: c.mutedForeground, fontWeight: "700",
      borderRightWidth: 1.5, borderRightColor: c.border, paddingVertical: 14, backgroundColor: c.muted,
    },
    amountInput: {
      flex: 1, fontSize: 17, color: c.foreground, paddingHorizontal: 16,
      textAlign: "right", paddingVertical: 14,
    },

    submitBtn: {
      backgroundColor: c.primary, borderRadius: 14, paddingVertical: 17, alignItems: "center",
      shadowColor: c.primary, shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3, shadowRadius: 10, elevation: 6,
    },
    submitDisabled: { opacity: 0.4, shadowOpacity: 0 },
    submitInner: { flexDirection: "row-reverse", alignItems: "center", gap: 10 },
    submitTxt: { color: c.primaryForeground, fontSize: 17, fontWeight: "700" },

    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
    sheet: {
      backgroundColor: c.card, borderTopLeftRadius: 24, borderTopRightRadius: 24,
      maxHeight: "65%", paddingTop: 8,
    },
    sheetHandle: {
      width: 36, height: 4, borderRadius: 2, backgroundColor: c.border,
      alignSelf: "center", marginBottom: 8,
    },
    sheetTitle: {
      fontSize: 17, fontWeight: "700", color: c.foreground,
      textAlign: "center", paddingBottom: 8,
      borderBottomWidth: 1, borderBottomColor: c.border,
    },
    areaRow: {
      flexDirection: "row-reverse", alignItems: "center", gap: 12,
      paddingHorizontal: 20, paddingVertical: 15,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border,
    },
    areaRowActive: { backgroundColor: c.secondary },
    areaTxt: { fontSize: 15, color: c.foreground, flex: 1, textAlign: "right", fontWeight: "500" },
    areaTxtActive: { color: c.primary, fontWeight: "700" },
  });
