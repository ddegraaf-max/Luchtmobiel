const pool = require('../db/pool');

// Haalt de galerij-items voor een bepaalde pagina op ('home' | 'brigade' | 'veteranen').
// Een item is een foto (media_id) of een YouTube-video (youtube_id).
async function getGalerij(pagina) {
  try {
    const { rows } = await pool.query(
      'SELECT id, media_id, youtube_id, bijschrift FROM galerij WHERE pagina = $1 ORDER BY volgorde, id',
      [pagina]
    );
    return rows;
  } catch (err) {
    return [];
  }
}

// Haalt het video-id (11 tekens) uit een YouTube-adres in alle gangbare vormen:
// youtube.com/watch?v=..., youtu.be/..., youtube.com/shorts/..., /embed/..., /live/...,
// of een los geplakt id. Geeft null terug als er geen geldig id in zit.
function youtubeId(invoer) {
  const s = String(invoer || '').trim();
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#]|$)/i);
  return m ? m[1] : null;
}

module.exports = { getGalerij, youtubeId };
