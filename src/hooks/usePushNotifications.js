// src/hooks/usePushNotifications.js

// Requires: npx expo install expo-notifications expo-device
// (not pinned in package.json here — run that command to get the
// exact versions compatible with your installed Expo SDK).
import { useEffect, useRef } from "react";
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { updatePushToken } from "../lib/db";

// Show notifications with a banner + sound even while the app is in
// the foreground (default Expo behaviour hides them while open).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function usePushNotifications(profileId) {
  const registeredFor = useRef(null);

  useEffect(() => {
    if (!profileId || registeredFor.current === profileId) return;

    let cancelled = false;

    async function register() {
      // Push notifications only work on a real device, not the
      // simulator/emulator — and only inside a dev/production build
      // (not Expo Go, which doesn't support push since SDK 53+).
      if (!Device.isDevice) {
        console.log("[push] Skipping — physical device required");
        return;
      }

      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "default",
          importance: Notifications.AndroidImportance.DEFAULT,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#E8500A",
        });
      }

      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== "granted") {
        console.log("[push] Permission not granted — notifications will not be delivered");
        return;
      }

      try {
        const tokenData = await Notifications.getExpoPushTokenAsync();
        const token = tokenData.data;
        if (cancelled) return;

        const { error } = await updatePushToken(profileId, token);
        if (error) {
          console.error("[push] Failed to save push token:", error.message);
          return;
        }
        registeredFor.current = profileId;
      } catch (err) {
        console.error("[push] Failed to get push token:", err.message);
      }
    }

    register();

    return () => { cancelled = true; };
  }, [profileId]);
}