const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { requireRedactie, idParams } = require('../middleware/auth');
const nieuwsImport = require('../lib/nieuws-import');
const { afbeeldingEnPdf, bewaarAfbeelding } = require('../lib/upload');

idParams(router);

// Eigen berichten kunnen een afbeelding en een PDF-bijlage (bijv. een nieuwsbrief) krijgen.
const MAX_AFBEELDING_MB = 2;
const MAX_BIJLAGE_MB = 10;
const uploads = afbeeldingEnPdf('afbeelding', 'bijlage', { maxMb: MAX_AFBEELDING_MB, maxMbPdf: MAX_BIJLAGE_MB });

function magBeheren(req) {
  const u = req.session.user;
  return !!u && (u.rol === 'admin' || u.rol === 'brigade');
}

// Velden uit het formulier netjes maken (zelfde regels voor toevoegen en bewerken).
function leesFormulier(body) {
  const b = body || {};
  const regel = (v, max) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, max) || null;
  return {
    titel: regel(b.titel, 200) || '',
    inhoud: String(b.inhoud || '').replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 50000) || null,
    categorie: regel(b.categorie, 60),
    bijlage_naam: regel(b.bijlage_naam, 120),
    gepubliceerd: b.gepubliceerd === 'on'
  };
}

// Naam van de bijlage zoals getoond: uit het formulier, anders de bestandsnaam zonder .pdf
function bijlageNaam(d, file) {
  if (d.bijlage_naam) return d.bijlage_naam;
  const uitBestand = String((file && file.originalname) || '').replace(/\.pdf$/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
  return uitBestand || 'Bijlage';
}

// Bestandsnaam bij het openen/downloaden: alleen gewone tekens, altijd .pdf
function bestandsnaam(naam) {
  const n = String(naam || '').normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/\.pdf$/i, '').replace(/[^A-Za-z0-9 ._(),-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
  return (n || 'bijlage') + '.pdf';
}

function toonFormulier(res, { title, bericht, actie, fout, status = 200 }) {
  res.status(status).render('nieuws/form', { title, bericht, actie, fout, maxAfbeeldingMb: MAX_AFBEELDING_MB, maxBijlageMb: MAX_BIJLAGE_MB });
}

// Overzicht
router.get('/', async (req, res) => {
  const beheer = magBeheren(req);
  try {
    const sql = beheer
      ? `SELECT n.*, u.naam AS auteur FROM nieuws n LEFT JOIN users u ON u.id = n.auteur_id ORDER BY n.aangemaakt DESC`
      : `SELECT n.*, u.naam AS auteur FROM nieuws n LEFT JOIN users u ON u.id = n.auteur_id WHERE n.gepubliceerd = true ORDER BY n.aangemaakt DESC`;
    const berichten = (await pool.query(sql)).rows;
    res.render('nieuws/index', { title: 'Nieuws', berichten, magBeheren: beheer });
  } catch (err) {
    console.error('[nieuws]', err.message);
    res.status(500).render('error', { title: 'Fout', bericht: 'Het nieuws kon niet worden geladen.' });
  }
});

router.get('/nieuw', requireRedactie, (req, res) => {
  toonFormulier(res, { title: 'Nieuwsbericht toevoegen', bericht: { gepubliceerd: true }, actie: '/nieuws/nieuw', fout: null });
});

router.post('/nieuw', requireRedactie, uploads, async (req, res) => {
  const d = leesFormulier(req.body);
  const terug = (fout, status) => toonFormulier(res, { title: 'Nieuwsbericht toevoegen', bericht: { ...req.body, ...d }, actie: '/nieuws/nieuw', fout, status });
  if (!d.titel) return terug('Geef het bericht een titel.', 400);
  if (req.uploadFout) return terug(req.uploadFout, 400);
  try {
    const afbId = await bewaarAfbeelding(req.file, null);
    const bijlageId = await bewaarAfbeelding(req.bijlage, null);
    const { rows } = await pool.query(
      `INSERT INTO nieuws (titel, inhoud, categorie, gepubliceerd, auteur_id, afbeelding_id, bijlage_id, bijlage_naam)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [d.titel, d.inhoud, d.categorie, d.gepubliceerd, req.session.user.id, afbId, bijlageId, bijlageId ? bijlageNaam(d, req.bijlage) : null]
    );
    req.session.flash = { type: 'succes', message: 'Nieuwsbericht geplaatst.' };
    res.redirect('/nieuws/' + rows[0].id);
  } catch (err) {
    console.error('[nieuws nieuw]', err.message);
    terug('Opslaan mislukt.', 500);
  }
});

router.get('/:id', async (req, res) => {
  try {
    const bericht = (await pool.query(
      `SELECT n.*, u.naam AS auteur, octet_length(b.data) AS bijlage_grootte
       FROM nieuws n LEFT JOIN users u ON u.id = n.auteur_id LEFT JOIN media b ON b.id = n.bijlage_id
       WHERE n.id = $1`,
      [req.params.id]
    )).rows[0];
    const beheer = magBeheren(req);
    if (!bericht || (!bericht.gepubliceerd && !beheer)) {
      return res.status(404).render('error', { title: 'Niet gevonden', bericht: 'Dit bericht bestaat niet (meer).' });
    }
    if (bericht.gepubliceerd) {
      res.locals.meta = {
        type: 'article',
        titel: bericht.titel,
        beschrijving: res.locals.h.kort(bericht.inhoud, 200) || 'Nieuws van de Business Club Luchtmobiel.',
        afbeelding: bericht.afbeelding_id ? '/media/' + bericht.afbeelding_id : null,
        afbeeldingAlt: bericht.afbeelding_id ? bericht.titel : null,
        kaart: bericht.afbeelding_id ? 'summary_large_image' : 'summary'
      };
    }
    res.render('nieuws/detail', { title: bericht.titel, bericht, magBeheren: beheer });
  } catch (err) {
    console.error('[nieuws detail]', err.message);
    res.status(500).render('error', { title: 'Fout', bericht: 'Het bericht kon niet worden geladen.' });
  }
});

// PDF-bijlage van een bericht: in de browser openen (standaard) of downloaden (?download=1).
// Alleen van gepubliceerde berichten, tenzij je het nieuws beheert.
router.get('/:id/bijlage', async (req, res) => {
  try {
    const r = (await pool.query(
      'SELECT n.gepubliceerd, n.bijlage_naam, m.mime, m.data FROM nieuws n JOIN media m ON m.id = n.bijlage_id WHERE n.id = $1',
      [req.params.id]
    )).rows[0];
    if (!r || (!r.gepubliceerd && !magBeheren(req)) || r.mime !== 'application/pdf') {
      return res.status(404).render('error', { title: 'Niet gevonden', bericht: 'Deze bijlage bestaat niet (meer).' });
    }
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="${bestandsnaam(r.bijlage_naam)}"`);
    res.set('Cache-Control', r.gepubliceerd ? 'public, max-age=0, must-revalidate' : 'no-store');
    res.send(r.data);
  } catch (err) {
    console.error('[nieuws bijlage]', err.message);
    res.status(500).render('error', { title: 'Fout', bericht: 'De bijlage kon niet worden geladen.' });
  }
});

router.get('/:id/bewerken', requireRedactie, async (req, res) => {
  const bericht = (await pool.query('SELECT * FROM nieuws WHERE id = $1', [req.params.id])).rows[0];
  if (!bericht) return res.status(404).render('error', { title: 'Niet gevonden', bericht: 'Dit bericht bestaat niet.' });
  toonFormulier(res, { title: 'Nieuwsbericht bewerken', bericht, actie: '/nieuws/' + bericht.id + '/bewerken', fout: null });
});

router.post('/:id/bewerken', requireRedactie, uploads, async (req, res) => {
  const bestaand = (await pool.query('SELECT * FROM nieuws WHERE id = $1', [req.params.id])).rows[0];
  if (!bestaand) return res.status(404).render('error', { title: 'Niet gevonden', bericht: 'Dit bericht bestaat niet.' });
  const d = leesFormulier(req.body);
  const actie = '/nieuws/' + bestaand.id + '/bewerken';
  const terug = (fout, status) => toonFormulier(res, { title: 'Nieuwsbericht bewerken', bericht: { ...bestaand, ...req.body, ...d, id: bestaand.id }, actie, fout, status });
  if (!d.titel) return terug('Geef het bericht een titel.', 400);
  if (req.uploadFout) return terug(req.uploadFout, 400);
  try {
    // Nieuwe afbeelding/bijlage vervangt de oude; "verwijderen" haalt hem weg. Oude media pas
    // opruimen nadat het bericht naar de nieuwe verwijst.
    const opruimen = [];
    let afbId = bestaand.afbeelding_id;
    if (req.file || req.body.afbeelding_verwijderen === 'on') {
      if (afbId) opruimen.push(afbId);
      afbId = req.file ? await bewaarAfbeelding(req.file, null) : null;
    }
    let bijlageId = bestaand.bijlage_id;
    let naam = bijlageId ? (d.bijlage_naam || bestaand.bijlage_naam) : null;
    if (req.bijlage || req.body.bijlage_verwijderen === 'on') {
      if (bijlageId) opruimen.push(bijlageId);
      bijlageId = req.bijlage ? await bewaarAfbeelding(req.bijlage, null) : null;
      naam = req.bijlage ? bijlageNaam(d, req.bijlage) : null;
    }
    await pool.query(
      `UPDATE nieuws SET titel=$1, inhoud=$2, categorie=$3, gepubliceerd=$4, afbeelding_id=$5, bijlage_id=$6, bijlage_naam=$7, bijgewerkt=now()
       WHERE id=$8`,
      [d.titel, d.inhoud, d.categorie, d.gepubliceerd, afbId, bijlageId, naam, bestaand.id]
    );
    for (const id of opruimen) await pool.query('DELETE FROM media WHERE id = $1 AND eigenaar_id IS NULL', [id]);
    req.session.flash = { type: 'succes', message: 'Nieuwsbericht bijgewerkt.' };
    res.redirect('/nieuws/' + bestaand.id);
  } catch (err) {
    console.error('[nieuws bewerken]', err.message);
    terug('Opslaan mislukt.', 500);
  }
});

router.post('/:id/verwijderen', requireRedactie, async (req, res) => {
  const bericht = (await pool.query('SELECT bron, bron_uid, afbeelding_id, bijlage_id FROM nieuws WHERE id = $1', [req.params.id])).rows[0];
  await pool.query('DELETE FROM nieuws WHERE id = $1', [req.params.id]);
  if (bericht) {
    // Overgenomen bericht: niet opnieuw importeren; meegekomen afbeelding en bijlage opruimen
    if (bericht.bron === nieuwsImport.BRON && bericht.bron_uid) await nieuwsImport.negeer(bericht.bron_uid);
    else if (nieuwsImport.SOCIAL_BRONNEN.includes(bericht.bron) && bericht.bron_uid) await nieuwsImport.negeer(bericht.bron_uid, nieuwsImport.LINKEDIN_NEGEER);
    for (const id of [bericht.afbeelding_id, bericht.bijlage_id]) {
      if (id) await pool.query('DELETE FROM media WHERE id = $1 AND eigenaar_id IS NULL', [id]);
    }
  }
  req.session.flash = { type: 'succes', message: 'Nieuwsbericht verwijderd.' };
  res.redirect('/nieuws');
});

module.exports = router;
