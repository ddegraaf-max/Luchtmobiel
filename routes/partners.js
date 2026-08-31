// Partners & initiatieven: organisaties, stichtingen en initiatieven die via de
// site onder de aandacht worden gebracht. Publiek zichtbaar; beheer door
// admin/brigade. Leden kunnen zelf een initiatief aandragen (komt als concept
// bij de redactie terecht).

const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { requireLogin, requireRedactie, idParams } = require('../middleware/auth');
const { netteUrl, isEmail } = require('../lib/helpers');
const { afbeelding, bewaarAfbeelding } = require('../lib/upload');
const { sendMail, mailLayout, escHtml } = require('../lib/mail');
const { limiet } = require('../lib/ratelimit');

idParams(router);
const uploadLogo = afbeelding('logo', { maxMb: 2 });
const limAandragen = limiet({ naam: 'partner-aandragen', max: 5, vensterMs: 60 * 60 * 1000 });

const CATEGORIEEN = ['Veteraneninitiatief', 'Goed doel & stichting', 'Sponsor', 'Bedrijfspartner', 'Defensie & brigade', 'Overig'];

function magBeheren(req) {
  const u = req.session.user;
  return !!u && (u.rol === 'admin' || u.rol === 'brigade');
}

function tekst(v, max) {
  const t = typeof v === 'string' ? v.trim().slice(0, max) : '';
  return t || null;
}

function leesFormulier(body) {
  const volgorde = parseInt(body.volgorde, 10);
  const d = {
    naam: tekst(body.naam, 150) || '',
    categorie: CATEGORIEEN.includes(body.categorie) ? body.categorie : null,
    samenvatting: tekst(body.samenvatting, 250),
    omschrijving: typeof body.omschrijving === 'string' && body.omschrijving.trim() ? body.omschrijving.slice(0, 10000) : null,
    website: tekst(body.website, 300) ? netteUrl(body.website) || null : null,
    contact_email: tekst(body.contact_email, 200) && isEmail(body.contact_email) ? body.contact_email.trim().toLowerCase() : null,
    uitgelicht: body.uitgelicht === 'on',
    gepubliceerd: body.gepubliceerd === 'on',
    volgorde: Number.isFinite(volgorde) && volgorde >= 0 ? Math.min(volgorde, 9999) : 0
  };
  d.fout = d.naam ? null : 'Geef de partner of het initiatief minimaal een naam.';
  return d;
}

function toonFormulier(res, { title, partner, actie, fout, status = 200 }) {
  res.status(status).render('partners/form', { title, partner, actie, fout, categorieen: CATEGORIEEN });
}

// Overzicht (publiek; redactie ziet ook concepten en aangedragen initiatieven)
router.get('/', async (req, res) => {
  const beheer = magBeheren(req);
  const categorie = CATEGORIEEN.includes(req.query.categorie) ? req.query.categorie : '';
  const params = [];
  let waar = beheer ? '1=1' : 'p.gepubliceerd = true';
  if (categorie) { params.push(categorie); waar += ` AND p.categorie = $${params.length}`; }
  try {
    const partners = (await pool.query(
      `SELECT p.*, u.naam AS aangedragen_naam
       FROM partners p LEFT JOIN users u ON u.id = p.aangedragen_door
       WHERE ${waar}
       ORDER BY p.gepubliceerd DESC, p.uitgelicht DESC, p.volgorde ASC, p.naam ASC`,
      params
    )).rows;
    res.render('partners/index', { title: 'Partners & initiatieven', partners, categorieen: CATEGORIEEN, categorie, magBeheren: beheer });
  } catch (err) {
    console.error('[partners]', err.message);
    res.status(500).render('error', { title: 'Fout', bericht: 'De partners konden niet worden geladen.' });
  }
});

// Nieuw (redactie)
router.get('/nieuw', requireRedactie, (req, res) => {
  toonFormulier(res, { title: 'Partner toevoegen', partner: { gepubliceerd: true }, actie: '/partners/nieuw', fout: null });
});

