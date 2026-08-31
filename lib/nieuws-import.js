// Automatische nieuws-import vanaf de hoofdsite van de Business Club (bclmb.nl, Congressus),
// net als de agenda-import: de nieuwsberichten (/service/nieuws) en blogs (/service/blog)
// worden overgenomen met titel, tekst, datum en hoofdafbeelding. Berichten worden herkend
// aan hun adres; wijzigt de bron, dan wordt het bericht hier bijgewerkt. Verwijderde
// berichten worden niet opnieuw geïmporteerd (negeerlijst), oude berichten blijven staan.

const crypto = require('crypto');
const pool = require('../db/pool');
const { isoLokaal } = require('./helpers');
const agenda = require('./agenda-import');

const BRON = 'bclmb';
const NEGEER_BRON = 'bclmb-nieuws';
const STANDAARD_SITE = 'https://www.bclmb.nl';
// LinkedIn-berichten van de brigade (en de club), verzameld door de dagelijkse assistent
const LINKEDIN_BRON = 'linkedin';
const LINKEDIN_NEGEER = 'linkedin-nieuws';
const LINKEDIN_BRONNEN = [
  'https://raw.githubusercontent.com/ddegraaf-max/Luchtmobiel/claude/sponsor-inbox/data/linkedin-nieuws.json',
  'https://raw.githubusercontent.com/ddegraaf-max/Luchtmobiel/main/data/linkedin-nieuws.json'
];
const LIJSTEN = [
  { soort: 'nieuws', pad: '/service/nieuws', categorie: 'Nieuws' },
  { soort: 'blog', pad: '/service/blog', categorie: 'Blog' }
];
const MAX_PER_LIJST = 30;

function config() {
  const urenRuw = process.env.NIEUWS_IMPORT_UREN;
  const uren = urenRuw === undefined || urenRuw === '' ? 6 : Number(urenRuw);
  return {
    site: (process.env.NIEUWS_BRON_SITE || STANDAARD_SITE).trim().replace(/\/+$/, ''),
    uren: Number.isFinite(uren) && uren >= 0 ? uren : 6,
    blog: process.env.NIEUWS_IMPORT_BLOG !== '0',
    linkedin: process.env.NIEUWS_IMPORT_LINKEDIN !== '0'
  };
}

// "…activity-7040989309109202944-UAp3" -> "activity-7040989309109202944"
function linkedinActiviteitId(url) {
  const m = String(url || '').match(/activity[-:](\d{10,25})/i);
  return m ? 'activity-' + m[1] : null;
}

// Ruw LinkedIn-item uit het bestand van de assistent -> schoon record (of null).
function valideerLinkedInItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const url = agenda.decodeEntities(String(raw.url || '').trim());
  let host;
  try { host = new URL(url).hostname.toLowerCase(); } catch (e) { return null; }
  if (!/(^|\.)linkedin\.com$/.test(host)) return null;
  const uid = (String(raw.id || '').trim() || linkedinActiviteitId(url) || '').slice(0, 120);
  if (!uid) return null;
  const titel = (String(raw.titel || '').replace(/\s+/g, ' ').trim() || 'Bericht op LinkedIn').slice(0, 200);
  const tekst = String(raw.tekst || '').replace(/\r\n?/g, '\n').trim().slice(0, 2000) || null;
  let datum = raw.datum ? new Date(raw.datum) : null;
  if (datum && Number.isNaN(datum.getTime())) datum = null;
  const pagina = String(raw.pagina || '').replace(/\s+/g, ' ').trim().slice(0, 100) || null;
  return { uid, titel, tekst, url, datum, pagina };
}

// ---- Parsen ---------------------------------------------------------------------------

// Alle artikel-adressen op een overzichtspagina: /service/<soort>/<slug> (geen category/author/pagina's).
function leesLijst(html, soort) {
  const re = new RegExp(`href="(?:https?://[^/"]+)?/service/${soort}/([a-z0-9][a-z0-9_-]*)"`, 'gi');
  const uit = [];
  const gezien = new Set();
  let m;
  while ((m = re.exec(String(html || '')))) {
    const slug = m[1].toLowerCase();
    if (gezien.has(slug)) continue;
    gezien.add(slug);
    uit.push(slug);
  }
  return uit;
}

