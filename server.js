require('dotenv').config();

const express = require('express');
const path = require('path');
const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const expressLayouts = require('express-ejs-layouts');

const pool = require('./db/pool');
const initDb = require('./db/init');
const { attachUser } = require('./middleware/auth');
const helpers = require('./lib/helpers');

const app = express();
const PORT = process.env.PORT || 3000;

// Achter de Railway-proxy: nodig voor correcte https-detectie en secure cookies.
app.set('trust proxy', 1);

// Views
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'partials/layout');

// Body parsing
app.use(express.urlencoded({ extended: true, limit: '2mb' }));
app.use(express.json({ limit: '2mb' }));

// Statische bestanden
app.use('/static', express.static(path.join(__dirname, 'public'), { maxAge: '7d' }));

// Sessies (opgeslagen in Postgres zodat ze deploys overleven)
const isProd = process.env.NODE_ENV === 'production';
app.use(
  session({
    store: new PgSession({ pool, tableName: 'session', createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET || 'luchtmobiel-dev-secret-wijzig-mij',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 30 // 30 dagen
    }
  })
);

// Maak gebruiker + helpers + flash beschikbaar in views
app.use(attachUser);
app.use((req, res, next) => {
  res.locals.h = helpers;
  res.locals.flash = req.session.flash || null;
  delete req.session.flash;
  res.locals.siteNaam = 'Business Club Luchtmobiel';
  next();
});

// Routes
app.use('/', require('./routes/pages'));
app.use('/', require('./routes/auth'));
app.use('/profiel', require('./routes/profiel'));
app.use('/leden', require('./routes/leden'));
app.use('/vacatures', require('./routes/vacatures'));
app.use('/projecten', require('./routes/projecten'));
app.use('/veteranen', require('./routes/veteranen'));
app.use('/media', require('./routes/media'));
app.use('/beheer', require('./routes/beheer'));

// 404
app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Niet gevonden',
    bericht: 'Deze pagina bestaat niet (meer).'
  });
});

// Foutafhandeling
app.use((err, req, res, next) => {
  console.error('[server] Fout:', err);
  res.status(500).render('error', {
    title: 'Er ging iets mis',
    bericht: 'Er trad een onverwachte fout op. Probeer het later opnieuw.'
  });
});

// Start: eerst DB klaarzetten, dan luisteren.
initDb()
  .catch((err) => console.error('[server] DB-init mislukt (server start toch):', err.message))
  .finally(() => {
    app.listen(PORT, () => console.log(`[server] Luchtmobiel-platform draait op poort ${PORT}`));
  });
