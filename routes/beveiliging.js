// Accountbeveiliging: wachtwoord wijzigen, tweestapsverificatie (authenticator-app),
// herstelcodes en sessies. Gemount op /profiel/beveiliging.

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const QRCode = require('qrcode');
const pool = require('../db/pool');
const { requireLogin } = require('../middleware/auth');
const totp = require('../lib/totp');
const bev = require('../lib/beveiliging');
const tfa = require('../lib/tfa');
const { beeindigSessies } = require('../lib/sessies');
const { sendMail, mailLayout, escHtml } = require('../lib/mail');
const { limiet } = require('../lib/ratelimit');

const BCRYPT_RONDES = 12;
const WACHTWOORD_MIN = 8;
const WACHTWOORD_MAX = 128;
const SETUP_GELDIG_MS = 15 * 60 * 1000;

const limGevoelig = limiet({ naam: 'beveiliging', max: 15, vensterMs: 15 * 60 * 1000 });

router.use(requireLogin);

async function haalUser(id) {
  return (await pool.query('SELECT * FROM users WHERE id = $1', [id])).rows[0];
}

function toon(res, user, extra = {}) {
  return res.status(extra.fout ? 400 : 200).render('leden/beveiliging', {
    title: 'Beveiliging',
    profiel: user,
    sleutelOk: bev.sleutelBeschikbaar(),
    aantalCodes: Array.isArray(user.backup_codes) ? user.backup_codes.length : 0,
    fout: null,
    ...extra
  });
}

async function wachtwoordKlopt(user, invoer) {
  return bcrypt.compare(typeof invoer === 'string' ? invoer.slice(0, WACHTWOORD_MAX) : '', user.wachtwoord_hash);
}

async function stuurMelding(user, onderwerp, tekst) {
  try {
    await sendMail({
      to: user.email,
      subject: onderwerp,
      html: mailLayout(onderwerp, `<p>Beste ${escHtml(user.naam)},</p><p>${tekst}</p><p>Was jij dit niet? Neem dan direct contact op met het bestuur.</p>`)
    });
  } catch (err) { console.error('[beveiliging mail]', err.message); }
}

async function qrVoor(geheim, email) {
  const url = totp.otpauthUrl({ geheim, account: email, uitgever: tfa.UITGEVER });
  return QRCode.toDataURL(url, { margin: 1, width: 240, color: { dark: '#1c1714', light: '#fbf9f4' } });
}

// Overzicht
router.get('/', async (req, res) => {
  const user = await haalUser(req.session.user.id);
  toon(res, user);
});

// Wachtwoord wijzigen
router.post('/wachtwoord', limGevoelig, async (req, res) => {
  const user = await haalUser(req.session.user.id);
  const { huidig, nieuw, nieuw2 } = req.body;

  if (typeof nieuw !== 'string' || nieuw.length < WACHTWOORD_MIN) return toon(res, user, { fout: `Het nieuwe wachtwoord moet minimaal ${WACHTWOORD_MIN} tekens zijn.` });
  if (nieuw.length > WACHTWOORD_MAX) return toon(res, user, { fout: `Een wachtwoord mag maximaal ${WACHTWOORD_MAX} tekens lang zijn.` });
  if (nieuw !== nieuw2) return toon(res, user, { fout: 'De nieuwe wachtwoorden komen niet overeen.' });
  if (!(await wachtwoordKlopt(user, huidig))) return toon(res, user, { fout: 'Je huidige wachtwoord is onjuist.' });

  const hash = await bcrypt.hash(nieuw, BCRYPT_RONDES);
  await pool.query('UPDATE users SET wachtwoord_hash = $1 WHERE id = $2', [hash, user.id]);
  await beeindigSessies(user.id, req.sessionID); // andere apparaten uitloggen
  await stuurMelding(user, 'Je wachtwoord is gewijzigd', 'Het wachtwoord van je account op het ledenplatform is zojuist gewijzigd. Op andere apparaten ben je automatisch uitgelogd.');

  req.session.flash = { type: 'succes', message: 'Je wachtwoord is gewijzigd. Op andere apparaten ben je uitgelogd.' };
  res.redirect('/profiel/beveiliging');
});

// Andere sessies beëindigen
router.post('/sessies', async (req, res) => {
  await beeindigSessies(req.session.user.id, req.sessionID);
  req.session.flash = { type: 'succes', message: 'Je bent uitgelogd op alle andere apparaten.' };
  res.redirect('/profiel/beveiliging');
});

// ---- 2FA inschakelen: stap 1 (wachtwoord) -> stap 2 (QR + code) -----------------
router.post('/2fa/start', limGevoelig, async (req, res) => {
  const user = await haalUser(req.session.user.id);
  if (user.totp_ingeschakeld) return res.redirect('/profiel/beveiliging');
  if (!bev.sleutelBeschikbaar()) {
    return toon(res, user, { fout: 'Tweestapsverificatie is nog niet beschikbaar: de beheerder moet eerst ENCRYPTIE_SLEUTEL (of SESSION_SECRET) instellen.' });
  }
  if (!(await wachtwoordKlopt(user, req.body.wachtwoord))) return toon(res, user, { fout: 'Je wachtwoord is onjuist.' });

  req.session.tfaSetup = { geheim: totp.nieuwGeheim(), sinds: Date.now() };
  res.redirect('/profiel/beveiliging/2fa');
});

