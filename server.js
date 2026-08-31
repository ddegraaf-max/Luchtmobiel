require('dotenv').config();
require('./lib/async-routes'); // vóór de routers: vangt fouten uit async routes op

const crypto = require('crypto');
const express = require('express');
const path = require('path');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const expressLayouts = require('express-ejs-layouts');

const pool = require('./db/pool');
const initDb = require('./db/init');
const { attachUser } = require('./middleware/auth');
const { headers, csrf, geenCacheVoorIngelogd, httpsVerplicht, platteInvoer } = require('./middleware/security');
const helpers = require('./lib/helpers');
const turnstile = require('./lib/turnstile');

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === 'production';

// Achter de Railway-proxy: nodig voor correcte https-detectie en secure cookies.
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Sessiesleutel. In productie is SESSION_SECRET verplicht; ontbreekt hij, dan
// gebruiken we een tijdelijke willekeurige sleutel (sessies vervallen bij herstart).
let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  if (isProd) {
    sessionSecret = crypto.randomBytes(32).toString('hex');
    console.error('[server] WAARSCHUWING: SESSION_SECRET ontbreekt. Er wordt een tijdelijke sleutel gebruikt; ' +
      'iedereen wordt bij elke herstart uitgelogd en 2FA kan niet worden ingeschakeld. Stel SESSION_SECRET in op Railway.');
  } else {
    sessionSecret = 'luchtmobiel-dev-secret-wijzig-mij';
    process.env.SESSION_SECRET = sessionSecret; // zodat 2FA lokaal ook werkt
  }
}

// Socialemedia-links (footer en Over-pagina); leeg = niet tonen.
const SOCIAL = {
  linkedin: helpers.netteUrl(process.env.SOCIAL_LINKEDIN || ''),
  facebook: helpers.netteUrl(process.env.SOCIAL_FACEBOOK || ''),
  instagram: helpers.netteUrl(process.env.SOCIAL_INSTAGRAM || '')
};

// Views
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'partials/layout');

// In productie alleen via https (Railway zet X-Forwarded-Proto; zonder die header doen we niets,
// zodat er nooit een redirect-lus kan ontstaan).
if (isProd) app.use(httpsVerplicht);

// Beveiligingsheaders (CSP, HSTS, nosniff, ...)
app.use(headers);

// Query-parameters: geen geneste objecten (a[b]=c) uit de URL.
app.set('query parser', 'simple');

// Basis-locals meteen zetten, zodat óók een foutpagina die vroeg in de keten
// wordt gerenderd (te groot verzoek, CSRF-fout, ...) altijd kan worden opgebouwd.
app.use((req, res, next) => {
  res.locals.h = helpers;
  res.locals.siteNaam = 'Business Club Luchtmobiel';
  res.locals.user = null;
  res.locals.path = req.path;
  res.locals.csrfToken = '';
  res.locals.flash = null;
  res.locals.turnstileSiteKey = turnstile.actief() ? turnstile.siteKey() : '';
  res.locals.social = SOCIAL;
  next();
});

// Body parsing
app.use(express.urlencoded({ extended: false, limit: '2mb', parameterLimit: 500 }));
app.use(platteInvoer);

// Statische bestanden
app.use('/static', express.static(path.join(__dirname, 'public'), { maxAge: '7d' }));

// Sessies (opgeslagen in Postgres zodat ze deploys overleven)
app.use(
  session({
    store: new PgSession({ pool, tableName: 'session', createTableIfMissing: true }),
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 14 // 14 dagen (verlengt bij gebruik)
    }
  })
);

// Gebruiker ophalen, CSRF-token, helpers + flash beschikbaar in views
app.use(attachUser);
app.use(csrf);
app.use(geenCacheVoorIngelogd);
app.use((req, res, next) => {
  if (req.session) {
    res.locals.flash = req.session.flash || null;
    delete req.session.flash;
  }
  next();
});

// Routes
app.use('/', require('./routes/pages'));
app.use('/', require('./routes/auth'));
app.use('/profiel/beveiliging', require('./routes/beveiliging'));
app.use('/profiel', require('./routes/profiel'));
app.use('/leden', require('./routes/leden'));
app.use('/vacatures', require('./routes/vacatures'));
app.use('/projecten', require('./routes/projecten'));
app.use('/agenda', require('./routes/agenda'));
app.use('/nieuws', require('./routes/nieuws'));
app.use('/partners', require('./routes/partners'));
app.use('/sponsorverzoeken', require('./routes/sponsorverzoeken'));
app.use('/veteranen', require('./routes/veteranen'));
app.use('/media', require('./routes/media'));
app.use('/beheer', require('./routes/beheer'));
app.use('/galerij', require('./routes/galerij'));

// 404
app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Niet gevonden',
    bericht: 'Deze pagina bestaat niet (meer).'
  });
});

// Foutafhandeling
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[server] Fout:', err);
  if (res.headersSent) return;
  res.status(500).render('error', {
    title: 'Er ging iets mis',
    bericht: 'Er trad een onverwachte fout op. Probeer het later opnieuw.'
  });
});

// Laatste vangnet: log in plaats van crashen.
process.on('unhandledRejection', (err) => console.error('[server] Onafgehandelde promise-fout:', err));

// Start: eerst DB klaarzetten, dan luisteren en de agenda-import en het ophalen van
// sponsorverzoeken inplannen.
if (require.main === module) {
  initDb()
    .catch((err) => console.error('[server] DB-init mislukt (server start toch):', err.message))
    .finally(() => {
      app.listen(PORT, () => console.log(`[server] Luchtmobiel-platform draait op poort ${PORT}`));
      require('./lib/agenda-import').planImport();
      require('./lib/sponsor-import').planImport();
    });
}

module.exports = app;
