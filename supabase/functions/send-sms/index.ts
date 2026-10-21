/**
 * Supabase Edge Function: send-sms
 *
 * Envoie des SMS via Twilio, à partir de modèles fixes.
 *
 * SÉCURITÉ : l'ancienne version envoyait n'importe quel SMS à n'importe quel
 * numéro pour quiconque appelait la fonction (et chaque SMS est facturé par
 * Twilio). Cette version :
 *   - exige un token valide (utilisateur connecté, ou appel interne avec la
 *     clé service_role, par exemple depuis stripe-webhook) ;
 *   - n'envoie qu'à deux catégories de destinataires :
 *       · le téléphone du professionnel lui-même (invoice_paid, new_booking,
 *         overdue_invoice) — jamais le numéro fourni par l'appelant ;
 *       · un client de CE professionnel, vérifié en base (job_reminder,
 *         review_request) ;
 *   - impose le nom du pro et le lien d'avis Google depuis son profil en
 *     base (impossible d'injecter un lien de phishing) ;
 *   - tronque les champs libres et limite à 30 SMS par jour et par pro.
 *
 * Si Twilio n'est pas configuré, répond 503 avec un message clair au lieu
 * d'une erreur 500 obscure.
 *
 * Autonome : aucun import depuis ../_shared.
 *
 * Deploy:
 *   supabase functions deploy send-sms --project-ref <ID>
 *
 * Secrets (tous les trois requis pour envoyer réellement) :
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TWILIO_SID = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
const TWILIO_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
const TWILIO_FROM = Deno.env.get("TWILIO_FROM_NUMBER") ?? "";

const MAX_BODY_BYTES = 4 * 1024;
const DAILY_LIMIT = 30;

const CLIENT_TYPES = new Set(["job_reminder", "review_request"]);
const OWNER_TYPES = new Set(["invoice_paid", "new_booking", "overdue_invoice"]);

// ── CORS ─────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = ["https://vimen.app", "https://www.vimen.app", "http://localhost:5173"];

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = ALLOWED_ORIGINS.includes(origin) || /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

async function readJsonWithLimit(req: Request, maxBytes: number): Promise<{ data: unknown; error: string | null }> {
  if (!req.body) return { data: null, error: "empty_body" };
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      reader.cancel();
      return { data: null, error: "payload_too_large" };
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return { data: JSON.parse(new TextDecoder().decode(bytes)), error: null };
  } catch {
    return { data: null, error: "invalid_json" };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────
// Nettoie un champ libre : une seule ligne, longueur bornée.
function clip(value: unknown, max = 80): string {
  if (typeof value === "number") return String(value);
  if (typeof value !== "string") return "";
  return value.replace(/[\r\n]+/g, " ").trim().slice(0, max);
}

const PHONE_RE = /^\+?[0-9 ()-]{6,20}$/;

interface ProfileRow {
  id: string;
  name: string | null;
  phone: string | null;
  google_review_url: string | null;
}

function buildMessage(type: string, d: Record<string, unknown>, profile: ProfileRow): string | null {
  const trade = clip(profile.name, 60) || "Vimen";
  switch (type) {
    case "job_reminder":
      return `Hi ${clip(d.clientName, 40)}, this is a reminder from ${trade} about your appointment: ` +
        `${clip(d.jobTitle)} on ${clip(d.date)} at ${clip(d.time, 10)}. Reply STOP to opt out.`;
    case "review_request": {
      const url = profile.google_review_url?.trim() ?? "";
      if (!/^https:\/\//i.test(url)) return null; // le lien vient du profil, jamais de l'appelant
      return `Hi ${clip(d.clientName, 40)}, thanks for choosing ${trade}! ` +
        `Would you mind leaving us a quick review? ${url} Reply STOP to opt out.`;
    }
    case "invoice_paid":
      return `💶 Payment received! Invoice ${clip(d.invoiceNumber, 30)} from ` +
        `${clip(d.clientName, 40)} — ${clip(d.amount, 20)} has been paid.`;
    case "new_booking":
      return `📅 New booking request from ${clip(d.customerName, 40)} for ${clip(d.date)}. ` +
        `Open Vimen to accept or decline.`;
    case "overdue_invoice":
      return `⚠️ Invoice ${clip(d.invoiceNumber, 30)} for ${clip(d.clientName, 40)} ` +
        `(${clip(d.amount, 20)}) is overdue.`;
    default:
      return null;
  }
}

// ── Handler ──────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const json = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    // 1. Authentification obligatoire.
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Non authentifié" }, 401);
    const isInternal = token === SERVICE_ROLE_KEY;

    // 2. Body borné et validé.
    const { data: raw, error: bodyError } = await readJsonWithLimit(req, MAX_BODY_BYTES);
    if (bodyError) return json({ error: bodyError }, bodyError === "payload_too_large" ? 413 : 400);
    const body = (raw ?? {}) as { type?: unknown; to?: unknown; profileId?: unknown; data?: unknown };

    const type = typeof body.type === "string" ? body.type : "";
    if (!CLIENT_TYPES.has(type) && !OWNER_TYPES.has(type)) {
      return json({ error: `Type de SMS inconnu : ${type || "(vide)"}` }, 400);
    }
    const data: Record<string, unknown> =
      body.data && typeof body.data === "object" ? (body.data as Record<string, unknown>) : {};

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

    // 3. Quel professionnel ? (identité tirée du token, jamais du body —
    // sauf appel interne, qui a le droit de préciser profileId.)
    let profile: ProfileRow | null = null;
    let db = admin;

    if (isInternal) {
      if (typeof body.profileId !== "string") return json({ error: "profileId requis" }, 400);
      const { data: p } = await admin
        .from("profiles").select("id,name,phone,google_review_url").eq("id", body.profileId).single();
      profile = (p as ProfileRow | null) ?? null;
    } else {
      db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false },
      });
      const { data: pid, error: pidError } = await db.rpc("my_profile_id");
      if (pidError || !pid) return json({ error: "Non authentifié" }, 401);
      const { data: p } = await db
        .from("profiles").select("id,name,phone,google_review_url").eq("id", pid as string).single();
      profile = (p as ProfileRow | null) ?? null;
    }
    if (!profile) return json({ error: "Profil introuvable" }, 404);

    // 4. Twilio configuré ? Sinon message clair plutôt qu'un 500 obscur.
    if (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM) {
      return json({ error: "SMS non configurés (secrets Twilio manquants sur ce projet)" }, 503);
    }

    // 5. Destinataire.
    let recipient: string;
    if (OWNER_TYPES.has(type)) {
      const own = profile.phone?.trim() ?? "";
      if (!own) return json({ success: true, skipped: "no_phone_on_file" }, 200);
      recipient = own;
    } else {
      const to = typeof body.to === "string" ? body.to.trim() : "";
      if (!PHONE_RE.test(to)) return json({ error: "Numéro de destinataire invalide" }, 400);
      if (!isInternal) {
        const { data: found } = await db
          .from("clients").select("id").eq("profile_id", profile.id).eq("phone", to).limit(1);
        if (!found || found.length === 0) {
          return json({ error: "Ce numéro ne correspond à aucun de tes clients" }, 403);
        }
      }
      recipient = to;
    }

    // 6. Plafond quotidien par professionnel (les SMS coûtent de l'argent).
    const bucket = `sms:${profile.id}`;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("rate_limit_events")
      .select("*", { count: "exact", head: true })
      .eq("bucket_key", bucket)
      .gte("created_at", since);
    if ((count ?? 0) >= DAILY_LIMIT) {
      return json({ error: "Limite quotidienne de SMS atteinte, réessaie demain" }, 429);
    }

    // 7. Message (modèle fixe) et envoi.
    const message = buildMessage(type, data, profile);
    if (!message) {
      return json({ error: "Aucun lien d'avis Google configuré dans ton profil" }, 400);
    }

    const creds = btoa(`${TWILIO_SID}:${TWILIO_TOKEN}`);
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${creds}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ To: recipient, From: TWILIO_FROM, Body: message }).toString(),
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = (result as { message?: string }).message ?? `Twilio ${res.status}`;
      console.error("send-sms: Twilio error:", detail);
      return json({ error: `Envoi impossible : ${detail}` }, 502);
    }

    await admin.from("rate_limit_events").insert({ bucket_key: bucket, action: `sms_${type}` });
    return json({ success: true, sid: (result as { sid?: string }).sid ?? null }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("send-sms error:", message);
    return json({ error: message }, 500);
  }
});