// "2025-11-27 16:57:00" (Amsterdamse wandkloktijd van de bron) -> Date
function amsterdamNaarDate(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (!m) return null;
  const [y, mo, d, h, mi] = [+m[1], +m[2], +m[3], +m[4], +m[5]];
  const gewenst = Date.UTC(y, mo - 1, d, h, mi);
  let t = gewenst;
  for (let i = 0; i < 2; i++) {
    const lok = isoLokaal(new Date(t)); // wandkloktijd Amsterdam van t
    const isNu = Date.UTC(+lok.slice(0, 4), +lok.slice(5, 7) - 1, +lok.slice(8, 10), +lok.slice(11, 13), +lok.slice(14, 16));
    if (isNu === gewenst) break;
    t -= isNu - gewenst;
  }
  return new Date(t);
}

function ogTag(html, naam) {
  const m = html.match(new RegExp(`<meta property="og:${naam}" content="([^"]*)"`, 'i'));
  return m ? agenda.decodeEntities(m[1]).trim() : null;
}

function eerste(...indices) {
  const geldig = indices.filter((i) => i >= 0);
  return geldig.length ? Math.min(...geldig) : -1;
}

// Leest een artikelpagina (nieuws of blog): titel, datum, afbeeldingen, tekst, auteur, categorie.
function leesArtikel(html, soort) {
  const h = String(html || '').replace(/\r\n?/g, '\n');
  let titel = ogTag(h, 'title');
  let inhoudHtml = '';
  let auteur = null;
  let categorie = null;
  let kop = '';

  if (soort === 'blog') {
    const k = h.indexOf('class="blog-header"');
    const s = h.indexOf('class="blog-text');
    if (k >= 0) kop = h.slice(k, s > k ? s : k + 3000);
    if (s >= 0) {
      const start = h.indexOf('>', s) + 1;
      const eind = eerste(h.indexOf('class="blog-content-box"', start), h.indexOf('class="comments-container"', start), h.indexOf('class="blog-teaser', start));
      inhoudHtml = h.slice(start, eind > start ? h.lastIndexOf('<', eind) : undefined);
    }
    const a = kop.match(/href="\/service\/blog\/author\/[^"]*"[^>]*>([^<]+)</i);
    if (a) auteur = agenda.stripTags(a[1]) || null;
    const c = kop.match(/href="\/service\/blog\/category\/[^"]*"[^>]*>([^<]+)</i);
    if (c) categorie = agenda.stripTags(c[1]) || null;
    if (!titel) { const t = kop.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i); if (t) titel = agenda.stripTags(t[1]); }
  } else {
    const s = h.indexOf('paragraph-text');
    if (s >= 0) {
      const start = h.indexOf('>', s) + 1;
      const eind = eerste(h.indexOf('paragraph-text', start), h.indexOf('class="comments-container"', start));
      inhoudHtml = h.slice(start, eind > start ? h.lastIndexOf('<', eind) : undefined);
    }
    kop = inhoudHtml;
  }

  const tm = (kop || inhoudHtml || h).match(/<time[^>]*data-datetime="([^"]+)"/i);
  const datum = tm ? amsterdamNaarDate(tm[1]) : null;

  const afbeeldingen = [...inhoudHtml.matchAll(/<img[^>]+src="([^"]+)"/gi)].map((m) => agenda.decodeEntities(m[1]));
  const ogImg = ogTag(h, 'image');
  if (!afbeeldingen.length && ogImg) afbeeldingen.push(ogImg);

  // Witruimte in de bron-HTML is alleen opmaak (inspringing, regeleinden tussen tags): eerst samenvouwen,
  // anders komen er losse regeleinden in opsommingen en na <br> terecht.
  let schoon = inhoudHtml
    .replace(/\s+/g, ' ')
    .replace(/<ol class="carousel-indicators">[\s\S]*?<\/ol>/gi, '')
    .replace(/<a class="(?:left|right) carousel-control"[\s\S]*?<\/a>/gi, '')
    .replace(/<ul class="list-unstyled[^"]*">[\s\S]*?<\/ul>/gi, '');
  const kopTitel = schoon.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
  if (kopTitel && (!titel || agenda.stripTags(kopTitel[1]) === titel)) {
    if (!titel) titel = agenda.stripTags(kopTitel[1]);
    schoon = schoon.replace(kopTitel[0], '');
  }
  const tekst = agenda.htmlNaarTekst(schoon);
  return { titel: titel ? titel.replace(/\s+/g, ' ').trim() : null, datum, afbeeldingen, tekst, auteur, categorie };
}

// ---- Hoofdroutine ---------------------------------------------------------------------
let laatste = null;
let bezig = false;

