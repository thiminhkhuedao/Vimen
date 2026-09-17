/**
 * Supabase Edge Function: stripe-connect
 *
 * SÉCURITÉ — IDOR corrigé (voir audit "Broken Access Control") :
 * L'ancienne version faisait confiance à un `profileId` envoyé dans le
 * body de la requête, sans vérifier qu'il appartenait bien à l'appelant.
 * N'importe quel utilisateur connecté pouvait donc récupérer un lien
 * d'onboarding Stripe pour N'IMPORTE QUEL profil et détourner les futurs
 * paiements vers son propre compte bancaire.
 *
 * Fix : on ne fait plus jamais confiance à un ID fourni par le client
 * pour déterminer l'identité. On dérive le profil de l'appelant à partir
 * de son JWT (via un client Supabase scopé à son Authorization header,
 * qui ne peut lire QUE sa propre ligne grâce au RLS `profiles_own`).
 *
 * Deploy:
 *   supabase functions deploy stripe-connect
 *
 * Secrets requis (déjà utilisés par les autres fonctions) :
 *   STRIPE_SECRET_KEY
 *   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY (par défaut)
 *
 * Appelée avec : { returnUrl }  — PLUS de profileId, il est déduit du JWT
 * Renvoie :      { url }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

function toStripeParams(obj: unknown, prefix = ""): [string, string][] {
  const pairs: [string, string][] = [];
  if (obj === null || obj === undefined) return pairs;
  if (Array.isArray(obj)) {
    obj.forEach((item, i) => pairs.push(...toStripeParams(item, `${prefix}[${i}]`)));
    return pairs;
  }
  if (typeof obj === "object") {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      pairs.push(...toStripeParams(value, prefix ? `${prefix}[${key}]` : key));
    }
    return pairs;
  }
  pairs.push([prefix, String(obj)]);
  return pairs;
}

async function stripeRequest(method: "GET" | "POST", path: string, body?: Record<string, unknown>) {
  const secretKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  const opts: RequestInit = {
    method,
    headers: { Authorization: `Bearer ${secretKey}` },
  };
  if (body) {
    opts.headers = { ...opts.headers, "Content-Type": "application/x-www-form-urlencoded" };
    opts.body = new URLSearchParams(toStripeParams(body)).toString();
  }
  const res = await fetch(`https://api.stripe.com/v1/${path}`, opts);
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? `Stripe API error (${res.status})`);
  return json;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non authentifié" }), { status: 401, headers: CORS });
    }

    const { returnUrl } = await req.json();

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";

    // Client scopé au JWT de l'appelant : la policy RLS "profiles_own"
    // garantit que .single() sans filtre ne peut renvoyer QUE SA PROPRE
    // ligne, quoi qu'on demande explicitement. C'est ça qui remplace la
    // confiance aveugle en un profileId fourni par le client.
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: myProfile, error: profileErr } = await userClient
      .from("profiles")
      .select("id, email, stripe_account_id")
      .single();

    if (profileErr || !myProfile) {
      return new Response(JSON.stringify({ error: "Profil introuvable" }), { status: 403, headers: CORS });
    }

    const profileId = myProfile.id; // dérivé du JWT — jamais du body
    let accountId = myProfile.stripe_account_id;

    // Écriture (création du compte Stripe / mise à jour) : service_role,
    // mais seulement maintenant qu'on a confirmé l'identité ci-dessus.
    const supabaseAdmin = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");

    // First time connecting — create a new Express connected account.
    if (!accountId) {
      const account = await stripeRequest("POST", "accounts", {
        type: "express",
        email: myProfile.email || undefined,
        capabilities: {
          card_payments: { requested: true },
          transfers:     { requested: true },
        },
      });
      accountId = account.id;

      await supabaseAdmin
        .from("profiles")
        .update({ stripe_account_id: accountId })
        .eq("id", profileId);
    }

    // Account Links expire quickly and are meant to be single-use —
    // create a fresh one every time this function is called, even
    // for a professional who already has an account (e.g. they
    // dropped off mid-onboarding and are retrying).
    const accountLink = await stripeRequest("POST", "account_links", {
      account:     accountId,
      refresh_url: returnUrl,
      return_url:  returnUrl,
      type:        "account_onboarding",
    });

    return new Response(JSON.stringify({ url: accountLink.url }), { headers: CORS });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("stripe-connect error:", message);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: CORS });
  }
});