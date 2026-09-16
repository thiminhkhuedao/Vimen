// src/components/PrivacyControls.js
//
// Contrôles RGPD : export des données personnelles et suppression de
// compte, via les Edge Functions Supabase `export-data` et `delete-account`.

import { useState } from "react";
import { View, Text, Alert, StyleSheet } from "react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { useAuth } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import { Btn, Card } from "./UI";
import { T } from "../styles/tokens";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;

export default function PrivacyControls() {
  const { getToken, signOut } = useAuth();
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function callFunction(name) {
    const token = await getToken();
    if (!token) throw new Error("Session expirée, reconnecte-toi.");

    const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await res.json();
    if (!res.ok || data.error) {
      throw new Error(data.error || `Erreur serveur (${res.status})`);
    }
    return data;
  }

  async function handleExport() {
    setExporting(true);
    try {
      const data = await callFunction("export-data");
      const fileUri = `${FileSystem.documentDirectory}vimen-export-${Date.now()}.json`;
      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(data, null, 2));

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(fileUri, {
          mimeType: "application/json",
          dialogTitle: "Exporter mes données",
        });
      } else {
        Alert.alert("Export prêt", `Fichier enregistré : ${fileUri}`);
      }
    } catch (err) {
      Alert.alert("Échec de l'export", err.message || "Une erreur est survenue.");
    }
    setExporting(false);
  }

  function confirmDelete() {
    Alert.alert(
      "Supprimer ton compte ?",
      "Cette action est irréversible. Toutes tes données (factures, clients, historique) seront définitivement supprimées.",
      [
        { text: "Annuler", style: "cancel" },
        { text: "Supprimer définitivement", style: "destructive", onPress: handleDelete },
      ]
    );
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await callFunction("delete-account");
      await signOut();
      router.replace("/(auth)/sign-in");
    } catch (err) {
      Alert.alert("Échec de la suppression", err.message || "Une erreur est survenue.");
      setDeleting(false);
    }
  }

  return (
    <Card>
      <View style={styles.row}>
        <View style={styles.textBlock}>
          <Text style={styles.title}>Exporter mes données</Text>
          <Text style={styles.subtitle}>Télécharge une copie complète de tes données au format JSON.</Text>
        </View>
      </View>
      <Btn onPress={handleExport} disabled={exporting} variant="ghost" style={{ marginTop: 10 }}>
        {exporting ? "Export en cours…" : "Exporter mes données"}
      </Btn>

      <View style={[styles.row, { marginTop: 24 }]}>
        <View style={styles.textBlock}>
          <Text style={styles.title}>Supprimer mon compte</Text>
          <Text style={styles.subtitle}>Supprime définitivement ton compte et toutes tes données associées.</Text>
        </View>
      </View>
      <Btn onPress={confirmDelete} disabled={deleting} variant="danger" style={{ marginTop: 10 }}>
        {deleting ? "Suppression…" : "Supprimer mon compte"}
      </Btn>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start" },
  textBlock: { flex: 1 },
  title: { fontSize: 15, fontWeight: "700", color: T.text },
  subtitle: { fontSize: 13, color: T.muted, marginTop: 4, lineHeight: 18 },
});