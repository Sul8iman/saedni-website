import React, { useState, useRef } from "react";
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Modal, TextInput,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useColors } from "@/hooks/useColors";
import { CATEGORIES, STATUS_INFO } from "@/constants/categories";

const BASE = `https://${process.env.EXPO_PUBLIC_DOMAIN ?? "saedni.onrender.com"}`;

interface UserDetail {
  id: number;
  name: string;
  phone: string;
  userType: string;
  area?: string | null;
  rating?: number | null;
  isVerified: boolean;
  isBlocked: boolean;
  isActive: boolean;
  otpCode?: string | null;
  otpCreatedAt?: string | null;
  createdAt: string;
  lastLogin?: string | null;
}

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
  helperName?: string | null;
}

const USER_TYPE_LABEL: Record<string, string> = {
  customer: "عميل",
  helper: "مساعد",
  admin: "مدير",
};

const ACTIVE_STATUSES = ["available", "accepted", "in_progress"];

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const dd = d.getDate().toString().padStart(2, "0");
  const mm = (d.getMonth() + 1).toString().padStart(2, "0");
  const yyyy = d.getFullYear();
  let h = d.getHours();
  const min = d.getMinutes().toString().padStart(2, "0");
  const period = h >= 12 ? "مساءً" : "صباحاً";
  h = h % 12 || 12;
  return `${dd}/${mm}/${yyyy} — ${h}:${min} ${period}`;
}

function InfoRow({ icon, label, value, valueColor }: {
  icon: string; label: string; value: string; valueColor?: string;
}) {
  const colors = useColors();
  const s = infoStyles(colors);
  return (
    <View style={s.row}>
      <Text style={[s.value, valueColor ? { color: valueColor } : {}]}>{value}</Text>
      <View style={s.labelGroup}>
        <Ionicons name={icon as any} size={15} color={colors.mutedForeground} />
        <Text style={s.label}>{label}</Text>
      </View>
    </View>
  );
}

const infoStyles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  row: {
    flexDirection: "row-reverse",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.border,
  },
  labelGroup: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  label: { fontSize: 14, color: c.mutedForeground, fontWeight: "500" },
  value: { fontSize: 14, color: c.foreground, fontWeight: "600", textAlign: "left", flexShrink: 1, marginStart: 8 },
});

