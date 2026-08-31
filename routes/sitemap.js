// Sitemap en robots.txt voor zoekmachines. De sitemap bevat alle openbare pagina's,
// inclusief gepubliceerd nieuws, partners, geplaatste sponsorverzoeken, komende
// evenementen, vacatures en projecten. Besloten delen worden in robots.txt uitgesloten.

const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { isoLokaal } = require('../lib/helpers');

function xmlEsc(s) {
  return String(s).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&apos;', '"': '&quot;' }[c]));
}

function datum(d) {
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? null : t.toISOString().slice(0, 10);
}

router.get('/sitemap.xml', async (req, res) => {
  const basis = res.locals.basisUrl;
  const urls = [];
  const voeg = (pad, lastmod, prioriteit) => urls.push({ loc: basis + pad, lastmod: lastmod ? datum(lastmod) : null, prioriteit: prioriteit || null });

  voeg('/', null, '1.0');
  for (const p of ['/over', '/eenheden', '/agenda', '/nieuws', '/partners', '/sponsorverzoeken', '/veteranen', '/vacatures', '/projecten']) voeg(p, null, '0.8');
  try {
    for (const r of (await pool.query("SELECT id, COALESCE(bijgewerkt, aangemaakt) AS m FROM nieuws WHERE gepubliceerd = true ORDER BY id")).rows) voeg('/nieuws/' + r.id, r.m);
    for (const r of (await pool.query("SELECT id, COALESCE(bijgewerkt, aangemaakt) AS m FROM partners WHERE gepubliceerd = true ORDER BY id")).rows) voeg('/partners/' + r.id, r.m);
    for (const r of (await pool.query("SELECT id, COALESCE(bijgewerkt, aangemaakt) AS m FROM sponsorverzoeken WHERE status = 'geplaatst' ORDER BY id")).rows) voeg('/sponsorverzoeken/' + r.id, r.m);
    for (const r of (await pool.query('SELECT id, aangemaakt FROM evenementen WHERE COALESCE(eind_op, start_op) >= $1 ORDER BY id', [isoLokaal(new Date())])).rows) voeg('/agenda/' + r.id, r.aangemaakt);
    for (const r of (await pool.query('SELECT id, aangemaakt FROM vacatures ORDER BY id')).rows) voeg('/vacatures/' + r.id, r.aangemaakt);
    for (const r of (await pool.query('SELECT id, aangemaakt FROM projecten ORDER BY id')).rows) voeg('/projecten/' + r.id, r.aangemaakt);
  } catch (err) {
    console.error('[sitemap]', err.message);
  }

  res.set('Content-Type', 'application/xml; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=3600');
  res.send('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + urls.map((u) => `  <url><loc>${xmlEsc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}${u.prioriteit ? `<priority>${u.prioriteit}</priority>` : ''}</url>`).join('\n')
    + '\n</urlset>\n');
});

router.get('/robots.txt', (req, res) => {
  res.set('Content-Type', 'text/plain; charset=utf-8');
  res.set('Cache-Control', 'public, max-age=3600');
  res.send([
    'User-agent: *',
    'Disallow: /beheer',
    'Disallow: /profiel',
    'Disallow: /dashboard',
    'Disallow: /leden',
    'Disallow: /galerij/beheer',
    'Disallow: /sponsorverzoeken/controle',
    'Disallow: /inloggen',
    'Disallow: /registreren',
    'Disallow: /uitloggen',
    'Disallow: /wachtwoord-vergeten',
    'Disallow: /wachtwoord-herstellen',
    '',
    'Sitemap: ' + res.locals.basisUrl + '/sitemap.xml',
    ''
  ].join('\n'));
});

module.exports = router;
