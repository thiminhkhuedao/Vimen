// app/(auth)/sign-in.js
import { useState } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ScrollView, Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useSignIn } from "@clerk/clerk-expo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { T } from "../../src/styles/tokens";

export default function SignInScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signIn, setActive, isLoaded } = useSignIn();

  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);

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

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: T.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24, paddingTop: insets.top + 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={{ fontSize: 28, fontWeight: "900", color: T.brand, marginBottom: 6, letterSpacing: -0.5 }}>⚡ Vinem</Text>
        <Text style={{ fontSize: 22, fontWeight: "800", color: T.text, marginBottom: 6 }}>Welcome back</Text>
        <Text style={{ fontSize: 14, color: T.muted, marginBottom: 28 }}>Sign in to your Vinem account</Text>

        <Text style={{ fontSize: 13, fontWeight: "500", color: T.muted, marginBottom: 6 }}>Email</Text>
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

        <Text style={{ fontSize: 13, fontWeight: "500", color: T.muted, marginTop: 14, marginBottom: 6 }}>Password</Text>
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
            {loading ? "Please wait…" : "Sign in →"}
          </Text>
        </TouchableOpacity>

        <View style={{ flexDirection: "row", justifyContent: "center", marginTop: 24 }}>
          <Text style={{ fontSize: 14, color: T.muted }}>No account? </Text>
          <TouchableOpacity onPress={() => router.push("/(auth)/sign-up")}>
            <Text style={{ fontSize: 14, color: T.brand, fontWeight: "700" }}>Sign up free</Text>
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