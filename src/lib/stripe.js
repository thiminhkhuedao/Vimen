// src/lib/stripe.js — mobile
//
// CORRECTIF : la Edge Function create-payment-link ne fait plus confiance
// à aucune donnée fournie par le client (montant, email, nom...) — elle va
// tout chercher elle-même dans la table invoices, et vérifie que l'appelant
// authentifié est bien le propriétaire de la facture. On envoie donc
// seulement l'ID de la facture, plus le token Clerk pour prouver qui on est.

import { supabase } from "./supabase";
import { saveStripeLink } from "./db";

/**
 * Crée un lien de paiement Stripe pour une facture.
 * @param {string} invoiceId
 * @param {string} clerkToken - récupéré via useAuth().getToken() côté composant
 * @returns {{ url: string, id: string } | null}
 */
export async function createPaymentLink(invoiceId, clerkToken) {
  const { data, error } = await supabase.functions.invoke("create-payment-link", {
    body: { invoiceId },
    headers: { Authorization: `Bearer ${clerkToken}` },
  });

  if (error || data?.error) {
    console.error("[stripe] createPaymentLink:", error ?? data.error);
    return null;
  }

  await saveStripeLink(invoiceId, {
    stripe_payment_link_id:  data.id,
    stripe_payment_link_url: data.url,
  });

  return data; // { url, id }
}