import {
  getListContactedHelpersQueryKey,
  getListRequestsQueryKey,
  useListContactedHelpers,
  useListRequests,
  type ContactedHelper,
} from "@workspace/api-client-react";
import { Ionicons } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import { getRequestLocationLines } from "@/lib/request-locations";

type AdminRequestDetailsRequest = {
  id: number;
  customerId: number;
  category: string;
  area: string;
  fromArea?: string | null;
  toArea?: string | null;
  status: string;
  completedHelperId?: number | null;
  completedHelperTaskRatingStars?: number | null;
  helperName?: string | null;
  helperPhone?: string | null;
};

export function AdminRequestDetails({
  request,
}: {
  request: AdminRequestDetailsRequest;
}) {
  const colors = useColors();
  const {
    data: contactedHelpers,
    isError,
    isFetching,
    isLoading,
    refetch,
  } = useListContactedHelpers(request.id, {
    query: { queryKey: getListContactedHelpersQueryKey(request.id) },
  });

  // The paged admin endpoints do not include this field. The existing admin
  // request-list endpoint does, so look up this customer's completed requests
  // only when the detail is expanded and the value is not already available.
  const shouldLookupTaskRating =
    request.status === "completed" &&
    request.completedHelperId != null &&
    request.completedHelperTaskRatingStars === undefined;
  const taskRatingParams = shouldLookupTaskRating
    ? { status: "completed", customerId: request.customerId }
    : undefined;
  const taskRatingQuery = useListRequests(taskRatingParams, {
    query: {
      queryKey: getListRequestsQueryKey(taskRatingParams),
      enabled: shouldLookupTaskRating,
    },
  });
  const matchingRequest = taskRatingQuery.data?.find(
    (item) => item.id === request.id,
  );
  const taskRating =
    request.completedHelperTaskRatingStars !== undefined
      ? request.completedHelperTaskRatingStars
      : matchingRequest?.completedHelperTaskRatingStars;
  const taskRatingLoading =
    shouldLookupTaskRating && taskRatingQuery.isLoading;
  const taskRatingError =
    shouldLookupTaskRating && taskRatingQuery.isError;
  const selectedHelperId = request.completedHelperId ?? null;

  return (
    <View
      style={[styles.section, { borderTopColor: colors.border }]}
      testID={`admin-request-details-${request.id}`}
    >
      <View style={styles.sectionContent}>
        <View
          style={styles.locationList}
          testID={`admin-request-locations-${request.id}`}
        >
          {getRequestLocationLines(request).map((location) => (
            <View style={styles.locationRow} key={location.label}>
              <Ionicons name="location-outline" size={15} color={colors.mutedForeground} />
              <Text style={[styles.locationText, { color: colors.foreground }]}>
                {location.label}: {location.value}
              </Text>
            </View>
          ))}
        </View>
        <View style={styles.sectionHeading}>
          <Ionicons name="people-outline" size={17} color={colors.primary} />
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            المساعدون الذين تواصلوا مع الطلب
          </Text>
        </View>

        {isLoading && (
          <View
            style={styles.statusRow}
            accessibilityRole="progressbar"
            testID={`contacted-helpers-loading-${request.id}`}
          >
            <ActivityIndicator size="small" color={colors.primary} />
            <Text style={[styles.statusText, { color: colors.mutedForeground }]}>
              جارٍ تحميل قائمة المساعدين...
            </Text>
          </View>
        )}

        {isError && (
          <View
            style={[
              styles.errorCard,
              { borderColor: colors.destructive, backgroundColor: colors.card },
            ]}
            testID={`contacted-helpers-error-${request.id}`}
          >
            <Text style={[styles.errorText, { color: colors.destructive }]}>
              {contactedHelpers
                ? "تعذر تحديث قائمة المساعدين."
                : "تعذر تحميل قائمة المساعدين."}
            </Text>
            <TouchableOpacity
              onPress={() => void refetch()}
              disabled={isFetching}
              accessibilityRole="button"
              accessibilityLabel="إعادة تحميل قائمة المساعدين"
              testID={`retry-contacted-helpers-${request.id}`}
            >
              <Ionicons
                name="refresh-outline"
                size={20}
                color={isFetching ? colors.mutedForeground : colors.primary}
              />
            </TouchableOpacity>
          </View>
        )}

        {!isLoading && !isError && (contactedHelpers?.length ?? 0) === 0 && (
          <Text
            style={[
              styles.emptyText,
              { backgroundColor: colors.card, color: colors.mutedForeground },
            ]}
            accessibilityRole="text"
            testID={`contacted-helpers-empty-${request.id}`}
          >
            لا يوجد مساعدون تواصلوا مع هذا الطلب.
          </Text>
        )}

        {!!contactedHelpers?.length && (
          <View style={styles.helperList}>
            {contactedHelpers.map((helper, index) => (
              <ContactedHelperCard
                key={helper.helperId ?? `${helper.helperName ?? "helper"}-${index}`}
                helper={helper}
                requestId={request.id}
                colors={colors}
              />
            ))}
          </View>
        )}
      </View>

      <View
        style={[
          styles.selectedCard,
          { backgroundColor: colors.card, borderColor: colors.primary },
        ]}
        testID={`selected-completion-helper-${request.id}`}
      >
        <View>
          <Text style={[styles.selectedHeading, { color: colors.foreground }]}>
            المساعد الذي اختاره العميل لإتمام الطلب
          </Text>
          {selectedHelperId === null ? (
            <Text
              style={[styles.selectedEmpty, { color: colors.mutedForeground }]}
              testID={`selected-helper-empty-${request.id}`}
            >
              لم يحدد العميل مساعداً لإتمام الطلب.
            </Text>
          ) : (
            <View style={styles.selectedIdentity}>
              <Text
                style={[styles.selectedName, { color: colors.foreground }]}
                testID={`selected-helper-name-${request.id}`}
              >
                {request.helperName ?? `المساعد رقم ${selectedHelperId}`}
              </Text>
              <Text
                style={[styles.phone, { color: colors.mutedForeground }]}
                accessibilityLabel="رقم هاتف المساعد المختار"
                testID={`selected-helper-phone-${request.id}`}
              >
                {request.helperPhone ?? "رقم الهاتف غير متاح"}
              </Text>
            </View>
          )}
        </View>

        <View style={[styles.taskRating, { borderTopColor: colors.border }]}>
          <Text style={[styles.ratingLabel, { color: colors.mutedForeground }]}>
            تقييم هذا الطلب
          </Text>
          {taskRatingLoading ? (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.statusText, { color: colors.mutedForeground }]}>
                جارٍ تحميل تقييم المهمة...
              </Text>
            </View>
          ) : taskRatingError ? (
            <TouchableOpacity
              style={styles.retryRating}
              onPress={() => void taskRatingQuery.refetch()}
              disabled={taskRatingQuery.isFetching}
              accessibilityRole="button"
              testID={`retry-task-rating-${request.id}`}
            >
              <Text style={[styles.statusText, { color: colors.destructive }]}>
                تعذر تحميل تقييم هذا الطلب — اضغط لإعادة المحاولة
              </Text>
              <Ionicons
                name="refresh-outline"
                size={16}
                color={colors.destructive}
              />
            </TouchableOpacity>
          ) : taskRating == null ? (
            <Text
              style={[styles.selectedEmpty, { color: colors.mutedForeground }]}
              testID={`task-rating-empty-${request.id}`}
            >
              {selectedHelperId === null
                ? "لا يوجد تقييم لهذا الطلب لعدم اختيار مساعد."
                : "لم يسجل العميل تقييماً لهذا الطلب."}
            </Text>
          ) : (
            <View
              style={styles.ratingValue}
              testID={`task-rating-${request.id}`}
            >
              <View style={styles.ratingStars}>
                <Ionicons name="star" size={16} color={colors.primary} />
                <Text style={[styles.ratingNumber, { color: colors.foreground }]}>
                  {taskRating} / 5
                </Text>
              </View>
              <Text style={[styles.ratingNote, { color: colors.mutedForeground }]}>
                تقييم المهمة الحالية، وليس متوسط المساعد
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

function ContactedHelperCard({
  helper,
  requestId,
  colors,
}: {
  helper: ContactedHelper;
  requestId: number;
  colors: ReturnType<typeof useColors>;
}) {
  const averageRating =
    helper.rating !== null && Number.isFinite(helper.rating)
      ? helper.rating.toFixed(1)
      : null;
  const isWhatsapp = helper.contactMethod === "whatsapp";
  const helperKey = helper.helperId;

  return (
    <View
      style={[
        styles.helperCard,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
      testID={`contacted-helper-${requestId}-${helperKey}`}
    >
      <View style={styles.helperTop}>
        <View style={styles.helperCopy}>
          <Text
            style={[styles.helperName, { color: colors.foreground }]}
            testID={`contacted-helper-name-${requestId}-${helperKey}`}
          >
            {helper.helperName ?? "الاسم غير متاح"}
          </Text>
          <Text
            style={[styles.phone, { color: colors.mutedForeground }]}
            testID={`contacted-helper-phone-${requestId}-${helperKey}`}
          >
            {helper.contactPhone ?? "رقم الهاتف غير متاح"}
          </Text>
        </View>
        <View
          style={[
            styles.methodBadge,
            { backgroundColor: colors.secondary },
          ]}
          testID={`contact-method-${requestId}-${helperKey}`}
        >
          <Ionicons
            name={isWhatsapp ? "logo-whatsapp" : "call-outline"}
            size={14}
            color={colors.primary}
          />
          <Text style={[styles.methodText, { color: colors.primary }]}>
            {isWhatsapp ? "واتساب" : "اتصال هاتفي"}
          </Text>
        </View>
      </View>

      <View
        style={styles.averageRating}
        testID={`helper-average-rating-${requestId}-${helperKey}`}
      >
        <Ionicons
          name="star"
          size={14}
          color={colors.primary}
        />
        <Text style={[styles.ratingNote, { color: colors.mutedForeground }]}>
          {averageRating === null
            ? "لا يوجد متوسط تقييم"
            : `متوسط التقييم: ${averageRating} / 5${
                helper.ratingCount > 0 ? ` (${helper.ratingCount} تقييم)` : ""
              }`}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 12,
    paddingTop: 12,
    gap: 12,
  },
  sectionContent: { gap: 10 },
  locationList: { gap: 5 },
  locationRow: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  locationText: { fontSize: 12, fontWeight: "600", textAlign: "right" },
  sectionHeading: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 7,
  },
  sectionTitle: { fontSize: 13, fontWeight: "800", textAlign: "right" },
  helperList: { gap: 8 },
  helperCard: { borderWidth: 1, borderRadius: 11, padding: 11, gap: 9 },
  helperTop: {
    flexDirection: "row-reverse",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  },
  helperCopy: { flex: 1, alignItems: "flex-end", gap: 4 },
  helperName: { fontSize: 13, fontWeight: "700", textAlign: "right" },
  phone: {
    fontSize: 12,
    textAlign: "left",
    writingDirection: "ltr",
  },
  methodBadge: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 4,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  methodText: { fontSize: 11, fontWeight: "700" },
  averageRating: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 5,
  },
  ratingNote: { fontSize: 11, textAlign: "right", flexShrink: 1 },
  emptyText: {
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 12,
    fontSize: 12,
    textAlign: "right",
  },
  statusRow: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 7,
  },
  statusText: { fontSize: 11, textAlign: "right", flexShrink: 1 },
  errorCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: 10,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  errorText: { fontSize: 11, textAlign: "right", flex: 1 },
  selectedCard: {
    borderWidth: 1,
    borderRadius: 11,
    padding: 11,
    gap: 12,
  },
  selectedHeading: { fontSize: 13, fontWeight: "800", textAlign: "right" },
  selectedIdentity: { marginTop: 8, gap: 4 },
  selectedName: { fontSize: 12, fontWeight: "700", textAlign: "right" },
  selectedEmpty: { marginTop: 6, fontSize: 12, textAlign: "right" },
  taskRating: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 7 },
  ratingLabel: { fontSize: 11, fontWeight: "700", textAlign: "right" },
  retryRating: {
    flexDirection: "row-reverse",
    alignItems: "center",
    gap: 5,
  },
  ratingValue: {
    flexDirection: "row-reverse",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 9,
  },
  ratingStars: { flexDirection: "row-reverse", alignItems: "center", gap: 4 },
  ratingNumber: { fontSize: 12, fontWeight: "800" },
});