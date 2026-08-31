const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { isEmail } = require('../lib/helpers');
const { sendMail, mailLayout, escHtml, mailBeschikbaar } = require('../lib/mail');
const bev = require('../lib/beveiliging');
const tfa = require('../lib/tfa');
const { beeindigSessies, regenereer, bewaar } = require('../lib/sessies');
const { limiet, opEmail } = require('../lib/ratelimit');
const turnstile = require('../lib/turnstile');

const BCRYPT_RONDES = 12;
const WACHTWOORD_MIN = 8;
const WACHTWOORD_MAX = 128;
const TFA_MAX_POGINGEN = 5;
const TFA_GELDIG_MS = 10 * 60 * 1000;

// Vaste dummy-hash: een onbekend e-mailadres kost dan evenveel tijd als een
// fout wachtwoord, zodat je aan de responstijd niet kunt zien of een adres bestaat.
const DUMMY_HASH = bcrypt.hashSync('dummy-wachtwoord-voor-timing', BCRYPT_RONDES);

// ---- Rate-limits (brute force) ----------------------------------------------
const MIN = 60 * 1000;
const limLoginIp = limiet({ naam: 'login-ip', max: 20, vensterMs: 15 * MIN });
const limLoginEmail = limiet({
  naam: 'login-email', max: 8, vensterMs: 15 * MIN, sleutel: opEmail,
  bericht: 'Te veel inlogpogingen voor dit e-mailadres. Probeer het over 15 minuten opnieuw, of gebruik "Wachtwoord vergeten".'
});
const limRegistratie = limiet({ naam: 'registratie', max: 5, vensterMs: 60 * MIN });
const limVergetenIp = limiet({ naam: 'vergeten-ip', max: 6, vensterMs: 60 * MIN });
const limVergetenEmail = limiet({
  naam: 'vergeten-email', max: 3, vensterMs: 60 * MIN, sleutel: opEmail,
  bericht: 'Er is al een herstelmail aangevraagd voor dit adres. Controleer je inbox (en spammap) of probeer het over een uur opnieuw.'
});
const limHerstel = limiet({ naam: 'herstel', max: 10, vensterMs: 60 * MIN });
const limTfa = limiet({ naam: 'tfa-ip', max: 30, vensterMs: 15 * MIN });

// ---- Hulpfuncties -------------------------------------------------------------
function tekst(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function controleerWachtwoord(w, w2) {
  if (typeof w !== 'string' || w.length < WACHTWOORD_MIN) return `Kies een wachtwoord van minimaal ${WACHTWOORD_MIN} tekens.`;
  if (w.length > WACHTWOORD_MAX) return `Een wachtwoord mag maximaal ${WACHTWOORD_MAX} tekens lang zijn.`;
  if (w !== w2) return 'De wachtwoorden komen niet overeen.';
  return null;
}

// Alleen interne paden als "terug"-bestemming (geen open redirect).
function veiligTerug(p) {
  return typeof p === 'string' && /^\/(?!\/)/.test(p) ? p : null;
}

function baseUrl(req) {
  const vast = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
  return vast || `${req.protocol}://${req.get('host')}`;
}

// Rondt het inloggen af: nieuwe sessie-id (tegen session fixation) + gebruiker erin.
async function voltooiLogin(req, user) {
  await regenereer(req);
  req.session.user = { id: user.id, naam: user.naam, email: user.email, rol: user.rol, tfa: !!user.totp_ingeschakeld };
  await bewaar(req);
}

// --- Registreren ---
router.get('/registreren', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('auth/registreren', {
    title: 'Word lid',
    fout: null,
    waarden: {},
    codeVereist: !!process.env.REGISTRATIE_CODE
  });
});

