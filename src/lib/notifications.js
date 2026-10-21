// src/lib/notifications.js

import { supabase } from "./supabase";

const invoke = async (fn, body) => {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error || data?.error) {
    let msg = error?.message ?? data?.error;

    // Le message générique "Edge Function returned a non-2xx status code"
    // cache la vraie réponse du serveur. error.context contient la Response
    // HTTP brute.
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
// envoyées par le client 
export const sendInvoiceEmail = (invoice, _profile, reminder = false) =>
  invoke("send-invoice-email", { invoiceId: invoice.id, reminder });

// La Edge Function send-quote-email ne reçoit plus que l'ID du devis 
export const sendQuoteEmail = (quote, client, _profile) => {
  if (!client?.email) {
    return Promise.resolve({ success: false, error: "Client has no email address" });
  }
  return invoke("send-quote-email", { quoteId: quote.id });
};