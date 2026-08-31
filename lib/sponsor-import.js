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
const { sendMail, mailLayout, mailKnop, escHtml } = require('./mail');

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

function tijdOk(s) {
  const m = typeof s === 'string' && s.trim().match(/^(\d{1,2})[:.](\d{2})$/);
  if (!m || +m[1] > 23 || +m[2] > 59) return null;
  return String(+m[1]).padStart(2, '0') + ':' + m[2];
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
      zoekterm: tekst(raw.zoekterm || raw.gevonden_via, 200),
      // Hoort het verzoek bij een evenement (sponsorloop, benefiet, mars)? Dan kan het in de agenda.
      evenement_datum: datumOk(raw.evenement_datum),
      evenement_tijd: tijdOk(raw.evenement_tijd),
      evenement_einddatum: datumOk(raw.evenement_einddatum),
      evenement_locatie: tekst(raw.evenement_locatie, 200)
    }
  };
}

// Velden die bij een al bekend, nog niet beoordeeld verzoek mogen worden aangevuld als ze leeg zijn.
const AANVULBAAR = ['organisatie', 'samenvatting', 'omschrijving', 'plaats', 'doelbedrag', 'einddatum', 'gepubliceerd_op_bron',
  'evenement_datum', 'evenement_tijd', 'evenement_einddatum', 'evenement_locatie'];

// ---- Kenmerk (RED2026001, RED2026002, ...) ------------------------------------------
const KENMERK_PREFIX = 'RED';

// Volgend vrije kenmerk voor het jaar van de gegeven datum: RED + jaar + volgnummer (3 cijfers).
async function volgendKenmerk(datum = new Date()) {
  const basis = KENMERK_PREFIX + String(datum.getFullYear());
  const { rows } = await pool.query('SELECT kenmerk FROM sponsorverzoeken WHERE kenmerk LIKE $1', [basis + '%']);
  let hoogste = 0;
  for (const r of rows) {
    const n = parseInt(String(r.kenmerk).slice(basis.length), 10);
    if (Number.isFinite(n) && n > hoogste) hoogste = n;
  }
  return basis + String(hoogste + 1).padStart(3, '0');
}

// ---- Agenda -------------------------------------------------------------------------
const BRON_AGENDA = 'sponsorverzoek';
const CATEGORIE_AGENDA = 'Sponsoractie';

/**
 * Zet een geplaatst sponsorverzoek met evenementdatum in de agenda (of werkt het bestaande
 * agenda-item bij) en haalt het weer weg als het verzoek niet meer geplaatst is, geen datum
 * heeft of niet in de agenda hoort. Geeft het id van het agenda-item terug, of null.
 */
async function synchroniseerAgenda(verzoekId, auteurId = null) {
  const v = (await pool.query('SELECT * FROM sponsorverzoeken WHERE id = $1', [verzoekId])).rows[0];
  if (!v) return null;
  const hoortInAgenda = v.status === 'geplaatst' && v.in_agenda && v.evenement_datum;
  if (!hoortInAgenda) {
    if (v.evenement_id) {
      await pool.query('DELETE FROM evenementen WHERE id = $1 AND bron = $2', [v.evenement_id, BRON_AGENDA]);
      await pool.query('UPDATE sponsorverzoeken SET evenement_id = NULL WHERE id = $1', [v.id]);
    }
    return null;
  }
  const heleDag = !v.evenement_tijd;
  const start_op = v.evenement_datum + 'T' + (v.evenement_tijd || '00:00');
  const laatsteDag = v.evenement_einddatum && v.evenement_einddatum >= v.evenement_datum ? v.evenement_einddatum : null;
  const eind_op = laatsteDag ? laatsteDag + 'T23:59' : (heleDag ? v.evenement_datum + 'T23:59' : null);
  const omschrijving = [v.samenvatting, v.omschrijving, v.url ? 'Meer informatie, sponsoren of doneren: ' + v.url : null,
    v.kenmerk ? 'Kenmerk sponsorverzoek: ' + v.kenmerk : null]
    .filter(Boolean).join('\n\n').slice(0, 10000) || null;
  const locatie = v.evenement_locatie || v.plaats || null;
  const velden = [v.titel, omschrijving, locatie, start_op, eind_op, heleDag, v.url || null, String(v.id)];

  let evId = v.evenement_id;
  if (evId) {
    const r = await pool.query(
      `UPDATE evenementen SET titel=$1, omschrijving=$2, locatie=$3, start_op=$4, eind_op=$5, hele_dag=$6, bron_url=$7, bron_uid=$8, bron_bijgewerkt=now()
       WHERE id=$9 AND bron=$10 RETURNING id`, [...velden, evId, BRON_AGENDA]
    );
    if (!r.rows.length) evId = null; // agenda-item is intussen verwijderd of van iemand anders
  }
  if (!evId) {
    const r = await pool.query(
      `INSERT INTO evenementen (titel, omschrijving, locatie, start_op, eind_op, hele_dag, bron_url, bron_uid, bron, categorie, aanmelden, auteur_id, bron_bijgewerkt)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,$11,now()) RETURNING id`, [...velden, BRON_AGENDA, CATEGORIE_AGENDA, auteurId]
    );
    evId = r.rows[0].id;
    await pool.query('UPDATE sponsorverzoeken SET evenement_id = $1 WHERE id = $2', [evId, v.id]);
  }
  return evId;
}

