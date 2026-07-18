const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { isEmail } = require('../lib/helpers');
const { sendMail, mailLayout, escHtml } = require('../lib/mail');

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

router.post('/registreren', async (req, res) => {
  const { naam, email, wachtwoord, wachtwoord2, code, bedrijf, functie } = req.body;
  const waarden = { naam, email, bedrijf, functie };
  const codeVereist = !!process.env.REGISTRATIE_CODE;

  const toonFout = (fout) =>
    res.status(400).render('auth/registreren', { title: 'Word lid', fout, waarden, codeVereist });

  if (!naam || !email || !wachtwoord) return toonFout('Vul je naam, e-mail en wachtwoord in.');
  if (!isEmail(email)) return toonFout('Vul een geldig e-mailadres in.');
  if (wachtwoord.length < 8) return toonFout('Kies een wachtwoord van minimaal 8 tekens.');
  if (wachtwoord !== wachtwoord2) return toonFout('De wachtwoorden komen niet overeen.');
  if (codeVereist && code !== process.env.REGISTRATIE_CODE) {
    return toonFout('De toegangscode is onjuist. Vraag deze op bij het bestuur.');
  }

  try {
    const bestaat = await pool.query('SELECT id FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    if (bestaat.rows.length > 0) return toonFout('Er bestaat al een account met dit e-mailadres.');

    const hash = await bcrypt.hash(wachtwoord, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (naam, email, wachtwoord_hash, rol, bedrijf, functie)
       VALUES ($1, $2, $3, 'lid', $4, $5)
       RETURNING id, naam, email, rol`,
      [naam.trim(), email.trim().toLowerCase(), hash, bedrijf || null, functie || null]
    );
    req.session.user = rows[0];
    req.session.flash = { type: 'succes', message: 'Welkom! Vul je profiel aan zodat andere leden je kunnen vinden.' };

    // E-mail (niet-blokkerend)
    try {
      await sendMail({
        to: rows[0].email,
        subject: 'Welkom bij de Business Club Luchtmobiel',
        html: mailLayout(`Welkom, ${escHtml(naam.trim())}!`,
          `<p>Je account is aangemaakt — fijn dat je je aansluit bij het netwerk van de Business Club Luchtmobiel.</p>
           <p>Vul je profiel aan zodat andere leden je kunnen vinden, bekijk de agenda en meld je aan voor de eerstvolgende evenementen.</p>`)
      });
      if (process.env.MAIL_BESTUUR) {
        await sendMail({
          to: process.env.MAIL_BESTUUR,
          replyTo: rows[0].email,
          subject: 'Nieuw lid aangemeld',
          html: mailLayout('Nieuw lid',
            `<p><strong>${escHtml(naam.trim())}</strong>${bedrijf ? ' (' + escHtml(bedrijf) + ')' : ''} heeft een account aangemaakt.</p>
             <p>E-mail: ${escHtml(email.trim().toLowerCase())}</p>`)
        });
      }
    } catch (mailErr) { console.error('[registratie mail]', mailErr.message); }

    res.redirect('/profiel');
  } catch (err) {
    console.error(err);
    toonFout('Er ging iets mis bij het aanmaken van je account. Probeer het opnieuw.');
  }
});

// --- Inloggen ---
router.get('/inloggen', (req, res) => {
  if (req.session.user) return res.redirect('/dashboard');
  res.render('auth/inloggen', { title: 'Inloggen', fout: null, waarden: {} });
});

router.post('/inloggen', async (req, res) => {
  const { email, wachtwoord } = req.body;
  const waarden = { email };
  const toonFout = (fout) =>
    res.status(400).render('auth/inloggen', { title: 'Inloggen', fout, waarden });

  if (!email || !wachtwoord) return toonFout('Vul je e-mail en wachtwoord in.');

  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email.trim().toLowerCase()]);
    if (rows.length === 0) return toonFout('E-mailadres of wachtwoord is onjuist.');
    const user = rows[0];

    const klopt = await bcrypt.compare(wachtwoord, user.wachtwoord_hash);
    if (!klopt) return toonFout('E-mailadres of wachtwoord is onjuist.');
    if (!user.actief) return toonFout('Dit account is gedeactiveerd. Neem contact op met het bestuur.');

    req.session.user = { id: user.id, naam: user.naam, email: user.email, rol: user.rol };
    const terug = req.session.returnTo || '/dashboard';
    delete req.session.returnTo;
    res.redirect(terug);
  } catch (err) {
    console.error(err);
    toonFout('Er ging iets mis bij het inloggen. Probeer het opnieuw.');
  }
});

// --- Uitloggen ---
router.post('/uitloggen', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

module.exports = router;
