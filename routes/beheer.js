const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { requireLogin, requireAdmin, idParams } = require('../middleware/auth');
const { beeindigSessies } = require('../lib/sessies');
const tfa = require('../lib/tfa');
const { sendMail, mailLayout, mailKnop, escHtml, verstuur, mailInstellingen } = require('../lib/mail');
const versie = require('../lib/versie');
const agendaImportLib = require('../lib/agenda-import');
const sponsorImportLib = require('../lib/sponsor-import');
const nieuwsImportLib = require('../lib/nieuws-import');

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
    const agendaImport = { ...agendaImportLib.status(), genegeerd: await agendaImportLib.aantalGenegeerd(),
      aantal: (await pool.query('SELECT COUNT(*)::int AS n FROM evenementen WHERE bron = $1', [agendaImportLib.BRON])).rows[0].n };
    const sponsor = { ...sponsorImportLib.status(), teControleren: await sponsorImportLib.aantalTeControleren(),
      geplaatst: (await pool.query("SELECT COUNT(*)::int AS n FROM sponsorverzoeken WHERE status = 'geplaatst'")).rows[0].n };
    const nieuwsImport = { ...nieuwsImportLib.status(), genegeerd: await nieuwsImportLib.aantalGenegeerd(),
      aantal: (await pool.query('SELECT COUNT(*)::int AS n FROM nieuws WHERE bron = $1', [nieuwsImportLib.BRON])).rows[0].n };
    res.render('beheer/index', { title: 'Beheer', leden, stats, agendaImport, sponsor, nieuwsImport, mail: mailInstellingen() });
  } catch (err) {
    console.error('[beheer]', err.message);
    res.status(500).render('error', { title: 'Fout', bericht: 'Het beheerpaneel kon niet worden geladen.' });
  }
});

// Agenda-import vanaf bclmb.nl handmatig draaien
router.post('/agenda-import', async (req, res) => {
  const r = await agendaImportLib.importeerAgenda();
  const samenvatting = `${r.nieuw} nieuw, ${r.bijgewerkt} bijgewerkt, ${r.ongewijzigd} ongewijzigd, ${r.verwijderd} verwijderd${r.overgeslagen ? ', ' + r.overgeslagen + ' genegeerd' : ''}.`;
  req.session.flash = r.fouten.length
    ? { type: 'fout', message: `Agenda-import afgerond met meldingen: ${samenvatting} ${r.fouten.join(' | ')}` }
    : { type: 'succes', message: `Agenda-import afgerond: ${samenvatting}` };
  res.redirect('/beheer');
});

router.post('/agenda-import/negeer-wissen', async (req, res) => {
  await agendaImportLib.negeerlijstWissen();
  req.session.flash = { type: 'succes', message: 'Genegeerde evenementen worden bij de volgende import weer toegevoegd.' };
  res.redirect('/beheer');
});

// Test-e-mail naar de ingelogde beheerder; toont precies wat Resend antwoordt.
router.post('/testmail', async (req, res) => {
  const u = req.session.user;
  const inst = mailInstellingen();
  const r = await verstuur({
    to: u.email,
    subject: 'Testmail van het ledenplatform',
    html: mailLayout('Test geslaagd',
      `<p>Beste ${escHtml(u.naam)},</p>
       <p>Deze testmail is verstuurd vanuit <strong>Beheer</strong> op het ledenplatform. Komt hij aan, dan werkt het versturen van e-mail — en zo zien de e-mails van het platform eruit.</p>
       ${mailKnop((inst.appUrl || 'https://luchtmobiel.red') + '/beheer', 'Naar het beheerpaneel')}
       <p style="font-size:12px;color:#8a8178;">Afzender ${escHtml(inst.van)} &middot; versie ${escHtml(versie.label)} &middot; ${new Date().toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam' })}</p>`,
      { voorproefje: 'Als je dit leest, werkt het versturen van e-mail vanuit het ledenplatform.' })
  });
  req.session.flash = r.ok
    ? { type: 'succes', message: `Testmail verstuurd naar ${u.email} (Resend-id ${r.id || 'onbekend'}). Niet ontvangen? Kijk in je spammap en in Resend onder Emails.` }
    : { type: 'fout', message: `Testmail NIET verstuurd. ${r.fout}` };
  res.redirect('/beheer');
});

// Nieuws-import vanaf bclmb.nl handmatig draaien
router.post('/nieuws-import', async (req, res) => {
  const r = await nieuwsImportLib.importeerNieuws();
  const samenvatting = `${r.nieuw} nieuw, ${r.bijgewerkt} bijgewerkt, ${r.ongewijzigd} ongewijzigd${r.overgeslagen ? ', ' + r.overgeslagen + ' genegeerd' : ''}.`;
  req.session.flash = r.fouten.length
    ? { type: 'fout', message: `Nieuws-import afgerond met meldingen: ${samenvatting} ${r.fouten.join(' | ')}` }
    : { type: 'succes', message: `Nieuws-import afgerond: ${samenvatting}` };
  res.redirect('/beheer');
});

router.post('/nieuws-import/negeer-wissen', async (req, res) => {
  await nieuwsImportLib.negeerlijstWissen();
  req.session.flash = { type: 'succes', message: 'Verwijderde nieuwsberichten worden bij de volgende import weer overgenomen.' };
  res.redirect('/beheer');
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