router.post('/registreren', limRegistratie, turnstile.verifieer, async (req, res) => {
  const naam = tekst(req.body.naam, 120);
  const email = tekst(req.body.email, 200).toLowerCase();
  const bedrijf = tekst(req.body.bedrijf, 120) || null;
  const functie = tekst(req.body.functie, 120) || null;
  const { wachtwoord, wachtwoord2, code } = req.body;
  const waarden = { naam, email, bedrijf, functie };
  const codeVereist = !!process.env.REGISTRATIE_CODE;

  const toonFout = (fout) =>
    res.status(400).render('auth/registreren', { title: 'Word lid', fout, waarden, codeVereist });

  if (req.turnstileFout) return toonFout(req.turnstileFout);
  if (!naam || !email || !wachtwoord) return toonFout('Vul je naam, e-mail en wachtwoord in.');
  if (!isEmail(email)) return toonFout('Vul een geldig e-mailadres in.');
  const wwFout = controleerWachtwoord(wachtwoord, wachtwoord2);
  if (wwFout) return toonFout(wwFout);
  if (codeVereist && !bev.veiligGelijk(tekst(code, 200), process.env.REGISTRATIE_CODE)) {
    return toonFout('De toegangscode is onjuist. Vraag deze op bij het bestuur.');
  }

  try {
    const bestaat = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (bestaat.rows.length > 0) return toonFout('Er bestaat al een account met dit e-mailadres.');

    const hash = await bcrypt.hash(wachtwoord, BCRYPT_RONDES);
    const { rows } = await pool.query(
      `INSERT INTO users (naam, email, wachtwoord_hash, rol, bedrijf, functie)
       VALUES ($1, $2, $3, 'lid', $4, $5)
       RETURNING id, naam, email, rol, totp_ingeschakeld`,
      [naam, email, hash, bedrijf, functie]
    );
    if (bedrijf) {
      await pool.query('INSERT INTO bedrijven (user_id, naam, functie, hoofd) VALUES ($1, $2, $3, true)', [rows[0].id, bedrijf, functie]);
    }
    await voltooiLogin(req, rows[0]);
    req.session.flash = { type: 'succes', message: 'Welkom! Vul je profiel aan zodat andere leden je kunnen vinden.' };

    // E-mail (fouten blokkeren de registratie niet)
    try {
      await sendMail({
        to: rows[0].email,
        subject: 'Welkom bij de Business Club Luchtmobiel',
        html: mailLayout(`Welkom, ${escHtml(naam)}!`,
          `<p>Je account is aangemaakt — fijn dat je je aansluit bij het netwerk van de Business Club Luchtmobiel.</p>
           <p>Vul je profiel aan zodat andere leden je kunnen vinden, bekijk de agenda en meld je aan voor de eerstvolgende evenementen.</p>
           <p>Tip: beveilig je account extra met een authenticator-app via <em>Mijn profiel → Beveiliging</em>.</p>`)
      });
      if (process.env.MAIL_BESTUUR) {
        await sendMail({
          to: process.env.MAIL_BESTUUR,
          replyTo: rows[0].email,
          subject: 'Nieuw lid aangemeld',
          html: mailLayout('Nieuw lid',
            `<p><strong>${escHtml(naam)}</strong>${bedrijf ? ' (' + escHtml(bedrijf) + ')' : ''} heeft een account aangemaakt.</p>
             <p>E-mail: ${escHtml(email)}</p>`)
        });
      }
    } catch (mailErr) { console.error('[registratie mail]', mailErr.message); }

    res.redirect('/profiel');
  } catch (err) {
    console.error('[registratie]', err.message);
    toonFout('Er ging iets mis bij het aanmaken van je account. Probeer het opnieuw.');
  }
});

// --- Inloggen ---
router.get('/inloggen', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('auth/inloggen', { title: 'Inloggen', fout: null, waarden: {} });
});

router.post('/inloggen', limLoginIp, limLoginEmail, turnstile.verifieer, async (req, res) => {
  const email = tekst(req.body.email, 200).toLowerCase();
  const wachtwoord = typeof req.body.wachtwoord === 'string' ? req.body.wachtwoord.slice(0, WACHTWOORD_MAX) : '';
  const waarden = { email };
  const toonFout = (fout) =>
    res.status(400).render('auth/inloggen', { title: 'Inloggen', fout, waarden });

  if (req.turnstileFout) return toonFout(req.turnstileFout);
  if (!email || !wachtwoord) return toonFout('Vul je e-mail en wachtwoord in.');

  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    const user = rows[0];
    const klopt = await bcrypt.compare(wachtwoord, user ? user.wachtwoord_hash : DUMMY_HASH);
    if (!user || !klopt) return toonFout('E-mailadres of wachtwoord is onjuist.');
    if (!user.actief) return toonFout('Dit account is gedeactiveerd. Neem contact op met het bestuur.');

    const terug = veiligTerug(req.session.returnTo);

    if (user.totp_ingeschakeld) {
      // Wachtwoord klopt, maar de gebruiker is pas ingelogd na de tweede stap.
      await regenereer(req);
      req.session.tfaPending = { userId: user.id, terug, pogingen: 0, sinds: Date.now() };
      await bewaar(req);
      return res.redirect('/inloggen/verificatie');
    }

    await voltooiLogin(req, user);
    res.redirect(terug || '/dashboard');
  } catch (err) {
    console.error('[inloggen]', err.message);
    toonFout('Er ging iets mis bij het inloggen. Probeer het opnieuw.');
  }
});

