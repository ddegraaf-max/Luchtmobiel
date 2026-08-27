// Eenvoudige rate-limiter in het geheugen (voldoende voor één app-instantie).
// Beschermt inloggen, registreren, wachtwoord-herstel en 2FA tegen brute force.

const emmers = new Map();

function opruimen() {
  const nu = Date.now();
  for (const [k, e] of emmers) if (e.reset <= nu) emmers.delete(k);
}
setInterval(opruimen, 60 * 1000).unref();

/**
 * limiet({ naam, max, vensterMs, sleutel?, bericht? })
 * - sleutel: functie die de "wie" bepaalt (standaard het IP-adres).
 *   Geeft de functie null terug, dan wordt de limiet overgeslagen.
 */
function limiet({ naam, max, vensterMs, sleutel = (req) => req.ip, bericht }) {
  return (req, res, next) => {
    const wie = sleutel(req);
    if (!wie) return next();
    const k = `${naam}:${wie}`;
    const nu = Date.now();
    let e = emmers.get(k);
    if (!e || e.reset <= nu) { e = { n: 0, reset: nu + vensterMs }; emmers.set(k, e); }
    e.n += 1;
    if (e.n > max) {
      const wacht = Math.max(1, Math.ceil((e.reset - nu) / 1000));
      res.set('Retry-After', String(wacht));
      return res.status(429).render('error', {
        title: 'Even geduld',
        bericht: bericht || `Te veel pogingen. Probeer het over ${Math.ceil(wacht / 60)} minuut/minuten opnieuw.`
      });
    }
    next();
  };
}

// Sleutel op basis van het e-mailveld (genormaliseerd).
const opEmail = (req) => {
  const e = req.body && req.body.email;
  return typeof e === 'string' && e.trim() ? e.trim().toLowerCase() : null;
};

// Alleen voor tests: alle tellers wissen.
function reset() { emmers.clear(); }

module.exports = { limiet, opEmail, reset };
