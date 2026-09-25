// src/lib/db.js

import { supabase } from "./supabase";

const handle = async (query) => {
  const { data, error } = await query;
  if (error) console.error("[db]", error.message);
  return { data, error };
};

// ── PROFILES ─────────────────────────────────────────
export const getProfile = (userId) =>
  handle(supabase.from("profiles").select("*").eq("clerk_id", userId).single());

export const createProfile = async (userId, { name, email, trade = "" }) => {
  const slug = name.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "") +
               Math.floor(Math.random() * 900 + 100);

  const { data, error } = await supabase.from("profiles")
    .insert({ clerk_id: userId, name, email, trade, booking_slug: slug })
    .select().single();

  // Course entre deux appels concurrents (ex: double-mount en mode strict
  // React) — l'autre a déjà créé le profil entre-temps. Plutôt que de
  // planter, on récupère simplement le profil qui existe déjà.
  if (error?.code === "23505") {
    return handle(
      supabase.from("profiles").select("*").eq("clerk_id", userId).single()
    );
  }

  if (error) console.error("[db]", error.message);
  return { data, error };
};

export const updateProfile = (userId, updates) =>
  handle(supabase.from("profiles").update(updates).eq("clerk_id", userId).select().single());

// Même Edge Function que le web (stripe-connect) — backend partagé, pas
// besoin de la redéployer, juste de l'appeler depuis le mobile aussi.
export const getStripeConnectUrl = async (profileId, returnUrl) => {
  const { data, error } = await supabase.functions.invoke("stripe-connect", {
    body: { profileId, returnUrl },
  });
  if (error) {
    try {
      const body = await error.context?.json?.();
      if (body?.error) error.message = body.error;
    } catch {
      // pas de JSON exploitable — message générique conservé
    }
    console.error("[getStripeConnectUrl]", error.message, error);
  }
  return { data, error };
};

// ── CLIENTS ───────────────────────────────────────────
export const getClients = (profileId) =>
  handle(supabase.from("clients").select("*").eq("profile_id", profileId).order("name"));

export const createClient = (profileId, data) =>
  handle(supabase.from("clients").insert({ profile_id: profileId, ...data }).select().single());

export const updateClient = (id, data) =>
  handle(supabase.from("clients").update(data).eq("id", id).select().single());

export const deleteClient = (id) =>
  handle(supabase.from("clients").delete().eq("id", id));

// ── JOBS ──────────────────────────────────────────────
export const getJobs = (profileId) =>
  handle(
    supabase.from("jobs")
      .select("*, client:clients(id,name,email,phone)")
      .eq("profile_id", profileId)
      .order("date", { ascending: false })
  );

export const createJob = (profileId, data) =>
  handle(
    supabase.from("jobs")
      .insert({ profile_id: profileId, ...data })
      .select("*, client:clients(id,name)").single()
  );

export const updateJob = (id, data) =>
  handle(
    supabase.from("jobs")
      .update(data).eq("id", id)
      .select("*, client:clients(id,name)").single()
  );

export const completeJob = (id) => updateJob(id, { status: "completed" });
export const deleteJob   = (id) => handle(supabase.from("jobs").delete().eq("id", id));

// ── INVOICES ─────────────────────────────────────────
export const getInvoices = (profileId) =>
  handle(
    supabase.from("invoices")
      .select("*, client:clients(id,name,email,address), job:jobs(id,title)")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false })
  );

export const createInvoice = async (profileId, data) => {
  const { count } = await supabase
    .from("invoices").select("id", { count: "exact", head: true })
    .eq("profile_id", profileId);
  const invoice_number = `INV-${String((count ?? 0) + 1).padStart(3, "0")}`;
  return handle(
    supabase.from("invoices")
      .insert({ profile_id: profileId, invoice_number, ...data })
      .select("*, client:clients(id,name,email,address), job:jobs(id,title)").single()
  );
};

export const markInvoicePaid = (id) =>
  handle(
    supabase.from("invoices")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", id).select().single()
  );

