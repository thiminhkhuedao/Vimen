// supabase/functions/_shared/cors.ts
//
// Helper CORS partagé — à importer dans CHAQUE Edge Function. Restreint
// les appels à tes domaines connus uniquement, pas de wildcard "*".
//
// Usage dans une Edge Function :
//   import { corsHeaders, handleCors, readJsonWithLimit } from "../_shared/cors.ts";
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
function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) return true;
  return false;
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin");
  const allowed = isAllowedOrigin(origin);
  return {
    "Access-Control-Allow-Origin": allowed && origin ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

// Répond directement aux requêtes préflight OPTIONS que le navigateur
// envoie automatiquement avant tout POST cross-origin. Retourne null si
// ce n'est pas une requête OPTIONS (continue vers ta logique normale).
export function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders(req) });
  }
  return null;
}

// Lit le body JSON d'une requête en limitant sa taille, pour éviter
// qu'un appelant envoie un payload énorme. Vérifie d'abord le header
// Content-Length (rapide mais pas fiable à 100%, un client peut mentir),
// puis vérifie aussi la taille réelle pendant la lecture du stream.
//
// Retourne { data } en cas de succès, ou { error } sinon (jamais les deux).
export async function readJsonWithLimit(
  req: Request,
  maxBytes: number
): Promise<{ data: unknown; error?: undefined } | { data?: undefined; error: string }> {
  const contentLength = req.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    return { error: "payload_too_large" };
  }

  const reader = req.body?.getReader();
  if (!reader) {
    return { error: "invalid_json" };
  }

  const chunks: Uint8Array[] = [];
  let total = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      // On annule la lecture pour ne pas continuer à consommer le stream.
      await reader.cancel();
      return { error: "payload_too_large" };
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
    const text = new TextDecoder().decode(bytes);
    const data = text ? JSON.parse(text) : {};
    return { data };
  } catch {
    return { error: "invalid_json" };
  }
}