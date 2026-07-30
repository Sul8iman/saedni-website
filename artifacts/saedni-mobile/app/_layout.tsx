import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect, useRef } from "react";
import { I18nManager } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { setBaseUrl } from "@workspace/api-client-react";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { AuthProvider, useAuth, BASE } from "@/contexts/AuthContext";
import { readAuthToken } from "@/hooks/usePushNotifications";

// ── Force RTL for Arabic layout ─────────────────────────────────────────────
// Must run before the first render. On Android a restart is required after
// the very first install; subsequent launches apply RTL immediately.
I18nManager.allowRTL(true);
I18nManager.forceRTL(true);
I18nManager.swapLeftAndRightInRTL(true);

// Patch global fetch to include session cookies on every request
const _origFetch = global.fetch;
global.fetch = (input: RequestInfo | URL, init?: RequestInit) =>
  _origFetch(input, { credentials: "include", ...init });

// Point the API client to the Replit domain for absolute URLs
if (process.env.EXPO_PUBLIC_DOMAIN) {
  setBaseUrl(`https://${process.env.EXPO_PUBLIC_DOMAIN}`);
}

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

// ── Notification tap handler ────────────────────────────────────────────────
// Everything is inside useEffect so expo-notifications is never touched at
// module-load time. The Subscription type is imported lazily to avoid any
// native-module side effects before the bridge is ready.
function NotificationHandler() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const listenerRef = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        // Dynamic import: native module only touched after React Native bridge
        const Notifications = await import("expo-notifications");

        // Configure foreground display behaviour (safe inside useEffect)
        Notifications.setNotificationHandler({
          handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: false,
          }),
        });

        if (cancelled) return;

        listenerRef.current = Notifications.addNotificationResponseReceivedListener(
          (response) => {
            const data = response.notification.request.content.data as Record<string, unknown>;

            if (data?.type === "new_request") {
              if (user) {
                router.replace("/(helper)");
              } else {
                router.replace("/(auth)/login");
              }
              return;
            }

            if (data?.notificationType === "otp_request") {
              // Mark notification as read (fire-and-forget)
              const nId = data.notificationId as number | undefined;
              if (nId && BASE) {
                void (async () => {
                  try {
                    const authToken = await readAuthToken();
                    await fetch(`${BASE}/api/admin/notifications/${nId}/read`, {
                      method: "PATCH",
                      headers: authToken ? { "Authorization": `Bearer ${authToken}` } : {},
                    });
                  } catch {}
                })();
              }
              // Navigate to admin user detail
              if (user) {
                const userId = data.userId as number | null | undefined;
                if (userId) {
                  router.push(`/(admin)/user-detail?id=${userId}`);
                } else {
                  const phone = encodeURIComponent(String(data.phone ?? ""));
                  const requestTime = encodeURIComponent(String(data.requestTime ?? ""));
                  router.push(`/(admin)/user-detail?id=0&fallbackPhone=${phone}&fallbackTime=${requestTime}`);
                }
              } else {
                router.replace("/(auth)/login");
              }
              return;
            }
          },
        );
      } catch {
        // If expo-notifications is unavailable (e.g. on web) — silently ignore
      }
    })();

    return () => {
      cancelled = true;
      listenerRef.current?.remove();
      listenerRef.current = null;
    };
  }, [user, loading]);

  return null;
}

function RootLayoutNav() {
  return (
    <>
      <NotificationHandler />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(customer)" />
        <Stack.Screen name="(helper)" />
        <Stack.Screen name="(admin)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="rtl-test" />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <RootLayoutNav />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </AuthProvider>
        </QueryClientProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
