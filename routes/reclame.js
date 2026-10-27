// Reclameblokken: beheer door de beheerder en de klik-doorverwijzing voor bezoekers.
// Het tonen van de blokken zelf gebeurt in de pagina's via views/partials/reclame.ejs.

const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { requireLogin, requireAdmin, idParams } = require('../middleware/auth');
const { netteUrl, isEmail } = require('../lib/helpers');
const { afbeeldingen, bewaarAfbeelding } = require('../lib/upload');
const reclame = require('../lib/reclame');

const uploads = afbeeldingen({ maxMb: 4, maxBestanden: 2 });
const DATUM = /^\d{4}-\d{2}-\d{2}$/;

function tekst(v, max) {
  const t = typeof v === 'string' ? v.trim().slice(0, max) : '';
  return t || null;
}
function datum(v) {
  const t = tekst(v, 10);
  return t && DATUM.test(t) ? t : null;
}
function bestand(req, veld) {
  return (req.files || []).find((f) => f.fieldname === veld) || null;
}

// Openbare kopie van een (besloten) bedrijfslogo uit de ledengids, zodat het ook voor
// bezoekers zichtbaar is. Het origineel blijft onaangeroerd bij het lid.
async function kopieerMedia(mediaId, eigenaarId) {
  const { rows } = await pool.query(
    'INSERT INTO media (mime, data, eigenaar_id, besloten) SELECT mime, data, $2::int, false FROM media WHERE id = $1::int RETURNING id',
    [mediaId, eigenaarId]
  );
  return rows[0] ? rows[0].id : null;
}

async function verwijderMedia(id) {
  if (!id) return;
  try { await pool.query('DELETE FROM media WHERE id = $1', [id]); } catch (e) { /* niet erg */ }
}

function leesFormulier(body) {
  const gewicht = parseInt(body.gewicht, 10);
  const website = tekst(body.website, 300);
  const ctaUrl = tekst(body.cta_url, 500);
  const email = tekst(body.email, 200);
  const d = {
    naam: tekst(body.naam, 150) || '',
    slogan: tekst(body.slogan, 120),
    kop: tekst(body.kop, 160),
    tekst: tekst(body.tekst, 1200),
    diensten: tekst(body.diensten, 1000),
    kenmerken: tekst(body.kenmerken, 600),
    website: website ? netteUrl(website) || null : null,
    cta_url: ctaUrl ? netteUrl(ctaUrl) || null : null,
    cta_tekst: tekst(body.cta_tekst, 40),
    telefoon: tekst(body.telefoon, 40),
    whatsapp: tekst(body.whatsapp, 40),
    email: email ? email.toLowerCase() : null,
    plaats: tekst(body.plaats, 120),
    regio: tekst(body.regio, 300),
    thema: reclame.THEMAS[body.thema] ? body.thema : 'donker',
    accent: reclame.netteHex(body.accent),
    logo_achtergrond: reclame.netteHex(body.logo_achtergrond),
    van: datum(body.van),
    tot: datum(body.tot),
    gewicht: Number.isFinite(gewicht) ? Math.min(5, Math.max(1, gewicht)) : 1,
    actief: body.actief === 'on',
    notities: tekst(body.notities, 2000),
    bedrijf_id: /^\d{1,9}$/.test(String(body.bedrijf_id || '')) ? Number(body.bedrijf_id) : null,
    logo_van_bedrijf: body.logo_van_bedrijf === 'on',
    logo_verwijderen: body.logo_verwijderen === 'on',
    foto_verwijderen: body.foto_verwijderen === 'on'
  };
  if (!d.naam) d.fout = 'Geef het reclameblok minimaal een bedrijfsnaam.';
  else if (website && !d.website) d.fout = 'Het websiteadres is ongeldig.';
  else if (ctaUrl && !d.cta_url) d.fout = 'Het adres achter de knop is ongeldig.';
  else if (email && !isEmail(email)) d.fout = 'Het e-mailadres is ongeldig.';
  else if (d.van && d.tot && d.tot < d.van) d.fout = 'De einddatum ligt vóór de begindatum.';
  else d.fout = null;
  return d;
}

// Bedrijven van actieve leden (voor de koppeling in het formulier).
async function bedrijvenLijst() {
  return (await pool.query(
    `SELECT b.id, b.naam, b.plaats, b.logo_id, u.naam AS lid_naam
     FROM bedrijven b JOIN users u ON u.id = b.user_id
     WHERE u.actief = true ORDER BY lower(b.naam) ASC, b.id ASC`
  )).rows;
}

