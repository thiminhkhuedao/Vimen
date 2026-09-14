// src/components/ErrorBoundary.js
//
// Équivalent mobile de src/components/ErrorBoundary.jsx (web). Capture
// tout crash de rendu React Native et l'envoie à Sentry — sans lui, les
// erreurs de rendu (pas les erreurs de bootstrap/réseau, celles-là sont
// déjà captées par Sentry.init dans _layout.js) ne remontent jamais.

import { Component } from "react";
import { View, Text, TouchableOpacity } from "react-native";
import * as Sentry from "@sentry/react-native";
import { T } from "../styles/tokens";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    Sentry.captureException(error, { extra: { componentStack: info?.componentStack } });
    if (__DEV__) console.error("[Vimen] Render error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: T.surface }}>
          <Text style={{ fontSize: 40, marginBottom: 16 }}>⚠️</Text>
          <Text style={{ fontSize: 18, fontWeight: "700", color: T.text, marginBottom: 8, textAlign: "center" }}>
            Oups, une erreur est survenue
          </Text>
          <Text style={{ fontSize: 14, color: T.muted, textAlign: "center", marginBottom: 24, lineHeight: 20 }}>
            Le problème a été enregistré. Redémarre l'app — si ça persiste, contacte le support.
          </Text>
          <TouchableOpacity
            onPress={() => this.setState({ hasError: false })}
            style={{ backgroundColor: T.brand, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24 }}
          >
            <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Réessayer</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}