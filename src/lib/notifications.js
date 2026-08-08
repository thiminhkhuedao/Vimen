// src/lib/notifications.js

import { supabase } from "./supabase";

const invoke = async (fn, body) => {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error || data?.error) {
    const msg = error?.message ?? data?.error;
    console.error(`[notifications] ${fn}:`, msg);
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
