const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { requireLogin } = require('../middleware/auth');
const { netteUrl, isEmail } = require('../lib/helpers');

const DIENSTVERBANDEN = ['Fulltime', 'Parttime', 'Tijdelijk', 'Stage', 'Freelance/ZZP', 'Vrijwillig'];

// Overzicht (besloten)
router.get('/', async (req, res) => {
  const zoek = (req.query.zoek || '').trim();
  const alleenVeteraan = req.query.veteraan === '1';

  let sql = `SELECT v.*, u.naam AS plaatser FROM vacatures v JOIN users u ON u.id = v.user_id WHERE 1=1`;
  const params = [];
  if (zoek) {
    params.push(`%${zoek}%`);
    sql += ` AND (v.titel ILIKE $${params.length} OR v.bedrijf ILIKE $${params.length} OR v.plaats ILIKE $${params.length})`;
  }
  if (alleenVeteraan) sql += ' AND v.veteraan_vriendelijk = true';
  sql += ' ORDER BY v.aangemaakt DESC';

  try {
    const vacatures = (await pool.query(sql, params)).rows;
    res.render('vacatures/index', { title: 'Vacatures', vacatures, zoek, alleenVeteraan });
  } catch (err) {
    console.error('[vacatures]', err.message);
    res.status(500).render('error', { title: 'Fout', bericht: 'De vacatures konden niet worden geladen.' });
  }
});

// Nieuw formulier
router.get('/nieuw', requireLogin, (req, res) => {
  res.render('vacatures/form', {
    title: 'Vacature plaatsen',
    vacature: { contact_email: req.session.user.email },
    dienstverbanden: DIENSTVERBANDEN,
    actie: '/vacatures/nieuw',
    fout: null
  });
});

// Nieuw opslaan
router.post('/nieuw', requireLogin, async (req, res) => {
  const { titel, bedrijf, plaats, dienstverband, omschrijving, link, contact_email, veteraan_vriendelijk } = req.body;
  if (!titel) {
    return res.status(400).render('vacatures/form', {
      title: 'Vacature plaatsen', vacature: req.body, dienstverbanden: DIENSTVERBANDEN,
      actie: '/vacatures/nieuw', fout: 'Geef de vacature minimaal een titel.'
    });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO vacatures (user_id, titel, bedrijf, plaats, dienstverband, omschrijving, link, contact_email, veteraan_vriendelijk)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [req.session.user.id, titel.trim(), bedrijf || null, plaats || null, dienstverband || null,
       omschrijving || null, link ? netteUrl(link) : null,
       contact_email && isEmail(contact_email) ? contact_email.trim() : null,
       veteraan_vriendelijk === 'on']
    );
    req.session.flash = { type: 'succes', message: 'Je vacature staat online.' };
    res.redirect('/vacatures/' + rows[0].id);
  } catch (err) {
    console.error('[vacature nieuw]', err.message);
    res.status(500).render('vacatures/form', {
      title: 'Vacature plaatsen', vacature: req.body, dienstverbanden: DIENSTVERBANDEN,
      actie: '/vacatures/nieuw', fout: 'Opslaan mislukt. Probeer het opnieuw.'
    });
  }
});

// Detail
router.get('/:id', async (req, res) => {
  try {
    const vacature = (await pool.query(
      `SELECT v.*, u.naam AS plaatser, u.id AS plaatser_id FROM vacatures v JOIN users u ON u.id = v.user_id WHERE v.id = $1`,
      [req.params.id]
    )).rows[0];
    if (!vacature) return res.status(404).render('error', { title: 'Niet gevonden', bericht: 'Deze vacature bestaat niet (meer).' });
    const u = req.session.user;
    const mag = !!u && (u.id === vacature.user_id || u.rol === 'admin');
    res.render('vacatures/detail', { title: vacature.titel, vacature, mag });
  } catch (err) {
    console.error('[vacature detail]', err.message);
    res.status(500).render('error', { title: 'Fout', bericht: 'De vacature kon niet worden geladen.' });
  }
});

// Bewerken formulier
router.get('/:id/bewerken', requireLogin, async (req, res) => {
  const vacature = (await pool.query('SELECT * FROM vacatures WHERE id = $1', [req.params.id])).rows[0];
  if (!vacature) return res.status(404).render('error', { title: 'Niet gevonden', bericht: 'Deze vacature bestaat niet.' });
  if (req.session.user.id !== vacature.user_id && req.session.user.rol !== 'admin')
    return res.status(403).render('error', { title: 'Geen toegang', bericht: 'Je mag deze vacature niet bewerken.' });
  res.render('vacatures/form', {
    title: 'Vacature bewerken', vacature, dienstverbanden: DIENSTVERBANDEN,
    actie: '/vacatures/' + vacature.id + '/bewerken', fout: null
  });
});

// Bewerken opslaan
router.post('/:id/bewerken', requireLogin, async (req, res) => {
  const vacature = (await pool.query('SELECT * FROM vacatures WHERE id = $1', [req.params.id])).rows[0];
  if (!vacature) return res.status(404).render('error', { title: 'Niet gevonden', bericht: 'Deze vacature bestaat niet.' });
  if (req.session.user.id !== vacature.user_id && req.session.user.rol !== 'admin')
    return res.status(403).render('error', { title: 'Geen toegang', bericht: 'Je mag deze vacature niet bewerken.' });

  const { titel, bedrijf, plaats, dienstverband, omschrijving, link, contact_email, veteraan_vriendelijk } = req.body;
  await pool.query(
    `UPDATE vacatures SET titel=$1, bedrijf=$2, plaats=$3, dienstverband=$4, omschrijving=$5, link=$6, contact_email=$7, veteraan_vriendelijk=$8 WHERE id=$9`,
    [titel.trim(), bedrijf || null, plaats || null, dienstverband || null, omschrijving || null,
     link ? netteUrl(link) : null, contact_email && isEmail(contact_email) ? contact_email.trim() : null,
     veteraan_vriendelijk === 'on', vacature.id]
  );
  req.session.flash = { type: 'succes', message: 'Vacature bijgewerkt.' };
  res.redirect('/vacatures/' + vacature.id);
});

// Verwijderen
router.post('/:id/verwijderen', requireLogin, async (req, res) => {
  const vacature = (await pool.query('SELECT * FROM vacatures WHERE id = $1', [req.params.id])).rows[0];
  if (vacature && (req.session.user.id === vacature.user_id || req.session.user.rol === 'admin')) {
    await pool.query('DELETE FROM vacatures WHERE id = $1', [vacature.id]);
    req.session.flash = { type: 'succes', message: 'Vacature verwijderd.' };
  }
  res.redirect('/vacatures');
});

module.exports = router;
