// Maakt de ingelogde gebruiker beschikbaar in alle views via res.locals.user
function attachUser(req, res, next) {
  res.locals.user = req.session.user || null;
  res.locals.path = req.path;
  next();
}

function requireLogin(req, res, next) {
  if (req.session.user) return next();
  req.session.flash = { type: 'info', message: 'Log in om deze pagina te bekijken.' };
  req.session.returnTo = req.originalUrl;
  return res.redirect('/inloggen');
}

function requireAdmin(req, res, next) {
  if (req.session.user && req.session.user.rol === 'admin') return next();
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

module.exports = { attachUser, requireLogin, requireAdmin, requireRedactie };
