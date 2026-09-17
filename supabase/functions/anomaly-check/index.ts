// supabase/functions/anomaly-check/index.ts
//
// À exécuter automatiquement toutes les heures via pg_cron (voir le SQL
// plus bas). Regarde les événements des dernières 24h dans
// rate_limit_events et compare à la moyenne des 7 jours précédents.
// Si un chiffre sort largement de la norme, envoie un email d'alerte via
// Resend à l'adresse que tu configures.
//
// Déploiement :
//   supabase functions deploy anomaly-check
//   supabase secrets set RESEND_API_KEY=xxxx
//   supabase secrets set ALERT_EMAIL=toi@exemple.com

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const ALERT_EMAIL = Deno.env.get("ALERT_EMAIL") ?? "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Seuils simples : au-delà de X fois la moyenne des 7 derniers jours,
// c'est considéré comme anormal. Ajuste selon ton volume réel une fois
// que tu as un peu de recul sur tes chiffres normaux.
const ANOMALY_MULTIPLIER = 3;
const MIN_ABSOLUTE_THRESHOLD = 10; // évite les faux positifs sur petit volume

async function countLast24h(action: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("rate_limit_events")
    .select("*", { count: "exact", head: true })
    .eq("action", action)
    .gte("created_at", since);
  return count ?? 0;
}

async function averageDailyLast7Days(action: string): Promise<number> {
  const since = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
  const until = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("rate_limit_events")
    .select("*", { count: "exact", head: true })
    .eq("action", action)
    .gte("created_at", since)
    .lt("created_at", until);
  return (count ?? 0) / 7;
}

async function sendAlert(subject: string, bodyLines: string[]): Promise<void> {
  if (!RESEND_API_KEY || !ALERT_EMAIL) {
    console.error("RESEND_API_KEY ou ALERT_EMAIL manquant, alerte non envoyée");
    return;
  }
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Vimen Monitoring <alerts@vimen.com>", // adapte à ton domaine vérifié Resend
      to: ALERT_EMAIL,
      subject,
      text: bodyLines.join("\n"),
    }),
  });
}

Deno.serve(async (_req: Request) => {
  const actionsToWatch = ["signup", "login", "contact_form", "booking_request"];
  const anomalies: string[] = [];

  for (const action of actionsToWatch) {
    const today = await countLast24h(action);
    const avg = await averageDailyLast7Days(action);
    const threshold = Math.max(avg * ANOMALY_MULTIPLIER, MIN_ABSOLUTE_THRESHOLD);
    if (today > threshold) {
      anomalies.push(
        `⚠️ ${action} : ${today} aujourd'hui vs ${avg.toFixed(1)} en moyenne/jour (seuil: ${threshold.toFixed(0)})`
      );
    }
  }

  // Vérifie aussi le taux de tentatives bloquées (indicateur d'attaque)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { count: loginAttempts } = await supabase
    .from("rate_limit_events")
    .select("*", { count: "exact", head: true })
    .eq("action", "login")
    .gte("created_at", since);

  if (loginAttempts && loginAttempts > 200) {
    anomalies.push(`⚠️ ${loginAttempts} tentatives de login en 24h — possible attaque credential stuffing`);
  }

  if (anomalies.length > 0) {
    await sendAlert(
      `🚨 Vimen — ${anomalies.length} anomalie(s) détectée(s)`,
      [
        "Comportement anormal détecté sur les dernières 24h :",
        "",
        ...anomalies,
        "",
        "Vérifie le dashboard Supabase (Table Editor → rate_limit_events) et Sentry pour creuser.",
      ]
    );
  }

  return new Response(JSON.stringify({ checked: actionsToWatch, anomalies }), {
    headers: { "Content-Type": "application/json" },
  });
});