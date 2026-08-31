const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { requireRedactie, idParams } = require('../middleware/auth');
const { afbeelding, bewaarAfbeelding } = require('../lib/upload');
const { youtubeId } = require('../lib/galerij');

idParams(router);
const uploadFoto = afbeelding('foto', { maxMb: 6 });

const PAGINAS = [
  { key: 'home', label: 'Homepage' },
  { key: 'brigade', label: 'De Brigade' },
  { key: 'veteranen', label: 'Veteranenzaken' }
];

// Overzicht + uploadformulier
router.get('/beheer', requireRedactie, async (req, res) => {
  let fotos = [];
  try {
    fotos = (await pool.query(
      'SELECT id, media_id, youtube_id, pagina, bijschrift FROM galerij ORDER BY pagina, volgorde, id'
    )).rows;
  } catch (e) { /* tabel bestaat mogelijk nog niet */ }
  res.render('galerij/beheer', { title: 'Galerij beheren', fotos, paginas: PAGINAS });
});

// Foto toevoegen
router.post('/', requireRedactie, uploadFoto, async (req, res) => {
  try {
    if (req.uploadFout || !req.file) {
      req.session.flash = { type: 'fout', message: req.uploadFout || 'Kies een geldige afbeelding (JPG/PNG/WebP, max 6MB).' };
      return res.redirect('/galerij/beheer');
    }
    const pagina = PAGINAS.some(p => p.key === req.body.pagina) ? req.body.pagina : 'brigade';
    const bijschrift = typeof req.body.bijschrift === 'string' ? req.body.bijschrift.trim().slice(0, 200) : '';
    const mediaId = await bewaarAfbeelding(req.file, req.session.user.id);
    await pool.query(
      'INSERT INTO galerij (media_id, pagina, bijschrift, auteur_id) VALUES ($1, $2, $3, $4)',
      [mediaId, pagina, bijschrift || null, req.session.user.id]
    );
    req.session.flash = { type: 'succes', message: 'Foto toegevoegd aan de galerij.' };
  } catch (e) {
    console.error('[galerij upload]', e.message);
    req.session.flash = { type: 'fout', message: 'Uploaden mislukt. Probeer het opnieuw.' };
  }
  res.redirect('/galerij/beheer');
});

// YouTube-video toevoegen
router.post('/youtube', requireRedactie, async (req, res) => {
  const id = youtubeId(req.body.youtube_url);
  if (!id) {
    req.session.flash = { type: 'fout', message: 'Dat is geen geldige YouTube-link. Plak bijvoorbeeld https://www.youtube.com/watch?v=… of https://youtu.be/… .' };
    return res.redirect('/galerij/beheer');
  }
  try {
    const pagina = PAGINAS.some(p => p.key === req.body.pagina) ? req.body.pagina : 'brigade';
    const bijschrift = typeof req.body.bijschrift === 'string' ? req.body.bijschrift.trim().slice(0, 200) : '';
    await pool.query(
      'INSERT INTO galerij (youtube_id, pagina, bijschrift, auteur_id) VALUES ($1, $2, $3, $4)',
      [id, pagina, bijschrift || null, req.session.user.id]
    );
    req.session.flash = { type: 'succes', message: 'Video toegevoegd aan de galerij.' };
  } catch (e) {
    console.error('[galerij youtube]', e.message);
    req.session.flash = { type: 'fout', message: 'Video toevoegen mislukt. Probeer het opnieuw.' };
  }
  res.redirect('/galerij/beheer');
});

// Item verwijderen (foto: media weg = galerij-rij valt via cascade weg; video: rij direct weg)
router.post('/:id/verwijderen', requireRedactie, async (req, res) => {
  try {
    const g = await pool.query('SELECT media_id FROM galerij WHERE id = $1', [req.params.id]);
    if (g.rows.length && g.rows[0].media_id) {
      await pool.query('DELETE FROM media WHERE id = $1', [g.rows[0].media_id]);
    } else {
      await pool.query('DELETE FROM galerij WHERE id = $1', [req.params.id]);
    }
    req.session.flash = { type: 'succes', message: 'Verwijderd uit de galerij.' };
  } catch (e) {
    req.session.flash = { type: 'fout', message: 'Verwijderen mislukt.' };
  }
  res.redirect('/galerij/beheer');
});

module.exports = router;
