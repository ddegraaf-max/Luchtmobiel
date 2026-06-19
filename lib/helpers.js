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

module.exports = { formatDatum, initialen, isEmail, netteUrl, toonUrl, kort };
