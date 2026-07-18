function formatDatum(d) {
  if (!d) return '';
  const datum = new Date(d);
  return datum.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });
}

function initialen(naam) {
  if (!naam) return '?';
  return naam
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('');
}

function isEmail(v) {
  return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

// Maakt een ruwe URL veilig en zorgt voor https:// prefix indien nodig.
function netteUrl(url) {
  if (!url) return '';
  let u = url.trim();
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u;
}

function toonUrl(url) {
  if (!url) return '';
  return url.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

// Korte samenvatting
function kort(tekst, n = 160) {
  if (!tekst) return '';
  const t = tekst.trim();
  return t.length > n ? t.slice(0, n).trim() + '…' : t;
}

// ---- Agenda: datum/tijd (lokale wandkloktijd, opgeslagen als ISO-tekst) ----
const DAGEN = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

// Bouwt een "YYYY-MM-DDTHH:MM"-string in Amsterdamse tijd uit een Date.
function isoLokaal(dt) {
  const p = new Intl.DateTimeFormat('sv-SE', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Amsterdam'
  }).formatToParts(dt).reduce((a, x) => (a[x.type] = x.value, a), {});
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

function parseLokaal(s) {
  if (!s) return null;
  const [d, t] = String(s).split('T');
  const [Y, M, D] = d.split('-').map(Number);
  const [h, mi] = (t || '00:00').split(':').map(Number);
  return { Y, M, D, h: h || 0, mi: mi || 0, js: new Date(Y, M - 1, D, h || 0, mi || 0) };
}

function formatDatumLang(s) {
  const p = parseLokaal(s);
  if (!p) return '';
  const wd = DAGEN[new Date(p.Y, p.M - 1, p.D).getDay()];
  return `${wd} ${p.D} ${MAANDEN[p.M - 1]} ${p.Y}`;
}

function formatDatumKort(s) {
  const p = parseLokaal(s);
  if (!p) return '';
  return `${p.D} ${MAANDEN[p.M - 1].slice(0, 3)}`;
}

function formatTijd(s) {
  const p = parseLokaal(s);
  if (!p) return '';
  return String(p.h).padStart(2, '0') + ':' + String(p.mi).padStart(2, '0');
}

function toDatetimeLocal(s) { return s || ''; }
function isToekomst(s) { const p = parseLokaal(s); return p ? p.js.getTime() >= Date.now() : false; }

module.exports = {
  formatDatum, initialen, isEmail, netteUrl, toonUrl, kort,
  isoLokaal, formatDatumLang, formatDatumKort, formatTijd, toDatetimeLocal, isToekomst
};
