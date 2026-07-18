const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { requireRedactie } = require('../middleware/auth');

function magBeheren(req) {
  const u = req.session.user;
  return !!u && (u.rol === 'admin' || u.rol === 'brigade');
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
  res.render('nieuws/form', { title: 'Nieuwsbericht toevoegen', bericht: { gepubliceerd: true }, actie: '/nieuws/nieuw', fout: null });
});

router.post('/nieuw', requireRedactie, async (req, res) => {
  const titel = (req.body.titel || '').trim();
  const inhoud = req.body.inhoud || null;
  const gepubliceerd = req.body.gepubliceerd === 'on';
  if (!titel) return res.status(400).render('nieuws/form', { title: 'Nieuwsbericht toevoegen', bericht: req.body, actie: '/nieuws/nieuw', fout: 'Geef het bericht een titel.' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO nieuws (titel, inhoud, gepubliceerd, auteur_id) VALUES ($1,$2,$3,$4) RETURNING id',
      [titel, inhoud, gepubliceerd, req.session.user.id]
    );
    req.session.flash = { type: 'succes', message: 'Nieuwsbericht geplaatst.' };
    res.redirect('/nieuws/' + rows[0].id);
  } catch (err) {
    console.error('[nieuws nieuw]', err.message);
    res.status(500).render('nieuws/form', { title: 'Nieuwsbericht toevoegen', bericht: req.body, actie: '/nieuws/nieuw', fout: 'Opslaan mislukt.' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const bericht = (await pool.query(
      'SELECT n.*, u.naam AS auteur FROM nieuws n LEFT JOIN users u ON u.id = n.auteur_id WHERE n.id = $1',
      [req.params.id]
    )).rows[0];
    const beheer = magBeheren(req);
    if (!bericht || (!bericht.gepubliceerd && !beheer)) {
      return res.status(404).render('error', { title: 'Niet gevonden', bericht: 'Dit bericht bestaat niet (meer).' });
    }
    res.render('nieuws/detail', { title: bericht.titel, bericht, magBeheren: beheer });
  } catch (err) {
    console.error('[nieuws detail]', err.message);
    res.status(500).render('error', { title: 'Fout', bericht: 'Het bericht kon niet worden geladen.' });
  }
});

router.get('/:id/bewerken', requireRedactie, async (req, res) => {
  const bericht = (await pool.query('SELECT * FROM nieuws WHERE id = $1', [req.params.id])).rows[0];
  if (!bericht) return res.status(404).render('error', { title: 'Niet gevonden', bericht: 'Dit bericht bestaat niet.' });
  res.render('nieuws/form', { title: 'Nieuwsbericht bewerken', bericht, actie: '/nieuws/' + bericht.id + '/bewerken', fout: null });
});

router.post('/:id/bewerken', requireRedactie, async (req, res) => {
  const bestaand = (await pool.query('SELECT id FROM nieuws WHERE id = $1', [req.params.id])).rows[0];
  if (!bestaand) return res.status(404).render('error', { title: 'Niet gevonden', bericht: 'Dit bericht bestaat niet.' });
  const titel = (req.body.titel || '').trim();
  const inhoud = req.body.inhoud || null;
  const gepubliceerd = req.body.gepubliceerd === 'on';
  if (!titel) return res.status(400).render('nieuws/form', { title: 'Nieuwsbericht bewerken', bericht: { ...req.body, id: bestaand.id }, actie: '/nieuws/' + bestaand.id + '/bewerken', fout: 'Geef het bericht een titel.' });
  await pool.query('UPDATE nieuws SET titel=$1, inhoud=$2, gepubliceerd=$3, bijgewerkt=now() WHERE id=$4', [titel, inhoud, gepubliceerd, bestaand.id]);
  req.session.flash = { type: 'succes', message: 'Nieuwsbericht bijgewerkt.' };
  res.redirect('/nieuws/' + bestaand.id);
});

router.post('/:id/verwijderen', requireRedactie, async (req, res) => {
  await pool.query('DELETE FROM nieuws WHERE id = $1', [req.params.id]);
  req.session.flash = { type: 'succes', message: 'Nieuwsbericht verwijderd.' };
  res.redirect('/nieuws');
});

module.exports = router;
