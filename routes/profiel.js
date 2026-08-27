const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { requireLogin } = require('../middleware/auth');
const { netteUrl } = require('../lib/helpers');
const { afbeelding, bewaarAfbeelding } = require('../lib/upload');

const uploadLogo = afbeelding('logo', { maxMb: 2 });

function tekst(v, max) {
  const t = typeof v === 'string' ? v.trim().slice(0, max) : '';
  return t || null;
}

// Profiel bewerken (formulier)
router.get('/', requireLogin, async (req, res) => {
  const profiel = (await pool.query('SELECT * FROM users WHERE id = $1', [req.session.user.id])).rows[0];
  res.render('leden/profiel', { title: 'Mijn profiel', profiel });
});

// Profiel opslaan
router.post('/', requireLogin, uploadLogo, async (req, res) => {
  const uid = req.session.user.id;
  if (req.uploadFout) {
    req.session.flash = { type: 'fout', message: req.uploadFout };
    return res.redirect('/profiel');
  }

  const { naam, bedrijf, functie, branche, plaats, telefoon, website, bio, logo_verwijderen } = req.body;

  try {
    const huidig = (await pool.query('SELECT logo_id FROM users WHERE id = $1', [uid])).rows[0];
    const nieuwLogoId = await bewaarAfbeelding(req.file, uid);
    const verwijderLogo = !nieuwLogoId && logo_verwijderen === 'on';

    const velden = [
      tekst(naam, 120) || req.session.user.naam,
      tekst(bedrijf, 120), tekst(functie, 120), tekst(branche, 120), tekst(plaats, 120),
      tekst(telefoon, 40), tekst(website, 300) ? netteUrl(website) || null : null, tekst(bio, 4000)
    ];
    let sql = `UPDATE users SET naam=$1, bedrijf=$2, functie=$3, branche=$4, plaats=$5, telefoon=$6, website=$7, bio=$8`;
    if (nieuwLogoId) {
      velden.push(nieuwLogoId);
      sql += `, logo_id=$${velden.length}`;
    } else if (verwijderLogo) {
      sql += `, logo_id=NULL`;
    }
    velden.push(uid);
    sql += ` WHERE id=$${velden.length}`;
    await pool.query(sql, velden);

    // Oud logo opruimen als het vervangen of verwijderd is.
    if (huidig && huidig.logo_id && (nieuwLogoId || verwijderLogo)) {
      await pool.query('DELETE FROM media WHERE id = $1 AND eigenaar_id = $2', [huidig.logo_id, uid]);
    }

    req.session.flash = { type: 'succes', message: 'Je profiel is opgeslagen.' };
    res.redirect('/profiel');
  } catch (err) {
    console.error('[profiel opslaan]', err.message);
    req.session.flash = { type: 'fout', message: 'Opslaan mislukt. Probeer het opnieuw.' };
    res.redirect('/profiel');
  }
});

module.exports = router;
