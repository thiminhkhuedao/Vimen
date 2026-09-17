// app/(auth)/sign-up.js
import { useCallback, useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useSignUp, useOAuth } from "@clerk/clerk-expo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { T } from "../../src/styles/tokens";
import { checkRateLimit } from "../../src/lib/security";
import Turnstile from "../../src/components/Turnstile";
import { useTranslation } from "../../src/hooks/i18n/index.js";
import { useWarmUpBrowser } from "../../src/hooks/useWarmUpBrowser";

export default function SignUpScreen() {
  useWarmUpBrowser();

  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const { signUp, setActive, isLoaded } = useSignUp();
  const { startOAuthFlow } = useOAuth({ strategy: "oauth_google" });

  const [step, setStep]       = useState("form"); // "form" | "verify"
  const [name, setName]       = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail]     = useState("");
  const [pass, setPass]       = useState("");
  const [code, setCode]       = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError]     = useState("");
  const [captchaToken, setCaptchaToken] = useState(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  async function submit() {
    if (!isLoaded) return;
    setError("");
    if (!agreedToTerms) { setError("Please accept the Privacy Policy and Terms of Service to continue."); return; }
    if (!captchaToken) { setError("Please complete the verification challenge."); return; }
    const rateLimitMsg = await checkRateLimit("signup", { identifier: email.trim(), turnstileToken: captchaToken });
    if (rateLimitMsg) { setError(rateLimitMsg); return; }
    setLoading(true);

    try {
      const trimmedName = name.trim();
      const [firstName, ...rest] = trimmedName.split(" ");
      const lastName = rest.join(" ");

      await signUp.create({
        emailAddress: email,
        password: pass,
        username: username,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
      });

      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setStep("verify");
    } catch (err) {
      console.error(err);
      Alert.alert("Sign up failed", err.errors?.[0]?.longMessage || err.message);
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
      Alert.alert("Google sign up failed", err.errors?.[0]?.longMessage || err.message || "Please try again.");
    }
    setGoogleLoading(false);
  }, [startOAuthFlow, router]);

  async function verify() {
    if (!isLoaded) return;
    setError("");
    setLoading(true);

    try {
      const result = await signUp.attemptEmailAddressVerification({ code });

      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.replace("/(tabs)");
      } else if (result.status === "missing_requirements") {
        setError(
          `Almost there — still missing: ${result.missingFields?.join(", ") || "some required fields"}.`
        );
      } else {
        setError(`Unexpected status: ${result.status}`);
      }
    } catch (err) {
      setError(err?.errors?.[0]?.longMessage || err?.message || "Invalid code");
    }
    setLoading(false);
  }

  if (step === "verify") {
    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: T.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24, paddingTop: insets.top + 40 }} keyboardShouldPersistTaps="handled">
          <Text style={{ fontSize: 32, textAlign: "center", marginBottom: 16 }}>📬</Text>
          <Text style={{ fontSize: 20, fontWeight: "800", textAlign: "center", marginBottom: 8 }}>{t("auth.verifyEmail")}</Text>
          <Text style={{ fontSize: 14, color: T.muted, textAlign: "center", marginBottom: 28, lineHeight: 20 }}>
            {t("auth.verifyCode", { email })}
          </Text>

          <TextInput
            style={{ ...inputStyle, fontSize: 28, fontWeight: "800", letterSpacing: 8, textAlign: "center" }}
            value={code}
            onChangeText={v => setCode(v.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            placeholderTextColor={T.hint}
            maxLength={6}
            keyboardType="number-pad"
            autoFocus
          />

          {!!error && (
            <View style={{ backgroundColor: "#FEF2F2", borderRadius: 8, padding: 12, marginTop: 14 }}>
              <Text style={{ color: "#EF4444", fontSize: 13 }}>{error}</Text>
            </View>
          )}

          <TouchableOpacity
            onPress={verify}
            disabled={loading || code.length !== 6}
            style={{
              marginTop: 20, backgroundColor: T.brand, borderRadius: 10, padding: 16,
              alignItems: "center", opacity: loading || code.length !== 6 ? 0.6 : 1,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
              {loading ? t("auth.verifying") : `${t("auth.verifyEmail2")} →`}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => { setStep("form"); setError(""); }} style={{ marginTop: 16, alignItems: "center" }}>
            <Text style={{ color: T.muted, fontSize: 13, textDecorationLine: "underline" }}>{t("auth.backToSignUp")}</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: T.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24, paddingTop: insets.top + 40 }} keyboardShouldPersistTaps="handled">
        <Text style={{ fontSize: 28, fontWeight: "900", color: T.brand, marginBottom: 6, letterSpacing: -0.5 }}>⚡ vimen</Text>
        <Text style={{ fontSize: 22, fontWeight: "800", color: T.text, marginBottom: 6 }}>{t("auth.createAccount")}</Text>
        <Text style={{ fontSize: 14, color: T.muted, marginBottom: 24 }}>{t("auth.signUpSub")}</Text>

        <TouchableOpacity
          onPress={onGooglePress}
          disabled={googleLoading}
          style={{
            flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
            borderWidth: 1, borderColor: T.borderMed ?? "#00000022", borderRadius: 10,
            padding: 14, backgroundColor: T.surface, opacity: googleLoading ? 0.6 : 1, marginBottom: 20,
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

        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 20 }}>
          <View style={{ flex: 1, height: 1, backgroundColor: T.border }} />
          <Text style={{ marginHorizontal: 12, fontSize: 12, color: T.muted, textTransform: "uppercase" }}>
            {t("auth.orDivider")}
          </Text>
          <View style={{ flex: 1, height: 1, backgroundColor: T.border }} />
        </View>

        <Field label={t("auth.fullName")}>
          <TextInput style={inputStyle} value={name} onChangeText={setName} placeholder="Jake Morrison" placeholderTextColor={T.hint} autoFocus/>
        </Field>
        <Field label={t("auth.username")}>
          <TextInput style={inputStyle} value={username} onChangeText={v => setUsername(v.replace(/\s/g, ""))} placeholder="jakemorrison" placeholderTextColor={T.hint} autoCapitalize="none"/>
        </Field>
        <Field label={t("auth.email")}>
          <TextInput style={inputStyle} value={email} onChangeText={setEmail} placeholder="you@example.com" placeholderTextColor={T.hint} autoCapitalize="none" keyboardType="email-address"/>
        </Field>
        <Field label={t("auth.password")}>
          <TextInput style={inputStyle} value={pass} onChangeText={setPass} placeholder="••••••••" placeholderTextColor={T.hint} secureTextEntry/>
        </Field>

        {!!error && (
          <View style={{ backgroundColor: "#FEF2F2", borderRadius: 8, padding: 12, marginTop: 4 }}>
            <Text style={{ color: "#EF4444", fontSize: 13 }}>{error}</Text>
          </View>
        )}

        <View style={{ marginTop: 14 }}>
          <TouchableOpacity
            onPress={() => setAgreedToTerms(v => !v)}
            style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}
            activeOpacity={0.7}
          >
            <View style={{
              width: 20, height: 20, borderRadius: 5, marginTop: 1,
              borderWidth: 1.5, borderColor: agreedToTerms ? T.brand : T.border,
              backgroundColor: agreedToTerms ? T.brand : "transparent",
              alignItems: "center", justifyContent: "center",
            }}>
              {agreedToTerms && <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>✓</Text>}
            </View>
            <Text style={{ flex: 1, fontSize: 13, color: T.muted, lineHeight: 19 }}>
              I agree to the{" "}
              <Text style={{ color: T.brand, fontWeight: "600" }} onPress={() => router.push("/(screens)/privacy-policy")}>
                Privacy Policy
              </Text>
              {" "}and{" "}
              <Text style={{ color: T.brand, fontWeight: "600" }} onPress={() => router.push("/(screens)/terms-of-service")}>
                Terms of Service
              </Text>
            </Text>
          </TouchableOpacity>
        </View>

        <View style={{ marginTop: 14 }}>
          <Turnstile onVerify={setCaptchaToken} onExpire={() => setCaptchaToken(null)} />
        </View>

        <TouchableOpacity
          onPress={submit}
          disabled={loading || !email || !pass || !name || !captchaToken || !agreedToTerms}
          style={{
            marginTop: 20, backgroundColor: T.brand, borderRadius: 10, padding: 16,
            alignItems: "center", opacity: loading || !email || !pass || !name || !captchaToken || !agreedToTerms ? 0.6 : 1,
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>
            {loading ? t("auth.creatingAccount") : `${t("auth.createAccount")} →`}
          </Text>
        </TouchableOpacity>

        <View style={{ flexDirection: "row", justifyContent: "center", marginTop: 24 }}>
          <Text style={{ fontSize: 14, color: T.muted }}>{t("auth.alreadyAccount")} </Text>
          <TouchableOpacity onPress={() => router.push("/(auth)/sign-in")}>
            <Text style={{ fontSize: 14, color: T.brand, fontWeight: "700" }}>{t("common.signIn")}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontSize: 13, fontWeight: "500", color: T.muted, marginBottom: 6 }}>{label}</Text>
      {children}
    </View>
  );
}

const inputStyle = {
  width: "100%", padding: 14, borderRadius: 10,
  borderWidth: 1, borderColor: T.borderMed ?? "#00000022",
  fontSize: 15, backgroundColor: T.surface, color: T.text,
};