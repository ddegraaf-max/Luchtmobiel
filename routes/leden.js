const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { requireLogin } = require('../middleware/auth');

// Ledengids (besloten)
router.get('/', requireLogin, async (req, res) => {
  const zoek = (req.query.zoek || '').trim();
  const branche = (req.query.branche || '').trim();

  let sql = `SELECT id, naam, bedrijf, functie, branche, plaats, website, bio, logo_id, rol
             FROM users WHERE actief = true`;
  const params = [];
  if (zoek) {
    params.push(`%${zoek}%`);
    sql += ` AND (naam ILIKE $${params.length} OR bedrijf ILIKE $${params.length} OR functie ILIKE $${params.length} OR branche ILIKE $${params.length} OR bio ILIKE $${params.length})`;
  }
  if (branche) {
    params.push(branche);
    sql += ` AND branche = $${params.length}`;
  }
  sql += ' ORDER BY naam ASC';

  try {
    const leden = (await pool.query(sql, params)).rows;
    const branches = (await pool.query(
      `SELECT DISTINCT branche FROM users WHERE branche IS NOT NULL AND branche <> '' ORDER BY branche`
    )).rows.map((r) => r.branche);
    res.render('leden/index', { title: 'Ledengids', leden, branches, zoek, branche });
  } catch (err) {
    console.error('[leden]', err.message);
    res.status(500).render('error', { title: 'Fout', bericht: 'De ledengids kon niet worden geladen.' });
  }
});

// Profieldetail
router.get('/:id', requireLogin, async (req, res) => {
  try {
    const lid = (await pool.query(
      'SELECT * FROM users WHERE id = $1 AND actief = true',
      [req.params.id]
    )).rows[0];
    if (!lid) return res.status(404).render('error', { title: 'Niet gevonden', bericht: 'Dit lid bestaat niet.' });

    const vacatures = (await pool.query(
      'SELECT id, titel, plaats, dienstverband FROM vacatures WHERE user_id = $1 ORDER BY aangemaakt DESC',
      [lid.id]
    )).rows;
    const projecten = (await pool.query(
      'SELECT id, titel, steun_type FROM projecten WHERE user_id = $1 ORDER BY aangemaakt DESC',
      [lid.id]
    )).rows;

    res.render('leden/detail', { title: lid.naam, lid, vacatures, projecten });
  } catch (err) {
    console.error('[leden detail]', err.message);
    res.status(500).render('error', { title: 'Fout', bericht: 'Het profiel kon niet worden geladen.' });
  }
});

module.exports = router;
