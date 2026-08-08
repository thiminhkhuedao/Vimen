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

export const createProfile = (userId, { name, email, trade = "" }) => {
  const slug = name.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "") +
               Math.floor(Math.random() * 900 + 100);
  return handle(
    supabase.from("profiles")
      .insert({ clerk_id: userId, name, email, trade, booking_slug: slug })
      .select().single()
  );
};

export const updateProfile = (userId, updates) =>
  handle(supabase.from("profiles").update(updates).eq("clerk_id", userId).select().single());

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

// ── MARKETPLACE ───────────────────────────────────────
export const getListings = (filters = {}) => {
  let q = supabase.from("marketplace_listings")
    .select("*").eq("status", "active")
    .order("created_at", { ascending: false });
  if (filters.type && filters.type !== "all") q = q.eq("type", filters.type);
  if (filters.trade && filters.trade !== "All trades") q = q.eq("trade", filters.trade);
  return handle(q);
};

export const createListing = (profileId, data) =>
  handle(supabase.from("marketplace_listings").insert({ profile_id: profileId, ...data }).select().single());

export const closeListing  = (id) =>
  handle(supabase.from("marketplace_listings").update({ status: "closed" }).eq("id", id));

export const expressInterest = (listingId, data) =>
  handle(supabase.from("marketplace_interests").insert({ listing_id: listingId, ...data }).select().single());

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