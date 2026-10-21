// src/lib/notifications.js

import { supabase } from "./supabase";

const invoke = async (fn, body) => {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error || data?.error) {
    let msg = error?.message ?? data?.error;

    // Le message générique "Edge Function returned a non-2xx status code"
    // cache la vraie réponse du serveur. error.context contient la Response
    // HTTP brute : on en extrait le code (401 = token rejeté avant même
    // d'exécuter la fonction, 404 = fonction introuvable, 500 = la fonction
    // a planté) et le corps du message pour savoir quoi corriger.
    let status;
    try {
      status = error?.context?.status;
      const text = await error?.context?.text?.();
      if (text) {
        try { msg = JSON.parse(text)?.error ?? JSON.parse(text)?.message ?? text; }
        catch { msg = text; }
      }
    } catch {
      // pas de réponse exploitable — on garde le message générique
    }

    console.error(`[notifications] ${fn} (HTTP ${status ?? "?"}):`, msg);
    return { success: false, error: msg };
  }
  return { success: true, ...data };
};

// La Edge Function send-invoice-email ne fait plus confiance aux données
// envoyées par le client : elle reçoit uniquement l'ID de la facture et
// va relire facture, client et profil elle-même en base (avec le token
// Clerk de l'utilisateur, donc limité à ses propres données). Même
// format d'appel que côté web.
export const sendInvoiceEmail = (invoice, _profile, reminder = false) =>
  invoke("send-invoice-email", { invoiceId: invoice.id, reminder });

// La Edge Function send-quote-email ne reçoit plus que l'ID du devis : elle
// relit devis, client et profil en base avec le token de l'utilisateur,
// construit elle-même le lien public (secret APP_URL côté serveur) et
// n'envoie qu'à l'email du client enregistré. Plus besoin de
// EXPO_PUBLIC_APP_URL pour ça côté mobile.
export const sendQuoteEmail = (quote, client, _profile) => {
  if (!client?.email) {
    return Promise.resolve({ success: false, error: "Client has no email address" });
  }
  return invoke("send-quote-email", { quoteId: quote.id });
};

export const sendNewBookingSMS = (booking, profile) =>
  invoke("send-sms", {
    type: "new_booking",
    to:   profile.phone,
    data: {
      customerName:  booking.customer_name,
      preferredDate: booking.preferred_date
        ? new Date(booking.preferred_date).toLocaleDateString("en-GB", { day:"numeric", month:"long" })
        : null,
    },
  });

export const sendInvoicePaidSMS = (invoice, profile) =>
  invoke("send-sms", {
    type: "invoice_paid",
    to:   profile.phone,
    data: {
      invoiceNumber: invoice.invoice_number,
      amount:        invoice.amount,
      clientName:    invoice.client?.name ?? "your client",
    },
  });

export const sendJobReminderSMS = (job, client, profile) => {
  if (!client?.phone) {
    return Promise.resolve({ success: false, error: "Client has no phone number" });
  }
  return invoke("send-sms", {
    type: "job_reminder",
    to:   client.phone,
    data: {
      clientName: client.name,
      tradeName:  profile.name,
      date: new Date(job.date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }),
      time:     job.time,
      jobTitle: job.title,
    },
  });
};

// Version qui marche vraiment (contrairement à ReviewsPage.jsx côté web,
// qui appelle encore "send-review-request" — une Edge Function qui n'a
// jamais existé, échoue silencieusement à chaque fois, et retombe sur un
// mailto/presse-papier manuel). Celle-ci utilise "send-sms" avec
// type: "review_request", la même Edge Function déjà déployée et
// fonctionnelle que job_reminder/invoice_paid ci-dessus.
export async function sendReviewRequestSMS(client, job, profile) {
  if (!client?.phone) {
    return { success: false, error: "Client has no phone number" };
  }
  if (!profile?.google_review_url) {
    return { success: false, error: "No Google review link configured — add one in Settings" };
  }
  return invoke("send-sms", {
    type: "review_request",
    to:   client.phone,
    data: {
      clientName: client.name,
      jobTitle:   job?.title ?? "the work",
      googleUrl:  profile.google_review_url,
      tradeName:  profile.name,
    },
  });
}