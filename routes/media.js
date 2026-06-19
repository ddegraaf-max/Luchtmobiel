const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT mime, data FROM media WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).end();
    res.set('Content-Type', rows[0].mime);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(rows[0].data);
  } catch (err) {
    res.status(500).end();
  }
});

module.exports = router;
