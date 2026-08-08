// src/i18n/index.js

import en from "./en.js";
import fr from "./fr.js";

const TRANSLATIONS = { en, fr };
const SUPPORTED    = ["en", "fr"];
const FALLBACK     = "en";
const STORAGE_KEY  = "Vinem_language";

let _current = FALLBACK;

// Web gets a working storage adapter automatically. On React Native this
// stays null until the host app calls configureStorage().
let _storage = (typeof localStorage !== "undefined")
  ? { getItem: (k) => localStorage.getItem(k), setItem: (k, v) => localStorage.setItem(k, v) }
  : null;

// Detect initial language from:
//   1. Stored preference (web only, synchronously — localStorage)
//   2. Browser/OS locale
//   3. Fallback to "en"
// On React Native, step 1 is skipped here (AsyncStorage is async, so it
// can't be read synchronously at module load) — see configureStorage().
function detectLanguage() {
  try {
    if (typeof localStorage !== "undefined") {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && SUPPORTED.includes(stored)) return stored;
    }
    const locale = (
      (typeof navigator !== "undefined" && (navigator.language || navigator.languages?.[0])) ||
      FALLBACK
    );
    const lang = locale.split("-")[0].toLowerCase();
    return SUPPORTED.includes(lang) ? lang : FALLBACK;
  } catch {
    return FALLBACK;
  }
}

_current = detectLanguage();

// ── Core API ──────────────────────────────────────────

/** Get current language code ("en" | "fr") */
export function getLanguage() {
  return _current;
}

/** Switch language — persists via whatever storage adapter is active. */
export function setLanguage(lang) {
  if (!SUPPORTED.includes(lang)) {
    console.warn(`[i18n] Unsupported language: ${lang}. Supported: ${SUPPORTED.join(", ")}`);
    return;
  }
  _current = lang;
  try {
    const result = _storage?.setItem(STORAGE_KEY, lang);
    // AsyncStorage's setItem returns a promise — don't let a rejection
    // (e.g. storage full) surface as an unhandled rejection.
    if (result && typeof result.catch === "function") result.catch(() => {});
  } catch { /* SSR or storage blocked */ }
}

/**
 * Plug in a storage adapter for platforms without localStorage (React
 * Native). Call once at app startup, e.g. with AsyncStorage directly —
 * its {getItem, setItem} shape already matches what this module expects.
 *
 * Also immediately (asynchronously) checks the adapter for a previously
 * saved language and, if found and different from the current guess,
 * applies it and notifies every useTranslation() consumer so the UI
 * updates without needing a manual refresh.
 */
export function configureStorage(adapter) {
  _storage = adapter;
  return loadPersistedLanguage();
}

async function loadPersistedLanguage() {
  if (!_storage) return;
  try {
    const stored = await _storage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED.includes(stored) && stored !== _current) {
      _current = stored;
      _notifyListeners();
    }
  } catch { /* storage unavailable/blocked — keep the OS-locale guess */ }
}

/** All supported language codes */
export const LANGUAGES = [
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "fr", label: "French",  nativeLabel: "Français" },
];

// ── Translation lookup ────────────────────────────────

/**
 * Translate a dot-notation key with optional interpolation.
 *
 * @param {string} key     - e.g. "common.save", "dashboard.greeting"
 * @param {object} [vars]  - e.g. { name: "Jake", count: 3 }
 * @returns {string}       - Translated string, falls back to English,
 *                           then to the key itself if not found.
 *
 * Interpolation syntax: both {varName} and {{varName}} are supported —
 * the translation files mix both conventions, so the engine accepts
 * either rather than requiring one specific style.
 * e.g. t("dashboard.greeting", { name: "Jake" })
 *   → "Good morning, Jake 👋" (en)
 *   → "Bonjour, Jake 👋"      (fr)
 */
export function t(key, vars) {
  const result = lookup(_current, key) ?? lookup(FALLBACK, key) ?? key;
  return interpolate(result, vars);
}

/**
 * Pluralization helper. Picks "<baseKey>_one" when count === 1 and
 * "<baseKey>_other" otherwise, and passes `count` through to
 * interpolation automatically — English and French both only need
 * these two forms, so this simple rule covers the translation files
 * as written (keys like quotes.stats.quotesCount_one / _other).
 *
 * Prefer this over manually writing
 *   t(count === 1 ? "x.count_one" : "x.count_other", { count })
 * at every call site — same result, less to get wrong.
 *
 * @param {string} baseKey - key WITHOUT the _one/_other suffix
 * @param {number} count
 * @param {object} [vars]  - extra interpolation vars besides count
 */
export function tc(baseKey, count, vars) {
  const suffix = count === 1 ? "_one" : "_other";
  return t(`${baseKey}${suffix}`, { count, ...vars });
}

function lookup(lang, key) {
  const dict = TRANSLATIONS[lang];
  if (!dict) return undefined;
  return key.split(".").reduce((obj, k) => (obj && typeof obj === "object" ? obj[k] : undefined), dict);
}

function interpolate(str, vars) {
  if (!vars || typeof str !== "string") return str;
  // Matches {{varName}} first, then falls back to {varName} — the
  // translation files use both styles interchangeably.
  return str.replace(/\{\{(\w+)\}\}|\{(\w+)\}/g, (match, k1, k2) => {
    const k = k1 ?? k2;
    return vars[k] !== undefined ? String(vars[k]) : match;
  });
}

// ── React hook (web — Vite) ───────────────────────────
// Provides reactive re-render when language changes.
// Import { useTranslation } from "../i18n" in any React component.

import { useState, useEffect, useCallback } from "react";

let _listeners = new Set();

function _notifyListeners() {
  _listeners.forEach(fn => fn(_current));
}

const _originalSetLanguage = setLanguage;
// Wrap setLanguage to notify React listeners
export function useTranslation() {
  const [lang, setLang] = useState(_current);

  useEffect(() => {
    const handler = (newLang) => setLang(newLang);
    _listeners.add(handler);
    return () => _listeners.delete(handler);
  }, []);

  const changeLanguage = useCallback((newLang) => {
    _originalSetLanguage(newLang);
    _notifyListeners();
  }, []);

  // Return t/tc scoped to current lang (reactive)
  const tl = useCallback((key, vars) => {
    const result = lookup(lang, key) ?? lookup(FALLBACK, key) ?? key;
    return interpolate(result, vars);
  }, [lang]);

  const tcl = useCallback((baseKey, count, vars) => {
    const suffix = count === 1 ? "_one" : "_other";
    const result = lookup(lang, `${baseKey}${suffix}`) ?? lookup(FALLBACK, `${baseKey}${suffix}`) ?? baseKey;
    return interpolate(result, { count, ...vars });
  }, [lang]);

  return { t: tl, tc: tcl, lang, setLanguage: changeLanguage, languages: LANGUAGES };
}
