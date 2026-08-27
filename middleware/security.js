// Beveiligingslagen voor alle verzoeken: HTTP-headers en CSRF-bescherming.

const crypto = require('crypto');

const isProd = process.env.NODE_ENV === 'production';

// ---- HTTP security-headers ---------------------------------------------------
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://images.unsplash.com",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'"
].join('; ');

function headers(req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.set('Content-Security-Policy', CSP);
  if (isProd) res.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  next();
}

// Besloten pagina's niet in de browsercache (terug-knop na uitloggen).
function geenCacheVoorIngelogd(req, res, next) {
  if (req.session && (req.session.user || req.session.tfaPending)) {
    res.set('Cache-Control', 'no-store');
  }
  next();
}

// ---- CSRF ---------------------------------------------------------------------
// Elk formulier bevat een verborgen veld _csrf met een token uit de sessie.
// Multipart-formulieren (uploads) geven het token mee in de query-string,
// omdat hun body pas later door multer wordt gelezen.
function csrf(req, res, next) {
  if (!req.session) return next();
  if (!req.session.csrfToken) req.session.csrfToken = crypto.randomBytes(24).toString('base64url');
  res.locals.csrfToken = req.session.csrfToken;

  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();

  const geleverd = (req.body && req.body._csrf) || req.query._csrf || req.get('x-csrf-token');
  const verwacht = req.session.csrfToken;
  if (typeof geleverd === 'string') {
    const a = Buffer.from(geleverd), b = Buffer.from(verwacht);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return next();
  }
  return res.status(403).render('error', {
    title: 'Formulier verlopen',
    bericht: 'Je sessie is verlopen of het formulier was ongeldig. Ga terug, ververs de pagina en probeer het opnieuw.'
  });
}

module.exports = { headers, csrf, geenCacheVoorIngelogd };