function status() { return { laatste, bezig, config: config() }; }

async function importeerNieuws({ fetchImpl = fetch } = {}) {
  if (bezig) return laatste;
  bezig = true;
  const cfg = config();
  const r = { tijdstip: new Date(), nieuw: 0, bijgewerkt: 0, ongewijzigd: 0, overgeslagen: 0, fouten: [], bron: cfg.site };
  try {
    const negeer = new Set((await pool.query('SELECT bron_uid FROM agenda_import_negeer WHERE bron = $1', [NEGEER_BRON])).rows.map((x) => x.bron_uid));
    for (const lijst of LIJSTEN) {
      if (lijst.soort === 'blog' && !cfg.blog) continue;
      let slugs;
      try {
        slugs = leesLijst(await agenda.haal(cfg.site + lijst.pad, { fetchImpl }), lijst.soort);
      } catch (err) {
        r.fouten.push(`${lijst.categorie}: ${err.message}`);
        continue;
      }
      for (const slug of slugs.slice(0, MAX_PER_LIJST)) {
        const uid = `${lijst.soort}/${slug}`;
        if (negeer.has(uid)) { r.overgeslagen += 1; continue; }
        const url = `${cfg.site}${lijst.pad}/${slug}`;
        let art;
        try {
          art = leesArtikel(await agenda.haal(url, { fetchImpl }), lijst.soort);
        } catch (err) {
          r.fouten.push(`${uid}: ${err.message}`);
          continue;
        }
        if (!art.titel) { r.fouten.push(`${uid}: geen titel gevonden`); continue; }

        const titel = art.titel.slice(0, 200);
        const auteurRegel = art.auteur && !art.tekst.includes(art.auteur) ? `Door ${art.auteur}` : null;
        const inhoud = [art.tekst, auteurRegel].filter(Boolean).join('\n\n').slice(0, 20000) || null;
        const categorie = lijst.soort === 'blog' ? (art.categorie ? `Blog · ${art.categorie}` : 'Blog') : lijst.categorie;
        const afbUrl = art.afbeeldingen[0] || null;
        const hash = crypto.createHash('sha1').update(JSON.stringify([titel, inhoud, art.datum ? art.datum.toISOString() : null, afbUrl, categorie])).digest('hex');

        const bestaand = (await pool.query(
          'SELECT id, bron_hash, bron_afbeelding_url, afbeelding_id, aangemaakt FROM nieuws WHERE bron = $1 AND bron_uid = $2', [BRON, uid]
        )).rows[0];

        if (!bestaand) {
          const afbId = afbUrl ? await agenda.haalAfbeeldingId(afbUrl, fetchImpl) : null;
          await pool.query(
            `INSERT INTO nieuws (titel, inhoud, gepubliceerd, auteur_id, aangemaakt, bijgewerkt, categorie, afbeelding_id,
               bron, bron_uid, bron_url, bron_hash, bron_afbeelding_url, bron_bijgewerkt)
             VALUES ($1,$2,true,NULL,$3,now(),$4,$5,$6,$7,$8,$9,$10,now())`,
            [titel, inhoud, art.datum || new Date(), categorie, afbId, BRON, uid, url, hash, afbId ? afbUrl : null]
          );
          r.nieuw += 1;
        } else if (bestaand.bron_hash === hash) {
          r.ongewijzigd += 1;
        } else {
          let afbId = bestaand.afbeelding_id;
          let oudUrl = bestaand.bron_afbeelding_url;
          if (afbUrl !== oudUrl) {
            const nieuw = afbUrl ? await agenda.haalAfbeeldingId(afbUrl, fetchImpl) : null;
            if (nieuw || !afbUrl) {
              if (afbId && oudUrl) await pool.query('DELETE FROM media WHERE id = $1 AND eigenaar_id IS NULL', [afbId]);
              afbId = nieuw;
              oudUrl = nieuw ? afbUrl : null;
            }
          }
          await pool.query(
            `UPDATE nieuws SET titel=$1, inhoud=$2, categorie=$3, afbeelding_id=$4, aangemaakt=$5, bron_url=$6, bron_hash=$7,
               bron_afbeelding_url=$8, bron_bijgewerkt=now(), bijgewerkt=now() WHERE id=$9`,
            [titel, inhoud, categorie, afbId, art.datum || bestaand.aangemaakt, url, hash, oudUrl, bestaand.id]
          );
          r.bijgewerkt += 1;
        }
      }
    }
    // LinkedIn-berichten uit het bestand van de assistent (tak claude/sponsor-inbox, terugval main)
    if (cfg.linkedin) {
      const negeerLi = new Set((await pool.query('SELECT bron_uid FROM agenda_import_negeer WHERE bron = $1', [LINKEDIN_NEGEER])).rows.map((x) => x.bron_uid));
      const liItems = [];
      for (const bronUrl of LINKEDIN_BRONNEN) {
        try {
          const data = JSON.parse(await agenda.haal(bronUrl, { fetchImpl }));
          if (data && Array.isArray(data.items)) liItems.push(...data.items);
        } catch (err) {
          if (err.status !== 404) r.fouten.push(`LinkedIn: ${err.message}`);
        }
      }
      for (const raw of liItems.slice(0, 60)) {
        const it = valideerLinkedInItem(raw);
        if (!it) continue;
        if (negeerLi.has(it.uid)) { r.overgeslagen += 1; continue; }
        const bestaat = (await pool.query('SELECT id FROM nieuws WHERE bron = $1 AND bron_uid = $2', [LINKEDIN_BRON, it.uid])).rows[0];
        if (bestaat) { r.ongewijzigd += 1; continue; }
        const inhoud = [it.tekst, 'Bekijk het volledige bericht — met foto’s, video en reacties — op LinkedIn.'].filter(Boolean).join('\n\n');
        await pool.query(
          `INSERT INTO nieuws (titel, inhoud, gepubliceerd, auteur_id, aangemaakt, bijgewerkt, categorie, bron, bron_uid, bron_url, bron_bijgewerkt)
           VALUES ($1,$2,true,NULL,$3,now(),$4,$5,$6,$7,now())`,
          [it.titel, inhoud, it.datum || new Date(), it.pagina ? `LinkedIn · ${it.pagina}` : 'LinkedIn', LINKEDIN_BRON, it.uid, it.url]
        );
        r.nieuw += 1;
      }
    }
    return r;
  } catch (err) {
    r.fouten.push(err.message);
    console.error('[nieuws-import] mislukt:', err.message);
    return r;
  } finally {
    laatste = r;
    bezig = false;
    console.log(`[nieuws-import] ${r.nieuw} nieuw, ${r.bijgewerkt} bijgewerkt, ${r.ongewijzigd} ongewijzigd${r.overgeslagen ? ', ' + r.overgeslagen + ' genegeerd' : ''}${r.fouten.length ? ', fouten: ' + r.fouten.join(' | ') : ''}`);
  }
}

