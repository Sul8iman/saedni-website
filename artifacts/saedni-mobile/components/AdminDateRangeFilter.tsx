import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

export type AdminArchivePeriod = "all" | "7d" | "30d" | "month" | "custom";
export type AdminDateRange = { from: Date; to: Date };
type DateField = "from" | "to";

const GREGORIAN_MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];
const WEEKDAYS = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];

function dateKey(date: Date): number {
  return date.getFullYear() * 10_000 + (date.getMonth() + 1) * 100 + date.getDate();
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function formatGregorianDate(date: Date | null): string {
  if (!date) return "اختر التاريخ";
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  return `${day}/${month}/${date.getFullYear()}`;
}

function calendarWeeks(year: number, month: number): Array<Array<number | null>> {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: Array<number | null> = Array.from(
    { length: new Date(year, month, 1).getDay() },
    () => null,
  );
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);

  return Array.from({ length: Math.ceil(cells.length / 7) }, (_, weekIndex) =>
    Array.from({ length: 7 }, (_, dayIndex) => cells[weekIndex * 7 + dayIndex] ?? null),
  );
}

function monthHasAllowedDate(month: Date, minDate: Date | null): boolean {
  if (!minDate) return true;
  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  return dateKey(lastDay) >= dateKey(minDate);
}

