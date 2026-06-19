const express = require('express');
const router = express.Router();
const multer = require('multer');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { requireLogin } = require('../middleware/auth');
const { netteUrl } = require('../lib/helpers');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(png|jpe?g|webp|gif|svg\+xml)$/.test(file.mimetype)) cb(null, true);
    else cb(null, false);
  }
});

// Profiel bewerken (formulier)
router.get('/', requireLogin, async (req, res) => {
  const profiel = (await pool.query('SELECT * FROM users WHERE id = $1', [req.session.user.id])).rows[0];
  res.render('leden/profiel', { title: 'Mijn profiel', profiel, fout: null, succes: null });
});

// Profiel opslaan
router.post('/', requireLogin, upload.single('logo'), async (req, res) => {
  const uid = req.session.user.id;
  const { naam, bedrijf, functie, branche, plaats, telefoon, website, bio } = req.body;

  try {
    let logoId = null;
    if (req.file) {
      const m = await pool.query(
        'INSERT INTO media (mime, data, eigenaar_id) VALUES ($1, $2, $3) RETURNING id',
        [req.file.mimetype, req.file.buffer, uid]
      );
      logoId = m.rows[0].id;
    }

    const velden = [naam ? naam.trim() : req.session.user.naam, bedrijf, functie, branche, plaats, telefoon, website ? netteUrl(website) : null, bio];
    let sql = `UPDATE users SET naam=$1, bedrijf=$2, functie=$3, branche=$4, plaats=$5, telefoon=$6, website=$7, bio=$8`;
    if (logoId) {
      sql += `, logo_id=$9 WHERE id=$10`;
      velden.push(logoId, uid);
    } else {
      sql += ` WHERE id=$9`;
      velden.push(uid);
    }
    await pool.query(sql, velden);

    if (naam) req.session.user.naam = naam.trim();

    const profiel = (await pool.query('SELECT * FROM users WHERE id = $1', [uid])).rows[0];
    res.render('leden/profiel', { title: 'Mijn profiel', profiel, fout: null, succes: 'Je profiel is opgeslagen.' });
  } catch (err) {
    console.error('[profiel opslaan]', err.message);
    const profiel = (await pool.query('SELECT * FROM users WHERE id = $1', [uid])).rows[0];
    res.status(500).render('leden/profiel', { title: 'Mijn profiel', profiel, fout: 'Opslaan mislukt. Probeer het opnieuw.', succes: null });
  }
});

// Wachtwoord wijzigen
router.post('/wachtwoord', requireLogin, async (req, res) => {
  const uid = req.session.user.id;
  const { huidig, nieuw, nieuw2 } = req.body;
  const profiel = (await pool.query('SELECT * FROM users WHERE id = $1', [uid])).rows[0];

  const klaar = (fout, succes) =>
    res.render('leden/profiel', { title: 'Mijn profiel', profiel, fout, succes });

  if (!nieuw || nieuw.length < 8) return klaar('Het nieuwe wachtwoord moet minimaal 8 tekens zijn.', null);
  if (nieuw !== nieuw2) return klaar('De nieuwe wachtwoorden komen niet overeen.', null);

  const klopt = await bcrypt.compare(huidig || '', profiel.wachtwoord_hash);
  if (!klopt) return klaar('Je huidige wachtwoord is onjuist.', null);

  const hash = await bcrypt.hash(nieuw, 10);
  await pool.query('UPDATE users SET wachtwoord_hash = $1 WHERE id = $2', [hash, uid]);
  klaar(null, 'Je wachtwoord is gewijzigd.');
});

module.exports = router;
