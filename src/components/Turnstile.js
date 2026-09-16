// src/components/Turnstile.js
//
// Widget Cloudflare Turnstile pour React Native, via une WebView chargeant
// une mini-page HTML qui embarque le script officiel Cloudflare.
// Communique avec React Native via window.ReactNativeWebView.postMessage.

import { useRef } from "react";
import { View, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";

const SITE_KEY = process.env.EXPO_PUBLIC_TURNSTILE_SITE_KEY;

const HTML = `
<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
    <style>
      html, body { margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; background: transparent; }
    </style>
  </head>
  <body>
    <div class="cf-turnstile"
      data-sitekey="${SITE_KEY}"
      data-callback="onVerify"
      data-expired-callback="onExpire"
      data-error-callback="onError">
    </div>
    <script>
      function onVerify(token) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: "verify", token }));
      }
      function onExpire() {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: "expire" }));
      }
      function onError() {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: "error" }));
      }
    </script>
  </body>
</html>
`;

export default function Turnstile({ onVerify, onExpire }) {
  const webviewRef = useRef(null);

  function handleMessage(event) {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === "verify") {
        onVerify?.(data.token);
      } else if (data.type === "expire" || data.type === "error") {
        onExpire?.();
      }
    } catch (err) {
      console.error("Turnstile: message invalide reçu de la WebView", err);
    }
  }

  if (!SITE_KEY) {
    console.error("Turnstile: EXPO_PUBLIC_TURNSTILE_SITE_KEY manquant");
    return null;
  }

  return (
    <View style={styles.container}>
      <WebView
        ref={webviewRef}
        source={{ html: HTML, baseUrl: "https://vimen.app" }}
        onMessage={handleMessage}
        style={styles.webview}
        scrollEnabled={false}
        javaScriptEnabled
        originWhitelist={["*"]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 70,
    width: "100%",
    overflow: "hidden",
    borderRadius: 8,
  },
  webview: {
    backgroundColor: "transparent",
  },
});