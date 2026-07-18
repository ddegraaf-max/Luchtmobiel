const express = require('express');
const router = express.Router();
const multer = require('multer');
const pool = require('../db/pool');
const { requireLogin, requireRedactie } = require('../middleware/auth');
const { isoLokaal } = require('../lib/helpers');

const CATEGORIEEN = ['Ceremonieel', 'Sportief', 'Excursie', 'Netwerk', 'Overig'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(png|jpe?g|webp|gif)$/.test(file.mimetype))
});

async function bewaarAfbeelding(file, uid) {
  if (!file) return null;
  const m = await pool.query(
    'INSERT INTO media (mime, data, eigenaar_id) VALUES ($1,$2,$3) RETURNING id',
    [file.mimetype, file.buffer, uid]
  );
  return m.rows[0].id;
}

function leesFormulier(body) {
  const maxp = parseInt(body.max_plaatsen, 10);
  return {
    titel: (body.titel || '').trim(),
    categorie: CATEGORIEEN.includes(body.categorie) ? body.categorie : null,
    omschrijving: body.omschrijving || null,
    locatie: body.locatie || null,
    start_op: (body.start_op || '').trim(),
    eind_op: (body.eind_op || '').trim() || null,
    aanmelden: body.aanmelden === 'on' || body.aanmelden === 'true' || body.aanmelden === '1',
    max_plaatsen: Number.isFinite(maxp) && maxp > 0 ? maxp : null
  };
}

// Overzicht
router.get('/', async (req, res) => {
  const verleden = req.query.tonen === 'verleden';
  const categorie = CATEGORIEEN.includes(req.query.categorie) ? req.query.categorie : '';
  const nu = isoLokaal(new Date());
  const params = [nu];
  let waar = verleden ? 'COALESCE(e.eind_op, e.start_op) < $1' : 'COALESCE(e.eind_op, e.start_op) >= $1';
  if (categorie) { params.push(categorie); waar += ` AND e.categorie = $${params.length}`; }
  const volgorde = verleden ? 'e.start_op DESC' : 'e.start_op ASC';
  try {
    const evenementen = (await pool.query(
      `SELECT e.*, COALESCE(SUM(a.aantal),0)::int AS bezet
       FROM evenementen e LEFT JOIN evenement_aanmeldingen a ON a.evenement_id = e.id
       WHERE ${waar} GROUP BY e.id ORDER BY ${volgorde}`,
      params
    )).rows;
    res.render('agenda/index', {
      title: 'Agenda & evenementen', evenementen, categorieen: CATEGORIEEN, categorie, verleden
    });
  } catch (err) {
    console.error('[agenda]', err.message);
    res.status(500).render('error', { title: 'Fout', bericht: 'De agenda kon niet worden geladen.' });
  }
});

// Nieuw (beheer)
router.get('/nieuw', requireRedactie, (req, res) => {
  res.render('agenda/form', {
    title: 'Evenement toevoegen', evenement: { aanmelden: true },
    categorieen: CATEGORIEEN, actie: '/agenda/nieuw', fout: null
  });
});

