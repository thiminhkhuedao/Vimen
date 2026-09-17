// supabase/functions/get-public-quote/index.ts
//
// Appelée depuis PublicQuotePage.jsx (page publique, sans authentification)
// quand un client ouvre le lien de son devis. Utilise la clé service_role
// pour lire malgré le RLS, mais ne renvoie QUE les champs nécessaires à
// l'affichage — jamais l'ID interne du pro, ses autres clients, etc.
//
// Appelée avec : { token }
// Renvoie :      { quote } ou { error }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit } from "../_shared/rateLimit.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // 30 lectures / heure / IP — généreux pour un client qui recharge la
  // page plusieurs fois, mais empêche de scanner des tokens au hasard.
  const rl = await checkRateLimit(req, "get-public-quote", 30, 3600);
  if (!rl.allowed) {
    return new Response(JSON.stringify({ error: "Trop de tentatives. Réessaie plus tard." }), { status: 429, headers: CORS });
  }

  try {
    const { token } = await req.json();
    if (!token) {
      return new Response(JSON.stringify({ error: "Lien invalide" }), { status: 400, headers: CORS });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: quote, error } = await admin
      .from("quotes")
      .select(`
        id, quote_number, title, notes, line_items, subtotal, vat_rate, vat_amount, total,
        status, valid_until, created_at, signed_at, signed_by,
        client:clients ( name, email, address ),
        profile:profiles ( name, trade, email, phone, currency )
      `)
      .eq("public_token", token)
      .single();

    if (error || !quote) {
      return new Response(JSON.stringify({ error: "Ce devis est introuvable ou le lien a expiré." }), { status: 404, headers: CORS });
    }

    // Première ouverture : on marque comme consulté, sans écraser un statut
    // plus avancé (accepté, refusé...) si le client rouvre le lien après coup.
    if (quote.status === "sent") {
      await admin
        .from("quotes")
        .update({ status: "viewed", viewed_at: new Date().toISOString() })
        .eq("id", quote.id);
      quote.status = "viewed";
    }

    return new Response(JSON.stringify({ quote }), { headers: CORS });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("get-public-quote error:", message);
    return new Response(JSON.stringify({ error: "Une erreur est survenue." }), { status: 500, headers: CORS });
  }
});