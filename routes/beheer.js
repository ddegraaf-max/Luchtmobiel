const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { requireLogin, requireAdmin, idParams } = require('../middleware/auth');
const { beeindigSessies } = require('../lib/sessies');
const tfa = require('../lib/tfa');
const { sendMail, mailLayout, escHtml } = require('../lib/mail');

router.use(requireLogin, requireAdmin);
idParams(router);

// Overzicht
router.get('/', async (req, res) => {
  try {
    const leden = (await pool.query(
      'SELECT id, naam, email, rol, actief, bedrijf, totp_ingeschakeld, aangemaakt FROM users ORDER BY aangemaakt DESC'
    )).rows;
    const stats = (await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM users) AS leden,
        (SELECT COUNT(*) FROM vacatures) AS vacatures,
        (SELECT COUNT(*) FROM projecten) AS projecten,
        (SELECT COUNT(*) FROM users WHERE totp_ingeschakeld = true) AS met_tfa
    `)).rows[0];
    res.render('beheer/index', { title: 'Beheer', leden, stats });
  } catch (err) {
    console.error('[beheer]', err.message);
    res.status(500).render('error', { title: 'Fout', bericht: 'Het beheerpaneel kon niet worden geladen.' });
  }
});

const isZelf = (req) => Number(req.params.id) === req.session.user.id;

// Rol wijzigen
router.post('/lid/:id/rol', async (req, res) => {
  const { rol } = req.body;
  if (!isZelf(req) && ['lid', 'brigade', 'admin'].includes(rol)) {
    await pool.query('UPDATE users SET rol = $1 WHERE id = $2', [rol, req.params.id]);
    req.session.flash = { type: 'succes', message: 'Rol bijgewerkt.' };
  }
  res.redirect('/beheer');
});

// Activeren/deactiveren
router.post('/lid/:id/status', async (req, res) => {
  // voorkom dat de admin zichzelf deactiveert
  if (!isZelf(req)) {
    const { rows } = await pool.query('UPDATE users SET actief = NOT actief WHERE id = $1 RETURNING actief', [req.params.id]);
    if (rows.length && !rows[0].actief) await beeindigSessies(Number(req.params.id)); // direct uitloggen
    req.session.flash = { type: 'succes', message: 'Status bijgewerkt.' };
  }
  res.redirect('/beheer');
});

// Tweestapsverificatie resetten (bijv. telefoon kwijt en geen herstelcodes)
router.post('/lid/:id/2fa-reset', async (req, res) => {
  if (!isZelf(req)) {
    const lid = (await pool.query('SELECT id, naam, email, totp_ingeschakeld FROM users WHERE id = $1', [req.params.id])).rows[0];
    if (lid && lid.totp_ingeschakeld) {
      await tfa.schakelUit(lid.id);
      await beeindigSessies(lid.id);
      try {
        await sendMail({
          to: lid.email,
          subject: 'Tweestapsverificatie gereset',
          html: mailLayout('Tweestapsverificatie gereset',
            `<p>Beste ${escHtml(lid.naam)},</p>
             <p>Een beheerder heeft de tweestapsverificatie van je account uitgeschakeld. Je kunt weer inloggen met alleen je wachtwoord en daarna via <em>Mijn profiel → Beveiliging</em> opnieuw een authenticator instellen.</p>
             <p>Heb je hier niet om gevraagd? Neem dan direct contact op met het bestuur.</p>`)
        });
      } catch (err) { console.error('[2fa reset mail]', err.message); }
      req.session.flash = { type: 'succes', message: `Tweestapsverificatie van ${lid.naam} is uitgeschakeld.` };
    }
  }
  res.redirect('/beheer');
});

// Lid verwijderen
router.post('/lid/:id/verwijderen', async (req, res) => {
  if (!isZelf(req)) {
    await beeindigSessies(Number(req.params.id));
    await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    req.session.flash = { type: 'succes', message: 'Lid verwijderd.' };
  }
  res.redirect('/beheer');
});

module.exports = router;
