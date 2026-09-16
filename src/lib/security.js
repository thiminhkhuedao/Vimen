// src/lib/security.js
//
// Client léger pour l'Edge Function Supabase `check-rate-limit`.
// À appeler AVANT toute action sensible (signup, login, contact form...).
//
// Usage :
//   const errorMsg = await checkRateLimit("signup", { identifier: email, turnstileToken });
//   if (errorMsg) { setError(errorMsg); return; }

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Messages affichés à l'utilisateur selon la raison de refus renvoyée
// par l'Edge Function. On reste volontairement vague sur les raisons
// techniques (rate_limited_ip vs rate_limited_identifier) pour ne pas
// donner d'indices utiles à quelqu'un qui chercherait à contourner la limite.
const REASON_MESSAGES = {
  captcha_failed: "Verification failed. Please complete the challenge again.",
  rate_limited_ip: "Too many attempts. Please try again later.",
  rate_limited_identifier: "Too many attempts for this email. Please try again later.",
  bot_detected: "Something went wrong. Please try again.",
  invalid_action: "Something went wrong. Please try again.",
  invalid_identifier: "Something went wrong. Please try again.",
  invalid_turnstile_token: "Verification failed. Please complete the challenge again.",
  unknown_action: "Something went wrong. Please try again.",
  server_error: "Something went wrong. Please try again in a moment.",
};

const DEFAULT_MESSAGE = "Something went wrong. Please try again.";

/**
 * Vérifie le rate limit + CAPTCHA côté serveur avant une action sensible.
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
    return DEFAULT_MESSAGE;
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

    return REASON_MESSAGES[data.reason] || DEFAULT_MESSAGE;
  } catch (err) {
    console.error("checkRateLimit: échec de l'appel réseau", err);
    // En cas d'erreur réseau, on bloque par défaut plutôt que de laisser
    // passer une action sensible sans vérification (même logique que
    // TURNSTILE_SECRET_KEY manquant côté serveur : refuse par défaut).
    return DEFAULT_MESSAGE;
  }
}