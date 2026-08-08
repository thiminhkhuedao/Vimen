// src/hooks/useLanguage.js (Expo only)

import { useState, useEffect, useCallback } from "react";
import * as SecureStore from "expo-secure-store";
import { getLanguage, setLanguage as _setLanguage, LANGUAGES, t as _t } from "../hooks/i18n/index.js";

const STORAGE_KEY = "Vinem_language";

// Module-level listener set so all mounted components
// re-render together when the language changes.
const listeners = new Set();

function notifyAll(lang) {
  listeners.forEach(fn => fn(lang));
}

export function useLanguage() {
  const [lang, setLang] = useState(getLanguage());

  // On first mount, try to load stored preference from SecureStore
  useEffect(() => {
    SecureStore.getItemAsync(STORAGE_KEY).then(stored => {
      if (stored && stored !== getLanguage()) {
        _setLanguage(stored);
        setLang(stored);
        notifyAll(stored);
      }
    }).catch(() => {/* storage unavailable */});

    // Subscribe to language changes from other components
    const handler = (newLang) => setLang(newLang);
    listeners.add(handler);
    return () => listeners.delete(handler);
  }, []);

  const changeLanguage = useCallback(async (newLang) => {
    _setLanguage(newLang);
    notifyAll(newLang);
    try {
      await SecureStore.setItemAsync(STORAGE_KEY, newLang);
    } catch { /* non-fatal */ }
  }, []);

  // Reactive t() — re-evaluates when lang changes
  const tl = useCallback((key, vars) => _t(key, vars), [lang]);

  return { t: tl, lang, setLanguage: changeLanguage, languages: LANGUAGES };
}