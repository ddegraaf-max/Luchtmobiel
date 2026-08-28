// Automatische agenda-import vanaf de hoofdsite van de Business Club (bclmb.nl, Congressus).
//
// Bron 1: de publieke iCal-feed (UID, titel, omschrijving, locatie, datum/tijd).
// Bron 2: de detailpagina per evenement — daar staat de datum/tijd zoals de site hem
//         toont (de iCal-feed zet "hele dag"-evenementen om naar UTC, waardoor ze soms
//         een dag verschuiven), plus nette alinea's en de afbeelding.
// Evenementen worden herkend aan hun UID; bestaande worden bijgewerkt als de bron
// verandert, toekomstige evenementen die uit de bron verdwijnen worden verwijderd.

const crypto = require('crypto');
const pool = require('../db/pool');
const { isoLokaal } = require('./helpers');
const { detecteerAfbeelding } = require('./upload');

const BRON = 'bclmb';
const STANDAARD_ICS = 'https://www.bclmb.nl/_ical/public.ics';
const STANDAARD_SITE = 'https://bclmb.nl';
const TIMEOUT_MS = 15000;
const MAX_AFBEELDING = 3 * 1024 * 1024;

function config() {
  const urenRuw = process.env.AGENDA_IMPORT_UREN;
  const uren = urenRuw === undefined || urenRuw === '' ? 6 : Number(urenRuw);
  return {
    ics: (process.env.AGENDA_BRON_ICS || STANDAARD_ICS).trim(),
    site: (process.env.AGENDA_BRON_SITE || STANDAARD_SITE).trim().replace(/\/+$/, ''),
    uren: Number.isFinite(uren) && uren >= 0 ? uren : 6,
    detail: process.env.AGENDA_IMPORT_DETAIL !== '0'
  };
}

// ---- Tekst-hulpjes ------------------------------------------------------------
const ENTITIES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ndash: '–', mdash: '—', hellip: '…', euro: '€',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', copy: '©', reg: '®', deg: '°', middot: '·',
  eacute: 'é', egrave: 'è', euml: 'ë', ecirc: 'ê', aacute: 'á', agrave: 'à', auml: 'ä', acirc: 'â', iacute: 'í', iuml: 'ï',
  oacute: 'ó', ouml: 'ö', ocirc: 'ô', uacute: 'ú', uuml: 'ü', ccedil: 'ç', ntilde: 'ñ', Eacute: 'É', Euml: 'Ë', Ouml: 'Ö', Uuml: 'Ü'
};
function decodeEntities(s) {
  return String(s == null ? '' : s)
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-zA-Z]+);/g, (m, naam) => (ENTITIES[naam] !== undefined ? ENTITIES[naam] : m));
}

