// Sponsorverzoeken voor militairen en veteranen.
//
// Een dagelijkse Claude-routine (zie docs/sponsor-assistent.md) zoekt het Nederlandse
// web af naar sponsor-, donatie- en steunverzoeken voor militairen en veteranen en zet
// de vondsten in de repository, op de tak `claude/sponsor-inbox` in
// data/sponsorverzoeken.json. Dit bestand wordt hier periodiek opgehaald; nieuwe
// verzoeken komen als "te controleren" in de wachtrij, waarna het bestuur/de brigade
// ze plaatst of afwijst. Afgewezen verzoeken worden niet opnieuw aangeboden.

const crypto = require('crypto');
const pool = require('../db/pool');
const { netteUrl } = require('./helpers');
const { urlToegestaan } = require('./agenda-import');
const { sendMail, mailLayout, escHtml } = require('./mail');

const BRON_ASSISTENT = 'assistent';
const BRON_HANDMATIG = 'handmatig';
const STANDAARD_INBOX = 'https://raw.githubusercontent.com/ddegraaf-max/Luchtmobiel/claude/sponsor-inbox/data/sponsorverzoeken.json';
// Bestaat de tak van de assistent (nog) niet, dan geldt hetzelfde bestand op main.
const TERUGVAL_INBOX = 'https://raw.githubusercontent.com/ddegraaf-max/Luchtmobiel/main/data/sponsorverzoeken.json';
const TIMEOUT_MS = 15000;
const MAX_TEKST = 2 * 1024 * 1024;
const MAX_ITEMS = 200;

const STATUSSEN = ['nieuw', 'geplaatst', 'afgewezen'];
const STATUS_LABEL = { nieuw: 'Te controleren', geplaatst: 'Geplaatst', afgewezen: 'Afgewezen' };
const DOELGROEPEN = ['Veteranen', 'Militairen', 'Militairen & veteranen', 'Nabestaanden & gezinnen', 'Overig'];
const BRON_LABEL = { assistent: 'Gevonden door de assistent', handmatig: 'Handmatig toegevoegd' };

function config() {
  const urenRuw = process.env.SPONSOR_IMPORT_UREN;
  const uren = urenRuw === undefined || urenRuw === '' ? 3 : Number(urenRuw);
  const terugval = process.env.SPONSOR_INBOX_TERUGVAL_URL;
  return {
    url: (process.env.SPONSOR_INBOX_URL || STANDAARD_INBOX).trim(),
    terugval: (terugval === undefined ? TERUGVAL_INBOX : terugval).trim(),
    uren: Number.isFinite(uren) && uren >= 0 ? uren : 3
  };
}

// ---- Normaliseren en ontdubbelen -------------------------------------------------
function tekst(v, max) {
  if (v === undefined || v === null) return null;
  const t = String(v).replace(/\s+/g, ' ').trim().slice(0, max);
  return t || null;
}

function meerregelig(v, max) {
  if (v === undefined || v === null) return null;
  const t = String(v).replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
  return t || null;
}

// Sleutel waarmee dezelfde pagina wordt herkend, ook met www., tracking-parameters of
// een slash aan het eind.
function normaliseerUrl(url) {
  const net = netteUrl(url);
  if (!net) return null;
  let u;
  try { u = new URL(net); } catch (e) { return null; }
  u.hash = '';
  for (const k of [...u.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$|igshid$)/i.test(k)) u.searchParams.delete(k);
  }
  u.searchParams.sort();
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const pad = u.pathname.replace(/\/+$/, '').toLowerCase();
  const zoek = u.searchParams.toString();
  return host + pad + (zoek ? '?' + zoek : '');
}

function titelSleutel(titel) {
  return String(titel || '')
    .normalize('NFD').replace(/\p{M}/gu, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function hostVan(url) {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ''); } catch (e) { return null; }
}

function bepaalDoelgroep(v) {
  if (DOELGROEPEN.includes(v)) return v;
  const t = String(v || '').toLowerCase();
  const vet = /veteraan|veteran/.test(t);
  const mil = /militair|defensie|krijgsmacht|soldaat|marinier|commando|landmacht|luchtmacht|marine/.test(t);
  if (/nabestaand|gezin|familie|kinderen|partner|weduw/.test(t)) return 'Nabestaanden & gezinnen';
  if (vet && mil) return 'Militairen & veteranen';
  if (vet) return 'Veteranen';
  if (mil) return 'Militairen';
  return 'Overig';
}

function datumOk(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : null;
}