// --- Tweede stap: authenticator-code ---
router.get('/inloggen/verificatie', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  if (!req.session.tfaPending) return res.redirect('/inloggen');
  res.render('auth/verificatie', { title: 'Verificatie', fout: null });
});

router.post('/inloggen/verificatie', limTfa, async (req, res) => {
  const p = req.session.tfaPending;
  if (!p) return res.redirect('/inloggen');

  const afbreken = (message) => {
    delete req.session.tfaPending;
    req.session.flash = { type: 'fout', message };
    return res.redirect('/inloggen');
  };
  if (Date.now() - p.sinds > TFA_GELDIG_MS) return afbreken('De verificatie is verlopen. Log opnieuw in.');

  try {
    const user = (await pool.query('SELECT * FROM users WHERE id = $1', [p.userId])).rows[0];
    if (!user || !user.actief) return afbreken('Dit account is niet (meer) beschikbaar.');
    if (!user.totp_ingeschakeld) {
      await voltooiLogin(req, user);
      return res.redirect(p.terug || '/dashboard');
    }

    const uitkomst = await tfa.controleerTweedeFactor(user, req.body.code);
    if (!uitkomst.ok) {
      p.pogingen += 1;
      if (p.pogingen >= TFA_MAX_POGINGEN) return afbreken('Te veel mislukte pogingen. Log opnieuw in.');
      return res.status(400).render('auth/verificatie', {
        title: 'Verificatie',
        fout: `De code is onjuist. Je hebt nog ${TFA_MAX_POGINGEN - p.pogingen} poging(en).`
      });
    }

    await voltooiLogin(req, user);
    if (uitkomst.viaHerstelcode) {
      req.session.flash = {
        type: 'info',
        message: uitkomst.resterend > 0
          ? `Je hebt een herstelcode gebruikt; je hebt er nog ${uitkomst.resterend}. Maak nieuwe aan via Beveiliging als ze bijna op zijn.`
          : 'Je hebt je laatste herstelcode gebruikt. Maak direct nieuwe herstelcodes aan via Beveiliging.'
      };
    }
    res.redirect(p.terug || '/dashboard');
  } catch (err) {
    console.error('[verificatie]', err.message);
    res.status(500).render('auth/verificatie', { title: 'Verificatie', fout: 'Er ging iets mis. Probeer het opnieuw.' });
  }
});

router.post('/inloggen/verificatie/annuleren', (req, res) => {
  delete req.session.tfaPending;
  res.redirect('/inloggen');
});

// --- Uitloggen ---
router.post('/uitloggen', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
});

// --- Wachtwoord vergeten ---
router.get('/wachtwoord-vergeten', (req, res) => {
  if (req.session.user) return res.redirect('/profiel/beveiliging');
  res.render('auth/wachtwoord-vergeten', { title: 'Wachtwoord vergeten', fout: null, verzonden: false, waarden: {}, mailOk: mailBeschikbaar() });
});

