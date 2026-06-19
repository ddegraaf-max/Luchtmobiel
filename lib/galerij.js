const pool = require('../db/pool');

// Haalt de galerijfoto's voor een bepaalde pagina op ('home' | 'brigade' | 'veteranen').
async function getGalerij(pagina) {
  try {
    const { rows } = await pool.query(
      'SELECT id, media_id, bijschrift FROM galerij WHERE pagina = $1 ORDER BY volgorde, id',
      [pagina]
    );
    return rows;
  } catch (err) {
    return [];
  }
}

module.exports = { getGalerij };
