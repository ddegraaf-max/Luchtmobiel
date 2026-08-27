const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { idParams } = require('../middleware/auth');

idParams(router);

// Alleen deze typen worden als afbeelding geserveerd. SVG (uit oudere uploads)
// mag wél getoond worden, maar strikt gesandboxt zodat eventuele scripts niet draaien.
const AFBEELDINGEN = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']);

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT mime, data FROM media WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).end();
    const mime = AFBEELDINGEN.has(rows[0].mime) ? rows[0].mime : 'application/octet-stream';
    res.set('Content-Type', mime);
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Disposition', 'inline');
    res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    res.set('Cache-Control', 'public, max-age=86400, immutable');
    res.send(rows[0].data);
  } catch (err) {
    console.error('[media]', err.message);
    res.status(500).end();
  }
});

module.exports = router;