router.post('/nieuw', requireRedactie, upload.single('afbeelding'), async (req, res) => {
  const d = leesFormulier(req.body);
  if (!d.titel || !d.start_op) {
    return res.status(400).render('agenda/form', {
      title: 'Evenement toevoegen', evenement: req.body, categorieen: CATEGORIEEN,
      actie: '/agenda/nieuw', fout: 'Vul minimaal een titel en een startdatum/tijd in.'
    });
  }
  try {
    const afbId = await bewaarAfbeelding(req.file, req.session.user.id);
    const { rows } = await pool.query(
      `INSERT INTO evenementen (titel, categorie, omschrijving, locatie, start_op, eind_op, aanmelden, max_plaatsen, afbeelding_id, auteur_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [d.titel, d.categorie, d.omschrijving, d.locatie, d.start_op, d.eind_op, d.aanmelden, d.max_plaatsen, afbId, req.session.user.id]
    );
    req.session.flash = { type: 'succes', message: 'Evenement toegevoegd aan de agenda.' };
    res.redirect('/agenda/' + rows[0].id);
  } catch (err) {
    console.error('[agenda nieuw]', err.message);
    res.status(500).render('agenda/form', {
      title: 'Evenement toevoegen', evenement: req.body, categorieen: CATEGORIEEN,
      actie: '/agenda/nieuw', fout: 'Opslaan mislukt. Probeer het opnieuw.'
    });
  }
});

// Detail
router.get('/:id', async (req, res) => {
  try {
    const evenement = (await pool.query('SELECT * FROM evenementen WHERE id = $1', [req.params.id])).rows[0];
    if (!evenement) return res.status(404).render('error', { title: 'Niet gevonden', bericht: 'Dit evenement bestaat niet (meer).' });

    const u = req.session.user;
    const magBeheren = !!u && (u.rol === 'admin' || u.rol === 'brigade');

    const bezet = (await pool.query(
      'SELECT COALESCE(SUM(aantal),0)::int AS n FROM evenement_aanmeldingen WHERE evenement_id = $1',
      [evenement.id]
    )).rows[0].n;

    const deelnemers = magBeheren
      ? (await pool.query(
          `SELECT a.aantal, a.opmerking, a.aangemaakt, u.naam, u.bedrijf
           FROM evenement_aanmeldingen a JOIN users u ON u.id = a.user_id
           WHERE a.evenement_id = $1 ORDER BY a.aangemaakt ASC`,
          [evenement.id]
        )).rows
      : [];

    const mijnAanmelding = u
      ? (await pool.query(
          'SELECT aantal, opmerking FROM evenement_aanmeldingen WHERE evenement_id = $1 AND user_id = $2',
          [evenement.id, u.id]
        )).rows[0] || null
      : null;

    const plaatsenVrij = evenement.max_plaatsen ? Math.max(0, evenement.max_plaatsen - bezet) : null;

    res.render('agenda/detail', { title: evenement.titel, evenement, bezet, deelnemers, mijnAanmelding, plaatsenVrij, magBeheren });
  } catch (err) {
    console.error('[agenda detail]', err.message);
    res.status(500).render('error', { title: 'Fout', bericht: 'Het evenement kon niet worden geladen.' });
  }
});

// Aanmelden
router.post('/:id/aanmelden', requireLogin, async (req, res) => {
  const aantal = Math.min(10, Math.max(1, parseInt(req.body.aantal, 10) || 1));
  const opmerking = req.body.opmerking || null;
  try {
    const ev = (await pool.query('SELECT * FROM evenementen WHERE id = $1', [req.params.id])).rows[0];
    if (!ev) return res.redirect('/agenda');
    if (!ev.aanmelden) {
      req.session.flash = { type: 'info', message: 'Voor dit evenement is aanmelden niet nodig.' };
      return res.redirect('/agenda/' + ev.id);
    }
    // Capaciteitscheck (exclusief eigen bestaande aanmelding)
    if (ev.max_plaatsen) {
      const bezetAnderen = (await pool.query(
        'SELECT COALESCE(SUM(aantal),0)::int AS n FROM evenement_aanmeldingen WHERE evenement_id = $1 AND user_id <> $2',
        [ev.id, req.session.user.id]
      )).rows[0].n;
      if (bezetAnderen + aantal > ev.max_plaatsen) {
        req.session.flash = { type: 'fout', message: 'Helaas, er zijn niet genoeg plaatsen meer beschikbaar.' };
        return res.redirect('/agenda/' + ev.id);
      }
    }
    await pool.query(
      `INSERT INTO evenement_aanmeldingen (evenement_id, user_id, aantal, opmerking)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (evenement_id, user_id)
       DO UPDATE SET aantal = EXCLUDED.aantal, opmerking = EXCLUDED.opmerking, aangemaakt = now()`,
      [ev.id, req.session.user.id, aantal, opmerking]
    );
    req.session.flash = { type: 'succes', message: 'Je aanmelding is genoteerd. Tot dan!' };
    res.redirect('/agenda/' + ev.id);
  } catch (err) {
    console.error('[agenda aanmelden]', err.message);
    res.redirect('/agenda/' + req.params.id);
  }
});

// Afmelden
router.post('/:id/afmelden', requireLogin, async (req, res) => {
  try {
    await pool.query('DELETE FROM evenement_aanmeldingen WHERE evenement_id = $1 AND user_id = $2',
      [req.params.id, req.session.user.id]);
    req.session.flash = { type: 'info', message: 'Je afmelding is verwerkt.' };
  } catch (err) {
    console.error('[agenda afmelden]', err.message);
  }
  res.redirect('/agenda/' + req.params.id);
});

// Bewerken (beheer)
router.get('/:id/bewerken', requireRedactie, async (req, res) => {
  const evenement = (await pool.query('SELECT * FROM evenementen WHERE id = $1', [req.params.id])).rows[0];
  if (!evenement) return res.status(404).render('error', { title: 'Niet gevonden', bericht: 'Dit evenement bestaat niet.' });
  res.render('agenda/form', {
    title: 'Evenement bewerken', evenement, categorieen: CATEGORIEEN,
    actie: '/agenda/' + evenement.id + '/bewerken', fout: null
  });
});

router.post('/:id/bewerken', requireRedactie, upload.single('afbeelding'), async (req, res) => {
  const bestaand = (await pool.query('SELECT * FROM evenementen WHERE id = $1', [req.params.id])).rows[0];
  if (!bestaand) return res.status(404).render('error', { title: 'Niet gevonden', bericht: 'Dit evenement bestaat niet.' });
  const d = leesFormulier(req.body);
  if (!d.titel || !d.start_op) {
    return res.status(400).render('agenda/form', {
      title: 'Evenement bewerken', evenement: { ...bestaand, ...req.body }, categorieen: CATEGORIEEN,
      actie: '/agenda/' + bestaand.id + '/bewerken', fout: 'Vul minimaal een titel en een startdatum/tijd in.'
    });
  }
  try {
    const afbId = (await bewaarAfbeelding(req.file, req.session.user.id)) || bestaand.afbeelding_id;
    await pool.query(
      `UPDATE evenementen SET titel=$1, categorie=$2, omschrijving=$3, locatie=$4, start_op=$5, eind_op=$6,
       aanmelden=$7, max_plaatsen=$8, afbeelding_id=$9 WHERE id=$10`,
      [d.titel, d.categorie, d.omschrijving, d.locatie, d.start_op, d.eind_op, d.aanmelden, d.max_plaatsen, afbId, bestaand.id]
    );
    req.session.flash = { type: 'succes', message: 'Evenement bijgewerkt.' };
    res.redirect('/agenda/' + bestaand.id);
  } catch (err) {
    console.error('[agenda bewerken]', err.message);
    res.status(500).render('error', { title: 'Fout', bericht: 'Bijwerken mislukt.' });
  }
});

// Verwijderen (beheer)
router.post('/:id/verwijderen', requireRedactie, async (req, res) => {
  try {
    await pool.query('DELETE FROM evenementen WHERE id = $1', [req.params.id]);
    req.session.flash = { type: 'succes', message: 'Evenement verwijderd.' };
  } catch (err) {
    console.error('[agenda verwijderen]', err.message);
  }
  res.redirect('/agenda');
});

module.exports = router;