export default function AdminDateRangeFilter({
  value,
  onChange,
  onApplyRange,
}: {
  value: AdminArchivePeriod;
  onChange: (value: AdminArchivePeriod) => void;
  onApplyRange: (range: AdminDateRange) => void;
}) {
  const colors = useColors();
  const [fromDate, setFromDate] = useState<Date | null>(null);
  const [toDate, setToDate] = useState<Date | null>(null);
  const [pickerField, setPickerField] = useState<DateField | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(() => {
    const current = new Date();
    return new Date(current.getFullYear(), current.getMonth(), 1);
  });
  const [rangeError, setRangeError] = useState<string | null>(null);

  const options: Array<[AdminArchivePeriod, string]> = [
    ["all", "كل الوقت"],
    ["7d", "آخر 7 أيام"],
    ["30d", "30 يوماً"],
    ["month", "هذا الشهر"],
    ["custom", "فترة محددة"],
  ];
  const selectedDate = pickerField === "from" ? fromDate : toDate;
  const minimumPickerDate = pickerField === "to" ? fromDate : null;

  function openDatePicker(field: DateField) {
    const existing = field === "from" ? fromDate : toDate;
    const initialDate = existing ?? (field === "to" ? fromDate : null) ?? new Date();
    setCalendarMonth(new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));
    setRangeError(null);
    setPickerField(field);
  }

  function selectCalendarDay(day: number) {
    if (!pickerField) return;
    const selected = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
    if (pickerField === "to" && fromDate && dateKey(selected) < dateKey(fromDate)) return;

    if (pickerField === "from") {
      setFromDate(selected);
      if (toDate && dateKey(selected) > dateKey(toDate)) setToDate(null);
    } else {
      setToDate(selected);
    }
    setRangeError(null);
    setPickerField(null);
  }

  function applyRange() {
    if (!fromDate || !toDate) {
      setRangeError("اختر تاريخ البداية والنهاية.");
      return;
    }
    if (dateKey(toDate) < dateKey(fromDate)) {
      setRangeError("يجب أن يكون تاريخ النهاية مساوياً لتاريخ البداية أو بعده.");
      return;
    }

    onApplyRange({ from: startOfDay(fromDate), to: endOfDay(toDate) });
    setRangeError(null);
  }

  function changeMonth(offset: number) {
    setCalendarMonth((current) =>
      new Date(current.getFullYear(), current.getMonth() + offset, 1),
    );
  }

  const weeks = pickerField
    ? calendarWeeks(calendarMonth.getFullYear(), calendarMonth.getMonth())
    : [];
  const previousMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
  const nextMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
  const canGoToPreviousMonth = monthHasAllowedDate(previousMonth, minimumPickerDate);
  const canGoToNextMonth = monthHasAllowedDate(nextMonth, minimumPickerDate);

  return (
    <View style={styles.filterWrapper}>
      <Text style={[styles.filterLabel, { color: colors.foreground }]}>
        تاريخ إنشاء الطلب
      </Text>
      <View style={styles.filterRow}>
        {options.map(([key, label]) => (
          <TouchableOpacity
            key={key}
            style={[
              styles.filterChip,
              { backgroundColor: colors.muted, borderColor: colors.border },
              value === key && {
                backgroundColor: colors.secondary,
                borderColor: colors.primary,
              },
            ]}
            onPress={() => onChange(key)}
            accessibilityRole="button"
            accessibilityState={{ selected: value === key }}
            testID={`archive-period-${key}`}
          >
            <Text
              style={[
                styles.filterChipText,
                { color: value === key ? colors.primary : colors.mutedForeground },
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {value === "custom" && (
        <View
          style={[
            styles.customRange,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
          testID="archive-custom-date-range"
        >
          <View style={styles.dateFields}>
            <DateField
              label="من تاريخ"
              date={fromDate}
              onPress={() => openDatePicker("from")}
              colors={colors}
              testID="archive-date-from"
            />
            <DateField
              label="إلى تاريخ"
              date={toDate}
              onPress={() => openDatePicker("to")}
              colors={colors}
              testID="archive-date-to"
            />
          </View>
          {rangeError ? (
            <Text style={[styles.rangeMessage, { color: colors.destructive }]}>
              {rangeError}
            </Text>
          ) : (
            <Text style={[styles.rangeMessage, { color: colors.mutedForeground }]}>
              يشمل النطاق يوم البداية ويوم النهاية
            </Text>
          )}
          <TouchableOpacity
            style={[styles.applyButton, { backgroundColor: colors.primary }]}
            onPress={applyRange}
            accessibilityRole="button"
            testID="archive-date-apply"
          >
            <Text style={[styles.applyButtonText, { color: colors.primaryForeground }]}>
              تطبيق
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal
        visible={pickerField !== null}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={() => setPickerField(null)}
      >
        <View style={styles.modalRoot} testID="archive-gregorian-date-picker">
          <TouchableOpacity
            style={styles.backdrop}
            onPress={() => setPickerField(null)}
            activeOpacity={1}
            accessibilityLabel="إغلاق اختيار التاريخ"
          />
          <SafeAreaView
            edges={["bottom"]}
            style={[
              styles.sheet,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
            <View style={styles.sheetToolbar}>
              <TouchableOpacity
                onPress={() => setPickerField(null)}
                style={styles.toolbarAction}
                accessibilityRole="button"
              >
                <Text style={[styles.cancelText, { color: colors.mutedForeground }]}>
                  إلغاء
                </Text>
              </TouchableOpacity>
              <Text style={[styles.sheetTitle, { color: colors.foreground }]}>
                {pickerField === "from" ? "اختر تاريخ البداية" : "اختر تاريخ النهاية"}
              </Text>
              <View style={styles.toolbarAction} />
            </View>

            <View style={styles.monthNavigation}>
              <TouchableOpacity
                onPress={() => changeMonth(-1)}
                disabled={!canGoToPreviousMonth}
                style={styles.monthButton}
                accessibilityRole="button"
                accessibilityLabel="الشهر السابق"
                testID="archive-calendar-previous-month"
              >
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={canGoToPreviousMonth ? colors.primary : colors.mutedForeground}
                />
              </TouchableOpacity>
              <Text style={[styles.monthTitle, { color: colors.foreground }]}>
                {GREGORIAN_MONTHS[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}
              </Text>
              <TouchableOpacity
                onPress={() => changeMonth(1)}
                disabled={!canGoToNextMonth}
                style={styles.monthButton}
                accessibilityRole="button"
                accessibilityLabel="الشهر التالي"
                testID="archive-calendar-next-month"
              >
                <Ionicons
                  name="chevron-back"
                  size={20}
                  color={canGoToNextMonth ? colors.primary : colors.mutedForeground}
                />
              </TouchableOpacity>
            </View>

            <View style={styles.calendarWeek}>
              {WEEKDAYS.map((weekday) => (
                <Text
                  key={weekday}
                  style={[styles.weekday, { color: colors.mutedForeground }]}
                >
                  {weekday}
                </Text>
              ))}
            </View>
            <View style={styles.calendar}>
              {weeks.map((week, weekIndex) => (
                <View key={`week-${weekIndex}`} style={styles.calendarWeek}>
                  {week.map((day, dayIndex) => {
                    if (day === null) {
                      return (
                        <View
                          key={`blank-${weekIndex}-${dayIndex}`}
                          style={styles.dayCell}
                        />
                      );
                    }
                    const dayDate = new Date(
                      calendarMonth.getFullYear(),
                      calendarMonth.getMonth(),
                      day,
                    );
                    const isDisabled =
                      pickerField === "to" &&
                      minimumPickerDate !== null &&
                      dateKey(dayDate) < dateKey(minimumPickerDate);
                    const isSelected =
                      selectedDate !== null && dateKey(selectedDate) === dateKey(dayDate);
                    return (
                      <View key={`day-${day}`} style={styles.dayCell}>
                        <TouchableOpacity
                          style={[
                            styles.dayButton,
                            isSelected && { backgroundColor: colors.primary },
                            isDisabled && styles.disabledDay,
                          ]}
                          onPress={() => selectCalendarDay(day)}
                          disabled={isDisabled}
                          accessibilityRole="button"
                          accessibilityLabel={`اختيار ${formatGregorianDate(dayDate)}`}
                          accessibilityState={{
                            selected: isSelected,
                            disabled: isDisabled,
                          }}
                          testID={`archive-calendar-day-${calendarMonth.getFullYear()}-${calendarMonth.getMonth() + 1}-${day}`}
                        >
                          <Text
                            style={[
                              styles.dayText,
                              {
                                color: isSelected
                                  ? colors.primaryForeground
                                  : isDisabled
                                    ? colors.mutedForeground
                                    : colors.foreground,
                              },
                            ]}
                          >
                            {day}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

function DateField({
  label,
  date,
  onPress,
  colors,
  testID,
}: {
  label: string;
  date: Date | null;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
  testID: string;
}) {
  return (
    <View style={styles.dateField}>
      <Text style={[styles.dateFieldLabel, { color: colors.foreground }]}>{label}</Text>
      <TouchableOpacity
        style={[styles.dateFieldButton, { borderColor: colors.border, backgroundColor: colors.background }]}
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${formatGregorianDate(date)}`}
        testID={testID}
      >
        <Ionicons name="calendar-outline" size={17} color={colors.primary} />
        <Text
          style={[
            styles.dateFieldValue,
            { color: date ? colors.foreground : colors.mutedForeground },
          ]}
        >
          {formatGregorianDate(date)}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  filterWrapper: { gap: 7, marginBottom: 12 },
  filterLabel: { fontSize: 12, fontWeight: "800", textAlign: "right" },
  filterRow: { flexDirection: "row-reverse", flexWrap: "wrap", gap: 7 },
  filterChip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 7 },
  filterChipText: { fontSize: 11, fontWeight: "700" },
  customRange: { borderWidth: 1, borderRadius: 12, padding: 11, gap: 10 },
  dateFields: { flexDirection: "row-reverse", gap: 9 },
  dateField: { flex: 1, gap: 5 },
  dateFieldLabel: { fontSize: 11, fontWeight: "700", textAlign: "right" },
  dateFieldButton: {
    minHeight: 43,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 9,
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 5,
  },
  dateFieldValue: { fontSize: 12, fontWeight: "600", textAlign: "right" },
  rangeMessage: { fontSize: 11, textAlign: "right" },
  applyButton: { minHeight: 42, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  applyButtonText: { fontSize: 13, fontWeight: "800" },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.42)" },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  sheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 8,
    marginBottom: 5,
  },
  sheetToolbar: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 9,
  },
  toolbarAction: { width: 48 },
  cancelText: { fontSize: 13, fontWeight: "600" },
  sheetTitle: { flex: 1, fontSize: 15, fontWeight: "800", textAlign: "center" },
  monthNavigation: {
    flexDirection: "row-reverse",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 5,
    marginBottom: 7,
  },
  monthButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  monthTitle: { fontSize: 15, fontWeight: "800" },
  calendar: { gap: 2, paddingBottom: 8 },
  calendarWeek: { flexDirection: "row-reverse", alignItems: "center" },
  weekday: { width: "14.2857%", height: 30, textAlign: "center", textAlignVertical: "center", fontSize: 10, fontWeight: "700" },
  dayCell: { width: "14.2857%", height: 40, alignItems: "center", justifyContent: "center" },
  dayButton: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  disabledDay: { opacity: 0.35 },
  dayText: { fontSize: 13, fontWeight: "600" },
});