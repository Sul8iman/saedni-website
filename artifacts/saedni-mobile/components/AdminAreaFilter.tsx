import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

interface AdminAreaFilterProps {
  areas: string[];
  selectedAreas: string[];
  onChange: (areas: string[]) => void;
}

export default function AdminAreaFilter({ areas, selectedAreas, onChange }: AdminAreaFilterProps) {
  const colors = useColors();
  const allSelected = selectedAreas.length === 0;
  const toggle = (area: string) => {
    onChange(
      selectedAreas.includes(area)
        ? selectedAreas.filter((item) => item !== area)
        : [...selectedAreas, area],
    );
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.heading}>
        <Ionicons name="location-outline" size={16} color={colors.primary} />
        <Text style={[styles.title, { color: colors.foreground }]}>المنطقة</Text>
        <Text style={[styles.hint, { color: colors.mutedForeground }]}>اختيار متعدد</Text>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.row}
      >
        <TouchableOpacity
          style={[
            styles.chip,
            { backgroundColor: colors.muted, borderColor: colors.border },
            allSelected && { backgroundColor: colors.primary, borderColor: colors.primary },
          ]}
          onPress={() => onChange([])}
          accessibilityRole="button"
          accessibilityState={{ selected: allSelected }}
        >
          <Text style={[styles.chipText, { color: colors.mutedForeground }, allSelected && { color: colors.primaryForeground }]}>
            كل المناطق
          </Text>
        </TouchableOpacity>
        {areas.map((area) => {
          const selected = selectedAreas.includes(area);
          return (
            <TouchableOpacity
              key={area}
              style={[
                styles.chip,
                { backgroundColor: colors.muted, borderColor: colors.border },
                selected && { backgroundColor: colors.secondary, borderColor: colors.primary },
              ]}
              onPress={() => toggle(area)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text style={[styles.chipText, { color: colors.mutedForeground }, selected && { color: colors.primary, fontWeight: "700" }]}>
                {area}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 8, marginBottom: 14 },
  heading: { flexDirection: "row-reverse", alignItems: "center", gap: 6 },
  title: { fontSize: 13, fontWeight: "800" },
  hint: { fontSize: 11, marginStart: 2 },
  row: { flexDirection: "row-reverse", gap: 7, paddingHorizontal: 1 },
  chip: { borderWidth: 1, borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 12, fontWeight: "600" },
});