function setupActief(req) {
  const s = req.session.tfaSetup;
  if (!s || Date.now() - s.sinds > SETUP_GELDIG_MS) {
    delete req.session.tfaSetup;
    return null;
  }
  return s;
}

router.get('/2fa', async (req, res) => {
  const s = setupActief(req);
  if (!s) {
    req.session.flash = { type: 'info', message: 'Start het instellen van de authenticator opnieuw.' };
    return res.redirect('/profiel/beveiliging');
  }
  const qr = await qrVoor(s.geheim, req.session.user.email);
  res.render('leden/tfa-instellen', { title: 'Authenticator instellen', qr, geheim: totp.toonGeheim(s.geheim), fout: null });
});

router.post('/2fa', limGevoelig, async (req, res) => {
  const s = setupActief(req);
  if (!s) return res.redirect('/profiel/beveiliging');
  const user = await haalUser(req.session.user.id);
  if (user.totp_ingeschakeld) { delete req.session.tfaSetup; return res.redirect('/profiel/beveiliging'); }

  const stap = totp.controleer(s.geheim, req.body.code);
  if (stap == null) {
    const qr = await qrVoor(s.geheim, user.email);
    return res.status(400).render('leden/tfa-instellen', {
      title: 'Authenticator instellen', qr, geheim: totp.toonGeheim(s.geheim),
      fout: 'De code klopt niet. Controleer of de tijd op je telefoon juist staat en probeer het opnieuw.'
    });
  }

  const codes = await tfa.schakelIn(user.id, s.geheim, stap);
  delete req.session.tfaSetup;
  req.session.user.tfa = true;
  await stuurMelding(user, 'Tweestapsverificatie ingeschakeld', 'Voor je account is zojuist tweestapsverificatie met een authenticator-app ingeschakeld.');

  res.render('leden/tfa-herstelcodes', {
    title: 'Herstelcodes',
    codes,
    kop: 'Tweestapsverificatie staat aan',
    intro: 'Bewaar deze herstelcodes op een veilige plek (bijv. in je wachtwoordmanager of geprint). Raak je je telefoon kwijt, dan kun je met een herstelcode toch inloggen. Elke code werkt één keer en ze worden hierna niet meer getoond.'
  });
});

router.post('/2fa/annuleren', (req, res) => {
  delete req.session.tfaSetup;
  res.redirect('/profiel/beveiliging');
});

// ---- 2FA uitschakelen (wachtwoord + code) -------------------------------------
router.post('/2fa/uitschakelen', limGevoelig, async (req, res) => {
  const user = await haalUser(req.session.user.id);
  if (!user.totp_ingeschakeld) return res.redirect('/profiel/beveiliging');
  if (!(await wachtwoordKlopt(user, req.body.wachtwoord))) return toon(res, user, { fout: 'Je wachtwoord is onjuist.' });
  const uitkomst = await tfa.controleerTweedeFactor(user, req.body.code);
  if (!uitkomst.ok) return toon(res, user, { fout: 'De code uit je authenticator-app (of herstelcode) is onjuist.' });

  await tfa.schakelUit(user.id);
  req.session.user.tfa = false;
  await stuurMelding(user, 'Tweestapsverificatie uitgeschakeld', 'Tweestapsverificatie is zojuist uitgeschakeld voor je account. Je logt voortaan alleen met je wachtwoord in.');
  req.session.flash = { type: 'info', message: 'Tweestapsverificatie is uitgeschakeld.' };
  res.redirect('/profiel/beveiliging');
});

// ---- Nieuwe herstelcodes (wachtwoord + code) ----------------------------------
router.post('/2fa/herstelcodes', limGevoelig, async (req, res) => {
  const user = await haalUser(req.session.user.id);
  if (!user.totp_ingeschakeld) return res.redirect('/profiel/beveiliging');
  if (!(await wachtwoordKlopt(user, req.body.wachtwoord))) return toon(res, user, { fout: 'Je wachtwoord is onjuist.' });
  const uitkomst = await tfa.controleerTweedeFactor(user, req.body.code);
  if (!uitkomst.ok) return toon(res, user, { fout: 'De code uit je authenticator-app (of herstelcode) is onjuist.' });

  const codes = await tfa.nieuweHerstelcodes(user.id);
  res.render('leden/tfa-herstelcodes', {
    title: 'Nieuwe herstelcodes',
    codes,
    kop: 'Nieuwe herstelcodes',
    intro: 'Je oude herstelcodes zijn niet meer geldig. Bewaar deze nieuwe codes op een veilige plek; ze worden hierna niet meer getoond.'
  });
});

module.exports = router;