export const saveStripeLink = (id, { stripe_payment_link_id, stripe_payment_link_url }) =>
  handle(
    supabase.from("invoices")
      .update({ stripe_payment_link_id, stripe_payment_link_url })
      .eq("id", id).select().single()
  );

export const deleteInvoice = (id) =>
  handle(supabase.from("invoices").delete().eq("id", id));

// ── BOOKING REQUESTS ──────────────────────────────────
export const getBookingRequests = (profileId) =>
  handle(
    supabase.from("booking_requests").select("*")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false })
  );

export const updateBookingStatus = (id, status) =>
  handle(supabase.from("booking_requests").update({ status }).eq("id", id).select().single());

// ── SERVICE OPTIONS (catalogue de prestations réservables) ─
// N'existaient nulle part dans le repo — ni mobile, ni web comme
// référence — construites directement depuis le schéma de la table.
export const getServiceOptions = (profileId) =>
  handle(
    supabase.from("service_options").select("*")
      .eq("profile_id", profileId)
      .order("sort_order", { ascending: true })
  );

export const createServiceOption = (profileId, data) =>
  handle(supabase.from("service_options").insert({ profile_id: profileId, ...data }).select().single());

export const updateServiceOption = (id, data) =>
  handle(supabase.from("service_options").update(data).eq("id", id).select().single());

export const deleteServiceOption = (id) =>
  handle(supabase.from("service_options").delete().eq("id", id));

// ⚠️ VÉRIFIE le nom exact de ton bucket Storage (Storage → Buckets dans le
// dashboard Supabase) et ajuste cette constante si besoin — sans le bon
// nom, l'upload échoue silencieusement.
const OPTION_IMAGES_BUCKET = "public-uploads";

