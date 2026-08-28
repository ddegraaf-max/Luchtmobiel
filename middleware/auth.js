const pool = require('../db/pool');

// Maakt de ingelogde gebruiker beschikbaar in alle views via res.locals.user.
// De gebruiker wordt per verzoek opnieuw uit de database gelezen, zodat
// deactiveren of een rolwijziging door de beheerder direct effect heeft en
// een verwijderd account niet ingelogd kan blijven.
async function attachUser(req, res, next) {
  res.locals.user = null;
  res.locals.path = req.path;
  const sessieUser = req.session && req.session.user;
  if (!sessieUser) return next();
  try {
    const { rows } = await pool.query(
      'SELECT id, naam, email, rol, actief, totp_ingeschakeld FROM users WHERE id = $1',
      [sessieUser.id]
    );
    const u = rows[0];
    if (!u || !u.actief) {
      // Account bestaat niet meer of is gedeactiveerd: uitloggen met een verse,
      // lege sessie (regenerate i.p.v. destroy, zodat req.session blijft bestaan).
      return req.session.regenerate((err) => {
        if (err) console.error('[auth] sessie vernieuwen mislukt:', err.message);
        next();
      });
    }
    const vers = { id: u.id, naam: u.naam, email: u.email, rol: u.rol, tfa: !!u.totp_ingeschakeld };
    const oud = sessieUser;
    if (oud.naam !== vers.naam || oud.email !== vers.email || oud.rol !== vers.rol || oud.tfa !== vers.tfa) {
      req.session.user = vers; // alleen schrijven als er echt iets veranderde
    }
    res.locals.user = req.session.user;
  } catch (err) {
    // Database tijdelijk niet bereikbaar: val terug op de sessiegegevens.
    console.error('[auth] gebruiker verversen mislukt:', err.message);
    res.locals.user = sessieUser;
  }
  next();
}

function requireLogin(req, res, next) {
  if (req.session.user) return next();
  req.session.flash = { type: 'info', message: 'Log in om deze pagina te bekijken.' };
  req.session.returnTo = req.originalUrl;
  return res.redirect('/inloggen');
}

function requireAdmin(req, res, next) {
  const u = req.session.user;
  if (u && u.rol === 'admin') {
    // Optioneel: beheerders verplicht tweestapsverificatie (TFA_VERPLICHT_ADMIN=1)
    if (process.env.TFA_VERPLICHT_ADMIN === '1' && !u.tfa) {
      req.session.flash = { type: 'info', message: 'Als beheerder moet je eerst tweestapsverificatie instellen voordat je het beheer kunt gebruiken.' };
      return res.redirect('/profiel/beveiliging');
    }
    return next();
  }
  return res.status(403).render('error', {
    title: 'Geen toegang',
    bericht: 'Deze pagina is alleen voor beheerders.'
  });
}

// Admin of brigade (voor de veteranenhub-redactie)
function requireRedactie(req, res, next) {
  const u = req.session.user;
  if (u && (u.rol === 'admin' || u.rol === 'brigade')) return next();
  return res.status(403).render('error', {
    title: 'Geen toegang',
    bericht: 'Deze actie is alleen voor de brigade en beheerders.'
  });
}

// Route-parameters zoals :id moeten gewone positieve getallen zijn.
// Voorkomt databasefouten (en dus 500-pagina's) bij rommel in de URL.
function idParams(router, namen = ['id']) {
  for (const naam of namen) {
    router.param(naam, (req, res, next, waarde) => {
      if (!/^\d{1,9}$/.test(String(waarde))) {
        return res.status(404).render('error', { title: 'Niet gevonden', bericht: 'Deze pagina bestaat niet (meer).' });
      }
      next();
    });
  }
}

module.exports = { attachUser, requireLogin, requireAdmin, requireRedactie, idParams };
