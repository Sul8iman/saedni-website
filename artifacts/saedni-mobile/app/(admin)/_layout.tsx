import { Stack } from "expo-router";
import { useColors } from "@/hooks/useColors";

export default function AdminLayout() {
  const colors = useColors();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="users" />
      <Stack.Screen name="user-detail" />
      <Stack.Screen name="statistics" />
    </Stack>
  );
}
