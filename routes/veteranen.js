const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { requireLogin, requireRedactie } = require('../middleware/auth');
const { netteUrl } = require('../lib/helpers');
const { getGalerij } = require('../lib/galerij');

const CATEGORIEEN = ['Werk & loopbaan', 'Zorg & welzijn', 'Lotgenotencontact', 'Financieel & juridisch', 'Activiteiten', 'Overig'];

// Hub (publiek toegankelijk als visitekaartje, maar contact/aanmelden vereist login)
router.get('/', async (req, res) => {
  try {
    const resources = (await pool.query(
      'SELECT * FROM veteraan_resources ORDER BY categorie, titel'
    )).rows;
    const vacatures = (await pool.query(
      `SELECT v.id, v.titel, v.bedrijf, v.plaats FROM vacatures v WHERE v.veteraan_vriendelijk = true ORDER BY v.aangemaakt DESC LIMIT 6`
    )).rows;
    // Groepeer resources per categorie
    const perCat = {};
    resources.forEach((r) => {
      const c = r.categorie || 'Overig';
      (perCat[c] = perCat[c] || []).push(r);
    });
    const magRedactie = req.session.user && ['admin', 'brigade'].includes(req.session.user.rol);
    const galerij = await getGalerij('veteranen');
    res.render('veteranen', { title: 'Veteranenzaken', perCat, vacatures, categorieen: CATEGORIEEN, magRedactie, galerij });
  } catch (err) {
    console.error('[veteranen]', err.message);
    res.status(500).render('error', { title: 'Fout', bericht: 'De veteranenhub kon niet worden geladen.' });
  }
});

// Resource toevoegen (brigade/admin)
router.post('/resource', requireLogin, requireRedactie, async (req, res) => {
  const { titel, categorie, omschrijving, link } = req.body;
  if (titel) {
    await pool.query(
      'INSERT INTO veteraan_resources (titel, categorie, omschrijving, link, auteur_id) VALUES ($1,$2,$3,$4,$5)',
      [titel.trim(), categorie || 'Overig', omschrijving || null, link ? netteUrl(link) : null, req.session.user.id]
    );
    req.session.flash = { type: 'succes', message: 'Hulpbron toegevoegd.' };
  }
  res.redirect('/veteranen');
});

// Resource verwijderen (brigade/admin)
router.post('/resource/:id/verwijderen', requireLogin, requireRedactie, async (req, res) => {
  await pool.query('DELETE FROM veteraan_resources WHERE id = $1', [req.params.id]);
  req.session.flash = { type: 'succes', message: 'Hulpbron verwijderd.' };
  res.redirect('/veteranen');
});

module.exports = router;