async function bedrijfMetLid(id) {
  if (!id) return null;
  return (await pool.query(
    `SELECT b.*, u.telefoon AS lid_telefoon FROM bedrijven b JOIN users u ON u.id = b.user_id WHERE b.id = $1`, [id]
  )).rows[0] || null;
}

function toonFormulier(res, { title, item, actie, fout, status = 200, bedrijven = [] }) {
  res.status(status).render('reclame/form', { title, item, actie, fout, bedrijven, themas: reclame.THEMAS });
}

// ---- Beheer (alleen admin) ----------------------------------------------------
const beheer = express.Router();
beheer.use(requireLogin, requireAdmin);
idParams(beheer);

beheer.get('/', async (req, res) => {
  try {
    const reclames = (await pool.query(
      `SELECT r.*, u.naam AS lid_naam, b.naam AS bedrijf_naam
       FROM reclames r LEFT JOIN users u ON u.id = r.user_id LEFT JOIN bedrijven b ON b.id = r.bedrijf_id
       ORDER BY r.actief DESC, r.gewicht DESC, lower(r.naam) ASC, r.id ASC`
    )).rows.map((r) => ({ ...r, status: reclame.status(r) }));
    const zonder = (await pool.query(
      `SELECT b.id, b.naam, b.plaats, b.branche, b.logo_id, u.naam AS lid_naam
       FROM bedrijven b JOIN users u ON u.id = b.user_id LEFT JOIN reclames r ON r.bedrijf_id = b.id
       WHERE u.actief = true AND r.id IS NULL
       ORDER BY lower(b.naam) ASC, b.id ASC`
    )).rows;
    const totalen = reclames.reduce((t, r) => ({
      actief: t.actief + (r.status === 'actief' ? 1 : 0),
      vertoningen: t.vertoningen + Number(r.vertoningen || 0),
      kliks: t.kliks + Number(r.kliks || 0)
    }), { actief: 0, vertoningen: 0, kliks: 0 });
    res.render('reclame/beheer', { title: 'Reclameblokken', reclames, zonder, totalen, contact: reclame.contactAdres() });
  } catch (err) {
    console.error('[reclame beheer]', err.message);
    res.status(500).render('error', { title: 'Fout', bericht: 'De reclameblokken konden niet worden geladen.' });
  }
});

beheer.get('/nieuw', async (req, res) => {
  let item = { actief: true, gewicht: 1, thema: 'donker', cta_tekst: 'Bekijk website', accent: '#a98443', logo_achtergrond: '#ffffff' };
  try {
    const bid = /^\d{1,9}$/.test(String(req.query.bedrijf || '')) ? Number(req.query.bedrijf) : null;
    const b = await bedrijfMetLid(bid);
    if (b) {
      item = {
        ...item,
        bedrijf_id: b.id, naam: b.naam, tekst: b.omschrijving, website: b.website, email: b.email,
        telefoon: b.telefoon || b.lid_telefoon, plaats: b.plaats, bedrijf_logo_id: b.logo_id, logo_van_bedrijf: !!b.logo_id
      };
    }
    toonFormulier(res, { title: 'Reclameblok maken', item, actie: '/reclame/beheer/nieuw', fout: null, bedrijven: await bedrijvenLijst() });
  } catch (err) {
    console.error('[reclame nieuw]', err.message);
    res.status(500).render('error', { title: 'Fout', bericht: 'Het formulier kon niet worden geladen.' });
  }
});

