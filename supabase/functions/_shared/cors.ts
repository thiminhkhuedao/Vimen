// supabase/functions/_shared/cors.ts
//
// Helper CORS partagé — à importer dans CHAQUE Edge Function. Restreint
// les appels à tes domaines connus uniquement, pas de wildcard "*".
//
// Usage dans une Edge Function :
//   import { corsHeaders, handleCors } from "../_shared/cors.ts";
//
//   Deno.serve(async (req) => {
//     const corsResponse = handleCors(req);
//     if (corsResponse) return corsResponse; // requête OPTIONS préflight
//
//     // ... ta logique ...
//
//     return new Response(JSON.stringify(data), {
//       headers: { ...corsHeaders(req), "Content-Type": "application/json" },
//     });
//   });

const ALLOWED_ORIGINS = [
  "https://vimen.com",
  "https://www.vimen.com",
  "http://localhost:5173", // Vite dev server, à retirer si tu veux verrouiller aussi en dev
];

// Ajoute automatiquement les URLs de preview Vercel (*.vercel.app) si tu
// les utilises pour tester des branches avant de merger sur main.
function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) return true;
  return false;
}

export function corsHeaders(req) {
  const origin = req.headers.get("Origin");
  const allowed = isAllowedOrigin(origin);
  return {
    "Access-Control-Allow-Origin": allowed ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

// Répond directement aux requêtes préflight OPTIONS que le navigateur
// envoie automatiquement avant tout POST cross-origin. Retourne null si
// ce n'est pas une requête OPTIONS (continue vers ta logique normale).
export function handleCors(req) {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }
  return null;
}