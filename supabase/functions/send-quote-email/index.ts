/**
 * Supabase Edge Function: send-quote-email
 *
 * Envoie par email le lien public d'un devis au client concerné.
 *
 * SÉCURITÉ : l'ancienne version acceptait n'importe quelle adresse
 * destinataire et n'importe quel contenu envoyés par l'appelant, sans
 * vérifier qui il était — n'importe qui pouvait envoyer des emails depuis
 * ton compte Resend. Cette version :
 *   - n'accepte QUE l'identifiant du devis ({ quoteId }) ;
 *   - relit le devis, le client et le profil en base AVEC le token de
 *     l'utilisateur (donc soumis aux règles RLS : un pro ne voit que ses
 *     propres devis) ;
 *   - envoie toujours à l'email du client enregistré en base, jamais à une
 *     adresse fournie par l'appelant ;
 *   - limite à 100 envois par jour et par professionnel.
 *
 * Autonome : aucun import depuis ../_shared, rien d'autre à déployer.
 *
 * Deploy:
 *   supabase functions deploy send-quote-email --project-ref <ID>
 *
 * Secrets requis :   RESEND_API_KEY
 * Secrets optionnels: APP_URL (défaut https://vimen.app), FROM_EMAIL
 *                     (défaut quotes@vimen.app — domaine à vérifier dans
 *                     Resend), FROM_NAME (défaut Vimen)
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const APP_URL = (Deno.env.get("APP_URL") ?? "https://vimen.app").replace(/\/+$/, "");
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "quotes@vimen.app";
const FROM_NAME = Deno.env.get("FROM_NAME") ?? "Vimen";

const MAX_BODY_BYTES = 4 * 1024;
const DAILY_LIMIT = 100;

// ── CORS (les appels depuis l'app mobile n'ont pas d'Origin, seuls les
// navigateurs sont concernés) ────────────────────────────────────────
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

// Lit le body en coupant court au-delà de maxBytes (ne se fie pas à
// Content-Length, qui peut être absent ou mensonger).
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
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Nom affiché dans le champ "From" : on retire tout ce qui pourrait
// casser l'en-tête (guillemets, chevrons, retours à la ligne).
function safeDisplayName(value: string): string {
  return value.replace(/[<>"\r\n]/g, "").trim().slice(0, 60) || "Vimen";
}

function formatMoney(amount: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale, { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

interface QuoteRow {
  id: string;
  profile_id: string;
  quote_number: string;
  title: string | null;
  total: number | string | null;
  valid_until: string | null;
  public_token: string | null;
  client: { name: string | null; email: string | null } | null;
  profile: {
    name: string | null;
    email: string | null;
    phone: string | null;
    currency: string | null;
    language: string | null;
  } | null;
}

const COPY = {
  fr: {
    locale: "fr-FR",
    subject: (num: string, trade: string, amount: string) => `Devis ${num} de ${trade} — ${amount}`,
    hello: (name: string) => `Bonjour ${name},`,
    intro: (trade: string, title: string) =>
      `${trade} vous a envoyé un devis${title ? ` : « ${title} »` : ""}.`,
    total: "Montant total",
    validUntil: (date: string) => `Valable jusqu'au ${date}`,
    button: "Consulter et signer le devis",
    fallback: "Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :",
    contact: (phone: string) => `Une question ? Répondez directement à cet email${phone ? ` ou appelez le ${phone}` : ""}.`,
  },
  en: {
    locale: "en-GB",
    subject: (num: string, trade: string, amount: string) => `Quote ${num} from ${trade} — ${amount}`,
    hello: (name: string) => `Hi ${name},`,
    intro: (trade: string, title: string) =>
      `${trade} has sent you a quote${title ? `: "${title}"` : ""}.`,
    total: "Total amount",
    validUntil: (date: string) => `Valid until ${date}`,
    button: "View and sign the quote",
    fallback: "If the button doesn't work, copy this link into your browser:",
    contact: (phone: string) => `Any questions? Reply directly to this email${phone ? ` or call ${phone}` : ""}.`,
  },
};

function buildHtml(args: {
  c: typeof COPY.fr;
  clientName: string;
  tradeName: string;
  title: string;
  amount: string;
  validUntil: string;
  quoteUrl: string;
  phone: string;
}): string {
  const { c, clientName, tradeName, title, amount, validUntil, quoteUrl, phone } = args;
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#F5F4F1;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#131211;">
  <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
    <div style="background:#ffffff;border-radius:14px;padding:32px;border:1px solid #E5E5E0;">
      <p style="margin:0 0 16px;font-size:16px;">${esc(c.hello(clientName))}</p>
      <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#444;">${esc(c.intro(tradeName, title))}</p>
      <div style="background:#FAFAF8;border-radius:10px;padding:18px 20px;margin-bottom:24px;">
        <div style="font-size:12px;color:#6B6B66;text-transform:uppercase;letter-spacing:0.5px;">${esc(c.total)}</div>
        <div style="font-size:28px;font-weight:800;margin-top:4px;">${esc(amount)}</div>
        ${validUntil ? `<div style="font-size:13px;color:#6B6B66;margin-top:6px;">${esc(c.validUntil(validUntil))}</div>` : ""}
      </div>
      <a href="${esc(quoteUrl)}" style="display:inline-block;background:#E8500A;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 26px;border-radius:10px;">${esc(c.button)}</a>
      <p style="margin:24px 0 4px;font-size:12px;color:#6B6B66;">${esc(c.fallback)}</p>
      <p style="margin:0;font-size:12px;color:#6B6B66;word-break:break-all;">${esc(quoteUrl)}</p>
    </div>
    <p style="text-align:center;font-size:12px;color:#8A8680;margin:18px 0 0;">${esc(c.contact(phone))}</p>
  </div>
</body></html>`;
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
    if (!RESEND_API_KEY) {
      return json({ error: "Envoi d'emails non configuré (secret RESEND_API_KEY manquant)" }, 503);
    }

    // 1. Qui appelle ? Sans token, rien ne passe.
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!/^Bearer\s+\S+/i.test(authHeader)) {
      return json({ error: "Non authentifié" }, 401);
    }

    // 2. Quel devis ? Seul champ accepté du client.
    const { data: raw, error: bodyError } = await readJsonWithLimit(req, MAX_BODY_BYTES);
    if (bodyError) return json({ error: bodyError }, bodyError === "payload_too_large" ? 413 : 400);
    const quoteId = (raw as { quoteId?: unknown } | null)?.quoteId;
    if (typeof quoteId !== "string" || !quoteId) return json({ error: "quoteId requis" }, 400);

    // 3. Lecture avec le token de l'utilisateur : RLS ne renvoie le devis
    // que s'il appartient bien à l'appelant.
    const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data, error } = await db
      .from("quotes")
      .select(
        "id, profile_id, quote_number, title, total, valid_until, public_token, " +
          "client:clients(name,email), profile:profiles(name,email,phone,currency,language)",
      )
      .eq("id", quoteId)
      .single();

    if (error || !data) return json({ error: "Devis introuvable" }, 404);
    const quote = data as unknown as QuoteRow;

    const clientEmail = quote.client?.email?.trim() ?? "";
    if (!clientEmail) return json({ error: "Ce client n'a pas d'adresse email" }, 400);
    if (!quote.public_token) {
      return json({ error: "Ce devis n'a pas de lien public — réessaie dans un instant" }, 400);
    }

    // 4. Plafond quotidien par professionnel.
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const bucket = `email:${quote.profile_id}`;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count } = await admin
      .from("rate_limit_events")
      .select("*", { count: "exact", head: true })
      .eq("bucket_key", bucket)
      .gte("created_at", since);
    if ((count ?? 0) >= DAILY_LIMIT) {
      return json({ error: "Limite quotidienne d'envois atteinte, réessaie demain" }, 429);
    }

    // 5. Composition (tout vient de la base, rien du body).
    const profile = quote.profile;
    const c = profile?.language === "fr" ? COPY.fr : COPY.en;
    const tradeName = profile?.name?.trim() || "Vimen";
    const currency = profile?.currency || "EUR";
    const amount = formatMoney(Number(quote.total ?? 0), currency, c.locale);
    const validUntil = quote.valid_until
      ? new Date(quote.valid_until).toLocaleDateString(c.locale, { day: "numeric", month: "long", year: "numeric" })
      : "";
    const quoteUrl = `${APP_URL}/quote/${quote.public_token}`;

    const html = buildHtml({
      c,
      clientName: quote.client?.name?.trim() || "",
      tradeName,
      title: quote.title?.trim() || "",
      amount,
      validUntil,
      quoteUrl,
      phone: profile?.phone?.trim() || "",
    });

    const replyTo = profile?.email?.trim();
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: `${safeDisplayName(tradeName)} via ${safeDisplayName(FROM_NAME)} <${FROM_EMAIL}>`,
        to: [clientEmail],
        ...(replyTo ? { reply_to: replyTo } : {}),
        subject: c.subject(quote.quote_number, tradeName.replace(/[\r\n]/g, " "), amount),
        html,
      }),
    });

    if (!res.ok) {
      const detail = await res.json().catch(() => ({}));
      const message = (detail as { message?: string }).message ?? `Resend ${res.status}`;
      console.error("send-quote-email: Resend error:", message);
      return json({ error: `Envoi impossible : ${message}` }, 502);
    }

    await admin.from("rate_limit_events").insert({ bucket_key: bucket, action: "send_quote_email" });
    return json({ success: true }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("send-quote-email error:", message);
    return json({ error: message }, 500);
  }
});