function stripTags(html) {
  return decodeEntities(String(html || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

// HTML naar leesbare tekst met alinea's (voor de omschrijving).
function htmlNaarTekst(html) {
  let s = String(html || '');
  s = s.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  s = s.replace(/<img[^>]*>/gi, '');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<li[^>]*>/gi, '\n• ').replace(/<\/li>/gi, '');
  s = s.replace(/<\/(p|h[1-6]|ul|ol|div|blockquote|table|tr)>/gi, '\n\n');
  s = s.replace(/<[^>]+>/g, '');
  s = decodeEntities(s);
  s = s.replace(/[ \t ]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

// ---- iCal ---------------------------------------------------------------------
function parseIcsWaarde(v) {
  return String(v).replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
}

function parseIcsDatum(v) {
  const m = String(v || '').trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const d = { y: +m[1], m: +m[2], d: +m[3], heleDag: !m[4], utc: !!m[7], h: m[4] ? +m[4] : 0, mi: m[5] ? +m[5] : 0 };
  if (d.m < 1 || d.m > 12 || d.d < 1 || d.d > 31) return null;
  return d;
}

function parseIcs(tekst) {
  const regels = String(tekst || '').replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const events = [];
  let huidig = null;
  for (const regel of regels) {
    if (regel === 'BEGIN:VEVENT') { huidig = {}; continue; }
    if (regel === 'END:VEVENT') { if (huidig) events.push(huidig); huidig = null; continue; }
    if (!huidig) continue;
    const idx = regel.indexOf(':');
    if (idx < 0) continue;
    const naam = regel.slice(0, idx).split(';')[0].toUpperCase();
    const waarde = parseIcsWaarde(regel.slice(idx + 1));
    switch (naam) {
      case 'UID': huidig.uid = waarde.trim(); break;
      case 'SUMMARY': huidig.summary = decodeEntities(waarde).trim(); break;
      case 'DESCRIPTION': huidig.description = decodeEntities(waarde).trim(); break;
      case 'LOCATION': huidig.location = decodeEntities(waarde).trim(); break;
      case 'STATUS': huidig.status = waarde.trim().toUpperCase(); break;
      case 'DTSTART': huidig.start = parseIcsDatum(waarde); break;
      case 'DTEND': huidig.end = parseIcsDatum(waarde); break;
      default: break;
    }
  }
  return events.filter((e) => e.uid && e.summary && e.start && e.status !== 'CANCELLED');
}

// ---- Datumtekst van de site ("16 sep 2026 18:00 - 22:00", "10 - 11 dec 2026") ----
const MAANDEN = {
  jan: 1, januari: 1, feb: 2, februari: 2, mrt: 3, maa: 3, maart: 3, apr: 4, april: 4, mei: 5,
  jun: 6, juni: 6, jul: 7, juli: 7, aug: 8, augustus: 8, sep: 9, sept: 9, september: 9,
  okt: 10, oktober: 10, nov: 11, november: 11, dec: 12, december: 12
};

function parseDatumDeel(deel) {
  const uit = { d: null, m: null, y: null, h: null, mi: null };
  for (const tok of deel.split(/\s+/)) {
    const t = tok.toLowerCase().replace(/[.,]+$/, '');
    let m;
    if ((m = t.match(/^(\d{1,2})[:.](\d{2})$/))) { uit.h = +m[1]; uit.mi = +m[2]; }
    else if (/^\d{4}$/.test(t)) uit.y = +t;
    else if (/^\d{1,2}$/.test(t)) { if (uit.d == null) uit.d = +t; }
    else if (MAANDEN[t]) uit.m = MAANDEN[t];
  }
  return uit;
}

function parseDatumTekst(tekst) {
  const schoon = stripTags(tekst).replace(/\bt\/m\b/gi, '-').replace(/\btot\b/gi, '-');
  if (!schoon) return null;
  const delen = schoon.split(/\s*[-–—]\s*/).filter(Boolean);
  const links = parseDatumDeel(delen[0]);
  const rechts = delen[1] ? parseDatumDeel(delen[1]) : null;
  if (rechts) {
    for (const k of ['d', 'm', 'y']) {
      if (links[k] == null && rechts[k] != null) links[k] = rechts[k];
      if (rechts[k] == null && links[k] != null) rechts[k] = links[k];
    }
  }
  if (links.d == null || links.m == null) return null;
  if (links.y == null) links.y = new Date().getFullYear();
  if (rechts && rechts.y == null) rechts.y = links.y;
  const start = { y: links.y, m: links.m, d: links.d, h: links.h, mi: links.mi };
  let eind = null;
  if (rechts && rechts.d != null && rechts.m != null) {
    eind = { y: rechts.y, m: rechts.m, d: rechts.d, h: rechts.h, mi: rechts.mi };
    const zelfdeDag = eind.y === start.y && eind.m === start.m && eind.d === start.d;
    if (zelfdeDag && eind.h == null) eind = null;
  }
  return { start, eind };
}

// ---- Datums samenstellen ------------------------------------------------------
const p2 = (n) => String(n).padStart(2, '0');
const datumStr = (x) => `${x.y}-${p2(x.m)}-${p2(x.d)}`;
const tijdStr = (x) => `${p2(x.h)}:${p2(x.mi)}`;

function icsNaarLokaal(dt) {
  if (dt.utc) return isoLokaal(new Date(Date.UTC(dt.y, dt.m - 1, dt.d, dt.h, dt.mi)));
  return `${datumStr(dt)}T${tijdStr(dt)}`;
}

function dagErvoor(dt) {
  const d = new Date(Date.UTC(dt.y, dt.m - 1, dt.d));
  d.setUTCDate(d.getUTCDate() - 1);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

/**
 * Bepaalt start_op / eind_op / hele_dag. De datumtekst van de site gaat voor;
 * anders vallen we terug op de iCal-waarden.
 */
function bepaalTijden(ev, siteDatum) {
  if (siteDatum) {
    const s = siteDatum.start, e = siteDatum.eind;
    if (s.h != null) {
      const start_op = `${datumStr(s)}T${tijdStr(s)}`;
      let eind_op = null;
      if (e) eind_op = e.h != null ? `${datumStr(e)}T${tijdStr(e)}` : `${datumStr(e)}T23:59`;
      else if (ev.end && !ev.end.heleDag) eind_op = icsNaarLokaal(ev.end);
      return { start_op, eind_op, hele_dag: false };
    }
    return { start_op: `${datumStr(s)}T00:00`, eind_op: `${datumStr(e || s)}T23:59`, hele_dag: true };
  }
  if (ev.start.heleDag) {
    let laatste = ev.start;
    if (ev.end && ev.end.heleDag) {
      const excl = dagErvoor(ev.end); // DTEND is exclusief
      if (datumStr(excl) >= datumStr(ev.start)) laatste = excl;
    }
    return { start_op: `${datumStr(ev.start)}T00:00`, eind_op: `${datumStr(laatste)}T23:59`, hele_dag: true };
  }
  return {
    start_op: icsNaarLokaal(ev.start),
    eind_op: ev.end && !ev.end.heleDag ? icsNaarLokaal(ev.end) : null,
    hele_dag: false
  };
}

function raadCategorie(titel) {
  const t = String(titel || '').toLowerCase();
  if (/excursie|bezoek|oefening/.test(t)) return 'Excursie';
  if (/baret|intocht|herdenking|ceremon|uitreiking|defilé|defile/.test(t)) return 'Ceremonieel';
  if (/sport|hardloop|mars|wandel|fiets|golf/.test(t)) return 'Sportief';
  return 'Netwerk';
}

// ---- Detailpagina van de site -------------------------------------------------
function leesDetail(html) {
  const h = String(html || '');
  const dd = (label) => {
    const m = h.match(new RegExp(`<dt>\\s*${label}\\s*<\\/dt>\\s*<dd>([\\s\\S]*?)<\\/dd>`, 'i'));
    return m ? stripTags(m[1]) : null;
  };
  const blokken = [...h.matchAll(/<div class="[^"]*paragraph-text[^"]*">([\s\S]*?)<\/div>/gi)].map((m) => m[1]);
  const omschrijving = blokken.length ? htmlNaarTekst(blokken.join('\n')) : null;
  const afb = h.match(/<p class="heading-image">[\s\S]*?<img[^>]+src="([^"]+)"/i) || h.match(/property="og:image"\s+content="([^"]+)"/i);
  return {
    datumTekst: dd('(?:Datum(?:\\s+en\\s+tijd)?|Wanneer)'),
    locatie: dd('(?:Locatie|Waar)'),
    omschrijving: omschrijving || null,
    afbeelding: afb ? decodeEntities(afb[1]) : null
  };
}

// ---- Netwerk ------------------------------------------------------------------
const MAX_TEKST = 2 * 1024 * 1024;

// Alleen publieke http(s)-adressen ophalen (geen interne netwerken/localhost), ook als
// een gekaapte bronpagina een vreemde afbeeldings-URL zou bevatten.
function urlToegestaan(url) {
  let u;
  try { u = new URL(String(url)); } catch (e) { return false; }
  if (!/^https?:$/.test(u.protocol)) return false;
  const host = u.hostname.toLowerCase();
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || host.endsWith('.local') || host.includes(':') || host.startsWith('[')) return false;
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224) return false;
  }
  return true;
}

async function haal(url, { fetchImpl = fetch, alsBuffer = false } = {}) {
  if (!urlToegestaan(url)) throw new Error(`Adres niet toegestaan: ${String(url).slice(0, 120)}`);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Luchtmobiel-platform agenda-import' }, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status} voor ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (alsBuffer) {
      if (buf.length > MAX_AFBEELDING) throw new Error('Afbeelding te groot');
      return buf;
    }
    if (buf.length > MAX_TEKST) throw new Error('Antwoord te groot');
    return buf.toString('utf8');
  } finally {
    clearTimeout(timer);
  }
}

