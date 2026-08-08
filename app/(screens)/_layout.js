// app/(screens)/_layout.js
import { Stack } from "expo-router";
import { T } from "../../src/styles/tokens";

export default function ScreensLayout() {
  return (
    <Stack screenOptions={{
      headerStyle: { backgroundColor: T.surface },
      headerTintColor: T.brand,
      headerTitleStyle: { fontWeight: "700", color: T.text },
      headerBackTitle: "Back",
    }}>
      <Stack.Screen name="quotes"         options={{ title: "Quotes" }}/>
      <Stack.Screen name="payments"       options={{ title: "Vinem Pay" }}/>
      <Stack.Screen name="reviews"        options={{ title: "Reviews" }}/>
      <Stack.Screen name="certifications" options={{ title: "Certifications" }}/>
      <Stack.Screen name="referrals"      options={{ title: "Referrals" }}/>
      <Stack.Screen name="booking"        options={{ title: "Booking" }}/>
    </Stack>
  );
}
