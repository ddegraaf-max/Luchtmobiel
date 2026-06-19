const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { requireLogin, requireAdmin } = require('../middleware/auth');

router.use(requireLogin, requireAdmin);

// Overzicht
router.get('/', async (req, res) => {
  try {
    const leden = (await pool.query(
      'SELECT id, naam, email, rol, actief, bedrijf, aangemaakt FROM users ORDER BY aangemaakt DESC'
    )).rows;
    const stats = (await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users) AS leden,
        (SELECT COUNT(*) FROM vacatures) AS vacatures,
        (SELECT COUNT(*) FROM projecten) AS projecten,
        (SELECT COUNT(*) FROM veteraan_resources) AS resources
    `)).rows[0];
    res.render('beheer/index', { title: 'Beheer', leden, stats });
  } catch (err) {
    console.error('[beheer]', err.message);
    res.status(500).render('error', { title: 'Fout', bericht: 'Het beheerpaneel kon niet worden geladen.' });
  }
});

// Rol wijzigen
router.post('/lid/:id/rol', async (req, res) => {
  const { rol } = req.body;
  if (['lid', 'brigade', 'admin'].includes(rol)) {
    await pool.query('UPDATE users SET rol = $1 WHERE id = $2', [rol, req.params.id]);
    req.session.flash = { type: 'succes', message: 'Rol bijgewerkt.' };
  }
  res.redirect('/beheer');
});

// Activeren/deactiveren
router.post('/lid/:id/status', async (req, res) => {
  // voorkom dat de admin zichzelf deactiveert
  if (Number(req.params.id) !== req.session.user.id) {
    await pool.query('UPDATE users SET actief = NOT actief WHERE id = $1', [req.params.id]);
    req.session.flash = { type: 'succes', message: 'Status bijgewerkt.' };
  }
  res.redirect('/beheer');
});

// Lid verwijderen
router.post('/lid/:id/verwijderen', async (req, res) => {
  if (Number(req.params.id) !== req.session.user.id) {
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    req.session.flash = { type: 'succes', message: 'Lid verwijderd.' };
  }
  res.redirect('/beheer');
});

module.exports = router;
