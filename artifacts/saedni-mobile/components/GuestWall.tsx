import React from "react";
import {
  Modal, View, Text, TouchableOpacity, StyleSheet, TouchableWithoutFeedback,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/contexts/AuthContext";
import { useColors } from "@/hooks/useColors";

interface Props {
  visible: boolean;
  onClose: () => void;
  message?: string;
}

export default function GuestWall({ visible, onClose, message }: Props) {
  const colors = useColors();
  const router = useRouter();
  const { exitGuestMode } = useAuth();
  const s = makeStyles(colors);

  function goLogin() {
    onClose();
    exitGuestMode();
    router.replace("/(auth)/login");
  }

  function goRegister() {
    onClose();
    exitGuestMode();
    router.replace("/(auth)/register");
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={s.overlay}>
          <TouchableWithoutFeedback>
            <View style={s.sheet}>
              <View style={s.iconWrap}>
                <Ionicons name="lock-closed" size={32} color={colors.primary} />
              </View>
              <Text style={s.title}>هذه الميزة للأعضاء فقط</Text>
              <Text style={s.sub}>
                {message ?? "سجّل الدخول أو أنشئ حساباً للاستفادة من جميع ميزات ساعدني"}
              </Text>

              <TouchableOpacity style={s.primaryBtn} onPress={goLogin} activeOpacity={0.85}>
                <Text style={s.primaryBtnTxt}>تسجيل الدخول</Text>
              </TouchableOpacity>

              <TouchableOpacity style={s.secondaryBtn} onPress={goRegister} activeOpacity={0.85}>
                <Text style={s.secondaryBtnTxt}>إنشاء حساب جديد</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={onClose} style={s.cancelBtn} activeOpacity={0.7}>
                <Text style={s.cancelTxt}>إغلاق</Text>
              </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const makeStyles = (c: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    overlay: {
      flex: 1, backgroundColor: "rgba(0,0,0,0.45)",
      alignItems: "center", justifyContent: "flex-end",
    },
    sheet: {
      width: "100%", backgroundColor: c.background,
      borderTopLeftRadius: 24, borderTopRightRadius: 24,
      padding: 28, paddingBottom: 40, alignItems: "center",
    },
    iconWrap: {
      width: 68, height: 68, borderRadius: 34,
      backgroundColor: c.secondary,
      alignItems: "center", justifyContent: "center",
      marginBottom: 18,
    },
    title: {
      fontSize: 20, fontWeight: "800", color: c.foreground,
      textAlign: "center", marginBottom: 10,
    },
    sub: {
      fontSize: 14, color: c.mutedForeground, textAlign: "center",
      lineHeight: 22, marginBottom: 28, paddingHorizontal: 8,
    },
    primaryBtn: {
      width: "100%", backgroundColor: c.primary, borderRadius: 14,
      paddingVertical: 16, alignItems: "center", marginBottom: 10,
    },
    primaryBtnTxt: { color: c.primaryForeground, fontSize: 16, fontWeight: "700" },
    secondaryBtn: {
      width: "100%", backgroundColor: c.card, borderRadius: 14,
      paddingVertical: 16, alignItems: "center",
      borderWidth: 1.5, borderColor: c.border, marginBottom: 16,
    },
    secondaryBtnTxt: { color: c.foreground, fontSize: 16, fontWeight: "600" },
    cancelBtn: { paddingVertical: 8 },
    cancelTxt: { fontSize: 14, color: c.mutedForeground },
  });
