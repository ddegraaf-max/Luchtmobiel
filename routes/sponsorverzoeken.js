// Sponsorverzoeken voor militairen en veteranen: gevonden door de dagelijkse
// assistent (of handmatig toegevoegd), gecontroleerd door bestuur/brigade en pas
// daarna zichtbaar op de publieke pagina.

const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { requireLogin, requireRedactie, idParams } = require('../middleware/auth');
const { netteUrl } = require('../lib/helpers');
const si = require('../lib/sponsor-import');

idParams(router);

function magBeheren(req) {
  const u = req.session.user;
  return !!u && (u.rol === 'admin' || u.rol === 'brigade');
}

function tekst(v, max) {
  const t = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '';
  return t || null;
}

function leesFormulier(body) {
  const urlRuw = tekst(body.url, 500);
  const d = {
    titel: tekst(body.titel, 200) || '',
    organisatie: tekst(body.organisatie, 150),
    doelgroep: si.DOELGROEPEN.includes(body.doelgroep) ? body.doelgroep : 'Overig',
    samenvatting: tekst(body.samenvatting, 300),
    omschrijving: si.meerregelig(body.omschrijving, 5000),
    url: urlRuw ? netteUrl(urlRuw) || null : null,
    bron_naam: tekst(body.bron_naam, 100),
    plaats: tekst(body.plaats, 100),
    doelbedrag: tekst(body.doelbedrag, 50),
    einddatum: si.datumOk(body.einddatum),
    uitgelicht: body.uitgelicht === 'on',
    status: si.STATUSSEN.includes(body.status) ? body.status : 'nieuw'
  };
  if (!d.bron_naam && d.url) d.bron_naam = si.hostVan(d.url);
  d.fout = !d.titel ? 'Geef het sponsorverzoek minimaal een titel.'
    : (urlRuw && !d.url ? 'De link is geen geldig webadres.' : null);
  return d;
}

function toonFormulier(res, { title, verzoek, actie, fout, status = 200 }) {
  res.status(status).render('sponsorverzoeken/form', {
    title, verzoek, actie, fout, doelgroepen: si.DOELGROEPEN, statussen: si.STATUSSEN, statusLabel: si.STATUS_LABEL
  });
}

function terugNaar(req) {
  const s = req.body && req.body.terug;
  if (s === 'detail' && req.params.id) return '/sponsorverzoeken/' + req.params.id;
  return '/sponsorverzoeken/controle' + (si.STATUSSEN.includes(s) ? '?status=' + s : '');
}

// Publiek overzicht: alleen geplaatste verzoeken
router.get('/', async (req, res) => {
  const beheer = magBeheren(req);
  try {
    const verzoeken = (await pool.query(
      `SELECT * FROM sponsorverzoeken WHERE status = 'geplaatst'
       ORDER BY uitgelicht DESC, COALESCE(beoordeeld_op, aangemaakt) DESC`
    )).rows;
    const teControleren = beheer ? await si.aantalTeControleren() : 0;
    res.render('sponsorverzoeken/index', { title: 'Sponsorverzoeken', verzoeken, magBeheren: beheer, teControleren });
  } catch (err) {
    console.error('[sponsorverzoeken]', err.message);
    res.status(500).render('error', { title: 'Fout', bericht: 'De sponsorverzoeken konden niet worden geladen.' });
  }
});

// Controlewachtrij (bestuur/brigade)
router.get('/controle', requireLogin, requireRedactie, async (req, res) => {
  const status = si.STATUSSEN.includes(req.query.status) ? req.query.status : 'nieuw';
  try {
    const verzoeken = (await pool.query(
      `SELECT s.*, u.naam AS beoordeeld_naam FROM sponsorverzoeken s
       LEFT JOIN users u ON u.id = s.beoordeeld_door
       WHERE s.status = $1 ORDER BY s.aangemaakt DESC`, [status]
    )).rows;
    const tellingen = { nieuw: 0, geplaatst: 0, afgewezen: 0 };
    for (const r of (await pool.query('SELECT status, COUNT(*)::int AS n FROM sponsorverzoeken GROUP BY status')).rows) {
      if (tellingen[r.status] !== undefined) tellingen[r.status] = r.n;
    }
    res.render('sponsorverzoeken/controle', {
      title: 'Sponsorverzoeken controleren', verzoeken, status, tellingen,
      statusLabel: si.STATUS_LABEL, bronLabel: si.BRON_LABEL, imp: si.status()
    });
  } catch (err) {
    console.error('[sponsorverzoeken controle]', err.message);
    res.status(500).render('error', { title: 'Fout', bericht: 'De controlewachtrij kon niet worden geladen.' });
  }
});

