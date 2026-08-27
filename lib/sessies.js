// Beheer van ingelogde sessies (opgeslagen in de Postgres-tabel "session").

const pool = require('../db/pool');

// Beëindigt alle sessies van een gebruiker, eventueel behalve de huidige.
// Gebruikt na wachtwoordwijziging/-herstel, bij deactiveren en bij "overal uitloggen".
async function beeindigSessies(userId, behalveSid = null) {
  try {
    await pool.query(
      `DELETE FROM session
       WHERE (sess->'user'->>'id')::int = $1
         AND ($2::text IS NULL OR sid <> $2)`,
      [userId, behalveSid]
    );
  } catch (err) {
    console.error('[sessies] beëindigen mislukt:', err.message);
  }
}

// Promise-varianten van express-session-callbacks.
function regenereer(req) {
  return new Promise((ok, fail) => req.session.regenerate((e) => (e ? fail(e) : ok())));
}
function bewaar(req) {
  return new Promise((ok, fail) => req.session.save((e) => (e ? fail(e) : ok())));
}

module.exports = { beeindigSessies, regenereer, bewaar };
