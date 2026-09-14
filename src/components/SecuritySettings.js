// src/components/SecuritySettings.js
//
// Équivalent mobile de SecuritySettings.jsx (web), qui lui embarquait le
// composant tout-fait <UserProfile /> de Clerk. Ce composant n'existe pas
// en version Expo/React Native — il faut construire l'interface à la main
// avec les primitives de @clerk/clerk-expo :
//   - user.createTOTP() / user.verifyTOTP() / user.disableTOTP() pour le 2FA
//   - user.getSessions() puis session.revoke() pour les appareils connectés
//
// Nécessite : npx expo install react-native-qr-svg

import { useState, useEffect, useCallback } from "react";
import { View, Text, TextInput, Alert, ActivityIndicator } from "react-native";
import { useUser, useAuth } from "@clerk/clerk-expo";
import { QrCodeSvg } from "react-native-qr-svg";
import { Card, Btn, Sheet, Badge } from "./UI";
import { T, SS } from "../styles/tokens";

export default function SecuritySettings() {
  const { user } = useUser();
  const { sessionId: currentSessionId } = useAuth();

  const [totpSheet, setTotpSheet]   = useState(false);
  const [totp,      setTotp]        = useState(null); // TOTPResource en cours d'inscription
  const [code,      setCode]        = useState("");
  const [verifying, setVerifying]   = useState(false);
  const [disabling, setDisabling]   = useState(false);

  const [sessions,  setSessions]    = useState(null);
  const [revokingId,setRevokingId]  = useState(null);

  const twoFactorEnabled = !!user?.twoFactorEnabled;

  const loadSessions = useCallback(async () => {
    if (!user) return;
    try {
      const list = await user.getSessions();
      setSessions(list);
    } catch (err) {
      console.error("[SecuritySettings] getSessions failed:", err);
      setSessions([]);
    }
  }, [user]);

  useEffect(() => { loadSessions(); }, [loadSessions]);

  async function startTotpEnrollment() {
    setTotpSheet(true);
    setCode("");
    try {
      const resource = await user.createTOTP();
      setTotp(resource);
    } catch (err) {
      console.error("[SecuritySettings] createTOTP failed:", err);
      Alert.alert("Impossible de démarrer l'activation du 2FA. Réessaie.");
      setTotpSheet(false);
    }
  }

  async function verifyCode() {
    if (code.length !== 6) return;
    setVerifying(true);
    try {
      await user.verifyTOTP({ code });
      setVerifying(false);
      setTotpSheet(false);
      setTotp(null);
      Alert.alert("2FA activé", "La double authentification est maintenant active sur ton compte.");
    } catch (err) {
      setVerifying(false);
      Alert.alert("Code invalide", "Vérifie le code affiché dans ton application d'authentification et réessaie.");
    }
  }

  function confirmDisable() {
    Alert.alert(
      "Désactiver le 2FA ?",
      "Ton compte sera moins protégé — un mot de passe seul suffira à s'y connecter.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Désactiver", style: "destructive", onPress: async () => {
            setDisabling(true);
            try {
              await user.disableTOTP();
            } catch (err) {
              Alert.alert("Impossible de désactiver le 2FA pour le moment.");
            }
            setDisabling(false);
          },
        },
      ]
    );
  }

  function confirmRevoke(session) {
    Alert.alert(
      "Déconnecter cet appareil ?",
      `${session.latestActivity?.deviceType || "Cet appareil"} sera immédiatement déconnecté de ton compte.`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Déconnecter", style: "destructive", onPress: async () => {
            setRevokingId(session.id);
            try {
              await session.revoke();
              setSessions(prev => prev.filter(s => s.id !== session.id));
            } catch {
              Alert.alert("Impossible de déconnecter cet appareil pour le moment.");
            }
            setRevokingId(null);
          },
        },
      ]
    );
  }

  return (
    <View style={{ gap: 16 }}>
      <Card>
        <View style={[SS.spaceBetween, { marginBottom: 6 }]}>
          <Text style={{ fontSize: 15, fontWeight: "700" }}>Double authentification (2FA)</Text>
          <Badge color={twoFactorEnabled ? "green" : "gray"}>{twoFactorEnabled ? "Activé" : "Désactivé"}</Badge>
        </View>
        <Text style={{ fontSize: 13, color: T.muted, marginBottom: 16 }}>
          Ajoute une vérification par code à usage unique (via une app comme Google Authenticator) en plus de ton mot de passe.
        </Text>
        {twoFactorEnabled ? (
          <Btn variant="danger" onPress={confirmDisable} disabled={disabling}>
            {disabling ? "Désactivation..." : "Désactiver le 2FA"}
          </Btn>
        ) : (
          <Btn onPress={startTotpEnrollment}>Activer le 2FA</Btn>
        )}
      </Card>

      <Card>
        <Text style={{ fontSize: 15, fontWeight: "700", marginBottom: 6 }}>Appareils connectés</Text>
        <Text style={{ fontSize: 13, color: T.muted, marginBottom: 16 }}>
          Si tu ne reconnais pas un appareil dans cette liste, déconnecte-le immédiatement.
        </Text>
        {sessions === null ? (
          <ActivityIndicator color={T.brand} />
        ) : sessions.length === 0 ? (
          <Text style={{ fontSize: 13, color: T.muted }}>Aucune session active trouvée.</Text>
        ) : (
          sessions.map(s => (
            <View key={s.id} style={[SS.spaceBetween, { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: T.border }]}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={{ fontSize: 14, fontWeight: "600" }}>
                  {s.latestActivity?.deviceType || "Appareil inconnu"}
                  {s.id === currentSessionId ? "  (cet appareil)" : ""}
                </Text>
                <Text style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>
                  {[s.latestActivity?.city, s.latestActivity?.country].filter(Boolean).join(", ") || "Localisation inconnue"}
                  {"  ·  "}Actif {s.lastActiveAt ? new Date(s.lastActiveAt).toLocaleDateString() : "récemment"}
                </Text>
              </View>
              {s.id !== currentSessionId && (
                <Btn size="sm" variant="danger" onPress={() => confirmRevoke(s)} disabled={revokingId === s.id}>
                  {revokingId === s.id ? "..." : "Déconnecter"}
                </Btn>
              )}
            </View>
          ))
        )}
      </Card>

      <Sheet visible={totpSheet} onClose={() => { setTotpSheet(false); setTotp(null); }} title="Activer le 2FA" height="70%">
        {!totp ? (
          <ActivityIndicator color={T.brand} />
        ) : (
          <>
            <Text style={{ fontSize: 13, color: T.muted, marginBottom: 16, lineHeight: 20 }}>
              Scanne ce QR code avec Google Authenticator, Authy, ou une app équivalente.
            </Text>
            <View style={{ alignItems: "center", marginBottom: 16 }}>
              <QrCodeSvg value={totp.uri} frameSize={200} />
            </View>
            <Text style={{ fontSize: 11, color: T.hint, textAlign: "center", marginBottom: 16 }}>
              Impossible de scanner ? Entre ce code manuellement : {totp.secret}
            </Text>
            <Text style={{ fontSize: 13, fontWeight: "600", marginBottom: 6 }}>Code à 6 chiffres</Text>
            <TextInput
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              maxLength={6}
              placeholder="000000"
              style={{ borderWidth: 1, borderColor: T.border, borderRadius: 8, padding: 12, fontSize: 20, letterSpacing: 6, textAlign: "center", marginBottom: 16 }}
            />
            <Btn onPress={verifyCode} disabled={code.length !== 6 || verifying}>
              {verifying ? "Vérification..." : "Confirmer"}
            </Btn>
          </>
        )}
      </Sheet>
    </View>
  );
}