// Reclameblokken: advertenties van bedrijven uit het netwerk op de openbare pagina's.
//
// De blokken staan in de tabel `reclames` en worden door de beheerder gemaakt en
// onderhouden (Beheer → Reclameblokken). Per bezochte pagina kiest de site één lopend
// blok (gewogen toeval, zodat blokken met een hoger gewicht vaker aan de beurt zijn).
// Vertoningen en kliks worden geteld, zodat de adverteerder ziet wat het oplevert.
//
// Het blok zelf wordt getekend door views/partials/reclame.ejs in drie maten:
// 'groot' (homepage), 'balk' (onder lijsten en berichten) en 'kaart' (zijbalk).

const pool = require('../db/pool');
const { tags } = require('./helpers');

const THEMAS = {
  donker: 'Donker — inkt, zoals de voettekst',
  baret: 'Baret — kastanjebruin, zoals de paginakoppen',
  licht: 'Licht — botpapier, zoals de kaarten'
};

const CACHE_MS = 60 * 1000;   // hoe lang de lijst met actieve blokken in het geheugen blijft
const FLUSH_MS = 15 * 1000;   // hoe vaak getelde vertoningen naar de database gaan

let cache = { rijen: [], tot: 0, laden: null };
const vertoningen = new Map(); // id -> aantal nog weg te schrijven vertoningen
let flushTimer = null;

// Vandaag als 'YYYY-MM-DD' in Nederlandse tijd (de periode van een blok is in dagen).
function vandaag() {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(new Date());
}

function gewichtVan(r) {
  const g = Number(r && r.gewicht);
  return Number.isFinite(g) ? Math.min(5, Math.max(1, Math.round(g))) : 1;
}

// Status van een blok: 'actief' (loopt nu), 'gepland' (begint later), 'verlopen' of 'uit'.
function status(r, dag = vandaag()) {
  if (!r || !r.actief) return 'uit';
  if (r.van && String(r.van) > dag) return 'gepland';
  if (r.tot && String(r.tot) < dag) return 'verlopen';
  return 'actief';
}

function loopt(r, dag = vandaag()) {
  return status(r, dag) === 'actief';
}

// Alle actieve blokken (uit het geheugen; hoogstens één keer per minuut uit de database).
async function actieve() {
  if (cache.tot > Date.now()) return cache.rijen;
  if (!cache.laden) {
    cache.laden = pool.query('SELECT * FROM reclames WHERE actief = true ORDER BY id')
      .then(({ rows }) => {
        cache = { rijen: rows, tot: Date.now() + CACHE_MS, laden: null };
        return rows;
      })
      .catch((err) => {
        console.error('[reclame] blokken laden mislukt:', err.message);
        cache = { rijen: cache.rijen, tot: Date.now() + 10 * 1000, laden: null };
        return cache.rijen;
      });
  }
  return cache.laden;
}

// Na een wijziging in Beheer: lijst opnieuw laden bij het volgende bezoek.
function ververs() {
  cache = { rijen: [], tot: 0, laden: null };
}

// Kiest één lopend blok uit de lijst, gewogen naar `gewicht` (1 t/m 5). Geeft null als er niets loopt.
function kiesGewogen(lijst, rnd = Math.random, dag = vandaag()) {
  const kandidaten = (lijst || []).filter((r) => loopt(r, dag));
  if (!kandidaten.length) return null;
  const totaal = kandidaten.reduce((som, r) => som + gewichtVan(r), 0);
  let x = rnd() * totaal;
  for (const r of kandidaten) {
    x -= gewichtVan(r);
    if (x < 0) return r;
  }
  return kandidaten[kandidaten.length - 1];
}

// Volgorde voor de diavoorstelling: gewogen trekken zonder teruglegging, hoogstens `max` blokken.
// Het eerste blok is dus de gewogen keuze; de rest volgt in willekeurige (gewogen) volgorde.
const MAX_DIA = 6;
function kiesVolgorde(lijst, max = MAX_DIA, rnd = Math.random, dag = vandaag()) {
  let rest = (lijst || []).filter((r) => loopt(r, dag));
  const uit = [];
  while (rest.length && uit.length < max) {
    const k = kiesGewogen(rest, rnd, dag);
    uit.push(k);
    rest = rest.filter((r) => r !== k);
  }
  return uit;
}

// Vertoningen worden eerst in het geheugen opgeteld en periodiek weggeschreven.
function telVertoning(id) {
  const n = Number(id);
  if (!Number.isFinite(n) || n <= 0) return;
  vertoningen.set(n, (vertoningen.get(n) || 0) + 1);
  if (!flushTimer) {
    flushTimer = setTimeout(() => { flush().catch(() => {}); }, FLUSH_MS);
    if (flushTimer.unref) flushTimer.unref();
  }
}

