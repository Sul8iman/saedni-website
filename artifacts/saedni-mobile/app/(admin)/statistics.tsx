import React, { useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useGetAdminStatistics } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { CATEGORIES, AREAS } from "@/constants/categories";
import AdminAreaFilter from "@/components/AdminAreaFilter";

type Period = "7d" | "30d" | "month" | "all";

interface BreakdownRow {
  area?: string;
  category?: string;
  total: number;
  active: number;
  helped: number;
  notHelped: number;
  successRate: number;
}

interface AdminStatistics {
  users: {
    total: number;
    customers: number;
    helpers: number;
    active: number;
    blocked: number;
    newInPeriod: number;
  };
  requests: {
    total: number;
    active: number;
    completed: number;
    cancelled: number;
    newInPeriod: number;
  };
  completion: {
    helped: number;
    notHelped: number;
    noFeedback: number;
    successRate: number;
  };
  successfulValueOman: number;
  averageSuccessfulValueOman: number;
  contacts: {
    contactedRequests: number;
    contactRate: number;
    averageHelpersPerRequest: number;
    averageFirstContactMinutes: number;
    notContactedRequests: number;
  };
  ratings: {
    averageStars: number;
    totalRatings: number;
    helpersWithRatings: number;
    helpersWithoutRatings: number;
  };
  breakdowns: {
    area: BreakdownRow[];
    category: BreakdownRow[];
  };
  retention: {
    oneRequest: number;
    repeatCustomers: number;
    repeatRate: number;
  };
  consistency: {
    cancelledWithCompletionData: number;
    completedWithoutCompletedAt: number;
    legacyMismatches: number;
  };
}

const EMPTY_STATS: AdminStatistics = {
  users: { total: 0, customers: 0, helpers: 0, active: 0, blocked: 0, newInPeriod: 0 },
  requests: { total: 0, active: 0, completed: 0, cancelled: 0, newInPeriod: 0 },
  completion: { helped: 0, notHelped: 0, noFeedback: 0, successRate: 0 },
  successfulValueOman: 0,
  averageSuccessfulValueOman: 0,
  contacts: { contactedRequests: 0, contactRate: 0, averageHelpersPerRequest: 0, averageFirstContactMinutes: 0, notContactedRequests: 0 },
  ratings: { averageStars: 0, totalRatings: 0, helpersWithRatings: 0, helpersWithoutRatings: 0 },
  breakdowns: { area: [], category: [] },
  retention: { oneRequest: 0, repeatCustomers: 0, repeatRate: 0 },
  consistency: { cancelledWithCompletionData: 0, completedWithoutCompletedAt: 0, legacyMismatches: 0 },
};

function number(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : Number(value ?? 0) || 0;
}

function formatOman(value: unknown): string {
  return `${number(value).toFixed(3)} ر.ع.`;
}

function formatPercent(value: unknown): string {
  return `${(number(value) * 100).toFixed(1)}%`;
}

function MetricCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string | number;
  icon: keyof typeof Ionicons.glyphMap;
  tone?: "success" | "danger" | "primary" | "neutral";
}) {
  const colors = useColors();
  const toneColor = tone === "success"
    ? "#059669"
    : tone === "danger"
      ? "#DC2626"
      : tone === "primary"
        ? colors.primary
        : colors.foreground;
  return (
    <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={[styles.metricIcon, { backgroundColor: `${toneColor}18` }]}>
        <Ionicons name={icon} size={18} color={toneColor} />
      </View>
      <Text style={[styles.metricValue, { color: toneColor }]}>{value}</Text>
      <Text style={[styles.metricLabel, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}

export default function AdminStatisticsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [period, setPeriod] = useState<Period>("30d");
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [category, setCategory] = useState("");
  const params = useMemo(
    () => ({ period, ...(selectedAreas.length > 0 ? { area: selectedAreas } : {}), ...(category ? { category } : {}) }),
    [period, selectedAreas, category],
  );
  const { data, isLoading, isFetching, isError, refetch } = useGetAdminStatistics<AdminStatistics>(params);
  const stats = data ?? EMPTY_STATS;
  const categoryLabel = (category: string) =>
    CATEGORIES.find((item) => item.value === category)?.label ?? category;
  const topAreas = [...(stats.breakdowns?.area ?? [])].sort((a, b) => number(b.total) - number(a.total)).slice(0, 5);
  const topCategories = [...(stats.breakdowns?.category ?? [])].sort((a, b) => number(b.total) - number(a.total)).slice(0, 5);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <SafeAreaView edges={["top"]} style={[styles.headerSafe, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons name="stats-chart" size={21} color={colors.primary} />
          </View>
          <View style={styles.headerCopy}>
            <Text style={[styles.headerTitle, { color: colors.foreground }]}>الإحصائيات</Text>
            <Text style={[styles.headerSubtitle, { color: colors.mutedForeground }]}>ملخص آمن ومجمّع لأداء المنصة</Text>
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 36 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.periodRow}>
          {([
            ["7d", "آخر 7 أيام"],
            ["30d", "آخر 30 يوماً"],
            ["month", "هذا الشهر"],
            ["all", "كل الوقت"],
          ] as [Period, string][]).map(([key, label]) => (
            <Text
              key={key}
              onPress={() => setPeriod(key)}
              style={[
                styles.periodChip,
                { backgroundColor: colors.muted, borderColor: colors.border, color: colors.mutedForeground },
                period === key && { backgroundColor: colors.primary, borderColor: colors.primary, color: colors.primaryForeground },
              ]}
            >
              {label}
            </Text>
          ))}
        </View>
        <CategorySelector value={category} onChange={setCategory} colors={colors} />
        <AdminAreaFilter areas={AREAS} selectedAreas={selectedAreas} onChange={setSelectedAreas} />

        {isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : isError ? (
          <View style={[styles.errorCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Ionicons name="alert-circle-outline" size={28} color={colors.destructive} />
            <Text style={[styles.errorText, { color: colors.foreground }]}>تعذر تحميل الإحصائيات</Text>
            <Text onPress={() => void refetch()} style={[styles.retryText, { color: colors.primary }]}>إعادة المحاولة</Text>
          </View>
        ) : (
          <>
            {isFetching && <Text style={[styles.updating, { color: colors.mutedForeground }]}>يتم تحديث البيانات...</Text>}

            <SectionTitle title="الطلبات" />
            <View style={styles.grid}>
              <MetricCard label="الطلبات النشطة" value={stats.requests.active} icon="flash-outline" tone="primary" />
              <MetricCard label="الطلبات المنتهية" value={stats.requests.completed} icon="checkmark-done-outline" />
              <MetricCard label="تمت المساعدة" value={stats.completion.helped} icon="checkmark-circle-outline" tone="success" />
              <MetricCard label="لم تتم المساعدة" value={stats.completion.notHelped} icon="close-circle-outline" tone="danger" />
              <MetricCard label="مجموع الطلبات" value={stats.requests.total} icon="document-text-outline" />
              <MetricCard label="طلبات جديدة" value={stats.requests.newInPeriod} icon="sparkles-outline" tone="primary" />
            </View>

            <View style={[styles.highlightRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.highlightItem}>
                <Text style={[styles.highlightValue, { color: colors.primary }]}>{formatPercent(stats.completion.successRate)}</Text>
                <Text style={[styles.highlightLabel, { color: colors.mutedForeground }]}>نسبة النجاح</Text>
              </View>
              <View style={[styles.verticalDivider, { backgroundColor: colors.border }]} />
              <View style={styles.highlightItem}>
                <Text style={[styles.highlightValue, { color: "#059669" }]}>{formatOman(stats.successfulValueOman)}</Text>
                <Text style={[styles.highlightLabel, { color: colors.mutedForeground }]}>قيمة الطلبات التي تمت مساعدتها</Text>
              </View>
            </View>
            <Text style={[styles.note, { color: colors.mutedForeground }]}>
              القيم المعروضة هي مبالغ الطلبات المقدّمة وليست مدفوعات مؤكدة داخل التطبيق.
            </Text>

            <SectionTitle title="أداء التواصل" />
            <View style={styles.grid}>
              <MetricCard label="حصلت على تواصل" value={stats.contacts.contactedRequests} icon="call-outline" tone="success" />
              <MetricCard label="بدون تواصل" value={stats.contacts.notContactedRequests} icon="call-outline" tone="danger" />
              <MetricCard label="نسبة التواصل" value={formatPercent(stats.contacts.contactRate)} icon="analytics-outline" tone="primary" />
              <MetricCard label="مساعدون لكل طلب" value={number(stats.contacts.averageHelpersPerRequest).toFixed(1)} icon="people-outline" />
              <MetricCard label="أول تواصل بالدقائق" value={number(stats.contacts.averageFirstContactMinutes).toFixed(1)} icon="time-outline" />
              <MetricCard label="متوسط الطلب الناجح" value={formatOman(stats.averageSuccessfulValueOman)} icon="cash-outline" tone="success" />
            </View>

            <SectionTitle title="الأكثر طلباً" />
            <RankingList
              title="حسب المنطقة"
              rows={topAreas.map((row) => ({ label: row.area ?? "غير محددة", ...row }))}
              colors={colors}
              formatLabel={(row) => row.label}
            />
            <RankingList
              title="حسب نوع الخدمة"
              rows={topCategories.map((row) => ({ label: categoryLabel(row.category ?? ""), ...row }))}
              colors={colors}
              formatLabel={(row) => row.label}
            />

            <SectionTitle title="المستخدمون والتقييمات" />
            <View style={styles.grid}>
              <MetricCard label="إجمالي المستخدمين" value={stats.users.total} icon="people-outline" />
              <MetricCard label="العملاء" value={stats.users.customers} icon="person-outline" tone="primary" />
              <MetricCard label="المساعدون" value={stats.users.helpers} icon="hand-right-outline" tone="primary" />
              <MetricCard label="المستخدمون النشطون" value={stats.users.active} icon="checkmark-circle-outline" tone="success" />
              <MetricCard label="المستخدمون المحظورون" value={stats.users.blocked} icon="ban-outline" tone="danger" />
              <MetricCard label="مستخدمون جدد" value={stats.users.newInPeriod} icon="person-add-outline" tone="primary" />
              <MetricCard label="متوسط تقييم المساعدين" value={number(stats.ratings.averageStars).toFixed(1)} icon="star-outline" tone="success" />
              <MetricCard label="إجمالي التقييمات" value={stats.ratings.totalRatings} icon="ribbon-outline" />
            </View>

            <SectionTitle title="احتفاظ العملاء" />
            <View style={styles.grid}>
              <MetricCard label="طلب واحد" value={stats.retention.oneRequest} icon="person-outline" />
              <MetricCard label="عملاء متكررون" value={stats.retention.repeatCustomers} icon="repeat-outline" tone="primary" />
              <MetricCard label="نسبة التكرار" value={formatPercent(stats.retention.repeatRate)} icon="trending-up-outline" tone="success" />
            </View>

            {(number(stats.consistency.cancelledWithCompletionData) > 0 ||
              number(stats.consistency.completedWithoutCompletedAt) > 0 ||
              number(stats.consistency.legacyMismatches) > 0) && (
              <View style={[styles.warningCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="warning-outline" size={20} color="#D97706" />
                <View style={styles.warningCopy}>
                  <Text style={[styles.warningTitle, { color: colors.foreground }]}>سجلات قديمة تحتاج مراجعة</Text>
                  <Text style={[styles.warningText, { color: colors.mutedForeground }]}>
                    توجد سجلات لا تطابق تعريفات دورة الطلب الحالية. لم يتم تعديلها تلقائياً.
                  </Text>
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  const colors = useColors();
  return <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{title}</Text>;
}

function CategorySelector({
  value,
  onChange,
  colors,
}: {
  value: string;
  onChange: (value: string) => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.categoryFilter}>
      <Text style={[styles.filterLabel, { color: colors.foreground }]}>نوع الخدمة</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
        <Text
          onPress={() => onChange("")}
          style={[
            styles.categoryChip,
            { backgroundColor: colors.muted, borderColor: colors.border, color: colors.mutedForeground },
            !value && { backgroundColor: colors.primary, borderColor: colors.primary, color: colors.primaryForeground },
          ]}
        >
          كل الخدمات
        </Text>
        {CATEGORIES.map((item) => (
          <Text
            key={item.value}
            onPress={() => onChange(item.value)}
            style={[
              styles.categoryChip,
              { backgroundColor: colors.muted, borderColor: colors.border, color: colors.mutedForeground },
              value === item.value && { backgroundColor: colors.secondary, borderColor: colors.primary, color: colors.primary },
            ]}
          >
            {item.label}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

function RankingList({
  title,
  rows,
  colors,
  formatLabel,
}: {
  title: string;
  rows: Array<BreakdownRow & { label: string }>;
  colors: ReturnType<typeof useColors>;
  formatLabel: (row: BreakdownRow & { label: string }) => string;
}) {
  return (
    <View style={[styles.rankingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.rankingTitle, { color: colors.foreground }]}>{title}</Text>
      {rows.length === 0 ? (
        <Text style={[styles.emptyRanking, { color: colors.mutedForeground }]}>لا توجد بيانات للفترة المحددة</Text>
      ) : rows.map((row) => (
        <View key={row.label} style={[styles.rankingRow, { borderBottomColor: colors.border }]}>
          <View style={styles.rankingMain}>
            <Text style={[styles.rankingLabel, { color: colors.foreground }]}>{formatLabel(row)}</Text>
            <Text style={[styles.rankingMeta, { color: colors.mutedForeground }]}>
              {row.total} طلب · {row.active} نشط · {row.helped} تمت مساعدتها · {formatPercent(row.successRate)} نجاح
            </Text>
          </View>
          <Text style={[styles.rankingValue, { color: colors.primary }]}>{row.total}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerSafe: { borderBottomWidth: 1 },
  header: { flexDirection: "row-reverse", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 14 },
  headerIcon: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: "#10B98118" },
  headerCopy: { flex: 1, alignItems: "flex-end" },
  headerTitle: { fontSize: 22, fontWeight: "800" },
  headerSubtitle: { fontSize: 12, marginTop: 3, textAlign: "right" },
  content: { padding: 16 },
  periodRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 7, marginBottom: 16 },
  periodChip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 11, paddingVertical: 8, fontSize: 12, fontWeight: "700" },
  categoryFilter: { gap: 7, marginBottom: 14 },
  filterLabel: { fontSize: 12, fontWeight: "800", textAlign: "right" },
  categoryRow: { flexDirection: "row-reverse", gap: 7 },
  categoryChip: { borderWidth: 1, borderRadius: 17, paddingHorizontal: 11, paddingVertical: 8, fontSize: 11, fontWeight: "700" },
  centered: { paddingVertical: 90, alignItems: "center" },
  updating: { textAlign: "right", fontSize: 11, marginBottom: 8 },
  errorCard: { borderWidth: 1, borderRadius: 14, padding: 20, alignItems: "center", gap: 8 },
  errorText: { fontSize: 15, fontWeight: "700" },
  retryText: { fontSize: 13, fontWeight: "700", padding: 4 },
  sectionTitle: { fontSize: 17, fontWeight: "800", textAlign: "right", marginTop: 10, marginBottom: 10 },
  grid: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 9, marginBottom: 10 },
  metricCard: { width: "31.5%", minHeight: 108, borderWidth: 1, borderRadius: 14, padding: 11, alignItems: "flex-end", justifyContent: "space-between" },
  metricIcon: { width: 31, height: 31, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  metricValue: { fontSize: 18, fontWeight: "800", textAlign: "right" },
  metricLabel: { fontSize: 10, fontWeight: "600", textAlign: "right" },
  highlightRow: { flexDirection: "row-reverse", borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 4 },
  highlightItem: { flex: 1, alignItems: "center", gap: 5 },
  verticalDivider: { width: 1, marginVertical: 3 },
  highlightValue: { fontSize: 20, fontWeight: "800", textAlign: "center" },
  highlightLabel: { fontSize: 11, textAlign: "center" },
  note: { fontSize: 11, textAlign: "right", lineHeight: 18, marginTop: 7, marginBottom: 4 },
  rankingCard: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 13, marginBottom: 10 },
  rankingTitle: { fontSize: 14, fontWeight: "800", textAlign: "right", paddingVertical: 12 },
  rankingRow: { flexDirection: "row-reverse", alignItems: "center", borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 10, gap: 10 },
  rankingMain: { flex: 1, alignItems: "flex-end" },
  rankingLabel: { fontSize: 13, fontWeight: "700", textAlign: "right" },
  rankingMeta: { fontSize: 10, textAlign: "right", marginTop: 3 },
  rankingValue: { fontSize: 18, fontWeight: "800", minWidth: 24, textAlign: "center" },
  emptyRanking: { textAlign: "right", fontSize: 12, paddingBottom: 13 },
  warningCard: { flexDirection: "row-reverse", alignItems: "flex-start", gap: 9, borderWidth: 1, borderRadius: 14, padding: 13, marginTop: 8 },
  warningCopy: { flex: 1, alignItems: "flex-end" },
  warningTitle: { fontSize: 13, fontWeight: "800", textAlign: "right" },
  warningText: { fontSize: 11, lineHeight: 18, textAlign: "right", marginTop: 3 },
});