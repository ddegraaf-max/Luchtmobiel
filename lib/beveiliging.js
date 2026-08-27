// Beveiligingshulpmiddelen: versleuteling van 2FA-geheimen, tokens en herstelcodes.

const crypto = require('crypto');

// ---- Sleutel voor versleuteling "at rest" ------------------------------------
// Voorkeur: ENCRYPTIE_SLEUTEL. Anders afgeleid van SESSION_SECRET.
// Zonder stabiele sleutel kan 2FA niet worden ingeschakeld (zie sleutelBeschikbaar).
let sleutelCache;
function afgeleideSleutel() {
  if (sleutelCache !== undefined) return sleutelCache;
  const bron = process.env.ENCRYPTIE_SLEUTEL || process.env.SESSION_SECRET;
  sleutelCache = bron ? crypto.scryptSync(bron, 'bclmb-2fa-v1', 32) : null;
  return sleutelCache;
}
function sleutelBeschikbaar() { return !!afgeleideSleutel(); }

// AES-256-GCM. Uitvoer: "v1.<iv>.<tag>.<cijfertekst>" (base64url).
function versleutel(tekst) {
  const sleutel = afgeleideSleutel();
  if (!sleutel) throw new Error('Geen encryptiesleutel beschikbaar (stel ENCRYPTIE_SLEUTEL of SESSION_SECRET in).');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', sleutel, iv);
  const ct = Buffer.concat([cipher.update(String(tekst), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64url'), tag.toString('base64url'), ct.toString('base64url')].join('.');
}

function ontsleutel(blob) {
  const sleutel = afgeleideSleutel();
  if (!sleutel) throw new Error('Geen encryptiesleutel beschikbaar.');
  const delen = String(blob || '').split('.');
  if (delen.length !== 4 || delen[0] !== 'v1') throw new Error('Onbekend versleutelingsformaat.');
  const [, iv, tag, ct] = delen.map((d, i) => (i === 0 ? d : Buffer.from(d, 'base64url')));
  const decipher = crypto.createDecipheriv('aes-256-gcm', sleutel, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

// ---- Tokens (wachtwoord-herstel) --------------------------------------------
// De ruwe token gaat per e-mail naar de gebruiker; in de database staat alleen de hash.
function nieuwToken() { return crypto.randomBytes(32).toString('base64url'); }
function hashToken(token) { return crypto.createHash('sha256').update(String(token)).digest('hex'); }
function geldigTokenFormaat(token) { return typeof token === 'string' && /^[A-Za-z0-9_-]{32,64}$/.test(token); }

// ---- Herstelcodes (backup codes voor 2FA) -----------------------------------
// Alfabet zonder verwarrende tekens (0/O, 1/I/L).
const CODE_ALFABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
function nieuweHerstelcodes(aantal = 8) {
  const codes = [];
  for (let i = 0; i < aantal; i++) {
    let c = '';
    const bytes = crypto.randomBytes(10);
    for (let j = 0; j < 10; j++) c += CODE_ALFABET[bytes[j] % CODE_ALFABET.length];
    codes.push(c.slice(0, 5) + '-' + c.slice(5));
  }
  return codes;
}
function normaliseerHerstelcode(invoer) { return String(invoer || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function hashHerstelcode(code) { return crypto.createHash('sha256').update(normaliseerHerstelcode(code)).digest('hex'); }
function lijktHerstelcode(invoer) { return normaliseerHerstelcode(invoer).length === 10; }

// Geeft de index van de gebruikte code in de lijst met hashes, of -1.
function vindHerstelcode(hashes, invoer) {
  const h = Buffer.from(hashHerstelcode(invoer));
  let gevonden = -1;
  (hashes || []).forEach((bekend, i) => {
    const b = Buffer.from(String(bekend));
    if (b.length === h.length && crypto.timingSafeEqual(b, h)) gevonden = i;
  });
  return gevonden;
}

function veiligGelijk(a, b) {
  const ba = Buffer.from(String(a || '')), bb = Buffer.from(String(b || ''));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

module.exports = {
  sleutelBeschikbaar, versleutel, ontsleutel,
  nieuwToken, hashToken, geldigTokenFormaat,
  nieuweHerstelcodes, hashHerstelcode, vindHerstelcode, lijktHerstelcode, normaliseerHerstelcode,
  veiligGelijk
};
