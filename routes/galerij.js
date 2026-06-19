const express = require('express');
const router = express.Router();
const multer = require('multer');
const pool = require('../db/pool');
const { requireRedactie } = require('../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(png|jpe?g|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(null, false);
  }
});

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
      'SELECT id, media_id, pagina, bijschrift FROM galerij ORDER BY pagina, volgorde, id'
    )).rows;
  } catch (e) { /* tabel bestaat mogelijk nog niet */ }
  res.render('galerij/beheer', { title: 'Galerij beheren', fotos, paginas: PAGINAS });
});

// Foto toevoegen
router.post('/', requireRedactie, upload.single('foto'), async (req, res) => {
  try {
    if (!req.file) {
      req.session.flash = { type: 'fout', message: 'Kies een geldige afbeelding (JPG/PNG/WebP, max 6MB).' };
      return res.redirect('/galerij/beheer');
    }
    const pagina = PAGINAS.some(p => p.key === req.body.pagina) ? req.body.pagina : 'brigade';
    const m = await pool.query(
      'INSERT INTO media (mime, data, eigenaar_id) VALUES ($1, $2, $3) RETURNING id',
      [req.file.mimetype, req.file.buffer, req.session.user.id]
    );
    await pool.query(
      'INSERT INTO galerij (media_id, pagina, bijschrift, auteur_id) VALUES ($1, $2, $3, $4)',
      [m.rows[0].id, pagina, (req.body.bijschrift || '').trim() || null, req.session.user.id]
    );
    req.session.flash = { type: 'succes', message: 'Foto toegevoegd aan de galerij.' };
  } catch (e) {
    req.session.flash = { type: 'fout', message: 'Uploaden mislukt. Probeer het opnieuw.' };
  }
  res.redirect('/galerij/beheer');
});

// Foto verwijderen (media weg = galerij-rij valt via cascade weg)
router.post('/:id/verwijderen', requireRedactie, async (req, res) => {
  try {
    const g = await pool.query('SELECT media_id FROM galerij WHERE id = $1', [req.params.id]);
    if (g.rows.length) {
      await pool.query('DELETE FROM media WHERE id = $1', [g.rows[0].media_id]);
    }
    req.session.flash = { type: 'succes', message: 'Foto verwijderd.' };
  } catch (e) {
    req.session.flash = { type: 'fout', message: 'Verwijderen mislukt.' };
  }
  res.redirect('/galerij/beheer');
});

module.exports = router;