// Periodiek draaien (na de start en daarna elke N uur). uren = 0 zet de import uit.
function planImport() {
  const cfg = config();
  if (!cfg.uren) { console.log('[nieuws-import] uitgeschakeld (NIEUWS_IMPORT_UREN=0).'); return; }
  setTimeout(() => importeerNieuws().catch(() => {}), 12000).unref();
  setInterval(() => importeerNieuws().catch(() => {}), cfg.uren * 60 * 60 * 1000).unref();
  console.log(`[nieuws-import] actief: elke ${cfg.uren} uur vanaf ${cfg.site}`);
}

// Een verwijderd geïmporteerd bericht niet opnieuw importeren (bclmb of LinkedIn).
async function negeer(bronUid, welkeBron = NEGEER_BRON) {
  await pool.query('DELETE FROM agenda_import_negeer WHERE bron = $1 AND bron_uid = $2', [welkeBron, bronUid]);
  await pool.query('INSERT INTO agenda_import_negeer (bron, bron_uid) VALUES ($1, $2)', [welkeBron, bronUid]);
}
async function negeerlijstWissen() {
  await pool.query('DELETE FROM agenda_import_negeer WHERE bron = $1 OR bron = $2', [NEGEER_BRON, LINKEDIN_NEGEER]);
}
async function aantalGenegeerd() {
  return (await pool.query('SELECT COUNT(*)::int AS n FROM agenda_import_negeer WHERE bron = $1 OR bron = $2', [NEGEER_BRON, LINKEDIN_NEGEER])).rows[0].n;
}

module.exports = {
  BRON, LINKEDIN_BRON, LINKEDIN_NEGEER, config, importeerNieuws, planImport, status, negeer, negeerlijstWissen, aantalGenegeerd,
  // voor tests
  leesLijst, leesArtikel, amsterdamNaarDate, linkedinActiviteitId, valideerLinkedInItem
};
