// app/_layout.js 
import { useEffect } from "react";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import * as SecureStore from "expo-secure-store";
import * as Sentry from "@sentry/react-native";
import { setClerkTokenGetter } from "../src/lib/supabase";
import { useProfile } from "../src/hooks/useProfile";
import { usePushNotifications } from "../src/hooks/usePushNotifications";
import { ErrorBoundary } from "../src/components/ErrorBoundary";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { configureStorage } from "../src/hooks/i18n/index.js";


Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enabled: !__DEV__, // rien envoyé en dev local, seulement en vraie build
  tracesSampleRate: 0.1,
});

configureStorage(AsyncStorage);

const tokenCache = {
  async getToken(key) {
    try {
      return await SecureStore.getItemAsync(key);
    } catch {
      return null;
    }
  },
  async saveToken(key, value) {
    try {
      await SecureStore.setItemAsync(key, value);
    } catch {
      // ignore
    }
  },
};

const publishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

if (!publishableKey) {
  console.warn(
    "[vimen] Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY — add it to your .env"
  );
}

function ClerkToSupabaseBridge() {
  const { getToken } = useAuth();

  useEffect(() => {
    setClerkTokenGetter(() => getToken());
  }, [getToken]);

  return null;
}

function PushNotificationRegistrar() {
  const { profile } = useProfile();
  usePushNotifications(profile?.id);
  return null;
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <ClerkProvider publishableKey={publishableKey} tokenCache={tokenCache}>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <SafeAreaProvider>
            <ClerkToSupabaseBridge />
            <PushNotificationRegistrar />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="(screens)" />
            </Stack>
          </SafeAreaProvider>
        </GestureHandlerRootView>
      </ClerkProvider>
    </ErrorBoundary>
  );
}