router.post('/wachtwoord-vergeten', limVergetenIp, limVergetenEmail, turnstile.verifieer, async (req, res) => {
  const email = tekst(req.body.email, 200).toLowerCase();
  const waarden = { email };
  const toon = (opties) =>
    res.status(opties.fout ? 400 : 200).render('auth/wachtwoord-vergeten', {
      title: 'Wachtwoord vergeten', fout: null, verzonden: false, waarden, mailOk: mailBeschikbaar(), ...opties
    });

  if (req.turnstileFout) return toon({ fout: req.turnstileFout });
  if (!isEmail(email)) return toon({ fout: 'Vul een geldig e-mailadres in.' });
  if (!mailBeschikbaar()) {
    return toon({ fout: 'Wachtwoord herstellen per e-mail is nog niet ingeschakeld. Neem contact op met het bestuur via info@bclmb.nl.' });
  }

  try {
    // Oude tokens opruimen
    await pool.query("DELETE FROM wachtwoord_resets WHERE verloopt_op < now() - interval '1 day'");

    const user = (await pool.query('SELECT id, naam, email, actief FROM users WHERE email = $1', [email])).rows[0];
    if (user && user.actief) {
      const token = bev.nieuwToken();
      await pool.query(
        `INSERT INTO wachtwoord_resets (user_id, token_hash, verloopt_op) VALUES ($1, $2, now() + interval '1 hour')`,
        [user.id, bev.hashToken(token)]
      );
      const link = `${baseUrl(req)}/wachtwoord-herstellen/${token}`;
      const verzonden = await sendMail({
        to: user.email,
        subject: 'Wachtwoord opnieuw instellen',
        html: mailLayout('Wachtwoord opnieuw instellen',
          `<p>Beste ${escHtml(user.naam)},</p>
           <p>Er is gevraagd om het wachtwoord van je account op het ledenplatform opnieuw in te stellen. Klik op de knop hieronder om een nieuw wachtwoord te kiezen. De link is <strong>1 uur</strong> geldig en werkt één keer.</p>
           ${require('../lib/mail').mailKnop(link, 'Nieuw wachtwoord kiezen')}
           <p>Heb je dit niet zelf aangevraagd? Dan kun je deze e-mail negeren; je wachtwoord blijft ongewijzigd.</p>`)
      });
      if (!verzonden) console.error('[wachtwoord vergeten] mail niet verzonden voor gebruiker', user.id);
    }
    // Altijd hetzelfde antwoord, zodat niet te achterhalen is welke adressen bestaan.
    toon({ verzonden: true });
  } catch (err) {
    console.error('[wachtwoord vergeten]', err.message);
    toon({ fout: 'Er ging iets mis. Probeer het later opnieuw.' });
  }
});

// --- Wachtwoord herstellen via link ---
async function vindReset(token) {
  if (!bev.geldigTokenFormaat(token)) return null;
  const { rows } = await pool.query(
    `SELECT r.id, r.user_id, u.naam, u.email
     FROM wachtwoord_resets r JOIN users u ON u.id = r.user_id
     WHERE r.token_hash = $1 AND r.gebruikt_op IS NULL AND r.verloopt_op > now() AND u.actief = true`,
    [bev.hashToken(token)]
  );
  return rows[0] || null;
}

const ongeldigeLink = (res) =>
  res.status(400).render('error', {
    title: 'Link ongeldig of verlopen',
    bericht: 'Deze herstellink is niet (meer) geldig. Vraag een nieuwe aan via "Wachtwoord vergeten".'
  });

router.get('/wachtwoord-herstellen/:token', async (req, res) => {
  const reset = await vindReset(req.params.token);
  if (!reset) return ongeldigeLink(res);
  res.render('auth/wachtwoord-herstellen', { title: 'Nieuw wachtwoord', token: req.params.token, fout: null });
});

router.post('/wachtwoord-herstellen/:token', limHerstel, async (req, res) => {
  const reset = await vindReset(req.params.token);
  if (!reset) return ongeldigeLink(res);

  const { wachtwoord, wachtwoord2 } = req.body;
  const wwFout = controleerWachtwoord(wachtwoord, wachtwoord2);
  if (wwFout) {
    return res.status(400).render('auth/wachtwoord-herstellen', { title: 'Nieuw wachtwoord', token: req.params.token, fout: wwFout });
  }

  try {
    const hash = await bcrypt.hash(wachtwoord, BCRYPT_RONDES);
    await pool.query('UPDATE users SET wachtwoord_hash = $1 WHERE id = $2', [hash, reset.user_id]);
    await pool.query('UPDATE wachtwoord_resets SET gebruikt_op = now() WHERE user_id = $1 AND gebruikt_op IS NULL', [reset.user_id]);
    await beeindigSessies(reset.user_id); // overal uitloggen

    try {
      await sendMail({
        to: reset.email,
        subject: 'Je wachtwoord is gewijzigd',
        html: mailLayout('Wachtwoord gewijzigd',
          `<p>Beste ${escHtml(reset.naam)},</p>
           <p>Het wachtwoord van je account op het ledenplatform is zojuist gewijzigd. Was jij dit niet? Neem dan direct contact op met het bestuur.</p>`)
      });
    } catch (mailErr) { console.error('[wachtwoord herstel mail]', mailErr.message); }

    req.session.flash = { type: 'succes', message: 'Je wachtwoord is gewijzigd. Je kunt nu inloggen.' };
    res.redirect('/inloggen');
  } catch (err) {
    console.error('[wachtwoord herstellen]', err.message);
    res.status(500).render('auth/wachtwoord-herstellen', { title: 'Nieuw wachtwoord', token: req.params.token, fout: 'Opslaan mislukt. Probeer het opnieuw.' });
  }
});

module.exports = router;