// Lijst van de assistent nu ophalen
router.post('/controle/ophalen', requireLogin, requireRedactie, async (req, res) => {
  const r = await si.importeer();
  const samenvatting = `${r.nieuw} nieuw, ${r.dubbel} al bekend${r.ongeldig ? ', ' + r.ongeldig + ' ongeldig' : ''}.`;
  req.session.flash = r.fouten.length
    ? { type: 'fout', message: `Ophalen afgerond met meldingen: ${samenvatting} ${r.fouten.join(' | ')}` }
    : { type: 'succes', message: `Lijst van de assistent opgehaald: ${samenvatting}` };
  res.redirect('/sponsorverzoeken/controle');
});

// Handmatig toevoegen
router.get('/nieuw', requireLogin, requireRedactie, (req, res) => {
  toonFormulier(res, { title: 'Sponsorverzoek toevoegen', verzoek: { status: 'geplaatst', doelgroep: 'Veteranen' }, actie: '/sponsorverzoeken/nieuw', fout: null });
});

router.post('/nieuw', requireLogin, requireRedactie, async (req, res) => {
  const d = leesFormulier(req.body);
  if (d.fout) return toonFormulier(res, { title: 'Sponsorverzoek toevoegen', verzoek: req.body, actie: '/sponsorverzoeken/nieuw', fout: d.fout, status: 400 });
  try {
    const uid = req.session.user.id;
    const beoordeeld = d.status !== 'nieuw';
    const { rows } = await pool.query(
      `INSERT INTO sponsorverzoeken (titel, organisatie, samenvatting, omschrijving, url, url_sleutel, titel_sleutel, bron, bron_naam,
         doelgroep, plaats, doelbedrag, einddatum, status, uitgelicht, auteur_id, beoordeeld_door, beoordeeld_op)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`,
      [d.titel, d.organisatie, d.samenvatting, d.omschrijving, d.url, d.url ? si.normaliseerUrl(d.url) : null, si.titelSleutel(d.titel),
       si.BRON_HANDMATIG, d.bron_naam, d.doelgroep, d.plaats, d.doelbedrag, d.einddatum, d.status, d.uitgelicht, uid,
       beoordeeld ? uid : null, beoordeeld ? new Date() : null]
    );
    req.session.flash = { type: 'succes', message: d.status === 'geplaatst' ? 'Sponsorverzoek geplaatst.' : 'Sponsorverzoek opgeslagen.' };
    res.redirect('/sponsorverzoeken/' + rows[0].id);
  } catch (err) {
    console.error('[sponsorverzoeken nieuw]', err.message);
    toonFormulier(res, { title: 'Sponsorverzoek toevoegen', verzoek: req.body, actie: '/sponsorverzoeken/nieuw', fout: 'Opslaan mislukt. Probeer het opnieuw.', status: 500 });
  }
});

// Detail (publiek als geplaatst; anders alleen voor beheer)
router.get('/:id', async (req, res) => {
  try {
    const verzoek = (await pool.query(
      `SELECT s.*, u.naam AS beoordeeld_naam FROM sponsorverzoeken s LEFT JOIN users u ON u.id = s.beoordeeld_door WHERE s.id = $1`,
      [req.params.id]
    )).rows[0];
    const beheer = magBeheren(req);
    if (!verzoek || (verzoek.status !== 'geplaatst' && !beheer)) {
      return res.status(404).render('error', { title: 'Niet gevonden', bericht: 'Dit sponsorverzoek bestaat niet (meer).' });
    }
    res.render('sponsorverzoeken/detail', { title: verzoek.titel, verzoek, magBeheren: beheer, statusLabel: si.STATUS_LABEL, bronLabel: si.BRON_LABEL });
  } catch (err) {
    console.error('[sponsorverzoek detail]', err.message);
    res.status(500).render('error', { title: 'Fout', bericht: 'Het sponsorverzoek kon niet worden geladen.' });
  }
});

// Bewerken
router.get('/:id/bewerken', requireLogin, requireRedactie, async (req, res) => {
  const verzoek = (await pool.query('SELECT * FROM sponsorverzoeken WHERE id = $1', [req.params.id])).rows[0];
  if (!verzoek) return res.status(404).render('error', { title: 'Niet gevonden', bericht: 'Dit sponsorverzoek bestaat niet.' });
  toonFormulier(res, { title: 'Sponsorverzoek bewerken', verzoek, actie: '/sponsorverzoeken/' + verzoek.id + '/bewerken', fout: null });
});

