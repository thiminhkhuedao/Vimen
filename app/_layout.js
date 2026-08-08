// app/_layout.js — Root layout with Clerk + a real navigation stack
import { useEffect } from "react";
import { Stack } from "expo-router";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ClerkProvider, useAuth } from "@clerk/clerk-expo";
import * as SecureStore from "expo-secure-store";
import { setClerkTokenGetter } from "../src/lib/supabase";
import { useProfile } from "../src/hooks/useProfile";
import { usePushNotifications } from "../src/hooks/usePushNotifications";

// Clerk's recommended token cache for Expo — stores the short-lived
// session token in SecureStore. This stays small (unlike the full
// Supabase session we had issues with), so no 2048-byte problem here.
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
    "[Vinem] Missing EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY — add it to your .env"
  );
}

function ClerkToSupabaseBridge() {
  // Connects Clerk's getToken to the Supabase client, same pattern
  // as the web app's App.jsx.
  const { getToken } = useAuth();

  useEffect(() => {
    setClerkTokenGetter(() => getToken());
  }, [getToken]);

  return null;
}

function PushNotificationRegistrar() {
  // Waits for the profile to resolve (useProfile already handles the
  // signed-out / not-loaded states internally, returning profile:null),
  // then registers this device for push once we have a real profile id.
  const { profile } = useProfile();
  usePushNotifications(profile?.id);
  return null;
}

export default function RootLayout() {
  return (
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
  );
}