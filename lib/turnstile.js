// Cloudflare Turnstile: onzichtbare/lichte "ben je geen robot"-controle op de
// publieke formulieren (inloggen, registreren, wachtwoord vergeten).
// Werkt alleen als TURNSTILE_SITE_KEY én TURNSTILE_SECRET_KEY zijn ingesteld;
// anders wordt de controle overgeslagen zodat het platform gewoon blijft werken.

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TIMEOUT_MS = 6000;

function siteKey() { return (process.env.TURNSTILE_SITE_KEY || '').trim(); }
function secretKey() { return (process.env.TURNSTILE_SECRET_KEY || '').trim(); }
function actief() { return !!(siteKey() && secretKey()); }

/**
 * Controleert het token dat de widget in het veld "cf-turnstile-response" zet.
 * Geeft { ok: true } of { ok: false, reden } terug; gooit nooit een fout.
 */
async function controleer(token, ip) {
  if (!actief()) return { ok: true };
  if (typeof token !== 'string' || !token || token.length > 2048) return { ok: false, reden: 'geen-token' };

  const body = new URLSearchParams({ secret: secretKey(), response: token });
  if (ip) body.set('remoteip', ip);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(VERIFY_URL, { method: 'POST', body, signal: ctrl.signal });
    const data = await res.json();
    if (data && data.success) return { ok: true };
    const codes = Array.isArray(data && data['error-codes']) ? data['error-codes'] : [];
    if (codes.includes('invalid-input-secret')) {
      console.error('[turnstile] TURNSTILE_SECRET_KEY is ongeldig. Controleer de sleutel op Railway of verwijder beide Turnstile-variabelen om de controle uit te zetten.');
    }
    return { ok: false, reden: codes.join(',') || 'afgewezen' };
  } catch (err) {
    console.error('[turnstile] verificatie mislukt:', err.message);
    return { ok: false, reden: 'netwerk' };
  } finally {
    clearTimeout(timer);
  }
}

// Middleware: zet req.turnstileFout (tekst) als de controle niet slaagt; de route
// toont die melding in het formulier. Bij succes of uitgeschakeld: null.
async function verifieer(req, res, next) {
  req.turnstileFout = null;
  if (!actief()) return next();
  const uitkomst = await controleer(req.body && req.body['cf-turnstile-response'], req.ip);
  if (!uitkomst.ok) {
    req.turnstileFout = uitkomst.reden === 'geen-token'
      ? 'Bevestig eerst dat je geen robot bent (de controle boven de knop).'
      : 'De robot-controle is mislukt. Ververs de pagina en probeer het opnieuw.';
  }
  next();
}

module.exports = { actief, siteKey, controleer, verifieer };