export default function UserDetailScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { id, fallbackPhone, fallbackTime } = useLocalSearchParams<{
    id: string;
    fallbackPhone?: string;
    fallbackTime?: string;
  }>();
  const userId = Number(id);
  const [otpModalVisible, setOtpModalVisible] = useState(false);
  const otpInputRef = useRef<TextInput>(null);

  const { data: user, isLoading: userLoading } = useQuery<UserDetail>({
    queryKey: ["admin-user-detail", userId],
    queryFn: async () => {
      const r = await fetch(`${BASE}/api/users/${userId}`, { credentials: "include" });
      if (!r.ok) throw new Error("فشل تحميل المستخدم");
      return r.json();
    },
    enabled: !!userId,
  });

  const { data: requests, isLoading: reqLoading } = useQuery<HelpRequest[]>({
    queryKey: ["admin-user-requests", userId, user?.userType],
    queryFn: async () => {
      if (!user) return [];
      let url = `${BASE}/api/requests`;
      if (user.userType === "customer") url += `?customerId=${userId}`;
      else if (user.userType === "helper") url += `?helperId=${userId}`;
      else return [];
      const r = await fetch(url, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!user,
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async (isActive: boolean) => {
      const r = await fetch(`${BASE}/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isActive }),
      });
      if (!r.ok) throw new Error();
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["admin-user-detail", userId] });
      qc.invalidateQueries({ queryKey: ["admin-users"] });
    },
    onError: () => Alert.alert("خطأ", "تعذر تحديث حالة المستخدم"),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${BASE}/api/admin/users/${userId}/delete`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!r.ok) throw new Error();
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      router.back();
    },
    onError: () => Alert.alert("خطأ", "تعذر حذف المستخدم"),
  });

  const s = makeStyles(colors, insets.bottom);
  const catLabel = (v: string) => CATEGORIES.find(c => c.value === v)?.label ?? v;

  if (userLoading) {
    return (
      <View style={[s.container, s.centered]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!user) {
    if (fallbackPhone) {
      return (
        <View style={s.container}>
          <SafeAreaView edges={["top"]} style={s.headerSafe}>
            <View style={s.headerInner}>
              <Text style={s.headerTitle}>تفاصيل الطلب</Text>
              <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
                <Ionicons name="arrow-forward" size={22} color={colors.foreground} />
                <Text style={s.backTxt}>رجوع</Text>
              </TouchableOpacity>
            </View>
          </SafeAreaView>
          <ScrollView contentContainerStyle={[s.content, { paddingBottom: 48 }]}>
            <View style={s.profileCard}>
              <View style={[s.avatar, { backgroundColor: "#FEF3C7" }]}>
                <Ionicons name="key-outline" size={32} color="#92400E" />
              </View>
              <Text style={s.profileName}>{fallbackPhone}</Text>
              <Text style={s.profilePhone}>طلب رمز تحقق</Text>
              <View style={s.badgeRow}>
                <View style={[s.badge, { backgroundColor: "#FEF3C7" }]}>
                  <Text style={[s.badgeTxt, { color: "#92400E" }]}>OTP</Text>
                </View>
              </View>
            </View>
            <View style={s.section}>
              <Text style={s.sectionTitle}>تفاصيل الطلب</Text>
              <View style={s.infoCard}>
                <InfoRow icon="call-outline" label="رقم الهاتف" value={fallbackPhone} />
                {fallbackTime && (
                  <InfoRow icon="time-outline" label="وقت الطلب" value={fmtDate(fallbackTime)} />
                )}
                <InfoRow icon="information-circle-outline" label="نوع الطلب" value="طلب رمز تحقق (OTP)" />
              </View>
            </View>
            <View style={[s.section, { alignItems: "center", paddingVertical: 16 }]}>
              <Ionicons name="person-add-outline" size={40} color={colors.border} />
              <Text style={[s.emptyTxt, { marginTop: 8 }]}>لم يكتمل إنشاء حساب لهذا الرقم بعد</Text>
            </View>
          </ScrollView>
        </View>
      );
    }
    return (
      <View style={[s.container, s.centered]}>
        <Ionicons name="person-remove-outline" size={56} color={colors.border} />
        <Text style={s.emptyTxt}>المستخدم غير موجود</Text>
        <TouchableOpacity onPress={() => router.back()} style={s.backFallback}>
          <Text style={s.backFallbackTxt}>رجوع</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const activeReqs = (requests ?? []).filter(r => ACTIVE_STATUSES.includes(r.status));
  const pastReqs = (requests ?? []).filter(r => !ACTIVE_STATUSES.includes(r.status));
  const isHelper = user.userType === "helper";
  const isAdmin = user.userType === "admin";

  return (
    <View style={s.container}>
      {/* Header */}
      <SafeAreaView edges={["top"]} style={s.headerSafe}>
        <View style={s.headerInner}>
          <Text style={s.headerTitle}>ملف المستخدم</Text>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-forward" size={22} color={colors.foreground} />
            <Text style={s.backTxt}>رجوع</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <ScrollView
        style={s.scroll}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Card */}
        <View style={s.profileCard}>
          <View style={[s.avatar, isHelper && s.avatarHelper, isAdmin && s.avatarAdmin]}>
            <Text style={s.avatarTxt}>{user.name?.[0] ?? "؟"}</Text>
          </View>
          <Text style={s.profileName}>{user.name}</Text>
          <Text style={s.profilePhone}>{user.phone}</Text>

          {/* Badges */}
          <View style={s.badgeRow}>
            <View style={[s.badge, isHelper ? s.badgeHelper : isAdmin ? s.badgeAdmin : s.badgeCustomer]}>
              <Text style={[s.badgeTxt, isHelper ? s.badgeTxtHelper : isAdmin ? s.badgeTxtAdmin : s.badgeTxtCustomer]}>
                {USER_TYPE_LABEL[user.userType] ?? user.userType}
              </Text>
            </View>
            <View style={[s.badge, user.isActive ? s.badgeActive : s.badgeInactive]}>
              <Text style={[s.badgeTxt, user.isActive ? s.badgeTxtActive : s.badgeTxtInactive]}>
                {user.isActive ? "مفعّل" : "معطّل"}
              </Text>
            </View>
            {isHelper && (
              <View style={[s.badge, user.isVerified ? s.badgeVerified : s.badgePending]}>
                <Text style={[s.badgeTxt, user.isVerified ? s.badgeTxtVerified : s.badgeTxtPending]}>
                  {user.isVerified ? "موثّق" : "غير موثّق"}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Details Section */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>تفاصيل الحساب</Text>
          <View style={s.infoCard}>
            <InfoRow icon="person-outline" label="الاسم الكامل" value={user.name} />
            <InfoRow icon="call-outline" label="رقم الهاتف" value={user.phone} />
            <InfoRow icon="briefcase-outline" label="نوع الحساب" value={USER_TYPE_LABEL[user.userType] ?? user.userType} />
            <InfoRow
              icon="toggle-outline"
              label="حالة الحساب"
              value={user.isActive ? "مفعّل" : "معطّل"}
              valueColor={user.isActive ? colors.primary : "#DC2626"}
            />
            {isHelper && (
              <InfoRow
                icon="shield-checkmark-outline"
                label="حالة التحقق"
                value={user.isVerified ? "موثّق" : "غير موثّق"}
                valueColor={user.isVerified ? colors.primary : "#F59E0B"}
              />
            )}
            {user.area ? (
              <InfoRow icon="location-outline" label="المنطقة" value={user.area} />
            ) : null}
            <InfoRow icon="calendar-outline" label="تاريخ التسجيل" value={fmtDate(user.createdAt)} />
            <InfoRow icon="time-outline" label="آخر تسجيل دخول" value={fmtDate(user.lastLogin)} />
          </View>
        </View>

        {/* OTP Section (only if OTP present) */}
        {(user.otpCode || user.otpCreatedAt) && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>رمز OTP</Text>
            <View style={s.infoCard}>
              {user.otpCode && (
                <View style={s.otpRow}>
                  <TouchableOpacity
                    style={s.otpCopyBtn}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setOtpModalVisible(true);
                    }}
                    activeOpacity={0.75}
                  >
                    <Ionicons name="copy-outline" size={15} color={colors.primary} />
                    <Text style={s.otpCopyTxt}>نسخ</Text>
                  </TouchableOpacity>
                  <View style={s.otpCodeGroup}>
                    <Text style={s.otpCode}>{user.otpCode}</Text>
                    <View style={s.otpLabelGroup}>
                      <Ionicons name="key-outline" size={15} color={colors.mutedForeground} />
                      <Text style={s.otpLabel}>الرمز الحالي</Text>
                    </View>
                  </View>
                </View>
              )}
              {user.otpCreatedAt && (
                <InfoRow icon="time-outline" label="وقت الإنشاء" value={fmtDate(user.otpCreatedAt)} />
              )}
            </View>
          </View>
        )}

        {/* Actions Section */}
        {!isAdmin && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>الإجراءات</Text>
            <View style={s.actionsCard}>
              <TouchableOpacity
                style={[s.actionBtn, user.isActive ? s.actionBtnDeactivate : s.actionBtnActivate]}
                onPress={() =>
                  Alert.alert(
                    user.isActive ? "تعطيل المستخدم" : "تفعيل المستخدم",
                    user.isActive
                      ? `هل تريد تعطيل حساب ${user.name}؟`
                      : `هل تريد تفعيل حساب ${user.name}؟`,
                    [
                      { text: "إلغاء", style: "cancel" },
                      {
                        text: user.isActive ? "تعطيل" : "تفعيل",
                        onPress: () => toggleActiveMutation.mutate(!user.isActive),
                      },
                    ]
                  )
                }
                disabled={toggleActiveMutation.isPending}
              >
                <Ionicons
                  name={user.isActive ? "ban-outline" : "checkmark-circle-outline"}
                  size={18}
                  color={user.isActive ? "#DC2626" : colors.primary}
                />
                <Text style={[s.actionBtnTxt, { color: user.isActive ? "#DC2626" : colors.primary }]}>
                  {user.isActive ? "تعطيل المستخدم" : "تفعيل المستخدم"}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={s.actionBtnDelete}
                onPress={() =>
                  Alert.alert("حذف المستخدم", `سيتم حذف حساب ${user.name} نهائياً ولا يمكن التراجع.`, [
                    { text: "إلغاء", style: "cancel" },
                    { text: "حذف", style: "destructive", onPress: () => deleteMutation.mutate() },
                  ])
                }
                disabled={deleteMutation.isPending}
              >
                <Ionicons name="trash-outline" size={18} color="#DC2626" />
                <Text style={s.deleteTxt}>حذف المستخدم</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Requests Section */}
        {!isAdmin && (
          <View style={s.section}>
            <View style={s.reqSectionHeader}>
              <Text style={s.sectionTitle}>الطلبات</Text>
              {!reqLoading && (
                <View style={s.reqCountBadge}>
                  <Text style={s.reqCountTxt}>{(requests ?? []).length}</Text>
                </View>
              )}
            </View>

            {reqLoading ? (
              <View style={s.reqLoading}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            ) : (requests ?? []).length === 0 ? (
              <View style={s.emptyRequests}>
                <Ionicons name="document-text-outline" size={40} color={colors.border} />
                <Text style={s.emptyReqTxt}>لا توجد طلبات مرتبطة</Text>
              </View>
            ) : (
              <>
                {/* Current requests */}
                {activeReqs.length > 0 && (
                  <>
                    <View style={s.reqGroupHeader}>
                      <View style={s.reqGroupDot} />
                      <Text style={s.reqGroupTitle}>الطلبات الحالية ({activeReqs.length})</Text>
                    </View>
                    {activeReqs.map(req => (
                      <RequestCard key={req.id} req={req} catLabel={catLabel} colors={colors} />
                    ))}
                  </>
                )}

                {/* Past requests */}
                {pastReqs.length > 0 && (
                  <>
                    <View style={[s.reqGroupHeader, { marginTop: activeReqs.length > 0 ? 8 : 0 }]}>
                      <View style={[s.reqGroupDot, { backgroundColor: colors.mutedForeground }]} />
                      <Text style={[s.reqGroupTitle, { color: colors.mutedForeground }]}>
                        الطلبات السابقة ({pastReqs.length})
                      </Text>
                    </View>
                    {pastReqs.map(req => (
                      <RequestCard key={req.id} req={req} catLabel={catLabel} colors={colors} />
                    ))}
                  </>
                )}
              </>
            )}
          </View>
        )}
      </ScrollView>

      {/* OTP Copy Modal */}
      <Modal
        visible={otpModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setOtpModalVisible(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>رمز التحقق</Text>
            <Text style={s.modalHint}>اضغط مطولاً على الرمز لنسخه</Text>
            <TextInput
              ref={otpInputRef}
              style={s.modalOtpInput}
              value={user?.otpCode ?? ""}
              selectTextOnFocus
              contextMenuHidden={false}
              editable
              caretHidden
              onChangeText={() => {}}
            />
            <TouchableOpacity
              style={s.modalCloseBtn}
              onPress={() => setOtpModalVisible(false)}
              activeOpacity={0.8}
            >
              <Text style={s.modalCloseTxt}>إغلاق</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function RequestCard({
  req, catLabel, colors,
}: {
  req: HelpRequest;
  catLabel: (v: string) => string;
  colors: ReturnType<typeof useColors>;
}) {
  const st = STATUS_INFO[req.status] ?? { label: req.status, color: "#6B7280", bg: "#F3F4F6" };
  const s = reqCardStyles(colors);

  function fmtTime() {
    if (req.timeType === "now") return "الآن";
    if (req.scheduledDateTime) {
      const d = new Date(req.scheduledDateTime);
      const dd = d.getDate().toString().padStart(2, "0");
      const mm = (d.getMonth() + 1).toString().padStart(2, "0");
      const yyyy = d.getFullYear();
      let h = d.getHours();
      const min = d.getMinutes().toString().padStart(2, "0");
      const period = h >= 12 ? "مساءً" : "صباحاً";
      h = h % 12 || 12;
      return `${dd}/${mm}/${yyyy} — ${h}:${min} ${period}`;
    }
    return "لاحقاً";
  }

  function fmtDate(iso: string) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    const dd = d.getDate().toString().padStart(2, "0");
    const mm = (d.getMonth() + 1).toString().padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }

  return (
    <View style={s.card}>
      {/* Top row */}
      <View style={s.topRow}>
        <View style={[s.statusBadge, { backgroundColor: st.bg }]}>
          <Text style={[s.statusTxt, { color: st.color }]}>{st.label}</Text>
        </View>
        <Text style={s.category}>{catLabel(req.category)}</Text>
      </View>

      {/* Details */}
      <Text style={s.details} numberOfLines={2}>{req.details}</Text>

      {/* Meta rows */}
      <View style={s.metaRow}>
        <Ionicons name="location-outline" size={13} color={colors.mutedForeground} />
        <Text style={s.metaTxt}>{req.area}</Text>
        <View style={s.dot} />
        <Ionicons name={req.timeType === "now" ? "flash" : "calendar-outline"} size={13} color={colors.mutedForeground} />
        <Text style={s.metaTxt}>{fmtTime()}</Text>
      </View>
      <View style={s.metaRow}>
        <Ionicons name="cash-outline" size={13} color={colors.primary} />
        <Text style={[s.metaTxt, { color: colors.primary, fontWeight: "700" }]}>{req.offeredAmount} ر.ع.</Text>
        <View style={s.dot} />
        <Ionicons name="time-outline" size={13} color={colors.mutedForeground} />
        <Text style={s.metaTxt}>تاريخ النشر: {fmtDate(req.createdAt)}</Text>
      </View>
    </View>
  );
}

const reqCardStyles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  card: {
    backgroundColor: c.muted,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    padding: 12,
    marginBottom: 8,
  },
  topRow: { flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  category: { fontSize: 14, fontWeight: "700", color: c.foreground },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusTxt: { fontSize: 11, fontWeight: "700" },
  details: { fontSize: 13, color: c.mutedForeground, textAlign: "right", marginBottom: 8 },
  metaRow: { flexDirection: "row-reverse", alignItems: "center", gap: 5, marginBottom: 4 },
  metaTxt: { fontSize: 12, color: c.mutedForeground },
  dot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: c.mutedForeground },
});

const makeStyles = (c: ReturnType<typeof useColors>, _bottomInset: number) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.background },
    centered: { alignItems: "center", justifyContent: "center" },
    scroll: { flex: 1 },
    content: { padding: 16 },

    // Header
    headerSafe: { backgroundColor: c.card, borderBottomWidth: 1, borderBottomColor: c.border },
    headerInner: {
      paddingHorizontal: 16, paddingVertical: 12,
      flexDirection: "row-reverse", alignItems: "center", justifyContent: "space-between",
    },
    headerTitle: { fontSize: 18, fontWeight: "800", color: c.foreground },
    backBtn: { flexDirection: "row-reverse", alignItems: "center", gap: 4, padding: 4 },
    backTxt: { fontSize: 15, color: c.foreground, fontWeight: "600" },

    // Profile card
    profileCard: {
      backgroundColor: c.card, borderRadius: 20, borderWidth: 1, borderColor: c.border,
      padding: 20, alignItems: "center", marginBottom: 16,
      shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
    },
    avatar: {
      width: 72, height: 72, borderRadius: 36, backgroundColor: c.muted,
      alignItems: "center", justifyContent: "center", marginBottom: 12,
    },
    avatarHelper: { backgroundColor: c.primary },
    avatarAdmin: { backgroundColor: "#6366F1" },
    avatarTxt: { fontSize: 30, fontWeight: "800", color: c.primaryForeground },
    profileName: { fontSize: 20, fontWeight: "800", color: c.foreground, marginBottom: 4 },
    profilePhone: { fontSize: 14, color: c.mutedForeground, marginBottom: 12 },
    badgeRow: { flexDirection: "row-reverse", gap: 8, flexWrap: "wrap", justifyContent: "center" },
    badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
    badgeTxt: { fontSize: 12, fontWeight: "700" },
    badgeCustomer: { backgroundColor: "#EFF6FF" },
    badgeTxtCustomer: { color: "#1D4ED8" },
    badgeHelper: { backgroundColor: c.secondary },
    badgeTxtHelper: { color: c.primary },
    badgeAdmin: { backgroundColor: "#EDE9FE" },
    badgeTxtAdmin: { color: "#6366F1" },
    badgeActive: { backgroundColor: c.secondary },
    badgeTxtActive: { color: c.primary },
    badgeInactive: { backgroundColor: "#FEE2E2" },
    badgeTxtInactive: { color: "#DC2626" },
    badgeVerified: { backgroundColor: c.secondary },
    badgeTxtVerified: { color: c.primary },
    badgePending: { backgroundColor: "#FEF3C7" },
    badgeTxtPending: { color: "#92400E" },

    // OTP copy row
    otpRow: {
      flexDirection: "row-reverse",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 11,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
    },
    otpCodeGroup: { flexDirection: "row-reverse", alignItems: "center", gap: 8 },
    otpLabelGroup: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
    otpCode: { fontSize: 22, fontWeight: "800", color: c.primary, letterSpacing: 4, textAlign: "left" },
    otpLabel: { fontSize: 14, color: c.mutedForeground, fontWeight: "500" },
    otpCopyBtn: {
      flexDirection: "row-reverse", alignItems: "center", gap: 5,
      backgroundColor: c.secondary, borderRadius: 8,
      paddingHorizontal: 12, paddingVertical: 6,
      borderWidth: 1, borderColor: c.primary + "30",
    },
    otpCopyTxt: { fontSize: 13, fontWeight: "600", color: c.primary },

    // OTP modal
    modalOverlay: {
      flex: 1, backgroundColor: "rgba(0,0,0,0.55)",
      justifyContent: "center", alignItems: "center",
    },
    modalCard: {
      backgroundColor: c.card, borderRadius: 20, paddingHorizontal: 28,
      paddingTop: 28, paddingBottom: 20, width: "80%", alignItems: "center",
      shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.18, shadowRadius: 12, elevation: 8,
    },
    modalTitle: { fontSize: 18, fontWeight: "700", color: c.foreground, marginBottom: 6 },
    modalHint: { fontSize: 13, color: c.mutedForeground, marginBottom: 18, textAlign: "center" },
    modalOtpInput: {
      fontSize: 32, fontWeight: "800", color: c.primary, letterSpacing: 6,
      textAlign: "center", borderWidth: 1.5, borderColor: c.primary + "40",
      borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12,
      backgroundColor: c.secondary, width: "100%", marginBottom: 20,
    },
    modalCloseBtn: {
      backgroundColor: c.primary, borderRadius: 10,
      paddingHorizontal: 32, paddingVertical: 10,
    },
    modalCloseTxt: { fontSize: 15, fontWeight: "700", color: "#fff" },

    // Sections
    section: { marginBottom: 16 },
    sectionTitle: { fontSize: 16, fontWeight: "700", color: c.foreground, textAlign: "right", marginBottom: 10 },
    infoCard: {
      backgroundColor: c.card, borderRadius: 14, borderWidth: 1, borderColor: c.border,
      paddingHorizontal: 16, paddingTop: 4, paddingBottom: 0,
      shadowColor: "#000", shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
    },

    // Actions
    actionsCard: { gap: 10 },
    actionBtn: {
      flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8,
      borderRadius: 12, paddingVertical: 13, borderWidth: 1,
    },
    actionBtnActivate: { backgroundColor: c.secondary, borderColor: c.primary + "40" },
    actionBtnDeactivate: { backgroundColor: "#FEF2F2", borderColor: "#FECACA" },
    actionBtnDelete: {
      flexDirection: "row-reverse", alignItems: "center", justifyContent: "center", gap: 8,
      borderRadius: 12, paddingVertical: 13, borderWidth: 1,
      backgroundColor: "#FEF2F2", borderColor: "#FECACA",
    },
    actionBtnTxt: { fontSize: 15, fontWeight: "700" },
    deleteTxt: { fontSize: 15, fontWeight: "700", color: "#DC2626" },

    // Requests
    reqSectionHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 10 },
    reqCountBadge: {
      backgroundColor: c.primary, borderRadius: 10,
      minWidth: 22, height: 22, alignItems: "center", justifyContent: "center", paddingHorizontal: 6,
    },
    reqCountTxt: { fontSize: 12, fontWeight: "800", color: c.primaryForeground },
    reqLoading: { alignItems: "center", paddingVertical: 20 },
    emptyRequests: { alignItems: "center", paddingVertical: 28, gap: 8 },
    emptyReqTxt: { fontSize: 14, color: c.mutedForeground },
    reqGroupHeader: { flexDirection: "row-reverse", alignItems: "center", gap: 8, marginBottom: 8 },
    reqGroupDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.primary },
    reqGroupTitle: { fontSize: 14, fontWeight: "600", color: c.primary },

    // Fallback
    emptyTxt: { fontSize: 16, color: c.mutedForeground, marginTop: 12 },
    backFallback: {
      marginTop: 16, backgroundColor: c.primary, borderRadius: 10,
      paddingHorizontal: 20, paddingVertical: 10,
    },
    backFallbackTxt: { color: c.primaryForeground, fontWeight: "700", fontSize: 15 },
  });