// Zet een ruw item (uit het JSON-bestand of een formulier) om naar een schoon record.
function valideerItem(raw) {
  if (!raw || typeof raw !== 'object') return { fout: 'Onbruikbaar item (geen object).' };
  const titel = tekst(raw.titel, 200);
  if (!titel) return { fout: 'Item zonder titel overgeslagen.' };
  const url = raw.url ? netteUrl(String(raw.url)) : '';
  if (!url || !urlToegestaan(url)) return { fout: `"${titel}": geen geldig openbaar webadres.` };
  const urlSleutel = normaliseerUrl(url);
  let gepubliceerd = raw.gepubliceerd_op_bron ? new Date(raw.gepubliceerd_op_bron) : null;
  if (gepubliceerd && Number.isNaN(gepubliceerd.getTime())) gepubliceerd = null;
  return {
    item: {
      uid: tekst(raw.id || raw.uid, 120) || crypto.createHash('sha1').update(urlSleutel).digest('hex'),
      titel,
      organisatie: tekst(raw.organisatie, 150),
      samenvatting: tekst(raw.samenvatting, 300),
      omschrijving: meerregelig(raw.omschrijving, 5000),
      url,
      url_sleutel: urlSleutel,
      titel_sleutel: titelSleutel(titel),
      bron_naam: tekst(raw.bron_naam, 100) || hostVan(url),
      doelgroep: bepaalDoelgroep(raw.doelgroep),
      plaats: tekst(raw.plaats, 100),
      doelbedrag: tekst(raw.doelbedrag, 50),
      einddatum: datumOk(raw.einddatum),
      gepubliceerd_op_bron: gepubliceerd,
      zoekterm: tekst(raw.zoekterm || raw.gevonden_via, 200)
    }
  };
}

// Leest het JSON-bestand van de assistent: { bijgewerkt, items: [...] } of een kale lijst.
function leesInbox(tekstJson) {
  let data;
  try { data = JSON.parse(String(tekstJson || '')); } catch (e) { throw new Error('Het bestand van de assistent is geen geldige JSON.'); }
  const items = Array.isArray(data) ? data : (data && Array.isArray(data.items) ? data.items : null);
  if (!items) throw new Error('Het bestand van de assistent bevat geen lijst met verzoeken.');
  let bijgewerkt = data && !Array.isArray(data) && data.bijgewerkt ? new Date(data.bijgewerkt) : null;
  if (bijgewerkt && Number.isNaN(bijgewerkt.getTime())) bijgewerkt = null;
  return { bijgewerkt, items: items.slice(0, MAX_ITEMS) };
}

// ---- Database ----------------------------------------------------------------------
/**
 * Voegt verzoeken toe die nog niet bekend zijn. Een verzoek is bekend als dezelfde
 * pagina al in de database staat (ook als geplaatst of afgewezen), als de assistent
 * hetzelfde id al eerder aanbood, of als dezelfde titel van dezelfde site al bestaat.
 */
async function voegToe(items, { bron = BRON_ASSISTENT, auteurId = null, status = 'nieuw' } = {}) {
  const r = { nieuw: 0, dubbel: 0, ongeldig: 0, fouten: [], toegevoegd: [] };
  for (const raw of (Array.isArray(items) ? items : []).slice(0, MAX_ITEMS)) {
    const v = valideerItem(raw);
    if (v.fout) { r.ongeldig += 1; if (r.fouten.length < 10) r.fouten.push(v.fout); continue; }
    const it = v.item;
    const bestaand = (await pool.query(
      `SELECT id FROM sponsorverzoeken
       WHERE url_sleutel = $1 OR (bron = $2 AND bron_uid = $3) OR (titel_sleutel = $4 AND bron_naam = $5)
       LIMIT 1`,
      [it.url_sleutel, bron, it.uid, it.titel_sleutel, it.bron_naam]
    )).rows[0];
    if (bestaand) { r.dubbel += 1; continue; }
    const { rows } = await pool.query(
      `INSERT INTO sponsorverzoeken (titel, organisatie, samenvatting, omschrijving, url, url_sleutel, titel_sleutel,
         bron, bron_uid, bron_naam, doelgroep, plaats, doelbedrag, einddatum, gepubliceerd_op_bron, zoekterm, status, auteur_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING id`,
      [it.titel, it.organisatie, it.samenvatting, it.omschrijving, it.url, it.url_sleutel, it.titel_sleutel,
       bron, it.uid, it.bron_naam, it.doelgroep, it.plaats, it.doelbedrag, it.einddatum, it.gepubliceerd_op_bron, it.zoekterm,
       STATUSSEN.includes(status) ? status : 'nieuw', auteurId]
    );
    r.nieuw += 1;
    r.toegevoegd.push({ id: rows[0].id, titel: it.titel, organisatie: it.organisatie, bron_naam: it.bron_naam, doelgroep: it.doelgroep });
  }
  return r;
}

async function aantalTeControleren() {
  return (await pool.query("SELECT COUNT(*)::int AS n FROM sponsorverzoeken WHERE status = 'nieuw'")).rows[0].n;
}

