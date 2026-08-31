// Verstuurt e-mail via Resend. Werkt alleen als RESEND_API_KEY is ingesteld;
// anders wordt de mail stilletjes overgeslagen (zodat het platform gewoon blijft werken).
//
// mailLayout(titel, inhoudHtml, opties) levert de huisstijl-opmaak (tabellen + inline stijlen,
// zodat het in alle mailprogramma's goed staat); mailKnop(url, tekst) een knop met terugvallink.

function escHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const STANDAARD_VAN = 'BCLMB <onboarding@resend.dev>';
const FONT = "Arial, Helvetica, 'Segoe UI', sans-serif";
const FONT_KOP = "Georgia, 'Times New Roman', serif";
const KLEUR = { maroon: '#6e2230', maroonDiep: '#4a141d', inkt: '#1c1714', inktZacht: '#5a534c', bot: '#f4efe5', zand: '#e3d8c4', wit: '#ffffff', grijs: '#8a8178', lijn: '#e6ddcf', messing: '#a98443' };

function siteBasis() {
  return (process.env.APP_URL || '').trim().replace(/\/+$/, '') || 'https://luchtmobiel.red';
}

/** Knop in huisstijl, met daaronder de kale link voor mailprogramma's die knoppen niet tonen. */
function mailKnop(url, tekst) {
  const u = escHtml(url);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 10px;">
      <tr><td style="background:${KLEUR.maroon};border-radius:4px;">
        <a href="${u}" style="display:inline-block;padding:13px 24px;font-family:${FONT};font-size:15px;font-weight:bold;color:${KLEUR.wit};text-decoration:none;letter-spacing:.2px;">${escHtml(tekst)}</a>
      </td></tr>
    </table>
    <p style="margin:0 0 16px;font-family:${FONT};font-size:12px;line-height:1.5;color:${KLEUR.grijs};">Werkt de knop niet? Kopieer dan deze link: <a href="${u}" style="color:${KLEUR.maroon};word-break:break-all;">${u}</a></p>`;
}

/**
 * Volledige e-mail in huisstijl.
 * opties.voorproefje: korte tekst die mailprogramma's naast het onderwerp tonen.
 * opties.voettekst:   extra regel in de voettekst (bijv. waarom iemand deze mail krijgt).
 */
function mailLayout(titel, inhoudHtml, opties = {}) {
  const basis = siteBasis();
  const embleem = `${basis}/static/img/mail-embleem.png`;
  const inhoud = String(inhoudHtml || '')
    .replace(/<p>/g, `<p style="margin:0 0 16px;">`)
    .replace(/<ul>/g, `<ul style="margin:0 0 16px;padding-left:22px;">`)
    .replace(/<li>/g, `<li style="margin:0 0 6px;">`);
  const voorproefje = opties.voorproefje ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escHtml(opties.voorproefje)}</div>` : '';
  const voettekst = opties.voettekst ? ` ${opties.voettekst}` : '';

  return `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${escHtml(titel)}</title>
</head>
<body style="margin:0;padding:0;background:${KLEUR.bot};">
  ${voorproefje}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${KLEUR.bot};">
    <tr>
      <td align="center" style="padding:36px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
          <!-- kop -->
          <tr>
            <td style="background:${KLEUR.maroon};border-radius:8px 8px 0 0;padding:22px 32px;border-bottom:3px solid ${KLEUR.messing};">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;padding-right:16px;">
                    <img src="${embleem}" width="48" height="48" alt="" style="display:block;border:0;width:48px;height:48px;">
                  </td>
                  <td style="vertical-align:middle;">
                    <div style="font-family:${FONT_KOP};font-size:21px;line-height:1.15;font-weight:bold;color:${KLEUR.bot};">Business Club Luchtmobiel</div>
                    <div style="font-family:${FONT};font-size:11px;line-height:1.4;letter-spacing:2px;text-transform:uppercase;color:${KLEUR.zand};margin-top:3px;">Netwerk &amp; Veteranenzaken</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- inhoud -->
          <tr>
            <td style="background:${KLEUR.wit};padding:34px 32px 26px;border-left:1px solid ${KLEUR.lijn};border-right:1px solid ${KLEUR.lijn};font-family:${FONT};font-size:15px;line-height:1.65;color:${KLEUR.inkt};">
              <h1 style="margin:0 0 20px;font-family:${FONT_KOP};font-size:26px;line-height:1.2;font-weight:bold;color:${KLEUR.maroon};">${titel}</h1>
              ${inhoud}
            </td>
          </tr>
          <!-- voet -->
          <tr>
            <td style="background:#fbf9f4;border:1px solid ${KLEUR.lijn};border-top:none;border-radius:0 0 8px 8px;padding:18px 32px 20px;font-family:${FONT};font-size:12px;line-height:1.6;color:${KLEUR.grijs};">
              <strong style="color:${KLEUR.inktZacht};">Business Club Luchtmobiel</strong> &middot; <a href="${basis}" style="color:${KLEUR.maroon};text-decoration:none;">${escHtml(basis.replace(/^https?:\/\//, ''))}</a> &middot; Huijghenslaan 68, 6824 JJ Arnhem<br>
              Je ontvangt deze e-mail vanuit het ledenplatform van de Business Club Luchtmobiel.${voettekst}
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-family:${FONT_KOP};font-size:12px;letter-spacing:1px;color:#a89f94;">Nec temere, nec timide</p>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

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

module.exports = { sendMail, verstuur, mailLayout, mailKnop, escHtml, mailBeschikbaar, mailInstellingen };
