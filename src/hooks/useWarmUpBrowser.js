// src/hooks/useWarmUpBrowser.js
//
// Précharge le navigateur système en arrière-plan pour que le popup
// d'authentification OAuth (Google, etc.) s'ouvre plus vite. Recommandé
// par Clerk pour tout écran qui déclenche un flux OAuth.

import { useEffect } from "react";
import * as WebBrowser from "expo-web-browser";

export function useWarmUpBrowser() {
  useEffect(() => {
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
}