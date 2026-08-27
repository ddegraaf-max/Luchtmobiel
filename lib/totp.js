// Tijdgebaseerde eenmalige codes (TOTP, RFC 6238) voor authenticator-apps
// zoals Google Authenticator, Microsoft Authenticator, Authy of 1Password.
// Bewust zonder externe afhankelijkheid: alleen Node's ingebouwde crypto.

const crypto = require('crypto');

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STAP_SECONDEN = 30;
const CIJFERS = 6;

function base32Encode(buf) {
  let bits = 0, waarde = 0, uit = '';
  for (const byte of buf) {
    waarde = ((waarde << 8) | byte) & 0xffffff;
    bits += 8;
    while (bits >= 5) {
      uit += BASE32[(waarde >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) uit += BASE32[(waarde << (5 - bits)) & 31];
  return uit;
}

function base32Decode(str) {
  const schoon = String(str || '').toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, waarde = 0;
  const uit = [];
  for (const c of schoon) {
    waarde = ((waarde << 5) | BASE32.indexOf(c)) & 0xffffff;
    bits += 5;
    if (bits >= 8) {
      uit.push((waarde >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(uit);
}

// Nieuw geheim: 20 willekeurige bytes (160 bit), zoals de RFC aanbeveelt.
function nieuwGeheim() {
  return base32Encode(crypto.randomBytes(20));
}

// HOTP (RFC 4226) voor één teller-waarde.
function hotp(sleutel, teller, cijfers = CIJFERS) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(teller));
  const h = crypto.createHmac('sha1', sleutel).update(buf).digest();
  const off = h[h.length - 1] & 0x0f;
  const code = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(code % 10 ** cijfers).padStart(cijfers, '0');
}

function huidigeStap(ms = Date.now()) {
  return Math.floor(ms / 1000 / STAP_SECONDEN);
}

function veiligGelijk(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

/**
 * Controleert een code. Geeft de tijdstap terug waarop de code klopte, of null.
 * - venster: hoeveel stappen (van 30 s) voor/na "nu" we accepteren (klokafwijking).
 * - laatsteStap: de laatst geaccepteerde stap; codes van die stap of eerder worden
 *   geweigerd zodat een afgekeken code niet nog eens gebruikt kan worden.
 */
function controleer(geheimBase32, code, { venster = 1, laatsteStap = null, nu = Date.now() } = {}) {
  const c = String(code || '').replace(/\s+/g, '');
  if (!new RegExp(`^\d{${CIJFERS}}$`).test(c)) return null;
  const sleutel = base32Decode(geheimBase32);
  if (sleutel.length < 10) return null;
  const stap = huidigeStap(nu);
  for (let i = -venster; i <= venster; i++) {
    const s = stap + i;
    if (laatsteStap != null && s <= Number(laatsteStap)) continue;
    if (veiligGelijk(hotp(sleutel, s), c)) return s;
  }
  return null;
}

// URL die authenticator-apps begrijpen (wordt als QR-code getoond).
function otpauthUrl({ geheim, account, uitgever }) {
  const label = encodeURIComponent(`${uitgever}:${account}`);
  const q = new URLSearchParams({ secret: geheim, issuer: uitgever, algorithm: 'SHA1', digits: String(CIJFERS), period: String(STAP_SECONDEN) });
  return `otpauth://totp/${label}?${q.toString()}`;
}

// Geheim leesbaar in groepjes van 4 (voor handmatig invoeren).
function toonGeheim(geheim) {
  return String(geheim).replace(/(.{4})/g, '$1 ').trim();
}

module.exports = { base32Encode, base32Decode, nieuwGeheim, hotp, huidigeStap, controleer, otpauthUrl, toonGeheim, STAP_SECONDEN, CIJFERS };
