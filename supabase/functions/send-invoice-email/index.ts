/**
 * Supabase Edge Function: send-invoice-email
 *
 * SÉCURITÉ — corrigé (voir audit "Broken Access Control") :
 * L'ancienne version faisait confiance à TOUT ce que le client envoyait
 * (montant, IBAN, nom du pro, coordonnées bancaires...) sans jamais
 * vérifier que ces infos correspondaient à une vraie facture en base.
 * N'importe quel utilisateur connecté pouvait donc :
 *   - envoyer un email "facture Vimen" à n'importe qui, avec n'importe
 *     quel montant, en usurpant le nom de n'importe quel pro ;
 *   - y faire figurer un IBAN différent du vrai, pour détourner un
 *     virement client vers son propre compte (fraude à la facture).
 *
 * Fix : on ne reçoit plus qu'un invoiceId. Tout le contenu de l'email
 * (client, montant, coordonnées bancaires...) est relu depuis la base,
 * jamais fourni par l'appelant. Deux modes d'appel :
 *   - utilisateur normal (JWT) : client scopé au JWT, RLS garantit qu'on
 *     ne peut lire QUE ses propres factures.
 *   - cron interne (send-invoice-reminders) : authentifié par
 *     CRON_SECRET, lecture via service_role (doit pouvoir lire les
 *     factures de tous les comptes pour les rappels automatiques).
 *
 * Appelée avec : { invoiceId, reminder? }
 * Renvoie :      { success: true, id } ou { error }
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY          = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const CRON_SECRET       = Deno.env.get("CRON_SECRET") ?? "";

interface InvoiceRow {
  id: string;
  invoice_number: string;
  amount: number;
  due_date: string | null;
  stripe_payment_link_url: string | null;
  client: { name: string; email: string | null } | null;
  job: { title: string | null } | null;
  profile: {
    name: string;
    email: string | null;
    phone: string | null;
    currency: string | null;
    language: string | null;
    bank_name: string | null;
    sort_code: string | null;
    account_number: string | null;
    iban: string | null;
    bic: string | null;
    bank_account_holder: string | null;
    invoice_notes: string | null;
  } | null;
}

const INVOICE_SELECT = `
  id, invoice_number, amount, due_date, stripe_payment_link_url,
  client:clients ( name, email ),
  job:jobs ( title ),
  profile:profiles (
    name, email, phone, currency, language, bank_name, sort_code, account_number,
    iban, bic, bank_account_holder, invoice_notes
  )
`;

// Textes de l'email — une entrée par langue supportée. Ajoute une
// nouvelle clé ici (ex: "es") pour supporter une langue de plus, sans
// toucher au reste de la fonction.
const STRINGS = {
  en: {
    htmlLang: "en",
    locale: "en-GB",
    greeting: (name: string) => `Hi ${name},`,
    reminderBanner: "Friendly reminder — this invoice is still awaiting payment.",
    intro: (tradeName: string) => `Please find your invoice from <strong>${tradeName}</strong> below.`,
    paymentDue: (date: string) => `Payment is due by <strong>${date}</strong>.`,
    due: "Due:",
    billTo: "Bill to",
    description: "Description",
    amount: "Amount",
    servicesRendered: "Services rendered",
    totalDue: "Total due",
    payNow: (amount: string) => `Pay now — ${amount} →`,
    bankTransferDetails: "Bank transfer details",
    accountHolder: "Account holder:",
    iban: "IBAN:",
    bic: "BIC/SWIFT:",
    bank: "Bank:",
    sortCode: "Sort code:",
    account: "Account:",
    reference: "Reference:",
    sentVia: "Sent via",
    subjectReminder: "Reminder: ",
    subject: (num: string, amount: string, due: string | null) =>
      `Invoice ${num} — ${amount} due${due ? ` by ${due}` : ""}`,
  },
  fr: {
    htmlLang: "fr",
    locale: "fr-FR",
    greeting: (name: string) => `Bonjour ${name},`,
    reminderBanner: "Petit rappel — cette facture est toujours en attente de paiement.",
    intro: (tradeName: string) => `Voici ta facture de la part de <strong>${tradeName}</strong>.`,
    paymentDue: (date: string) => `Le paiement est dû avant le <strong>${date}</strong>.`,
    due: "Échéance :",
    billTo: "Facturé à",
    description: "Description",
    amount: "Montant",
    servicesRendered: "Prestations réalisées",
    totalDue: "Total à payer",
    payNow: (amount: string) => `Payer maintenant — ${amount} →`,
    bankTransferDetails: "Coordonnées bancaires",
    accountHolder: "Titulaire du compte :",
    iban: "IBAN :",
    bic: "BIC/SWIFT :",
    bank: "Banque :",
    sortCode: "Code guichet :",
    account: "Compte :",
    reference: "Référence :",
    sentVia: "Envoyé via",
    subjectReminder: "Rappel : ",
    subject: (num: string, amount: string, due: string | null) =>
      `Facture ${num} — ${amount} dû${due ? ` avant le ${due}` : ""}`,
  },
} as const;

type Lang = keyof typeof STRINGS;
function resolveLang(raw: string | null | undefined): Lang {
  return raw === "fr" ? "fr" : "en";
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const authHeader = req.headers.get("Authorization");
    const { invoiceId, reminder = false } = await req.json();

    if (!invoiceId) {
      return new Response(JSON.stringify({ error: "invoiceId requis" }), { status: 400, headers: CORS });
    }

    let invoice: InvoiceRow | null = null;

    if (CRON_SECRET && authHeader === `Bearer ${CRON_SECRET}`) {
      // Appel interne depuis le cron de rappels — service_role car il
      // doit pouvoir lire les factures de tous les comptes.
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
      const { data, error } = await admin
        .from("invoices")
        .select(INVOICE_SELECT)
        .eq("id", invoiceId)
        .single<InvoiceRow>();
      if (error || !data) {
        return new Response(JSON.stringify({ error: "Facture introuvable" }), { status: 404, headers: CORS });
      }
      invoice = data;
    } else {
      // Appel utilisateur normal — client scopé au JWT de l'appelant.
      // La policy RLS "invoices_select_own" garantit que cette requête
      // ne peut renvoyer une ligne QUE si la facture appartient à
      // l'appelant, peu importe l'invoiceId demandé.
      if (!authHeader) {
        return new Response(JSON.stringify({ error: "Non authentifié" }), { status: 401, headers: CORS });
      }
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data, error } = await userClient
        .from("invoices")
        .select(INVOICE_SELECT)
        .eq("id", invoiceId)
        .single<InvoiceRow>();
      if (error || !data) {
        return new Response(JSON.stringify({ error: "Facture introuvable ou accès refusé" }), { status: 404, headers: CORS });
      }
      invoice = data;
    }

    if (!invoice.client?.email) {
      return new Response(JSON.stringify({ error: "Ce client n'a pas d'adresse email" }), { status: 400, headers: CORS });
    }

    const profile = invoice.profile;
    const lang = resolveLang(profile?.language);
    const s = STRINGS[lang];
    const currencyCode = profile?.currency ?? "EUR";
    const CURRENCY_SYMBOLS: Record<string, string> = {
      GBP: "£", EUR: "€", USD: "$", CAD: "C$", AUD: "A$", CHF: "CHF ",
    };
    const fmtMoney = (n: number) =>
      `${CURRENCY_SYMBOLS[currencyCode] ?? CURRENCY_SYMBOLS.EUR}${Number(n).toLocaleString(s.locale, { minimumFractionDigits: 2 })}`;

    const dueDate = invoice.due_date
      ? new Date(invoice.due_date).toLocaleDateString(s.locale, { day: "numeric", month: "long", year: "numeric" })
      : null;

    const tradeName  = profile?.name ?? "";
    const tradeEmail = profile?.email ?? "";
    const tradePhone = profile?.phone ?? "";
    const clientName = invoice.client.name;
    const jobTitle   = invoice.job?.title ?? null;
    const paymentUrl = invoice.stripe_payment_link_url ?? null;
    const bankName          = profile?.bank_name ?? null;
    const sortCode          = profile?.sort_code ?? null;
    const accountNumber     = profile?.account_number ?? null;
    const iban              = profile?.iban ?? null;
    const bic                = profile?.bic ?? null;
    const bankAccountHolder = profile?.bank_account_holder ?? null;
    const invoiceNotes      = profile?.invoice_notes ?? null;
    const amount            = invoice.amount;
    const invoiceNumber     = invoice.invoice_number;

    const html = `<!DOCTYPE html>
<html lang="${s.htmlLang}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f4f1;color:#131211}
  .wrap{max-width:580px;margin:32px auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e5e3de}
  .top{background:#E8500A;padding:20px 32px;display:flex;align-items:center;gap:12px}
  .logo{color:#fff;font-size:20px;font-weight:900;letter-spacing:-0.5px}
  .body{padding:36px 36px 28px}
  .meta-row{display:flex;justify-content:space-between;margin-bottom:28px}
  .inv-num{font-size:22px;font-weight:800;letter-spacing:-0.5px}
  .inv-sub{font-size:13px;color:#888;margin-top:4px}
  .bill-box{background:#f7f6f3;border-radius:10px;padding:16px 20px;margin-bottom:24px}
  .bill-lbl{font-size:11px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px}
  .bill-name{font-size:16px;font-weight:700}
  .bill-sub{font-size:13px;color:#666;margin-top:3px}
  table.items{width:100%;border-collapse:collapse;margin-bottom:20px}
  table.items th{font-size:12px;font-weight:700;color:#aaa;text-transform:uppercase;padding:8px 0;border-bottom:1px solid #eee;text-align:left}
  table.items td{padding:14px 0;border-bottom:1px solid #eee;font-size:14px}
  .total-row{display:flex;justify-content:space-between;padding-top:14px;border-top:2px solid #131211;margin-bottom:28px}
  .total-lbl{font-size:16px;font-weight:700}
  .total-amt{font-size:24px;font-weight:900;color:#E8500A;letter-spacing:-0.5px}
  .pay-btn{display:block;background:#E8500A;color:#fff;text-decoration:none;padding:15px 28px;border-radius:10px;font-size:16px;font-weight:700;text-align:center;margin:0 0 24px}
  .bank-box{background:#f7f6f3;border-radius:10px;padding:16px 20px;font-size:13px;color:#555;margin-bottom:20px}
  .bank-box b{color:#131211}
  .footer{text-align:center;padding:18px;font-size:12px;color:#aaa;border-top:1px solid #eee}
  .footer a{color:#E8500A;text-decoration:none}
</style>
</head>
<body>
<div class="wrap">
  <div class="top">
    <div class="logo">⚡ Vimen</div>
  </div>
  <div class="body">
    <p style="font-size:15px;margin-bottom:24px">${s.greeting(clientName)}</p>
    ${reminder ? `
    <div style="background:#FEF3E2;border:1px solid #F5C97A;border-radius:8px;padding:12px 16px;margin-bottom:24px;font-size:13px;color:#92400E;font-weight:600">
      ${s.reminderBanner}
    </div>` : ""}
    <p style="font-size:14px;color:#555;margin-bottom:28px;line-height:1.6">
      ${s.intro(tradeName)}
      ${dueDate ? s.paymentDue(dueDate) : ""}
    </p>

    <div class="meta-row">
      <div>
        <div class="inv-num">${invoiceNumber}</div>
        ${dueDate ? `<div class="inv-sub">${s.due} ${dueDate}</div>` : ""}
      </div>
      <div style="text-align:right;font-size:13px;color:#888">
        <div style="font-weight:700;color:#131211">${tradeName}</div>
        <div>${tradeEmail}</div>
        ${tradePhone ? `<div>${tradePhone}</div>` : ""}
      </div>
    </div>

    <div class="bill-box">
      <div class="bill-lbl">${s.billTo}</div>
      <div class="bill-name">${clientName}</div>
    </div>

    <table class="items">
      <thead><tr><th>${s.description}</th><th style="text-align:right">${s.amount}</th></tr></thead>
      <tbody>
        <tr>
          <td>${jobTitle || s.servicesRendered}</td>
          <td style="text-align:right;font-weight:700">${fmtMoney(amount)}</td>
        </tr>
      </tbody>
    </table>

    <div class="total-row">
      <span class="total-lbl">${s.totalDue}</span>
      <span class="total-amt">${fmtMoney(amount)}</span>
    </div>

    ${paymentUrl ? `<a class="pay-btn" href="${paymentUrl}">${s.payNow(fmtMoney(amount))}</a>` : ""}

    ${(bankName || sortCode || accountNumber || iban || bic) ? `
    <div class="bank-box">
      <div style="font-weight:700;margin-bottom:10px">${s.bankTransferDetails}</div>
      ${bankAccountHolder ? `<div><b>${s.accountHolder}</b> ${bankAccountHolder}</div>` : ""}
      ${iban          ? `<div><b>${s.iban}</b> ${iban.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim()}</div>` : ""}
      ${bic           ? `<div><b>${s.bic}</b> ${bic}</div>` : ""}
      ${bankName      ? `<div><b>${s.bank}</b> ${bankName}</div>` : ""}
      ${sortCode      ? `<div><b>${s.sortCode}</b> ${sortCode}</div>` : ""}
      ${accountNumber ? `<div><b>${s.account}</b> ${accountNumber}</div>` : ""}
      <div style="margin-top:8px"><b>${s.reference}</b> ${invoiceNumber}</div>
    </div>` : ""}

    ${invoiceNotes ? `<p style="font-size:13px;color:#888;line-height:1.6">${invoiceNotes}</p>` : ""}
  </div>
  <div class="footer">
    ${s.sentVia} <a href="https://Vimen.app">Vimen</a>
  </div>
</div>
</body>
</html>`;

    const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
    const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "invoices@Vimen.app";
    const FROM_NAME  = Deno.env.get("FROM_NAME")  ?? "Vimen";

    const res = await fetch("https://api.resend.com/emails", {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from:    `${tradeName} via ${FROM_NAME} <${FROM_EMAIL}>`,
        to:      [invoice.client.email],
        subject: `${reminder ? s.subjectReminder : ""}${s.subject(invoiceNumber, fmtMoney(amount), dueDate)}`,
        html,
      }),
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.message ?? "Resend API error");

    return new Response(JSON.stringify({ success: true, id: result.id }), { headers: CORS });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("send-invoice-email error:", message);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: CORS });
  }
});