// ---- Netwerk -----------------------------------------------------------------------
async function haal(url, fetchImpl = fetch) {
  if (!urlToegestaan(url)) throw new Error(`Adres niet toegestaan: ${String(url).slice(0, 120)}`);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, {
      signal: ctrl.signal, redirect: 'follow',
      headers: { 'User-Agent': 'Luchtmobiel-platform sponsor-import', 'Cache-Control': 'no-cache' }
    });
    if (res.status === 404) {
      const e = new Error('De lijst van de assistent is (nog) niet gevonden. Heeft de dagelijkse zoekronde al een keer gedraaid?');
      e.status = 404;
      throw e;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status} bij het ophalen van de lijst van de assistent.`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_TEKST) throw new Error('Het bestand van de assistent is te groot.');
    return buf.toString('utf8');
  } finally {
    clearTimeout(timer);
  }
}

// ---- Melding aan het bestuur ------------------------------------------------------
async function meldBestuur(toegevoegd) {
  const to = process.env.MAIL_BESTUUR;
  if (!to || !toegevoegd.length) return;
  const basis = (process.env.APP_URL || '').replace(/\/+$/, '');
  const lijst = toegevoegd.slice(0, 20).map((t) =>
    `<li><strong>${escHtml(t.titel)}</strong>${t.organisatie ? ' — ' + escHtml(t.organisatie) : ''}${t.bron_naam ? ' <span style="color:#8a8178;">(' + escHtml(t.bron_naam) + ')</span>' : ''}</li>`
  ).join('');
  const meer = toegevoegd.length > 20 ? `<p>… en nog ${toegevoegd.length - 20} andere.</p>` : '';
  try {
    await sendMail({
      to,
      subject: `${toegevoegd.length} nieuw${toegevoegd.length === 1 ? ' sponsorverzoek' : 'e sponsorverzoeken'} te controleren`,
      html: mailLayout('Nieuwe sponsorverzoeken gevonden',
        `<p>De assistent heeft ${toegevoegd.length === 1 ? 'een nieuw sponsorverzoek' : toegevoegd.length + ' nieuwe sponsorverzoeken'} voor militairen of veteranen gevonden. ${toegevoegd.length === 1 ? 'Het staat' : 'Ze staan'} klaar in de controlewachtrij:</p>
         <ul>${lijst}</ul>${meer}
         <p>Bekijk ${toegevoegd.length === 1 ? 'het verzoek' : 'de verzoeken'} en kies per verzoek <em>Plaatsen</em> of <em>Afwijzen</em>${basis ? `: <a href="${basis}/sponsorverzoeken/controle">${basis}/sponsorverzoeken/controle</a>` : ' onder <em>Sponsoring → Controle</em> op het platform'}.</p>`)
    });
  } catch (err) {
    console.error('[sponsor-import] melding bestuur mislukt:', err.message);
  }
}

// ---- Hoofdroutine -----------------------------------------------------------------
let laatste = null;
let bezig = false;

function status() { return { laatste, bezig, config: config() }; }

async function importeer({ fetchImpl = fetch } = {}) {
  if (bezig) return laatste;
  bezig = true;
  const cfg = config();
  const r = { tijdstip: new Date(), nieuw: 0, dubbel: 0, ongeldig: 0, aantalInBron: 0, assistentBijgewerkt: null, fouten: [], bron: cfg.url, terugval: false };
  try {
    let tekst;
    try {
      tekst = await haal(cfg.url, fetchImpl);
    } catch (err) {
      if (err.status !== 404 || !cfg.terugval) throw err;
      // Tak van de assistent bestaat nog niet: gebruik het bestand op main.
      tekst = await haal(cfg.terugval, fetchImpl);
      r.bron = cfg.terugval;
      r.terugval = true;
    }
    const inbox = leesInbox(tekst);
    r.aantalInBron = inbox.items.length;
    r.assistentBijgewerkt = inbox.bijgewerkt;
    const t = await voegToe(inbox.items, { bron: BRON_ASSISTENT });
    r.nieuw = t.nieuw; r.dubbel = t.dubbel; r.ongeldig = t.ongeldig;
    r.fouten.push(...t.fouten);
    if (t.nieuw) await meldBestuur(t.toegevoegd);
    return r;
  } catch (err) {
    r.fouten.push(err.message);
    if (err.status !== 404) console.error('[sponsor-import] mislukt:', err.message);
    return r;
  } finally {
    laatste = r;
    bezig = false;
    console.log(`[sponsor-import] ${r.nieuw} nieuw, ${r.dubbel} al bekend, ${r.ongeldig} ongeldig (${r.aantalInBron} in de lijst)${r.fouten.length ? ' — ' + r.fouten.join(' | ') : ''}`);
  }
}

// Periodiek ophalen (kort na de start en daarna elke N uur). uren = 0 zet het uit.
function planImport() {
  const cfg = config();
  if (!cfg.uren) { console.log('[sponsor-import] uitgeschakeld (SPONSOR_IMPORT_UREN=0).'); return; }
  setTimeout(() => importeer().catch(() => {}), 20000).unref();
  setInterval(() => importeer().catch(() => {}), cfg.uren * 60 * 60 * 1000).unref();
  console.log(`[sponsor-import] actief: elke ${cfg.uren} uur vanaf ${cfg.url}`);
}

module.exports = {
  BRON_ASSISTENT, BRON_HANDMATIG, STATUSSEN, STATUS_LABEL, DOELGROEPEN, BRON_LABEL,
  config, importeer, planImport, status, voegToe, aantalTeControleren,
  // voor tests en formulieren
  normaliseerUrl, titelSleutel, valideerItem, leesInbox, bepaalDoelgroep, hostVan, datumOk, meerregelig
};
