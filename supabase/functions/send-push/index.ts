
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { profileId, title, body, data } = await req.json();
    if (!profileId || !title || !body) {
      throw new Error("profileId, title and body are required");
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("push_token")
      .eq("id", profileId)
      .single();

    if (profileErr) throw new Error(profileErr.message);

    if (!profile?.push_token) {
      return new Response(JSON.stringify({ success: true, skipped: "no_push_token" }), { headers: CORS });
    }

    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        to:    profile.push_token,
        title,
        body,
        data:  data ?? {},
        sound: "default",
      }),
    });

    const json = await res.json();

    // Expo's API returns 200 even for some per-token errors (e.g. a
    // stale/uninstalled-app token) — surface those in the response
    // rather than treating the whole call as a hard failure.
    const ticket = json?.data;
    if (ticket?.status === "error") {
      console.error("send-push: Expo ticket error:", ticket.message, ticket.details);
      return new Response(JSON.stringify({ success: false, error: ticket.message }), { status: 200, headers: CORS });
    }

    return new Response(JSON.stringify({ success: true, ticket }), { headers: CORS });
  } catch (err) {
    console.error("send-push error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: CORS });
  }
});