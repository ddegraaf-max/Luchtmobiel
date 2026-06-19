const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { requireLogin } = require('../middleware/auth');

// Homepage
router.get('/', async (req, res) => {
  let stats = { leden: 0, vacatures: 0, projecten: 0 };
  let vacatures = [];
  let projecten = [];
  try {
    const s = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE actief = true) AS leden,
        (SELECT COUNT(*) FROM vacatures) AS vacatures,
        (SELECT COUNT(*) FROM projecten) AS projecten
    `);
    stats = s.rows[0];

    vacatures = (await pool.query(
      `SELECT v.id, v.titel, v.bedrijf, v.plaats, v.dienstverband, v.veteraan_vriendelijk, v.aangemaakt
       FROM vacatures v ORDER BY v.aangemaakt DESC LIMIT 4`
    )).rows;

    projecten = (await pool.query(
      `SELECT p.id, p.titel, p.samenvatting, p.steun_type, p.afbeelding_id, p.aangemaakt
       FROM projecten p ORDER BY p.aangemaakt DESC LIMIT 3`
    )).rows;
  } catch (err) {
    console.error('[home]', err.message);
  }

  res.render('home', { title: 'Het netwerk van de Luchtmobiele Brigade', stats, vacatures, projecten });
});

// Over / het netwerk
router.get('/over', (req, res) => {
  res.render('over', { title: 'Over het netwerk' });
});

// De Brigade — de drie eenheden en hun geschiedenis
router.get('/eenheden', (req, res) => {
  res.render('eenheden', { title: 'De Brigade' });
});

// Dashboard (besloten)
router.get('/dashboard', requireLogin, async (req, res) => {
  const uid = req.session.user.id;
  try {
    const profiel = (await pool.query('SELECT * FROM users WHERE id = $1', [uid])).rows[0];
    const vacatures = (await pool.query(
      'SELECT id, titel, bedrijf, aangemaakt FROM vacatures WHERE user_id = $1 ORDER BY aangemaakt DESC',
      [uid]
    )).rows;
    const projecten = (await pool.query(
      'SELECT id, titel, steun_type, aangemaakt FROM projecten WHERE user_id = $1 ORDER BY aangemaakt DESC',
      [uid]
    )).rows;
    const aanmeldingen = (await pool.query(
      `SELECT a.bericht, a.aangemaakt, p.titel AS project_titel, u.naam AS van_naam
       FROM project_aanmeldingen a
       JOIN projecten p ON p.id = a.project_id
       JOIN users u ON u.id = a.user_id
       WHERE p.user_id = $1 ORDER BY a.aangemaakt DESC LIMIT 10`,
      [uid]
    )).rows;

    res.render('dashboard', { title: 'Mijn dashboard', profiel, vacatures, projecten, aanmeldingen });
  } catch (err) {
    console.error('[dashboard]', err.message);
    res.status(500).render('error', { title: 'Fout', bericht: 'Het dashboard kon niet worden geladen.' });
  }
});

module.exports = router;