router.post('/nieuw', requireRedactie, uploadLogo, async (req, res) => {
  const d = leesFormulier(req.body);
  if (d.fout || req.uploadFout) {
    return toonFormulier(res, { title: 'Partner toevoegen', partner: req.body, actie: '/partners/nieuw', fout: req.uploadFout || d.fout, status: 400 });
  }
  try {
    const logoId = await bewaarAfbeelding(req.file, req.session.user.id);
    const { rows } = await pool.query(
      `INSERT INTO partners (naam, categorie, samenvatting, omschrijving, website, contact_email, logo_id, uitgelicht, gepubliceerd, volgorde, auteur_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [d.naam, d.categorie, d.samenvatting, d.omschrijving, d.website, d.contact_email, logoId, d.uitgelicht, d.gepubliceerd, d.volgorde, req.session.user.id]
    );
    req.session.flash = { type: 'succes', message: d.gepubliceerd ? 'Partner geplaatst.' : 'Partner opgeslagen als concept.' };
    res.redirect('/partners/' + rows[0].id);
  } catch (err) {
    console.error('[partners nieuw]', err.message);
    toonFormulier(res, { title: 'Partner toevoegen', partner: req.body, actie: '/partners/nieuw', fout: 'Opslaan mislukt. Probeer het opnieuw.', status: 500 });
  }
});

// Initiatief aandragen (leden): komt als concept bij de redactie terecht
router.post('/aandragen', requireLogin, limAandragen, async (req, res) => {
  const naam = tekst(req.body.naam, 150);
  const website = tekst(req.body.website, 300) ? netteUrl(req.body.website) || null : null;
  const toelichting = tekst(req.body.toelichting, 2000);
  if (!naam) {
    req.session.flash = { type: 'fout', message: 'Vul minimaal de naam van het initiatief in.' };
    return res.redirect('/partners#aandragen');
  }
  try {
    const u = req.session.user;
    await pool.query(
      `INSERT INTO partners (naam, samenvatting, omschrijving, website, gepubliceerd, aangedragen_door, auteur_id)
       VALUES ($1, $2, $3, $4, false, $5, $5)`,
      [naam, toelichting ? toelichting.slice(0, 250) : null, toelichting, website, u.id]
    );
    if (process.env.MAIL_BESTUUR) {
      try {
        await sendMail({
          to: process.env.MAIL_BESTUUR,
          replyTo: u.email,
          subject: `Initiatief aangedragen — ${naam}`,
          html: mailLayout('Initiatief aangedragen',
            `<p><strong>${escHtml(u.naam)}</strong> draagt een partner/initiatief aan: <strong>${escHtml(naam)}</strong>${website ? ' (' + escHtml(website) + ')' : ''}.</p>
             ${toelichting ? '<p>' + escHtml(toelichting).replace(/\n/g, '<br>') + '</p>' : ''}
             <p>Het staat als concept klaar onder <em>Partners</em>; daar kun je het aanvullen en publiceren.</p>`)
        });
      } catch (e) { console.error('[partners aandragen mail]', e.message); }
    }
    req.session.flash = { type: 'succes', message: 'Bedankt! Je suggestie staat klaar voor het bestuur; na beoordeling verschijnt het initiatief op deze pagina.' };
  } catch (err) {
    console.error('[partners aandragen]', err.message);
    req.session.flash = { type: 'fout', message: 'Aandragen mislukt. Probeer het opnieuw.' };
  }
  res.redirect('/partners');
});

// Detail (publiek; concepten alleen voor redactie)
router.get('/:id', async (req, res) => {
  try {
    const partner = (await pool.query(
      `SELECT p.*, u.naam AS aangedragen_naam FROM partners p LEFT JOIN users u ON u.id = p.aangedragen_door WHERE p.id = $1`,
      [req.params.id]
    )).rows[0];
    const beheer = magBeheren(req);
    if (!partner || (!partner.gepubliceerd && !beheer)) {
      return res.status(404).render('error', { title: 'Niet gevonden', bericht: 'Deze partner bestaat niet (meer).' });
    }
    if (partner.gepubliceerd) {
      res.locals.meta = {
        type: 'article',
        titel: partner.naam,
        beschrijving: partner.samenvatting || res.locals.h.kort(partner.omschrijving, 200) || `${partner.naam} — partner van de Business Club Luchtmobiel.`,
        afbeelding: partner.logo_id ? '/media/' + partner.logo_id : null,
        afbeeldingAlt: partner.logo_id ? 'Logo ' + partner.naam : null
      };
    }
    res.render('partners/detail', { title: partner.naam, partner, magBeheren: beheer });
  } catch (err) {
    console.error('[partner detail]', err.message);
    res.status(500).render('error', { title: 'Fout', bericht: 'De partner kon niet worden geladen.' });
  }
});

// Bewerken (redactie)
router.get('/:id/bewerken', requireRedactie, async (req, res) => {
  const partner = (await pool.query('SELECT * FROM partners WHERE id = $1', [req.params.id])).rows[0];
  if (!partner) return res.status(404).render('error', { title: 'Niet gevonden', bericht: 'Deze partner bestaat niet.' });
  toonFormulier(res, { title: 'Partner bewerken', partner, actie: '/partners/' + partner.id + '/bewerken', fout: null });
});

router.post('/:id/bewerken', requireRedactie, uploadLogo, async (req, res) => {
  const bestaand = (await pool.query('SELECT * FROM partners WHERE id = $1', [req.params.id])).rows[0];
  if (!bestaand) return res.status(404).render('error', { title: 'Niet gevonden', bericht: 'Deze partner bestaat niet.' });
  const d = leesFormulier(req.body);
  if (d.fout || req.uploadFout) {
    return toonFormulier(res, {
      title: 'Partner bewerken', partner: { ...bestaand, ...req.body, id: bestaand.id },
      actie: '/partners/' + bestaand.id + '/bewerken', fout: req.uploadFout || d.fout, status: 400
    });
  }
  try {
    const nieuwLogo = await bewaarAfbeelding(req.file, req.session.user.id);
    const verwijderLogo = !nieuwLogo && req.body.logo_verwijderen === 'on';
    const logoId = nieuwLogo || (verwijderLogo ? null : bestaand.logo_id);
    await pool.query(
      `UPDATE partners SET naam=$1, categorie=$2, samenvatting=$3, omschrijving=$4, website=$5, contact_email=$6,
       logo_id=$7, uitgelicht=$8, gepubliceerd=$9, volgorde=$10, bijgewerkt=now() WHERE id=$11`,
      [d.naam, d.categorie, d.samenvatting, d.omschrijving, d.website, d.contact_email, logoId, d.uitgelicht, d.gepubliceerd, d.volgorde, bestaand.id]
    );
    if (bestaand.logo_id && (nieuwLogo || verwijderLogo)) {
      await pool.query('DELETE FROM media WHERE id = $1', [bestaand.logo_id]);
    }
    req.session.flash = { type: 'succes', message: 'Partner bijgewerkt.' };
    res.redirect('/partners/' + bestaand.id);
  } catch (err) {
    console.error('[partner bewerken]', err.message);
    toonFormulier(res, {
      title: 'Partner bewerken', partner: { ...bestaand, ...req.body, id: bestaand.id },
      actie: '/partners/' + bestaand.id + '/bewerken', fout: 'Opslaan mislukt. Probeer het opnieuw.', status: 500
    });
  }
});

// Verwijderen (redactie)
router.post('/:id/verwijderen', requireRedactie, async (req, res) => {
  try {
    const p = (await pool.query('DELETE FROM partners WHERE id = $1 RETURNING logo_id', [req.params.id])).rows[0];
    if (p && p.logo_id) await pool.query('DELETE FROM media WHERE id = $1', [p.logo_id]);
    req.session.flash = { type: 'succes', message: 'Partner verwijderd.' };
  } catch (err) {
    console.error('[partner verwijderen]', err.message);
    req.session.flash = { type: 'fout', message: 'Verwijderen mislukt.' };
  }
  res.redirect('/partners');
});

module.exports = router;
module.exports.CATEGORIEEN = CATEGORIEEN;
