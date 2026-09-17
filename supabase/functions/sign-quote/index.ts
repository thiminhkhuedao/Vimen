// supabase/functions/sign-quote/index.ts
//
// Appelée depuis PublicQuotePage.jsx quand le client signe. Publique et
// non authentifiée par design (le client n'a pas de compte) — la sécurité
// vient du token, difficile à deviner (uuid), pas d'un login.
//
// Appelée avec : { token, signedBy }
// Renvoie :      { success: true, signedAt } ou { error }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit } from "../_shared/rateLimit.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // 10 tentatives / heure / IP — un client légitime peut réessayer en cas
  // de faute de frappe sur son nom, mais ça bloque le brute-force de tokens.
  const rl = await checkRateLimit(req, "sign-quote", 10, 3600);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: "Trop de tentatives. Réessaie plus tard." }), { status: 429, headers: CORS });
  }

  try {
    const { token, signedBy } = await req.json();
    if (!token || !signedBy?.trim()) {
      return new Response(JSON.stringify({ error: "Nom manquant" }), { status: 400, headers: CORS });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: quote, error: fetchErr } = await admin
      .from("quotes")
      .select("id, profile_id, quote_number, status, valid_until, total")
      .eq("public_token", token)
      .single();

    if (fetchErr || !quote) {
      return new Response(JSON.stringify({ error: "Devis introuvable" }), { status: 404, headers: CORS });
    }
    if (["accepted", "declined", "converted"].includes(quote.status)) {
      return new Response(JSON.stringify({ error: "Ce devis a déjà reçu une réponse." }), { status: 409, headers: CORS });
    }
    if (quote.valid_until && new Date(quote.valid_until) < new Date()) {
      return new Response(JSON.stringify({ error: "Ce devis a expiré." }), { status: 409, headers: CORS });
    }

    const signedAt = new Date().toISOString();
    const { error: updateErr } = await admin
      .from("quotes")
      .update({ status: "accepted", signed_at: signedAt, signed_by: signedBy.trim() })
      .eq("id", quote.id);

    if (updateErr) {
      return new Response(JSON.stringify({ error: updateErr.message }), { status: 500, headers: CORS });
    }

    // Notifie le pro — best-effort, on ne bloque pas la réponse au client
    // si l'envoi du push échoue (pas de token enregistré, etc.)
    try {
      await admin.functions.invoke("send-push", {
        body: {
          profileId: quote.profile_id,
          title: "Devis signé !",
          body: `${signedBy.trim()} a signé le devis ${quote.quote_number} (${quote.total})`,
          data: { screen: "quotes", quoteId: quote.id },
        },
      });
    } catch (pushErr) {
      console.error("sign-quote: push notification failed:", pushErr);
    }

    return new Response(JSON.stringify({ success: true, signedAt }), { headers: CORS });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("sign-quote error:", message);
    return new Response(JSON.stringify({ error: "Une erreur est survenue." }), { status: 500, headers: CORS });
  }
});