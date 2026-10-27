// Bezoekersteller: telt unieke bezoekers (één keer per browser, via een cookie van een jaar) en
// toont het totaal in het vizier in de voettekst. Per dag opgeslagen in de tabel `bezoeken`;
// in het geheugen gebundeld en om de 15 seconden weggeschreven. Bekende zoekrobots en
// voorvertoningen (WhatsApp, LinkedIn, ...) tellen niet mee. Met BEZOEKERS_START kan het aantal
// bezoekers van vóór de teller (bijv. uit Cloudflare) bij het totaal worden opgeteld.

const pool = require('../db/pool');

const COOKIE = 'lm_bezoek';
const FLUSH_MS = 15 * 1000;
const CACHE_MS = 60 * 1000;
const BOT = /bot|crawl|spider|slurp|preview|fetch|facebookexternalhit|whatsapp|telegram|skype|linkedin|pinterest|embedly|quora|curl|wget|python|java\/|httpclient|headless|lighthouse|pingdom|uptime|monitor|scan/i;

let wachtend = new Map();   // dag -> aantal nog weg te schrijven bezoekers
let flushTimer = null;
let cache = { totaal: 0, tot: 0, laden: null };

function vandaag() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(new Date());
}
function isBot(ua) { return !ua || BOT.test(String(ua)); }
function heeftCookie(header) { return new RegExp('(?:^|;\\s*)' + COOKIE + '=').test(String(header || '')); }
function startwaarde() {
  const n = parseInt(process.env.BEZOEKERS_START || '0', 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function tel(dag = vandaag()) {
  wachtend.set(dag, (wachtend.get(dag) || 0) + 1);
  cache.totaal += 1; // de bezoeker ziet zichzelf meteen meegeteld
  if (!flushTimer) {
    flushTimer = setTimeout(() => { flush().catch(() => {}); }, FLUSH_MS);
    if (flushTimer.unref) flushTimer.unref();
  }
}

async function flush() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  const items = [...wachtend.entries()];
  wachtend = new Map();
  for (const [dag, n] of items) {
    try {
      await pool.query(
        'INSERT INTO bezoeken (dag, aantal) VALUES ($1, $2) ON CONFLICT (dag) DO UPDATE SET aantal = bezoeken.aantal + EXCLUDED.aantal',
        [dag, n]
      );
    } catch (err) {
      console.error('[bezoekers] wegschrijven mislukt:', err.message);
      wachtend.set(dag, (wachtend.get(dag) || 0) + n); // volgende keer opnieuw proberen
    }
  }
  return items.length;
}

// Totaal (database + nog niet weggeschreven + startwaarde), hoogstens één keer per minuut uit de database.
async function totaal() {
  if (cache.tot > Date.now()) return cache.totaal;
  if (!cache.laden) {
    cache.laden = pool.query('SELECT COALESCE(SUM(aantal), 0)::bigint AS n FROM bezoeken')
      .then(({ rows }) => {
        const inWacht = [...wachtend.values()].reduce((s, n) => s + n, 0);
        cache = { totaal: Number(rows[0].n) + inWacht + startwaarde(), tot: Date.now() + CACHE_MS, laden: null };
        return cache.totaal;
      })
      .catch((err) => {
        console.error('[bezoekers] totaal laden mislukt:', err.message);
        cache = { totaal: cache.totaal, tot: Date.now() + 10 * 1000, laden: null };
        return cache.totaal;
      });
  }
  return cache.laden;
}

// Voor Beheer: totaal, startwaarde, eerste teldag en de laatste dagen.
async function overzicht(dagen = 14) {
  await flush();
  const t = (await pool.query('SELECT COALESCE(SUM(aantal), 0)::bigint AS n, MIN(dag) AS sinds FROM bezoeken')).rows[0];
  const rijen = (await pool.query('SELECT dag, aantal FROM bezoeken ORDER BY dag DESC LIMIT $1', [dagen])).rows;
  return { geteld: Number(t.n), start: startwaarde(), totaal: Number(t.n) + startwaarde(), sinds: t.sinds || null, dagen: rijen };
}

// Alleen echte paginabezoeken (GET van een HTML-pagina) tellen; geen bestanden, afbeeldingen,
// kliklinks of de versie-/robotsbestanden. Zonder cookie en zonder robot-kenmerk: tellen en cookie zetten.
function middleware(req, res, next) {
  res.locals.bezoekers = { totaal: cache.totaal };
  if (req.method !== 'GET' || /^\/(static|media|reclame)\//.test(req.path) || /^\/(versie\.json|robots\.txt|sitemap\.xml)$/.test(req.path)) return next();
  if (!String(req.get('accept') || '').includes('text/html')) return next();
  if (!heeftCookie(req.get('cookie')) && !isBot(req.get('user-agent'))) {
    tel();
    res.cookie(COOKIE, '1', { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/' });
  }
  totaal().then((t) => { res.locals.bezoekers = { totaal: t }; next(); }, () => next());
}

module.exports = { COOKIE, isBot, heeftCookie, startwaarde, vandaag, tel, flush, totaal, overzicht, middleware };