async function haalAfbeeldingId(url, fetchImpl) {
  try {
    const buf = await haal(url, { fetchImpl, alsBuffer: true });
    const mime = detecteerAfbeelding(buf);
    if (!mime) return null;
    const { rows } = await pool.query('INSERT INTO media (mime, data, eigenaar_id) VALUES ($1, $2, NULL) RETURNING id', [mime, buf]);
    return rows[0].id;
  } catch (err) {
    console.error('[agenda-import] afbeelding ophalen mislukt:', err.message);
    return null;
  }
}

// ---- Hoofdroutine -------------------------------------------------------------
let laatste = null;
let bezig = false;

function status() { return { laatste, bezig, config: config() }; }

async function importeerAgenda({ fetchImpl = fetch } = {}) {
  if (bezig) return laatste;
  bezig = true;
  const cfg = config();
  const r = { tijdstip: new Date(), nieuw: 0, bijgewerkt: 0, ongewijzigd: 0, verwijderd: 0, overgeslagen: 0, fouten: [], bron: cfg.ics };
  try {
    const events = parseIcs(await haal(cfg.ics, { fetchImpl }));
    if (!events.length) {
      r.fouten.push('De feed bevat geen evenementen; er is niets gewijzigd.');
      return r;
    }
    const negeer = new Set((await pool.query('SELECT bron_uid FROM agenda_import_negeer WHERE bron = $1', [BRON])).rows.map((x) => x.bron_uid));
    const gezien = new Set();

    for (const ev of events) {
      gezien.add(ev.uid);
      if (negeer.has(ev.uid)) { r.overgeslagen += 1; continue; }
      const url = `${cfg.site}/evenementen/${encodeURIComponent(ev.uid)}`;
      let detail = null;
      if (cfg.detail) {
        try { detail = leesDetail(await haal(url, { fetchImpl })); }
        catch (err) { r.fouten.push(`Detailpagina ${ev.uid}: ${err.message}`); }
      }
      const siteDatum = detail && detail.datumTekst ? parseDatumTekst(detail.datumTekst) : null;
      const tijden = bepaalTijden(ev, siteDatum);
      const titel = ev.summary.replace(/\s+/g, ' ').trim().slice(0, 200);
      const omschrijving = ((detail && detail.omschrijving) || ev.description || '').trim().slice(0, 10000) || null;
      let locatie = ((detail && detail.locatie) || ev.location || '').trim().slice(0, 200) || null;
      if (locatie && /^(tbd|n\.?t\.?b\.?|nog te bepalen)$/i.test(locatie)) locatie = null;
      const afbeeldingUrl = detail && detail.afbeelding ? detail.afbeelding : null;
      const hash = crypto.createHash('sha1').update(JSON.stringify([titel, omschrijving, locatie, tijden, afbeeldingUrl])).digest('hex');

      const bestaand = (await pool.query(
        'SELECT id, bron_hash, bron_afbeelding_url, afbeelding_id FROM evenementen WHERE bron = $1 AND bron_uid = $2', [BRON, ev.uid]
      )).rows[0];

      if (!bestaand) {
        const afbId = afbeeldingUrl ? await haalAfbeeldingId(afbeeldingUrl, fetchImpl) : null;
        await pool.query(
          `INSERT INTO evenementen (titel, categorie, omschrijving, locatie, start_op, eind_op, aanmelden, hele_dag, afbeelding_id,
             bron, bron_uid, bron_url, bron_hash, bron_afbeelding_url, bron_bijgewerkt)
           VALUES ($1,$2,$3,$4,$5,$6,false,$7,$8,$9,$10,$11,$12,$13,now())`,
          [titel, raadCategorie(titel), omschrijving, locatie, tijden.start_op, tijden.eind_op, tijden.hele_dag, afbId,
           BRON, ev.uid, url, hash, afbId ? afbeeldingUrl : null]
        );
        r.nieuw += 1;
      } else if (bestaand.bron_hash === hash) {
        r.ongewijzigd += 1;
      } else {
        let afbId = bestaand.afbeelding_id;
        let afbUrl = bestaand.bron_afbeelding_url;
        if (afbeeldingUrl !== afbUrl) {
          const nieuw = afbeeldingUrl ? await haalAfbeeldingId(afbeeldingUrl, fetchImpl) : null;
          if (nieuw || !afbeeldingUrl) {
            if (afbId && afbUrl) await pool.query('DELETE FROM media WHERE id = $1 AND eigenaar_id IS NULL', [afbId]);
            afbId = nieuw;
            afbUrl = nieuw ? afbeeldingUrl : null;
          }
        }
        await pool.query(
          `UPDATE evenementen SET titel=$1, omschrijving=$2, locatie=$3, start_op=$4, eind_op=$5, hele_dag=$6, afbeelding_id=$7,
             bron_url=$8, bron_hash=$9, bron_afbeelding_url=$10, bron_bijgewerkt=now()
           WHERE id=$11`,
          [titel, omschrijving, locatie, tijden.start_op, tijden.eind_op, tijden.hele_dag, afbId, url, hash, afbUrl, bestaand.id]
        );
        r.bijgewerkt += 1;
      }
    }

    // Toekomstige evenementen die uit de bron zijn verdwenen: verwijderen (tenzij er aanmeldingen zijn)
    const nu = isoLokaal(new Date());
    const toekomstig = (await pool.query(
      'SELECT id, bron_uid, titel FROM evenementen WHERE bron = $1 AND COALESCE(eind_op, start_op) >= $2', [BRON, nu]
    )).rows;
    for (const e of toekomstig) {
      if (gezien.has(e.bron_uid)) continue;
      const aanmeldingen = (await pool.query('SELECT COUNT(*)::int AS n FROM evenement_aanmeldingen WHERE evenement_id = $1', [e.id])).rows[0].n;
      if (aanmeldingen > 0) { r.fouten.push(`"${e.titel}" staat niet meer op de bron maar heeft aanmeldingen; niet verwijderd.`); continue; }
      await pool.query('DELETE FROM evenementen WHERE id = $1', [e.id]);
      r.verwijderd += 1;
    }
    return r;
  } catch (err) {
    r.fouten.push(err.message);
    console.error('[agenda-import] mislukt:', err.message);
    return r;
  } finally {
    laatste = r;
    bezig = false;
    console.log(`[agenda-import] ${r.nieuw} nieuw, ${r.bijgewerkt} bijgewerkt, ${r.ongewijzigd} ongewijzigd, ${r.verwijderd} verwijderd${r.fouten.length ? ', fouten: ' + r.fouten.join(' | ') : ''}`);
  }
}

