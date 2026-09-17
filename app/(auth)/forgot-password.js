// app/(auth)/forgot-password.js
//
// Flux de réinitialisation de mot de passe Clerk, en deux étapes :
//   1. L'utilisateur saisit son email -> Clerk envoie un code par email
//   2. L'utilisateur saisit le code + un nouveau mot de passe -> Clerk
//      valide et connecte automatiquement la session si tout est correct.

import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useSignIn } from "@clerk/clerk-expo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { T } from "../../src/styles/tokens";
import { useTranslation } from "../../src/hooks/i18n/index.js";

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const { signIn, setActive, isLoaded } = useSignIn();

  const [step, setStep] = useState("request"); // "request" | "reset"
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPass, setNewPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function requestCode() {
    if (!isLoaded) return;
    setError("");
    setLoading(true);
    try {
      await signIn.create({
        strategy: "reset_password_email_code",
        identifier: email.trim(),
      });
      setStep("reset");
    } catch (err) {
      console.error(err);
      setError(err?.errors?.[0]?.longMessage || err?.message || "Something went wrong. Please try again.");
    }
    setLoading(false);
  }

  async function resetPassword() {
    if (!isLoaded) return;
    setError("");
    setLoading(true);
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: "reset_password_email_code",
        code,
        password: newPass,
      });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.replace("/(tabs)");
      } else {
        setError(`Unexpected status: ${result.status}`);
      }
    } catch (err) {
      console.error(err);
      setError(err?.errors?.[0]?.longMessage || err?.message || "Invalid code or password.");
    }
    setLoading(false);
  }

  if (step === "reset") {
    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: T.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24, paddingTop: insets.top + 40 }} keyboardShouldPersistTaps="handled">
          <Text style={{ fontSize: 32, textAlign: "center", marginBottom: 16 }}>📬</Text>
          <Text style={{ fontSize: 20, fontWeight: "800", textAlign: "center", marginBottom: 8 }}>{t("auth.verifyEmail")}</Text>
          <Text style={{ fontSize: 14, color: T.muted, textAlign: "center", marginBottom: 28, lineHeight: 20 }}>
            {t("auth.resetCodeSent", { email })}
          </Text>

          <Text style={{ fontSize: 13, fontWeight: "500", color: T.muted, marginBottom: 6 }}>{t("auth.resetCodeLabel")}</Text>
          <TextInput
            style={{ ...inputStyle, fontSize: 22, fontWeight: "800", letterSpacing: 6, textAlign: "center" }}
            value={code}
            onChangeText={v => setCode(v.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            placeholderTextColor={T.hint}
            maxLength={6}
            keyboardType="number-pad"
            autoFocus
          />

          <Text style={{ fontSize: 13, fontWeight: "500", color: T.muted, marginTop: 16, marginBottom: 6 }}>{t("auth.newPassword")}</Text>
          <TextInput
            style={inputStyle}
            value={newPass}
            onChangeText={setNewPass}
            placeholder="••••••••"
            placeholderTextColor={T.hint}
            secureTextEntry
          />

          {!!error && (
            <View style={{ backgroundColor: "#FEF2F2", borderRadius: 8, padding: 12, marginTop: 14 }}>
              <Text style={{ color: "#EF4444", fontSize: 13 }}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            onPress={resetPassword}
            disabled={loading || code.length !== 6 || !newPass}
            style={{
              marginTop: 20, backgroundColor: T.brand, borderRadius: 10, padding: 16,
              alignItems: "center", opacity: loading || code.length !== 6 || !newPass ? 0.6 : 1,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
              {loading ? t("auth.resettingPassword") : `${t("auth.resetPasswordBtn")} →`}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => { setStep("request"); setError(""); }} style={{ marginTop: 16, alignItems: "center" }}>
            <Text style={{ color: T.muted, fontSize: 13, textDecorationLine: "underline" }}>{t("auth.backToSignIn")}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: T.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24, paddingTop: insets.top + 40 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 28, fontWeight: "900", color: T.brand, marginBottom: 6, letterSpacing: -0.5 }}>⚡ vimen</Text>
        <Text style={{ fontSize: 22, fontWeight: "800", color: T.text, marginBottom: 6 }}>{t("auth.forgotPasswordTitle")}</Text>
        <Text style={{ fontSize: 14, color: T.muted, marginBottom: 28 }}>{t("auth.forgotPasswordSub")}</Text>

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
          autoFocus
        />

        {!!error && (
          <View style={{ backgroundColor: "#FEF2F2", borderRadius: 8, padding: 12, marginTop: 14 }}>
            <Text style={{ color: "#EF4444", fontSize: 13 }}>{error}</Text>
          </View>
        )}

        <TouchableOpacity
          onPress={requestCode}
          disabled={loading || !email}
          style={{
            marginTop: 24, backgroundColor: T.brand, borderRadius: 10, padding: 16,
            alignItems: "center", opacity: loading || !email ? 0.6 : 1,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
            {loading ? t("auth.sendingResetCode") : `${t("auth.sendResetCode")} →`}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.replace("/(auth)/sign-in")} style={{ marginTop: 20, alignItems: "center" }}>
          <Text style={{ color: T.muted, fontSize: 13, textDecorationLine: "underline" }}>{t("auth.backToSignIn")}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const inputStyle = {
  width: "100%", padding: 14, borderRadius: 10,
  borderWidth: 1, borderColor: T.borderMed ?? "#00000022",
  fontSize: 15, backgroundColor: T.surface, color: T.text,
};