router.post('/:id/bewerken', requireLogin, requireRedactie, async (req, res) => {
  const bestaand = (await pool.query('SELECT * FROM sponsorverzoeken WHERE id = $1', [req.params.id])).rows[0];
  if (!bestaand) return res.status(404).render('error', { title: 'Niet gevonden', bericht: 'Dit sponsorverzoek bestaat niet.' });
  const d = leesFormulier(req.body);
  const actie = '/sponsorverzoeken/' + bestaand.id + '/bewerken';
  if (d.fout) return toonFormulier(res, { title: 'Sponsorverzoek bewerken', verzoek: { ...bestaand, ...req.body, id: bestaand.id }, actie, fout: d.fout, status: 400 });
  try {
    const statusGewijzigd = d.status !== bestaand.status;
    await pool.query(
      `UPDATE sponsorverzoeken SET titel=$1, organisatie=$2, samenvatting=$3, omschrijving=$4, url=$5, url_sleutel=$6, titel_sleutel=$7,
         bron_naam=$8, doelgroep=$9, plaats=$10, doelbedrag=$11, einddatum=$12, status=$13, uitgelicht=$14,
         beoordeeld_door = CASE WHEN $15 THEN $16 ELSE beoordeeld_door END,
         beoordeeld_op   = CASE WHEN $15 THEN now() ELSE beoordeeld_op END,
         bijgewerkt=now()
       WHERE id=$17`,
      [d.titel, d.organisatie, d.samenvatting, d.omschrijving, d.url, d.url ? si.normaliseerUrl(d.url) : null, si.titelSleutel(d.titel),
       d.bron_naam, d.doelgroep, d.plaats, d.doelbedrag, d.einddatum, d.status, d.uitgelicht,
       statusGewijzigd, req.session.user.id, bestaand.id]
    );
    req.session.flash = { type: 'succes', message: 'Sponsorverzoek bijgewerkt.' };
    res.redirect('/sponsorverzoeken/' + bestaand.id);
  } catch (err) {
    console.error('[sponsorverzoek bewerken]', err.message);
    toonFormulier(res, { title: 'Sponsorverzoek bewerken', verzoek: { ...bestaand, ...req.body, id: bestaand.id }, actie, fout: 'Opslaan mislukt. Probeer het opnieuw.', status: 500 });
  }
});

// Plaatsen / afwijzen / terug naar de wachtrij
router.post('/:id/status', requireLogin, requireRedactie, async (req, res) => {
  const status = req.body.status;
  if (!si.STATUSSEN.includes(status)) return res.redirect(terugNaar(req));
  try {
    const { rows } = await pool.query(
      `UPDATE sponsorverzoeken SET status=$1, beoordeeld_door=$2, beoordeeld_op=now(), bijgewerkt=now() WHERE id=$3 RETURNING titel`,
      [status, req.session.user.id, req.params.id]
    );
    if (rows.length) {
      const berichten = {
        geplaatst: `"${rows[0].titel}" staat nu op de site.`,
        afgewezen: `"${rows[0].titel}" is afgewezen en wordt niet opnieuw aangeboden.`,
        nieuw: `"${rows[0].titel}" staat weer in de controlewachtrij.`
      };
      req.session.flash = { type: 'succes', message: berichten[status] };
    }
  } catch (err) {
    console.error('[sponsorverzoek status]', err.message);
    req.session.flash = { type: 'fout', message: 'Status wijzigen mislukt.' };
  }
  res.redirect(terugNaar(req));
});

// Uitgelicht aan/uit
router.post('/:id/uitgelicht', requireLogin, requireRedactie, async (req, res) => {
  await pool.query('UPDATE sponsorverzoeken SET uitgelicht = NOT uitgelicht, bijgewerkt = now() WHERE id = $1', [req.params.id]);
  res.redirect(terugNaar(req));
});

// Verwijderen (let op: een verzoek van de assistent kan dan opnieuw worden aangeboden; afwijzen voorkomt dat)
router.post('/:id/verwijderen', requireLogin, requireRedactie, async (req, res) => {
  try {
    await pool.query('DELETE FROM sponsorverzoeken WHERE id = $1', [req.params.id]);
    req.session.flash = { type: 'succes', message: 'Sponsorverzoek verwijderd.' };
  } catch (err) {
    console.error('[sponsorverzoek verwijderen]', err.message);
    req.session.flash = { type: 'fout', message: 'Verwijderen mislukt.' };
  }
  const s = req.body && req.body.terug;
  res.redirect('/sponsorverzoeken/controle' + (si.STATUSSEN.includes(s) ? '?status=' + s : ''));
});

module.exports = router;
