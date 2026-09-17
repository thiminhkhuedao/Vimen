// app/(auth)/sign-in.js
import { useCallback, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useSignIn, useOAuth } from "@clerk/clerk-expo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { T } from "../../src/styles/tokens";
import { useTranslation } from "../../src/hooks/i18n/index.js";
import { useWarmUpBrowser } from "../../src/hooks/useWarmUpBrowser";

export default function SignInScreen() {
  useWarmUpBrowser();

  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const { signIn, setActive, isLoaded } = useSignIn();
  const { startOAuthFlow } = useOAuth({ strategy: "oauth_google" });

  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  async function submit() {
    if (!isLoaded) return;
    setLoading(true);
    try {
      const result = await signIn.create({
        identifier: email,
        password: pass,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.replace("/(tabs)");
      } else {
        Alert.alert("Sign in incomplete", "Please try again or contact support.");
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Sign in failed", err.errors?.[0]?.longMessage || err.message);
    }
    setLoading(false);
  }

  const onGooglePress = useCallback(async () => {
    setGoogleLoading(true);
    try {
      const { createdSessionId, setActive: oauthSetActive } = await startOAuthFlow();
      if (createdSessionId && oauthSetActive) {
        await oauthSetActive({ session: createdSessionId });
        router.replace("/(tabs)");
      }
    } catch (err) {
      console.error(err);
      Alert.alert("Google sign in failed", err.errors?.[0]?.longMessage || err.message || "Please try again.");
    }
    setGoogleLoading(false);
  }, [startOAuthFlow, router]);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: T.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24, paddingTop: insets.top + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: 28, fontWeight: "900", color: T.brand, marginBottom: 6, letterSpacing: -0.5 }}>⚡ vimen</Text>
        <Text style={{ fontSize: 22, fontWeight: "800", color: T.text, marginBottom: 6 }}>{t("auth.welcomeBack")}</Text>
        <Text style={{ fontSize: 14, color: T.muted, marginBottom: 28 }}>{t("auth.signInSub")}</Text>

        <TouchableOpacity
          onPress={onGooglePress}
          disabled={googleLoading}
          style={{
            flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
            borderWidth: 1, borderColor: T.borderMed ?? "#00000022", borderRadius: 10,
            padding: 14, backgroundColor: T.surface, opacity: googleLoading ? 0.6 : 1,
          }}
        >
          <View style={{
            width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff",
            alignItems: "center", justifyContent: "center",
          }}>
            <Text style={{ fontSize: 13, fontWeight: "800", color: "#4285F4" }}>G</Text>
          </View>
          <Text style={{ fontSize: 15, fontWeight: "600", color: T.text }}>
            {googleLoading ? "…" : t("auth.continueWithGoogle")}
          </Text>
        </TouchableOpacity>

        <View style={{ flexDirection: "row", alignItems: "center", marginVertical: 20 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: T.border }} />
          <Text style={{ marginHorizontal: 12, fontSize: 12, color: T.muted, textTransform: "uppercase" }}>
            {t("auth.orDivider")}
          </Text>
          <View style={{ flex: 1, height: 1, backgroundColor: T.border }} />
        </View>

        <Text style={{ fontSize: 13, fontWeight: "500", color: T.muted, marginBottom: 6 }}>{t("auth.email")}</Text>
        <TextInput
          style={inputStyle}
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor={T.hint}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
        />

        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 14, marginBottom: 6 }}>
          <Text style={{ fontSize: 13, fontWeight: "500", color: T.muted }}>{t("auth.password")}</Text>
          <TouchableOpacity onPress={() => router.push("/(auth)/forgot-password")}>
            <Text style={{ fontSize: 13, fontWeight: "600", color: T.brand }}>{t("auth.forgotPassword")}</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          style={inputStyle}
          value={pass}
          onChangeText={setPass}
          placeholder="••••••••"
          placeholderTextColor={T.hint}
          secureTextEntry
          autoComplete="password"
        />

        <TouchableOpacity
          onPress={submit}
          disabled={loading || !email || !pass}
          style={{
            marginTop: 24, backgroundColor: T.brand, borderRadius: 10, padding: 16,
            alignItems: "center", opacity: loading || !email || !pass ? 0.6 : 1,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
            {loading ? t("auth.signingIn") : `${t("common.signIn")} →`}
          </Text>
        </TouchableOpacity>

        <View style={{ flexDirection: "row", justifyContent: "center", marginTop: 24 }}>
          <Text style={{ fontSize: 14, color: T.muted }}>{t("auth.noAccount")} </Text>
          <TouchableOpacity onPress={() => router.push("/(auth)/sign-up")}>
            <Text style={{ fontSize: 14, color: T.brand, fontWeight: "700" }}>{t("auth.signUpFree")}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const inputStyle = {
  width: "100%", padding: 14, borderRadius: 10,
  borderWidth: 1, borderColor: T.borderMed ?? "#00000022",
  fontSize: 15, backgroundColor: T.surface, color: T.text,
};