// src/lib/notifications.js

import { supabase } from "./supabase";

const invoke = async (fn, body) => {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error || data?.error) {
    let msg = error?.message ?? data?.error;


    let status;
    try {
      status = error?.context?.status;
      const text = await error?.context?.text?.();
      if (text) {
        try { msg = JSON.parse(text)?.error ?? JSON.parse(text)?.message ?? text; }
        catch { msg = text; }
      }
    } catch {
    }

    console.error(`[notifications] ${fn} (HTTP ${status ?? "?"}):`, msg);
    return { success: false, error: msg };
  }
  return { success: true, ...data };
};

export const sendInvoiceEmail = (invoice, profile) =>
  invoke("send-invoice-email", {
    to:            invoice.client?.email,
    clientName:    invoice.client?.name,
    tradeName:     profile.name,
    tradeEmail:    profile.email,
    tradePhone:    profile.phone,
    invoiceNumber: invoice.invoice_number,
    amount:        invoice.amount,
    dueDate:       invoice.due_date
      ? new Date(invoice.due_date).toLocaleDateString("en-GB", { day:"numeric", month:"long", year:"numeric" })
      : null,
    jobTitle:      invoice.job?.title ?? null,
    paymentUrl:    invoice.stripe_payment_link_url ?? null,
    bankName:      profile.bank_name,
    sortCode:      profile.sort_code,
    accountNumber: profile.account_number,
    invoiceNotes:  profile.invoice_notes,
  });

// process.env.EXPO_PUBLIC_APP_URL doit pointer vers le domaine web

export const sendQuoteEmail = (quote, client, profile) => {
  if (!client?.email) {
    return Promise.resolve({ success: false, error: "Client has no email address" });
  }
  if (!quote?.public_token) {
    return Promise.resolve({ success: false, error: "Quote is missing its public link — try refreshing" });
  }
  const quoteUrl = `${process.env.EXPO_PUBLIC_APP_URL}/quote/${quote.public_token}`;
  return invoke("send-quote-email", {
    to:           client.email,
    clientName:   client.name,
    tradeName:    profile.name,
    tradeEmail:   profile.email,
    tradePhone:   profile.phone,
    quoteNumber:  quote.quote_number,
    total:        quote.total,
    validUntil:   quote.valid_until
      ? new Date(quote.valid_until).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
      : null,
    quoteUrl,
    currencyCode: profile.currency ?? "EUR",
  });
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