async function flush() {
  if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
  const items = [...vertoningen.entries()];
  vertoningen.clear();
  for (const [id, n] of items) {
    try {
      await pool.query('UPDATE reclames SET vertoningen = vertoningen + $1 WHERE id = $2', [n, id]);
    } catch (err) {
      console.error('[reclame] vertoningen wegschrijven mislukt:', err.message);
    }
  }
  return items.length;
}

// Telt een klik en geeft het adres terug waar de bezoeker heen moet (knop-adres of website).
async function registreerKlik(id) {
  const { rows } = await pool.query(
    'UPDATE reclames SET kliks = kliks + 1 WHERE id = $1 RETURNING cta_url, website', [id]
  );
  const r = rows[0];
  return r ? (r.cta_url || r.website || null) : null;
}

// ---- Weergave-hulpjes -------------------------------------------------------

// '#FF7A00', 'ff7a00' of '#f70' -> '#ff7a00'; anders null.
function netteHex(v) {
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/^#/, '');
  if (/^[0-9a-f]{6}$/i.test(s)) return '#' + s.toLowerCase();
  if (/^[0-9a-f]{3}$/i.test(s)) return '#' + s.toLowerCase().split('').map((c) => c + c).join('');
  return null;
}

// Donkere of lichte tekst op een gekleurde knop (relatieve luminantie, WCAG).
function tekstKleur(hex) {
  const h = netteHex(hex);
  if (!h) return '#1c1714';
  const lin = (i) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * lin(1) + 0.7152 * lin(3) + 0.0722 * lin(5);
  return L > 0.18 ? '#1c1714' : '#fbf9f4';
}

