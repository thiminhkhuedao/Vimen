// src/lib/security.js


import { t } from "../hooks/i18n/index.js";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Messages affichés à l'utilisateur selon la raison de refus renvoyée par
// l'Edge Function, traduits via i18n (clés auth.errors.*). 
const REASON_KEYS = {
  captcha_failed: "auth.errors.captchaFailed",
  rate_limited_ip: "auth.errors.rateLimitedIp",
  rate_limited_identifier: "auth.errors.rateLimitedIdentifier",
  bot_detected: "auth.errors.generic",
  invalid_action: "auth.errors.generic",
  invalid_identifier: "auth.errors.generic",
  invalid_turnstile_token: "auth.errors.captchaFailed",
  unknown_action: "auth.errors.generic",
  server_error: "auth.errors.serverError",
};

const message = (reason) => t(REASON_KEYS[reason] || "auth.errors.generic");

/**
 *
 * @param {string} action - "signup" | "login" | "password_reset" | "contact_form" | "booking_request"
 * @param {object} [options]
 * @param {string} [options.identifier] - email ou autre identifiant unique de l'utilisateur
 * @param {string} [options.turnstileToken] - token du widget Turnstile
 * @param {string} [options.honeypot] - valeur du champ piège anti-bot (doit rester vide)
 * @returns {Promise<string|null>} un message d'erreur si bloqué, sinon null
 */
export async function checkRateLimit(action, { identifier, turnstileToken, honeypot } = {}) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("checkRateLimit: SUPABASE_URL ou SUPABASE_ANON_KEY manquant côté client");
    return message();
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/check-rate-limit`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ action, identifier, turnstileToken, honeypot }),
    });

    const data = await res.json();

    if (data.allowed === true) {
      return null;
    }

    return message(data.reason);
  } catch (err) {
    console.error("checkRateLimit: échec de l'appel réseau", err);
    return message();
  }
}