// Periodiek draaien (na de start en daarna elke N uur). uren = 0 zet de import uit.
function planImport() {
  const cfg = config();
  if (!cfg.uren) { console.log('[agenda-import] uitgeschakeld (AGENDA_IMPORT_UREN=0).'); return; }
  setTimeout(() => importeerAgenda().catch(() => {}), 5000).unref();
  setInterval(() => importeerAgenda().catch(() => {}), cfg.uren * 60 * 60 * 1000).unref();
  console.log(`[agenda-import] actief: elke ${cfg.uren} uur vanaf ${cfg.ics}`);
}

// Een verwijderd geïmporteerd evenement niet opnieuw importeren.
async function negeer(bronUid) {
  await pool.query('DELETE FROM agenda_import_negeer WHERE bron = $1 AND bron_uid = $2', [BRON, bronUid]);
  await pool.query('INSERT INTO agenda_import_negeer (bron, bron_uid) VALUES ($1, $2)', [BRON, bronUid]);
}
async function negeerlijstWissen() {
  await pool.query('DELETE FROM agenda_import_negeer WHERE bron = $1', [BRON]);
}
async function aantalGenegeerd() {
  return (await pool.query('SELECT COUNT(*)::int AS n FROM agenda_import_negeer WHERE bron = $1', [BRON])).rows[0].n;
}

module.exports = {
  BRON, config, importeerAgenda, planImport, status, negeer, negeerlijstWissen, aantalGenegeerd,
  // voor tests
  parseIcs, parseDatumTekst, bepaalTijden, htmlNaarTekst, leesDetail, raadCategorie, decodeEntities, urlToegestaan
};