// Agenda-item van een verzoek weghalen (bij verwijderen van het verzoek).
async function verwijderUitAgenda(verzoek) {
  if (verzoek && verzoek.evenement_id) {
    await pool.query('DELETE FROM evenementen WHERE id = $1 AND bron = $2', [verzoek.evenement_id, BRON_AGENDA]);
  }
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
  const r = { nieuw: 0, dubbel: 0, aangevuld: 0, ongeldig: 0, fouten: [], toegevoegd: [] };
  for (const raw of (Array.isArray(items) ? items : []).slice(0, MAX_ITEMS)) {
    const v = valideerItem(raw);
    if (v.fout) { r.ongeldig += 1; if (r.fouten.length < 10) r.fouten.push(v.fout); continue; }
    const it = v.item;
    const bestaand = (await pool.query(
      `SELECT * FROM sponsorverzoeken
       WHERE url_sleutel = $1 OR (bron = $2 AND bron_uid = $3) OR (titel_sleutel = $4 AND bron_naam = $5)
       LIMIT 1`,
      [it.url_sleutel, bron, it.uid, it.titel_sleutel, it.bron_naam]
    )).rows[0];
    if (bestaand) {
      r.dubbel += 1;
      // Nog niet beoordeeld: lege velden aanvullen met wat de bron nu wél weet (nooit overschrijven).
      if (bestaand.status === 'nieuw') {
        const leeg = AANVULBAAR.filter((k) => (bestaand[k] === null || bestaand[k] === undefined || bestaand[k] === '') && it[k] !== null && it[k] !== undefined);
        if (leeg.length) {
          await pool.query(
            `UPDATE sponsorverzoeken SET ${leeg.map((k, i) => `${k} = $${i + 1}`).join(', ')}, bijgewerkt = now() WHERE id = $${leeg.length + 1}`,
            [...leeg.map((k) => it[k]), bestaand.id]
          );
          r.aangevuld += 1;
        }
      }
      continue;
    }
    const kenmerk = await volgendKenmerk();
    const { rows } = await pool.query(
      `INSERT INTO sponsorverzoeken (titel, organisatie, samenvatting, omschrijving, url, url_sleutel, titel_sleutel,
         bron, bron_uid, bron_naam, doelgroep, plaats, doelbedrag, einddatum, gepubliceerd_op_bron, zoekterm, status, auteur_id,
         evenement_datum, evenement_tijd, evenement_einddatum, evenement_locatie, kenmerk)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23) RETURNING id`,
      [it.titel, it.organisatie, it.samenvatting, it.omschrijving, it.url, it.url_sleutel, it.titel_sleutel,
       bron, it.uid, it.bron_naam, it.doelgroep, it.plaats, it.doelbedrag, it.einddatum, it.gepubliceerd_op_bron, it.zoekterm,
       STATUSSEN.includes(status) ? status : 'nieuw', auteurId,
       it.evenement_datum, it.evenement_tijd, it.evenement_einddatum, it.evenement_locatie, kenmerk]
    );
    r.nieuw += 1;
    r.toegevoegd.push({ id: rows[0].id, kenmerk, titel: it.titel, organisatie: it.organisatie, bron_naam: it.bron_naam, doelgroep: it.doelgroep });
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
    `<li>${t.kenmerk ? '<span style="color:#8a8178;">' + escHtml(t.kenmerk) + '</span> ' : ''}<strong>${escHtml(t.titel)}</strong>${t.organisatie ? ' — ' + escHtml(t.organisatie) : ''}${t.bron_naam ? ' <span style="color:#8a8178;">(' + escHtml(t.bron_naam) + ')</span>' : ''}</li>`
  ).join('');
  const meer = toegevoegd.length > 20 ? `<p>… en nog ${toegevoegd.length - 20} andere.</p>` : '';
  try {
    await sendMail({
      to,
      subject: `${toegevoegd.length} nieuw${toegevoegd.length === 1 ? ' sponsorverzoek' : 'e sponsorverzoeken'} te controleren`,
      html: mailLayout('Nieuwe sponsorverzoeken gevonden',
        `<p>De assistent heeft ${toegevoegd.length === 1 ? 'een nieuw sponsorverzoek' : toegevoegd.length + ' nieuwe sponsorverzoeken'} voor militairen of veteranen gevonden. ${toegevoegd.length === 1 ? 'Het staat' : 'Ze staan'} klaar in de controlewachtrij:</p>
         <ul>${lijst}</ul>${meer}
         <p>Bekijk ${toegevoegd.length === 1 ? 'het verzoek' : 'de verzoeken'} en kies per verzoek <em>Plaatsen</em> of <em>Afwijzen</em>.</p>
         ${mailKnop((basis || 'https://luchtmobiel.red') + '/sponsorverzoeken/controle', 'Naar de controlewachtrij')}`,
        { voorproefje: toegevoegd.slice(0, 3).map((t) => t.titel).join(' · ') })
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
    // Twee bronnen: de lijst van de assistent (eigen tak) en hetzelfde bestand op main
    // (startlijst / handmatig aangevuld). Beide worden gelezen en samengevoegd; alleen als
    // geen van beide bereikbaar is, is dat een fout.
    const bronnen = [cfg.url];
    if (cfg.terugval && cfg.terugval !== cfg.url) bronnen.push(cfg.terugval);
    const items = [];
    const meldingen = [];
    let gelezen = 0;
    for (const bron of bronnen) {
      try {
        const inbox = leesInbox(await haal(bron, fetchImpl));
        gelezen += 1;
        items.push(...inbox.items);
        if (bron === cfg.url) r.assistentBijgewerkt = inbox.bijgewerkt;
        else r.terugval = true;
      } catch (err) {
        meldingen.push(err);
      }
    }
    if (!gelezen) throw meldingen[0];
    // Alleen melden wat de lijst van de assistent zelf betreft (main is een aanvulling).
    for (const err of meldingen) if (err.status !== 404) r.fouten.push(err.message);
    if (!r.assistentBijgewerkt && meldingen.some((e) => e.status === 404)) r.bron = cfg.terugval;
    r.aantalInBron = items.length;
    const t = await voegToe(items, { bron: BRON_ASSISTENT });
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
  BRON_ASSISTENT, BRON_HANDMATIG, BRON_AGENDA, CATEGORIE_AGENDA, STATUSSEN, STATUS_LABEL, DOELGROEPEN, BRON_LABEL,
  config, importeer, planImport, status, voegToe, aantalTeControleren, synchroniseerAgenda, verwijderUitAgenda, volgendKenmerk,
  // voor tests en formulieren
  normaliseerUrl, titelSleutel, valideerItem, leesInbox, bepaalDoelgroep, hostVan, datumOk, tijdOk, meerregelig
};
