/**
 * Supabase Edge Function: create-payment-link
 *
 * CORRECTIF DE SÉCURITÉ CRITIQUE par rapport à la version précédente :
 * l'ancienne version faisait confiance à `amount` envoyé tel quel par le
 * client, sans jamais le vérifier contre la vraie facture en base. N'importe
 * qui connaissant un invoiceId pouvait générer un lien de paiement Stripe
 * pour le montant de SON choix. Cette version récupère TOUJOURS le montant
 * réel depuis la table `invoices`, ignore complètement tout `amount` fourni
 * par l'appelant, et vérifie que l'appelant authentifié est bien le
 * propriétaire de cette facture avant de générer quoi que ce soit.
 *
 * Deploy:   supabase functions deploy create-payment-link
 * Secrets:  STRIPE_SECRET_KEY, APP_URL, CLERK_SECRET_KEY
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyToken } from "https://esm.sh/@clerk/backend@1";
import { corsHeaders, handleCors, readJsonWithLimit } from "../_shared/cors.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CLERK_SECRET_KEY = Deno.env.get("CLERK_SECRET_KEY");
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function getVerifiedProfileId(req: Request): Promise<string> {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Token de session manquant");
  if (!CLERK_SECRET_KEY) throw new Error("CLERK_SECRET_KEY non configuré côté serveur");

  const payload = await verifyToken(token, { secretKey: CLERK_SECRET_KEY });
  const clerkId = payload.sub;

  const { data: profile, error } = await supabase
    .from("profiles").select("id").eq("clerk_id", clerkId).single();
  if (error || !profile) throw new Error("Profil introuvable");
  return profile.id;
}

// Stripe attend du x-www-form-urlencoded avec notation à crochets pour les
// objets/tableaux imbriqués (ex: line_items[0][price_data][currency]=eur).
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

async function stripeRequest(path: string, body: Record<string, unknown>) {
  const params = new URLSearchParams(toStripeParams(body));
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error?.message ?? `Stripe API error (${res.status})`);
  return json;
}

Deno.serve(async (req: Request) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  const json = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders(req), "Content-Type": "application/json" },
    });

  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  try {
    // 1. Qui appelle ? (jamais faire confiance à un profileId envoyé par le client)
    const callerProfileId = await getVerifiedProfileId(req);

    // 2. Quelle facture ? (le seul champ qu'on accepte du client est l'ID —
    // tout le reste, montant compris, vient de la base, jamais du body)
    const { data: bodyRaw, error: sizeError } = await readJsonWithLimit(req, 5 * 1024);
    if (sizeError) return json({ error: sizeError }, sizeError === "payload_too_large" ? 413 : 400);
    const { invoiceId } = bodyRaw as { invoiceId?: unknown };
    if (typeof invoiceId !== "string" || !invoiceId) {
      return json({ error: "invoiceId requis" }, 400);
    }

    // 3. La facture existe et appartient VRAIMENT à l'appelant authentifié
    const { data: invoice, error: invErr } = await supabase
      .from("invoices")
      .select("*, client:clients(name,email), job:jobs(title), profile:profiles(name)")
      .eq("id", invoiceId)
      .single();

    if (invErr || !invoice) {
      return json({ error: "Facture introuvable" }, 404);
    }
    if (invoice.profile_id !== callerProfileId) {
      // Ne précise jamais si la facture existe pour quelqu'un d'autre —
      // même logique que l'énumération d'utilisateurs vue plus tôt.
      return json({ error: "Facture introuvable" }, 404);
    }
    if (invoice.status === "paid") {
      return json({ error: "Cette facture est déjà payée" }, 400);
    }

    // 4. Montant : TOUJOURS celui de la base, jamais celui fourni par le client
    const amountPence = Math.round(Number(invoice.amount) * 100);

    const link = await stripeRequest("payment_links", {
      line_items: [{
        price_data: {
          currency: "eur",
          product_data: {
            name: invoice.job?.title || "Trade services",
            description: `Invoice ${invoice.invoice_number} from ${invoice.profile?.name ?? ""}`,
          },
          unit_amount: amountPence,
        },
        quantity: 1,
      }],
      after_completion: {
        type: "redirect",
        redirect: { url: `${Deno.env.get("APP_URL") ?? "https://vimen.app"}/paid?invoice=${invoiceId}` },
      },
      metadata: {
        invoice_id: invoiceId,
        invoice_number: invoice.invoice_number,
        profile_id: callerProfileId,
        client_name: invoice.client?.name ?? "",
        client_email: invoice.client?.email ?? "",
      },
    });

    return json({ url: link.url, id: link.id }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("create-payment-link error:", message);
    return json({ error: message }, 500);
  }
});
