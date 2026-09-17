
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

async function sendSMS(to: string, body: string): Promise<{ sid: string }> {
  const SID       = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
  const TOKEN     = Deno.env.get("TWILIO_AUTH_TOKEN")  ?? "";
  const FROM      = Deno.env.get("TWILIO_FROM_NUMBER") ?? "";
  const url       = `https://api.twilio.com/2010-04-01/Accounts/${SID}/Messages.json`;
  const creds     = btoa(`${SID}:${TOKEN}`);

  const res = await fetch(url, {
    method:  "POST",
    headers: {
      Authorization:  `Basic ${creds}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ To: to, From: FROM, Body: body }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.message ?? "Twilio error");
  return { sid: json.sid };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { type, to, profileId, data } = await req.json();

    // Resolve the actual recipient number. If the caller passed
    // `profileId` instead of `to`, look it up ourselves — see the
    // note above on why (anon callers must never be trusted with
    // another user's phone number directly).
    let recipient = to;
    if (!recipient && profileId) {
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      );
      const { data: profile, error: profileErr } = await supabaseAdmin
        .from("profiles")
        .select("phone")
        .eq("id", profileId)
        .single();

      if (profileErr) throw new Error(profileErr.message);
      if (!profile?.phone) {
        // Not an error — this professional just hasn't added a phone
        // number yet, so there's simply no SMS to send.
        return new Response(JSON.stringify({ success: true, skipped: "no_phone_on_file" }), { headers: CORS });
      }
      recipient = profile.phone;
    }

    if (!recipient) throw new Error("Either `to` or `profileId` is required");

    let message = "";

    switch (type) {
      case "job_reminder":
        // to = client phone
        message =
          `Hi ${data.clientName}, just a reminder that ${data.tradeName} will be with you tomorrow ` +
          `(${data.date}) at ${data.time} for: ${data.jobTitle}. ` +
          `Questions? Reply to this message. Reply STOP to opt out.`;
        break;

      case "invoice_paid":
        // to = tradesperson phone
        message =
          `💷 Vimen: Invoice ${data.invoiceNumber} for €${data.amount} ` +
          `has been paid by ${data.clientName}. Nice one!`;
        break;

      case "new_booking":
        // to = tradesperson phone
        message =
          `🔔 Vimen: New booking request from ${data.customerName}` +
          `${data.preferredDate ? ` for ${data.preferredDate}` : ""}. ` +
          `Log in to accept or decline.`;
        break;

      case "overdue_invoice":
        // to = tradesperson phone
        message =
          `⚠️ Vimen: Invoice ${data.invoiceNumber} (€${data.amount}) ` +
          `for ${data.clientName} is now overdue. Consider following up.`;
        break;

      case "review_request":
        // to = client phone
        message =
          `Hi ${data.clientName}, hope you're happy with ${data.jobTitle}. ` +
          `Could you spare 60 seconds to leave us a Google review? It really helps: ${data.googleUrl} — ${data.tradeName}`;
        break;

      default:
        throw new Error(`Unknown SMS type: ${type}`);
    }

    const result = await sendSMS(recipient, message);
    return new Response(JSON.stringify({ success: true, sid: result.sid }), { headers: CORS });
  } catch (err) {
    console.error("send-sms error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
  }
});