export async function uploadOptionImage(profileId, localUri) {
  try {
    const response = await fetch(localUri);
    const blob = await response.arrayBuffer();
    const ext = localUri.split(".").pop()?.split("?")[0] || "jpg";
    const path = `service-options/${profileId}/${Date.now()}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(OPTION_IMAGES_BUCKET)
      .upload(path, blob, { contentType: `image/${ext === "jpg" ? "jpeg" : ext}` });

    if (uploadError) return { data: null, error: uploadError };

    const { data: pub } = supabase.storage.from(OPTION_IMAGES_BUCKET).getPublicUrl(path);
    return { data: pub.publicUrl, error: null };
  } catch (err) {
    return { data: null, error: err };
  }
}

// ── AVAILABILITY (disponibilités hebdomadaires) ────────
export const getAvailability = (profileId) =>
  handle(supabase.from("availability").select("*").eq("profile_id", profileId));

// Remplace TOUT le planning d'un coup (supprime puis réinsère) — même
// logique que le web (BookingPage.jsx → AvailabilityEditor).
export async function saveAvailability(profileId, days) {
  const { error: delErr } = await supabase.from("availability").delete().eq("profile_id", profileId);
  if (delErr) return { error: delErr };

  const rows = Object.entries(days)
    .filter(([, v]) => v.enabled)
    .map(([day, v]) => ({
      profile_id: profileId,
      day_of_week: parseInt(day, 10),
      start_time: v.start_time,
      end_time: v.end_time,
    }));

  if (rows.length === 0) return { error: null };
  const { error: insErr } = await supabase.from("availability").insert(rows);
  return { error: insErr };
}

// ── MARKETPLACE ───────────────────────────────────────
export const getListings = (filters = {}, page = 0, pageSize = 24) => {
  let q = supabase.from("marketplace_listings")
    .select("*, poster:profiles(name,trade,booking_slug)")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1); // pagination —
    // même raison que côté web : sans .range() un seul appel peut ramener
    // toute la table d'un coup
  if (filters.type && filters.type !== "all") q = q.eq("type", filters.type);
  if (filters.trade && filters.trade !== "All trades") q = q.eq("trade", filters.trade);
  if (filters.location) q = q.ilike("location", `%${filters.location}%`);
  if (filters.urgent) q = q.eq("urgent", true);
  return handle(q);
};

export const getMyListings = (profileId) =>
  handle(
    supabase.from("marketplace_listings")
      .select("*")
      .eq("profile_id", profileId)
      .order("created_at", { ascending: false })
  );

export const createListing = (profileId, data) =>
  handle(supabase.from("marketplace_listings").insert({ profile_id: profileId, ...data }).select().single());

export const updateListing = (id, data) =>
  handle(supabase.from("marketplace_listings").update(data).eq("id", id).select().single());

export const closeListing  = (id) =>
  updateListing(id, { status: "closed" });

export const deleteListing = (id) =>
  handle(supabase.from("marketplace_listings").delete().eq("id", id));

export const expressInterest = (listingId, data) =>
  handle(supabase.from("marketplace_interests").insert({ listing_id: listingId, ...data }).select().single());

export const getInterestsForListing = (listingId) =>
  handle(
    supabase.from("marketplace_interests")
      .select("*")
      .eq("listing_id", listingId)
      .order("created_at", { ascending: false })
  );

export const incrementViews = (listingId) =>
  supabase.rpc("increment_listing_views", { listing_id: listingId });

/* ══════════════════════════════════════════════════
   QUOTES
══════════════════════════════════════════════════ */
export const getQuotes = (profileId) =>
  handle(supabase.from("quotes").select("*, client:clients(id,name,email,address)").eq("profile_id", profileId).order("created_at", { ascending: false }));

export const createQuote = async (profileId, data) => {
  const { count } = await supabase.from("quotes").select("id",{count:"exact",head:true}).eq("profile_id",profileId);
  const quote_number = `QUO-${String((count??0)+1).padStart(3,"0")}`;
  return handle(supabase.from("quotes").insert({profile_id:profileId,quote_number,...data}).select("*, client:clients(id,name,email,address)").single());
};
export const updateQuote = (id, data) => handle(supabase.from("quotes").update(data).eq("id",id).select().single());
export const deleteQuote = (id) => handle(supabase.from("quotes").delete().eq("id",id));

/* ══════════════════════════════════════════════════
   CERTIFICATIONS
══════════════════════════════════════════════════ */
export const getCertifications = (profileId) =>
  handle(supabase.from("certifications").select("*").eq("profile_id",profileId).order("expiry_date"));
export const createCertification = (profileId, data) =>
  handle(supabase.from("certifications").insert({profile_id:profileId,...data}).select().single());
export const updateCertification = (id,data) =>
  handle(supabase.from("certifications").update(data).eq("id",id).select().single());
export const deleteCertification = (id) =>
  handle(supabase.from("certifications").delete().eq("id",id));

/* ══════════════════════════════════════════════════
   REVIEWS
══════════════════════════════════════════════════ */
export const getReviews = (profileId) =>
  handle(supabase.from("reviews").select("*").eq("profile_id",profileId).order("created_at",{ascending:false}));
export const createReview = (data) =>
  handle(supabase.from("reviews").insert(data).select().single());

/* ══════════════════════════════════════════════════
   REFERRALS
══════════════════════════════════════════════════ */
export const getReferrals = (profileId) =>
  handle(supabase.from("referrals").select("*").eq("referrer_id",profileId).order("created_at",{ascending:false}));
export const createReferral = (referrerId, email, name) => {
  const code = "TRD-" + Math.random().toString(36).slice(2,8).toUpperCase();
  return handle(supabase.from("referrals").insert({referrer_id:referrerId,referral_code:code,referred_email:email,referred_name:name}).select().single());
};

/* ══════════════════════════════════════════════════
   PAYMENTS / TRANSACTIONS
══════════════════════════════════════════════════ */
export const getTransactions = (profileId) =>
  handle(supabase.from("payment_transactions").select("*").eq("profile_id",profileId).order("paid_at",{ascending:false}));
export const getPayouts = (profileId) =>
  handle(supabase.from("payouts").select("*").eq("profile_id",profileId).order("created_at",{ascending:false}));

/* ══════════════════════════════════════════════════
   PUSH NOTIFICATIONS
══════════════════════════════════════════════════ */
export const updatePushToken = (profileId, token) =>
  handle(supabase.from("profiles").update({ push_token: token }).eq("id", profileId));