beheer.post('/nieuw', uploads, async (req, res) => {
  const d = leesFormulier(req.body);
  const bedrijven = await bedrijvenLijst().catch(() => []);
  if (d.fout || req.uploadFout) {
    return toonFormulier(res, {
      title: 'Reclameblok maken', item: { ...req.body, actief: d.actief, bedrijf_logo_id: null },
      actie: '/reclame/beheer/nieuw', fout: req.uploadFout || d.fout, status: 400, bedrijven
    });
  }
  try {
    const uid = req.session.user.id;
    const bedrijf = await bedrijfMetLid(d.bedrijf_id);
    let logoId = await bewaarAfbeelding(bestand(req, 'logo'), uid);
    if (!logoId && d.logo_van_bedrijf && bedrijf && bedrijf.logo_id) logoId = await kopieerMedia(bedrijf.logo_id, uid);
    const fotoId = await bewaarAfbeelding(bestand(req, 'foto'), uid);
    const { rows } = await pool.query(
      `INSERT INTO reclames (bedrijf_id, user_id, naam, slogan, kop, tekst, diensten, kenmerken, website, cta_url, cta_tekst,
         telefoon, whatsapp, email, plaats, regio, logo_id, foto_id, thema, accent, logo_achtergrond, van, tot, gewicht, actief, notities, auteur_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27) RETURNING id`,
      [bedrijf ? bedrijf.id : null, bedrijf ? bedrijf.user_id : null, d.naam, d.slogan, d.kop, d.tekst, d.diensten, d.kenmerken,
        d.website, d.cta_url, d.cta_tekst, d.telefoon, d.whatsapp, d.email, d.plaats, d.regio, logoId, fotoId, d.thema, d.accent,
        d.logo_achtergrond, d.van, d.tot, d.gewicht, d.actief, d.notities, uid]
    );
    reclame.ververs();
    req.session.flash = { type: 'succes', message: 'Reclameblok opgeslagen. Hieronder zie je hoe het op de site verschijnt.' };
    res.redirect('/reclame/beheer/' + rows[0].id + '/voorbeeld');
  } catch (err) {
    console.error('[reclame nieuw opslaan]', err.message);
    toonFormulier(res, {
      title: 'Reclameblok maken', item: { ...req.body, actief: d.actief }, actie: '/reclame/beheer/nieuw',
      fout: 'Opslaan mislukt. Probeer het opnieuw.', status: 500, bedrijven
    });
  }
});

async function haal(id) {
  return (await pool.query('SELECT * FROM reclames WHERE id = $1', [id])).rows[0] || null;
}

beheer.get('/:id/bewerken', async (req, res) => {
  const item = await haal(req.params.id);
  if (!item) return res.status(404).render('error', { title: 'Niet gevonden', bericht: 'Dit reclameblok bestaat niet (meer).' });
  const bedrijf = await bedrijfMetLid(item.bedrijf_id);
  item.bedrijf_logo_id = bedrijf ? bedrijf.logo_id : null;
  toonFormulier(res, { title: 'Reclameblok bewerken', item, actie: '/reclame/beheer/' + item.id + '/bewerken', fout: null, bedrijven: await bedrijvenLijst() });
});

beheer.post('/:id/bewerken', uploads, async (req, res) => {
  const bestaand = await haal(req.params.id);
  if (!bestaand) return res.status(404).render('error', { title: 'Niet gevonden', bericht: 'Dit reclameblok bestaat niet (meer).' });
  const d = leesFormulier(req.body);
  const actie = '/reclame/beheer/' + bestaand.id + '/bewerken';
  const bedrijven = await bedrijvenLijst().catch(() => []);
  if (d.fout || req.uploadFout) {
    return toonFormulier(res, {
      title: 'Reclameblok bewerken', item: { ...bestaand, ...req.body, id: bestaand.id, actief: d.actief },
      actie, fout: req.uploadFout || d.fout, status: 400, bedrijven
    });
  }
  try {
    const uid = req.session.user.id;
    const bedrijf = await bedrijfMetLid(d.bedrijf_id);
    const opruimen = [];

    const nieuwLogo = await bewaarAfbeelding(bestand(req, 'logo'), uid);
    let logoId = bestaand.logo_id;
    let logoUrl = bestaand.logo_url;
    if (nieuwLogo) { logoId = nieuwLogo; logoUrl = null; }
    else if (d.logo_verwijderen) { logoId = null; logoUrl = null; }
    if (!logoId && !logoUrl && d.logo_van_bedrijf && bedrijf && bedrijf.logo_id) logoId = await kopieerMedia(bedrijf.logo_id, uid);
    if (bestaand.logo_id && logoId !== bestaand.logo_id) opruimen.push(bestaand.logo_id);

    const nieuweFoto = await bewaarAfbeelding(bestand(req, 'foto'), uid);
    let fotoId = bestaand.foto_id;
    let fotoUrl = bestaand.foto_url;
    if (nieuweFoto) { fotoId = nieuweFoto; fotoUrl = null; }
    else if (d.foto_verwijderen) { fotoId = null; fotoUrl = null; }
    if (bestaand.foto_id && fotoId !== bestaand.foto_id) opruimen.push(bestaand.foto_id);

    await pool.query(
      `UPDATE reclames SET bedrijf_id=$1, user_id=$2, naam=$3, slogan=$4, kop=$5, tekst=$6, diensten=$7, kenmerken=$8, website=$9,
         cta_url=$10, cta_tekst=$11, telefoon=$12, whatsapp=$13, email=$14, plaats=$15, regio=$16, logo_id=$17, logo_url=$18,
         foto_id=$19, foto_url=$20, thema=$21, accent=$22, logo_achtergrond=$23, van=$24, tot=$25, gewicht=$26, actief=$27,
         notities=$28, bijgewerkt=now()
       WHERE id=$29`,
      [bedrijf ? bedrijf.id : null, bedrijf ? bedrijf.user_id : bestaand.user_id, d.naam, d.slogan, d.kop, d.tekst, d.diensten, d.kenmerken,
        d.website, d.cta_url, d.cta_tekst, d.telefoon, d.whatsapp, d.email, d.plaats, d.regio, logoId, logoUrl, fotoId, fotoUrl,
        d.thema, d.accent, d.logo_achtergrond, d.van, d.tot, d.gewicht, d.actief, d.notities, bestaand.id]
    );
    for (const id of opruimen) await verwijderMedia(id);
    reclame.ververs();
    req.session.flash = { type: 'succes', message: 'Reclameblok bijgewerkt.' };
    res.redirect('/reclame/beheer/' + bestaand.id + '/voorbeeld');
  } catch (err) {
    console.error('[reclame bewerken]', err.message);
    toonFormulier(res, {
      title: 'Reclameblok bewerken', item: { ...bestaand, ...req.body, id: bestaand.id, actief: d.actief },
      actie, fout: 'Opslaan mislukt. Probeer het opnieuw.', status: 500, bedrijven
    });
  }
});

