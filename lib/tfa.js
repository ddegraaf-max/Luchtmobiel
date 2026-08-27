// Tweestapsverificatie (2FA) met een authenticator-app: in-/uitschakelen,
// codes controleren en herstelcodes beheren. Het TOTP-geheim staat versleuteld
// in de database; van herstelcodes staat alleen een hash opgeslagen.

const pool = require('../db/pool');
const totp = require('./totp');
const bev = require('./beveiliging');

const UITGEVER = 'Business Club Luchtmobiel';

/**
 * Controleert een ingevoerde code (6 cijfers uit de app, of een herstelcode).
 * Werkt de database bij (laatst gebruikte tijdstap / gebruikte herstelcode).
 * Geeft { ok, viaHerstelcode, resterend } terug.
 */
async function controleerTweedeFactor(user, invoer) {
  const code = String(invoer || '').trim();
  if (!user || !user.totp_ingeschakeld) return { ok: false };

  if (/^\d{6}$/.test(code.replace(/\s+/g, ''))) {
    let geheim;
    try {
      geheim = bev.ontsleutel(user.totp_secret);
    } catch (err) {
      console.error('[2fa] geheim ontsleutelen mislukt voor gebruiker', user.id, '-', err.message);
      return { ok: false };
    }
    const stap = totp.controleer(geheim, code, { laatsteStap: user.totp_laatste_stap });
    if (stap == null) return { ok: false };
    await pool.query('UPDATE users SET totp_laatste_stap = $1 WHERE id = $2', [stap, user.id]);
    return { ok: true, viaHerstelcode: false };
  }

  if (bev.lijktHerstelcode(code)) {
    const hashes = Array.isArray(user.backup_codes) ? user.backup_codes : [];
    const idx = bev.vindHerstelcode(hashes, code);
    if (idx < 0) return { ok: false };
    const rest = hashes.filter((_, i) => i !== idx);
    await pool.query('UPDATE users SET backup_codes = $1 WHERE id = $2', [rest, user.id]);
    return { ok: true, viaHerstelcode: true, resterend: rest.length };
  }

  return { ok: false };
}

// Schakelt 2FA in en geeft de (eenmalig te tonen) herstelcodes terug.
async function schakelIn(userId, geheim, laatsteStap) {
  const codes = bev.nieuweHerstelcodes(8);
  await pool.query(
    `UPDATE users SET totp_secret = $1, totp_ingeschakeld = true, totp_laatste_stap = $2, backup_codes = $3
     WHERE id = $4`,
    [bev.versleutel(geheim), laatsteStap, codes.map(bev.hashHerstelcode), userId]
  );
  return codes;
}

async function schakelUit(userId) {
  await pool.query(
    `UPDATE users SET totp_secret = NULL, totp_ingeschakeld = false, totp_laatste_stap = NULL, backup_codes = '{}'
     WHERE id = $1`,
    [userId]
  );
}

async function nieuweHerstelcodes(userId) {
  const codes = bev.nieuweHerstelcodes(8);
  await pool.query('UPDATE users SET backup_codes = $1 WHERE id = $2', [codes.map(bev.hashHerstelcode), userId]);
  return codes;
}

module.exports = { UITGEVER, controleerTweedeFactor, schakelIn, schakelUit, nieuweHerstelcodes };