// Nederlands nummer naar internationale cijfers: '06 46 15 01 60' -> '31646150160'.
function internationaal(nummer) {
  let d = String(nummer || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = '31' + d.slice(1);
  if (d.length < 9 || d.length > 15) return null;
  return d;
}
function waUrl(nummer) { const d = internationaal(nummer); return d ? 'https://wa.me/' + d : null; }
function telHref(nummer) { const d = internationaal(nummer); return d ? 'tel:+' + d : null; }

// Komma-gescheiden tekst -> lijst (diensten, kenmerken).
function lijst(tekst, max = 14) { return tags(tekst, max); }

function logoSrc(r) { return r.logo_id ? '/media/' + r.logo_id : (r.logo_url || null); }
function fotoSrc(r) { return r.foto_id ? '/media/' + r.foto_id : (r.foto_url || null); }

// Adres voor bedrijven die ook willen adverteren (regel onder het grote blok).
function contactAdres() { return (process.env.RECLAME_CONTACT || 'info@bclmb.nl').trim(); }

// Startblokken: worden elk één keer geplaatst (markering in de tabel instellingen) en daarna
// door de beheerder onderhouden. Teksten en beeld komen van de eigen websites van de bedrijven.
// `marker` is de sleutel in instellingen; `bedrijfPatronen` koppelt het blok aan een bedrijf uit de
// ledengids als de naam daarop lijkt.
const STARTBLOK = {
  sleutel: 'degraaf-bouwbedrijf',
  marker: 'reclame_startblok_degraaf',
  bedrijfPatronen: ['%graaf%', '%bouw%'],
  naam: 'De Graaf Bouwbedrijf',
  slogan: 'Kwaliteit in elk detail',
  kop: 'Van nieuw kozijn tot complete renovatie: alles uit één hand.',
  tekst: 'Full-service bouwbedrijf voor het renoveren en verduurzamen van woningen en kantoren. '
    + 'Geen callcenter en geen tussenpersonen: je spreekt de man die inmeet, de offerte maakt en op de bouwplaats staat. '
    + 'Heldere prijs vooraf, korte levertijden en elke dag schoon opgeleverd.',
  diensten: 'Kunststof & aluminium kozijnen, Schuifpuien & vouwwanden, Voordeuren & deurpanelen, Dakkapellen, Dakramen, '
    + 'Uitbouwen & aanbouwen, Schroefpalen (trillingsvrij funderen), Garagedeuren op maat, Vloerverwarming, Keukens, '
    + 'Binnendeuren, Isolatie & verduurzaming, Complete renovaties',
  kenmerken: 'Eén vast aanspreekpunt, Heldere prijs vooraf, Levertijd vaak 5 tot 7 weken, 5 jaar fabrieksgarantie, '
    + 'Verzekerd werk (CAR), Betalen per fase',
  website: 'https://www.degraaf-bouwbedrijf.nl',
  cta_url: 'https://www.degraaf-bouwbedrijf.nl/contact',
  cta_tekst: 'Vraag een offerte aan',
  telefoon: '06 46 15 01 60',
  whatsapp: '06 46 15 01 60',
  email: 'montage@creditline.nl',
  plaats: 'Bussum',
  regio: 'Werkgebied: Den Haag, Zoetermeer, Delft, Leiden, Haarlem, Amstelveen, Aalsmeer, Hoofddorp, Alphen aan den Rijn en omgeving',
  logo_url: '/static/img/reclame/degraaf-bouwbedrijf-logo.png',
  foto_url: '/static/img/reclame/degraaf-bouwbedrijf-deur.jpg',
  thema: 'donker',
  accent: '#ff7a00',
  logo_achtergrond: '#1a1a1a',
  gewicht: 3,
  actief: true,
  notities: 'Startblok, geplaatst bij versie 1.7.0. Teksten en beeld overgenomen van degraaf-bouwbedrijf.nl en creditlineprojects.nl; aanpassen kan via Bewerken.'
};

const STARTBLOK_HONOR = {
  sleutel: 'honor-residence-poland',
  marker: 'reclame_startblok_honor',
  bedrijfPatronen: ['%honor%', '%residence%'],
  naam: 'Honor Residence Poland',
  slogan: 'Serving those who served — since 2026',
  kop: 'Een privé vakantiehuis in Polen, exclusief voor veteranen, militairen en hun gezin.',
  tekst: 'Honor Residence ligt in het rustige Mazovië, 120 km van Warschau: een vrijstaand huis voor zes gasten op een afgesloten en bewaakt terrein, '
    + 'met het bos als buurman. Geen hotellobby en geen vreemden in de gang, wel een overdekte jacuzzi, een vijver met waterval en ruim twintig '
    + 'militaire erfgoedlocaties binnen bereik. Wie gediend heeft, is hier thuis.',
  diensten: 'Vrijstaand huis voor 6 gasten, Afgesloten terrein met 24/7 beveiliging, Overdekte jacuzzi, BBQ & rookstation, Vijver met waterval, '
    + 'Lounge met houtkachel, Volledig uitgeruste keuken, Glasvezel-wifi, 20+ militaire erfgoedlocaties, WWII-routeplanner, '
    + 'Schietbaan onder begeleiding, Meren en natuurreservaat',
  diensten_label: 'Wat je er vindt',
  kenmerken: 'Alles inbegrepen vanaf €195 per nacht, 25% korting op je eerste verblijf, Zevende nacht gratis bij een week, '
    + 'Gratis annuleren tot 7 dagen vooraf, Minimaal 2 nachten, Alleen voor wie gediend heeft',
  website: 'https://honorresidencepoland.com',
  cta_url: 'https://honorresidencepoland.com/book',
  cta_tekst: 'Reserveer je verblijf',
  telefoon: '+48 452 823 838',
  whatsapp: null,
  email: 'hq@honorresidencepoland.com',
  plaats: 'Białka, Mazovië (Polen)',
  regio: '120 km van Warschau · 130 km van Łódź · dagelijks bereikbaar 08:00–20:00',
  logo_url: '/static/img/reclame/honor-residence-poland-logo.png',
  foto_url: '/static/img/reclame/honor-residence-poland.jpg',
  thema: 'baret',
  accent: '#d4a84b',
  logo_achtergrond: '#ffffff',
  gewicht: 3,
  actief: true,
  notities: 'Startblok, geplaatst bij versie 1.8.0. Teksten en beeld overgenomen van honorresidencepoland.com; aanpassen kan via Bewerken.'
};

const STARTBLOKKEN = [STARTBLOK, STARTBLOK_HONOR];

const lib = {
  THEMAS, STARTBLOK, STARTBLOK_HONOR, STARTBLOKKEN, MAX_DIA,
  vandaag, status, loopt, gewichtVan, actieve, ververs, kiesGewogen, kiesVolgorde,
  telVertoning, flush, registreerKlik,
  netteHex, tekstKleur, waUrl, telHref, lijst, logoSrc, fotoSrc, contactAdres
};

// Middleware: zet per pagina een keuzefunctie klaar. De blokken worden pas gekozen (en geteld)
// als een pagina ze ook echt toont; pagina's zonder reclameplek kosten dus niets.
// kiesReclames() geeft de volgorde voor de diavoorstelling (groot en balk), kiesReclame() het
// eerste blok daarvan (kaart in de zijbalk).
function middleware(req, res, next) {
  res.locals.reclameLib = lib;
  res.locals.kiesReclames = () => [];
  res.locals.kiesReclame = () => null;
  if (req.method !== 'GET' || /^\/(static|media)\//.test(req.path)) return next();
  actieve().then((rijen) => {
    let gekozen;
    res.locals.kiesReclames = () => {
      if (gekozen === undefined) gekozen = kiesVolgorde(rijen);
      return gekozen;
    };
    res.locals.kiesReclame = () => res.locals.kiesReclames()[0] || null;
    next();
  }, () => next());
}

module.exports = { ...lib, middleware };
