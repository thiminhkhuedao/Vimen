// supabase/functions/_shared/rateLimit.ts
//
// Import dans n'importe quelle Edge Function :
//   import { checkRateLimit } from "../_shared/rateLimit.ts";
//
// Utilisation en tout début de handler, après le CORS preflight :
//   const rl = await checkRateLimit(req, "send-contact-email", 5, 3600);
//   if (!rl.allowed) {
//     return new Response(JSON.stringify({ error: "Too many requests — please try again later." }),
//       { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
//   }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

export async function checkRateLimit(
  req: Request,
  functionName: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ allowed: boolean }> {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  const key = `${functionName}:${ip}`;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_key: key,
    p_max_requests: maxRequests,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    // Si le check lui-même échoue (panne DB, etc.), on laisse passer plutôt
    // que de bloquer tout le monde — mais on log pour investigation.
    console.error(`[rateLimit] check failed for ${key}:`, error);
    return { allowed: true };
  }

  return { allowed: data === true };
}