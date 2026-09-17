// supabase/functions/send-referral-email/index.ts
//
// Envoie l'email d'invitation de parrainage via l'API Resend.
//
// Déploiement :
//   supabase functions deploy send-referral-email
//
// Secret requis (une seule fois) :
//   supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxx
//
// Il faut aussi avoir vérifié un domaine d'envoi sur https://resend.com/domains
// (ex: mail.tradie.app) et l'utiliser comme adresse "from" ci-dessous.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { checkRateLimit } from "../_shared/rateLimit.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("REFERRAL_FROM_EMAIL") || "Tradie <onboarding@resend.dev>";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function buildEmailHtml({ referredName, referrerName, referralUrl }: {
  referredName?: string;
  referrerName?: string;
  referralUrl: string;
}) {
  const greeting = referredName ? `Bonjour ${referredName},` : "Bonjour,";
  return `
    <div style="font-family: -apple-system, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #111827;">
      <h2 style="margin: 0 0 16px;">${greeting}</h2>
      <p style="font-size: 15px; line-height: 1.6;">
        <strong>${referrerName || "Un(e) ami(e)"}</strong> vous invite à rejoindre Tradie,
        la plateforme de gestion de rendez-vous et de clients pour les professionnels.
      </p>
      <p style="text-align: center; margin: 28px 0;">
        <a href="${referralUrl}"
           style="background: #111827; color: #fff; padding: 12px 24px; border-radius: 8px;
                  text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block;">
          Créer mon compte
        </a>
      </p>
      <p style="font-size: 13px; color: #6b7280; line-height: 1.6;">
        Si le bouton ne fonctionne pas, copiez-collez ce lien dans votre navigateur :<br/>
        <a href="${referralUrl}" style="color: #2563eb;">${referralUrl}</a>
      </p>
    </div>
  `;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // 5 invitations par heure et par IP — un vrai utilisateur ne parraine
  // pas 50 personnes d'un coup ; ça bloque le spam automatisé.
  const rl = await checkRateLimit(req, "send-referral-email", 5, 3600);
  if (!rl.allowed) {
    return new Response(
      JSON.stringify({ error: "Too many requests. Please try again later." }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  if (!RESEND_API_KEY) {
    console.error("[send-referral-email] Missing RESEND_API_KEY secret");
    return new Response(
      JSON.stringify({ error: "Email service not configured" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const { to, referredName, referrerName, referralCode, referralUrl } = await req.json();

    if (!to || !referralUrl) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: to, referralUrl" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [to],
        subject: `${referrerName || "Un(e) ami(e)"} vous invite à rejoindre Tradie`,
        html: buildEmailHtml({ referredName, referrerName, referralUrl }),
      }),
    });

    const resendData = await resendRes.json();

    if (!resendRes.ok) {
      console.error("[send-referral-email] Resend error:", resendData);
      return new Response(
        JSON.stringify({ error: resendData?.message || "Resend API error" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, id: resendData?.id, referralCode }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[send-referral-email] Unexpected error:", err);
    return new Response(
      JSON.stringify({ error: "Unexpected error sending email" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});