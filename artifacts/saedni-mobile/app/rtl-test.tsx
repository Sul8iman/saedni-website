/**
 * RTL Diagnostic Test Screen — REMOVE BEFORE PRODUCTION
 *
 * Navigate here to test how every textAlign value renders Arabic text
 * with the current I18nManager.isRTL state.
 *
 * Reading the results:
 *   - If textAlign:"right" shows text on the LEFT → RTL layout is active
 *     and "right" is the logical trailing edge (= physical LEFT in RTL).
 *     Fix: use textAlign:"left" (which in RTL mode = physical RIGHT).
 *   - If textAlign:"start" shows text on the RIGHT → confirmed RTL layout;
 *     "start" in RTL = physical right = correct for Arabic labels.
 *   - I18nManager.isRTL tells you whether forceRTL(true) is currently active.
 */
import React from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Platform,
  I18nManager,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const ARABIC = "تسجيل الدخول";
const ARABIC_SHORT = "رقم الهاتف";

interface CaseProps {
  label: string;
  textAlign?: "left" | "right" | "center" | "auto" | "justify";
  writingDir?: "ltr" | "rtl" | "auto";
  noAlign?: boolean;
}

function Case({ label, textAlign, writingDir, noAlign }: CaseProps) {
  const textStyle: object = {
    fontSize: 18,
    ...(noAlign ? {} : textAlign ? { textAlign } : {}),
    ...(writingDir ? { writingDirection: writingDir } : {}),
  };
  return (
    <View style={s.caseWrap}>
      <Text style={s.caseLabel}>{label}</Text>
      {/* Blue border = full container width */}
      <View style={s.caseBox}>
        <Text style={[s.caseText, textStyle]}>{ARABIC}</Text>
      </View>
      {/* Also test with a narrow fixed box (300 px) — user-requested */}
      <View style={s.caseBoxNarrow}>
        <Text style={[s.caseText, { width: "100%" }, textStyle]}>
          {ARABIC_SHORT}
        </Text>
      </View>
    </View>
  );
}

export default function RTLTestScreen() {
  const info =
    `Platform: ${Platform.OS}\n` +
    `I18nManager.isRTL: ${I18nManager.isRTL}\n` +
    `doLeftAndRightSwapInRTL: ${I18nManager.doLeftAndRightSwapInRTL}`;

  return (
    <SafeAreaView style={s.safe} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={s.scroll}>

        {/* ── State dump ── */}
        <View style={s.infoBanner}>
          <Text style={s.infoTitle}>RTL Runtime State</Text>
          <Text style={s.infoBody}>{info}</Text>
        </View>

        <Text style={s.sectionTitle}>textAlign variants (full-width box)</Text>

        <Case label='textAlign: "right"'         textAlign="right" />
        <Case label='textAlign: "left"'          textAlign="left" />
        <Case label='textAlign: "center"'        textAlign="center" />
        <Case label='no textAlign (default)'     noAlign />
        <Case label='textAlign: "right" + writingDirection: "rtl"'
              textAlign="right" writingDir="rtl" />
        <Case label='textAlign: "left"  + writingDirection: "rtl"'
              textAlign="left"  writingDir="rtl" />

        {/* ── User-requested exact minimal test ── */}
        <Text style={s.sectionTitle}>User-requested minimal test</Text>
        <View style={s.caseWrap}>
          <Text style={s.caseLabel}>
            {"<View width=300><Text width=100% textAlign=right>"}
          </Text>
          <View style={{ width: 300, borderWidth: 1, borderColor: "blue" }}>
            <Text style={{ width: "100%", textAlign: "right", fontSize: 18 }}>
              {ARABIC}
            </Text>
          </View>
        </View>

        {/* ── Same but full screen width ── */}
        <Text style={s.sectionTitle}>Full-screen-width container</Text>
        <View style={s.caseWrap}>
          <Text style={s.caseLabel}>width="100%" textAlign="right"</Text>
          <View style={{ width: "100%", borderWidth: 1, borderColor: "green" }}>
            <Text style={{ textAlign: "right", fontSize: 18 }}>{ARABIC}</Text>
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#fff" },
  scroll: { padding: 16, paddingBottom: 60 },

  infoBanner: {
    backgroundColor: "#EFF6FF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    padding: 12,
    marginBottom: 24,
  },
  infoTitle: { fontSize: 13, fontWeight: "700", color: "#1D4ED8", marginBottom: 4 },
  infoBody:  { fontSize: 12, color: "#1E40AF", lineHeight: 18, fontFamily: "monospace" },

  sectionTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#6B7280",
    marginBottom: 12,
    marginTop: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  caseWrap: { marginBottom: 20 },
  caseLabel: { fontSize: 10, color: "#9CA3AF", marginBottom: 4 },
  caseBox: { width: "100%", borderWidth: 1.5, borderColor: "#3B82F6", padding: 4 },
  caseBoxNarrow: { width: 300, borderWidth: 1.5, borderColor: "#EF4444", padding: 4, marginTop: 4 },
  caseText: { fontSize: 18, backgroundColor: "#F9FAFB" },
});
