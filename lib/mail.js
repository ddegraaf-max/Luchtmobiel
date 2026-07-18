// Verstuurt e-mail via Resend. Werkt alleen als RESEND_API_KEY is ingesteld;
// anders wordt de mail stilletjes overgeslagen (zodat het platform gewoon blijft werken).

function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function mailLayout(titel, inhoudHtml) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1c1714;">
    <div style="background:#6e2230;color:#f4efe5;padding:18px 24px;border-radius:8px 8px 0 0;font-weight:bold;font-size:18px;">Business Club Luchtmobiel</div>
    <div style="border:1px solid #e6ddcf;border-top:none;border-radius:0 0 8px 8px;padding:24px;">
      <h2 style="margin:0 0 14px;color:#6e2230;font-size:19px;">${titel}</h2>
      ${inhoudHtml}
      <p style="margin-top:28px;font-size:12px;color:#8a8178;">Je ontvangt deze e-mail vanuit het ledenplatform van de Business Club Luchtmobiel.</p>
    </div>
  </div>`;
}

async function sendMail({ to, subject, html, replyTo }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_VAN || 'BCLMB <onboarding@resend.dev>';
  if (!key) { console.log('[mail] RESEND_API_KEY ontbreekt — e-mail overgeslagen:', subject); return false; }
  if (!to) return false;
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: Array.isArray(to) ? to : [to],
        subject,
        html,
        ...(replyTo ? { reply_to: replyTo } : {})
      })
    });
    if (!res.ok) { console.error('[mail] Resend-fout', res.status, await res.text()); return false; }
    return true;
  } catch (err) {
    console.error('[mail] verzenden mislukt:', err.message);
    return false;
  }
}

module.exports = { sendMail, mailLayout, escHtml };
