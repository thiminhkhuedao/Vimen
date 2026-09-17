// supabase/functions/export-data/index.ts
//
// Droit d'accès / portabilité RGPD : rassemble TOUTES les données
// personnelles liées à un profil en un seul objet JSON téléchargeable.
//
// SÉCURITÉ : le clerk_id est extrait du token de session Clerk vérifié
// (header Authorization), jamais fourni par le client — sinon n'importe
// qui pourrait télécharger les données de n'importe quel autre compte.
//
// Déploiement :
//   supabase functions deploy export-data

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyToken } from "https://esm.sh/@clerk/backend@1";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const CLERK_SECRET_KEY = Deno.env.get("CLERK_SECRET_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY manquant (normalement injectés automatiquement par Supabase)");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function getVerifiedClerkId(req: Request): Promise<string> {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("Token de session manquant");

  if (!CLERK_SECRET_KEY) throw new Error("CLERK_SECRET_KEY non configuré côté serveur");

  const payload = await verifyToken(token, { secretKey: CLERK_SECRET_KEY });
  return payload.sub;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405 });
  }

  try {
    const clerkId = await getVerifiedClerkId(req);

    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("*")
      .eq("clerk_id", clerkId)
      .single();

    if (profileErr || !profile) {
      return new Response(JSON.stringify({ error: "profil introuvable" }), { status: 404 });
    }

    const pid = profile.id;

    const fetchAll = async (table: string, column: string = "profile_id"): Promise<unknown[]> => {
      const { data, error } = await supabase.from(table).select("*").eq(column, pid);
      if (error) throw new Error(`${table}: ${error.message}`);
      return data ?? [];
    };

    const { data: listings } = await supabase.from("marketplace_listings").select("id").eq("profile_id", pid);
    const listingIds = (listings ?? []).map((l: { id: string }) => l.id);
    const interestsOnMyListings = listingIds.length
      ? (await supabase.from("marketplace_interests").select("*").in("listing_id", listingIds)).data ?? []
      : [];

    const exportPayload = {
      exported_at: new Date().toISOString(),
      profile,
      clients: await fetchAll("clients"),
      services: await fetchAll("services"),
      service_options: await fetchAll("service_options"),
      booking_requests: await fetchAll("booking_requests"),
      jobs: await fetchAll("jobs"),
      invoices: await fetchAll("invoices"),
      payouts: await fetchAll("payouts"),
      payment_transactions: await fetchAll("payment_transactions"),
      quotes: await fetchAll("quotes"),
      materials_orders: await fetchAll("materials_orders"),
      certifications: await fetchAll("certifications"),
      reviews: await fetchAll("reviews"),
      referrals_as_referrer: await fetchAll("referrals", "referrer_id"),
      referrals_as_referred: await fetchAll("referrals", "referred_profile_id"),
      review_requests: await fetchAll("review_requests"),
      marketplace_listings: listings ?? [],
      marketplace_interests_sent: await fetchAll("marketplace_interests"),
      marketplace_interests_received_on_my_listings: interestsOnMyListings,
      availability: await fetchAll("availability"),
      blocked_slots: await fetchAll("blocked_slots"),
    };

    return new Response(JSON.stringify(exportPayload, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="vimen-export-${pid}.json"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
});