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

const STANDAARD_VAN = 'BCLMB <onboarding@resend.dev>';

// Huidige instellingen (voor het beheerpaneel; de sleutel zelf wordt nooit getoond).
function mailInstellingen() {
  const key = (process.env.RESEND_API_KEY || '').trim();
  const van = (process.env.MAIL_VAN || '').trim();
  return {
    ingeschakeld: !!key,
    sleutelHint: key ? key.slice(0, 3) + '…' + key.slice(-4) : '',
    van: van || STANDAARD_VAN,
    vanStandaard: !van,
    bestuur: (process.env.MAIL_BESTUUR || '').trim(),
    appUrl: (process.env.APP_URL || '').trim()
  };
}

/**
 * Verstuurt een e-mail en geeft het resultaat terug: { ok, status, fout, id }.
 * `fout` is een leesbare melding (inclusief het antwoord van Resend) voor het beheerpaneel.
 */
async function verstuur({ to, subject, html, replyTo }) {
  const key = (process.env.RESEND_API_KEY || '').trim();
  const from = (process.env.MAIL_VAN || '').trim() || STANDAARD_VAN;
  if (!key) { console.log('[mail] RESEND_API_KEY ontbreekt — e-mail overgeslagen:', subject); return { ok: false, status: 0, fout: 'RESEND_API_KEY is niet ingesteld.' }; }
  if (!to) return { ok: false, status: 0, fout: 'Geen ontvanger opgegeven.' };
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
    const tekst = await res.text();
    if (!res.ok) {
      let melding = tekst.slice(0, 300);
      try { const j = JSON.parse(tekst); melding = [j.name, j.message].filter(Boolean).join(': ') || melding; } catch (e) { /* geen JSON */ }
      console.error('[mail] Resend-fout', res.status, tekst.slice(0, 500));
      return { ok: false, status: res.status, fout: `Resend antwoordde ${res.status}: ${melding}` };
    }
    let id = null;
    try { id = JSON.parse(tekst).id || null; } catch (e) { /* geen JSON */ }
    return { ok: true, status: res.status, id };
  } catch (err) {
    console.error('[mail] verzenden mislukt:', err.message);
    return { ok: false, status: 0, fout: `Verbinding met Resend mislukt: ${err.message}` };
  }
}

async function sendMail(opties) {
  return (await verstuur(opties)).ok;
}

function mailBeschikbaar() { return !!(process.env.RESEND_API_KEY || '').trim(); }

module.exports = { sendMail, verstuur, mailLayout, escHtml, mailBeschikbaar, mailInstellingen };
