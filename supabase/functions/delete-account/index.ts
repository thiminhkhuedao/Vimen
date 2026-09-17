// supabase/functions/delete-account/index.ts
//
// Droit à l'oubli RGPD : supprime TOUTES les données personnelles liées à
// un profil, dans le bon ordre (enfants avant parents, pour respecter les
// clés étrangères), puis supprime le compte Clerk lui-même.
//
// SÉCURITÉ : le clerk_id n'est JAMAIS pris depuis le body de la requête —
// il est extrait du token de session Clerk envoyé dans le header
// Authorization, vérifié cryptographiquement côté serveur. Impossible donc
// pour quelqu'un de fournir l'ID d'un autre utilisateur pour supprimer son
// compte à sa place.
//
// Déploiement :
//   supabase functions deploy delete-account
//   supabase secrets set CLERK_SECRET_KEY=sk_xxxx

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
  return payload.sub; // "sub" = l'ID Clerk de l'utilisateur authentifié
}

async function deleteClerkUser(clerkId: string): Promise<void> {
  const res = await fetch(`https://api.clerk.com/v1/users/${clerkId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${CLERK_SECRET_KEY}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Échec suppression Clerk: ${res.status}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405 });
  }

  try {
    const clerkId = await getVerifiedClerkId(req);

    // Retrouve le profil correspondant
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("id")
      .eq("clerk_id", clerkId)
      .single();

    if (profileErr || !profile) {
      return new Response(JSON.stringify({ error: "profil introuvable" }), { status: 404 });
    }

    const pid = profile.id;
    const deleted: Record<string, number> = {};

    // Ordre de suppression : enfants avant parents, pour respecter les FK.
    // (ordre exactement inverse de la création des tables dans le schéma)
    const step = async (
      label: string,
      query: PromiseLike<{ error: { message: string } | null; count: number | null }>
    ): Promise<void> => {
      const { error, count } = await query;
      if (error) throw new Error(`${label}: ${error.message}`);
      deleted[label] = count ?? 0;
    };

    await step("blocked_slots", supabase.from("blocked_slots").delete({ count: "exact" }).eq("profile_id", pid));
    await step("availability", supabase.from("availability").delete({ count: "exact" }).eq("profile_id", pid));

    // marketplace_interests : soit envoyé par ce profil, soit reçu sur une
    // de ses propres annonces (les deux doivent disparaître)
    const { data: listings } = await supabase.from("marketplace_listings").select("id").eq("profile_id", pid);
    const listingIds = (listings ?? []).map((l: { id: string }) => l.id);
    if (listingIds.length > 0) {
      await step(
        "marketplace_interests (sur ses annonces)",
        supabase.from("marketplace_interests").delete({ count: "exact" }).in("listing_id", listingIds)
      );
    }
    await step("marketplace_interests (envoyés par lui)", supabase.from("marketplace_interests").delete({ count: "exact" }).eq("profile_id", pid));
    await step("marketplace_listings", supabase.from("marketplace_listings").delete({ count: "exact" }).eq("profile_id", pid));

    await step("review_requests", supabase.from("review_requests").delete({ count: "exact" }).eq("profile_id", pid));
    await step("referrals (en tant que parrain)", supabase.from("referrals").delete({ count: "exact" }).eq("referrer_id", pid));
    await step("referrals (en tant que filleul)", supabase.from("referrals").delete({ count: "exact" }).eq("referred_profile_id", pid));
    await step("reviews", supabase.from("reviews").delete({ count: "exact" }).eq("profile_id", pid));
    await step("certifications", supabase.from("certifications").delete({ count: "exact" }).eq("profile_id", pid));
    await step("materials_orders", supabase.from("materials_orders").delete({ count: "exact" }).eq("profile_id", pid));
    await step("quotes", supabase.from("quotes").delete({ count: "exact" }).eq("profile_id", pid));
    await step("payment_transactions", supabase.from("payment_transactions").delete({ count: "exact" }).eq("profile_id", pid));
    await step("payouts", supabase.from("payouts").delete({ count: "exact" }).eq("profile_id", pid));
    await step("invoices", supabase.from("invoices").delete({ count: "exact" }).eq("profile_id", pid));
    await step("jobs", supabase.from("jobs").delete({ count: "exact" }).eq("profile_id", pid));
    await step("booking_requests", supabase.from("booking_requests").delete({ count: "exact" }).eq("profile_id", pid));
    await step("service_options", supabase.from("service_options").delete({ count: "exact" }).eq("profile_id", pid));
    await step("services", supabase.from("services").delete({ count: "exact" }).eq("profile_id", pid));
    await step("clients", supabase.from("clients").delete({ count: "exact" }).eq("profile_id", pid));
    await step("profiles", supabase.from("profiles").delete({ count: "exact" }).eq("id", pid));

    // Supprime le compte Clerk en dernier (une fois les données parties,
    // pour ne pas perdre l'accès en cours de route si une étape échoue)
    if (CLERK_SECRET_KEY) {
      await deleteClerkUser(clerkId);
      deleted["clerk_account"] = 1;
    }

    return new Response(JSON.stringify({ success: true, deleted }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(message);
    return new Response(JSON.stringify({ error: message }), { status: 500 });
  }
});