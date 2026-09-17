// supabase/functions/send-quote-email/index.ts
//
// Envoi manuel d'un devis par email (bouton "Envoyer par email" dans
// QuotesPage). Ne touche pas la base — comme send-invoice-email, c'est
// une fonction "stateless" ; c'est le front-end qui marque le devis
// comme "sent" après un envoi réussi (voir QuotesPage.jsx).

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const {
      to,            // client email address
      clientName,
      tradeName,
      tradeEmail,
      tradePhone,
      quoteNumber,
      total,
      validUntil,    // formatted string, e.g. "28 May 2026"
      quoteUrl,      // link to the public quote/sign page
      currencyCode = "EUR", // devise du profil (voir lib/currency.js) — plus de £ codé en dur
    } = await req.json();

    const CURRENCY_SYMBOLS: Record<string, string> = {
      GBP: "£", EUR: "€", USD: "$", CAD: "C$", AUD: "A$", CHF: "CHF ",
    };
    const fmtMoney = (n: number) =>
      `${CURRENCY_SYMBOLS[currencyCode] ?? CURRENCY_SYMBOLS.EUR}${Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2 })}`;

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f4f1;color:#131211}
  .wrap{max-width:580px;margin:32px auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e5e3de}
  .top{background:#E8500A;padding:20px 32px}
  .logo{color:#fff;font-size:20px;font-weight:900;letter-spacing:-0.5px}
  .body{padding:36px 36px 28px}
  .quote-num{font-size:22px;font-weight:800;letter-spacing:-0.5px;margin-bottom:4px}
  .quote-sub{font-size:13px;color:#888;margin-bottom:24px}
  .amount-box{background:#f7f6f3;border-radius:10px;padding:20px;text-align:center;margin-bottom:24px}
  .amount-lbl{font-size:12px;font-weight:700;color:#aaa;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px}
  .amount-val{font-size:30px;font-weight:900;color:#E8500A;letter-spacing:-0.5px}
  .cta-btn{display:block;background:#E8500A;color:#fff;text-decoration:none;padding:15px 28px;border-radius:10px;font-size:16px;font-weight:700;text-align:center;margin:0 0 20px}
  .footer{text-align:center;padding:18px;font-size:12px;color:#aaa;border-top:1px solid #eee}
</style>
</head>
<body>
<div class="wrap">
  <div class="top"><div class="logo">⚡ Vimen</div></div>
  <div class="body">
    <p style="font-size:15px;margin-bottom:24px">Hi ${clientName},</p>
    <p style="font-size:14px;color:#555;margin-bottom:24px;line-height:1.6">
      <strong>${tradeName}</strong> has sent you a quote for your review.
      ${validUntil ? `This quote is valid until <strong>${validUntil}</strong>.` : ""}
    </p>

    <div class="quote-num">${quoteNumber}</div>

    <div class="amount-box">
      <div class="amount-lbl">Quote total</div>
      <div class="amount-val">${fmtMoney(total)}</div>
    </div>

    <a class="cta-btn" href="${quoteUrl}">View & sign quote →</a>

    <p style="font-size:13px;color:#888;line-height:1.6">
      You can review the full breakdown and sign online, no account needed.
      Questions? Reply to ${tradeEmail}${tradePhone ? ` or call ${tradePhone}` : ""}.
    </p>
  </div>
  <div class="footer">Sent via <a href="https://vimen.app" style="color:#E8500A;text-decoration:none">Vimen</a></div>
</div>
</body>
</html>`;

    const RESEND_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
    const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "quotes@vimen.app";
    const FROM_NAME  = Deno.env.get("FROM_NAME")  ?? "Vimen";

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${tradeName} via ${FROM_NAME} <${FROM_EMAIL}>`,
        to: [to],
        subject: `Quote ${quoteNumber} from ${tradeName} — ${fmtMoney(total)}`,
        html,
      }),
    });

    const result = await res.json();
    if (!res.ok) throw new Error(result.message ?? "Resend API error");

    return new Response(JSON.stringify({ success: true, id: result.id }), { headers: CORS });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("send-quote-email error:", message);
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: CORS });
  }
});