beheer.get('/:id/voorbeeld', async (req, res) => {
  const item = await haal(req.params.id);
  if (!item) return res.status(404).render('error', { title: 'Niet gevonden', bericht: 'Dit reclameblok bestaat niet (meer).' });
  const labels = { actief: 'actief — wordt getoond', gepland: 'gepland — nog niet zichtbaar', verlopen: 'verlopen — niet meer zichtbaar', uit: 'uitgeschakeld' };
  res.render('reclame/voorbeeld', { title: 'Voorbeeld: ' + item.naam, item, statusLabel: labels[reclame.status(item)] });
});

beheer.post('/:id/actief', async (req, res) => {
  try {
    const r = (await pool.query('UPDATE reclames SET actief = NOT actief, bijgewerkt = now() WHERE id = $1 RETURNING actief, naam', [req.params.id])).rows[0];
    reclame.ververs();
    if (r) req.session.flash = { type: 'succes', message: r.actief ? `"${r.naam}" staat aan.` : `"${r.naam}" staat uit en wordt niet meer getoond.` };
  } catch (err) {
    console.error('[reclame actief]', err.message);
    req.session.flash = { type: 'fout', message: 'Wijzigen mislukt.' };
  }
  res.redirect('/reclame/beheer');
});

beheer.post('/:id/verwijderen', async (req, res) => {
  try {
    const r = (await pool.query('DELETE FROM reclames WHERE id = $1 RETURNING logo_id, foto_id', [req.params.id])).rows[0];
    if (r) { await verwijderMedia(r.logo_id); await verwijderMedia(r.foto_id); }
    reclame.ververs();
    req.session.flash = { type: 'succes', message: 'Reclameblok verwijderd.' };
  } catch (err) {
    console.error('[reclame verwijderen]', err.message);
    req.session.flash = { type: 'fout', message: 'Verwijderen mislukt.' };
  }
  res.redirect('/reclame/beheer');
});

router.use('/beheer', beheer);

// ---- Publiek: klik tellen en doorsturen naar de adverteerder ----------------------
idParams(router);
router.get('/:id/klik', async (req, res) => {
  try {
    const doel = await reclame.registreerKlik(req.params.id);
    if (!doel) return res.status(404).render('error', { title: 'Niet gevonden', bericht: 'Dit reclameblok bestaat niet (meer).' });
    res.set('Cache-Control', 'no-store');
    res.redirect(302, doel);
  } catch (err) {
    console.error('[reclame klik]', err.message);
    res.status(500).render('error', { title: 'Er ging iets mis', bericht: 'De link kon niet worden geopend. Probeer het later opnieuw.' });
  }
});

module.exports = router;
