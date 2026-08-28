// Mijn profiel: persoonlijke gegevens, meerdere bedrijven (met eigen logo),
// expertise, achtergrond bij Defensie en zichtbaarheid van contactgegevens.

const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { requireLogin } = require('../middleware/auth');
const { netteUrl, isEmail, tags } = require('../lib/helpers');
const { afbeeldingen, bewaarAfbeelding } = require('../lib/upload');

const uploads = afbeeldingen({ maxMb: 2, maxBestanden: 12 });
const DEFENSIE = ['Veteraan', 'Actief dienend', 'Reservist', 'Oud-militair', 'Geen / anders'];
const MAX_BEDRIJVEN = 10;

function tekst(v, max) {
  const t = typeof v === 'string' ? v.trim().slice(0, max) : '';
  return t || null;
}

async function haalBedrijven(uid, db = pool) {
  return (await db.query(
    'SELECT * FROM bedrijven WHERE user_id = $1 ORDER BY hoofd DESC, volgorde ASC, id ASC', [uid]
  )).rows;
}

function toon(res, { profiel, bedrijven, fout = null, status = 200 }) {
  res.status(status).render('leden/profiel', { title: 'Mijn profiel', profiel, bedrijven, fout, defensieOpties: DEFENSIE });
}

// ---- Formulier uitlezen -------------------------------------------------------
function leesProfiel(body, huidig) {
  const contact = tekst(body.contact_email, 200);
  const w = {
    naam: tekst(body.naam, 120) || huidig.naam,
    telefoon: tekst(body.telefoon, 40),
    contact_email: contact ? contact.toLowerCase() : null,
    linkedin: tekst(body.linkedin, 300) ? netteUrl(body.linkedin) || null : null,
    plaats: tekst(body.plaats, 120),
    bio: tekst(body.bio, 4000),
    expertise: tags(body.expertise).join(', ') || null,
    aanbod: tekst(body.aanbod, 2000),
    vraag: tekst(body.vraag, 2000),
    defensie_relatie: DEFENSIE.includes(body.defensie_relatie) ? body.defensie_relatie : null,
    defensie_toelichting: tekst(body.defensie_toelichting, 500),
    toon_telefoon: body.toon_telefoon === 'on',
    toon_email: body.toon_email === 'on'
  };
  const fout = w.contact_email && !isEmail(w.contact_email) ? 'Het contact-e-mailadres is ongeldig.' : null;
  return { waarden: w, fout };
}

// Bedrijfsblokken heten bedrijf_<i>_<veld>; blokken zonder naam worden genegeerd.
function leesBedrijven(body, files) {
  const indexen = new Set();
  for (const k of Object.keys(body || {})) {
    const m = k.match(/^bedrijf_(\d{1,3})_naam$/);
    if (m) indexen.add(Number(m[1]));
  }
  const lijst = [];
  for (const i of [...indexen].sort((a, b) => a - b)) {
    const v = (veld, max) => tekst(body[`bedrijf_${i}_${veld}`], max);
    const naam = v('naam', 150);
    if (!naam) continue;
    const idRuw = body[`bedrijf_${i}_id`];
    const email = v('email', 200);
    lijst.push({
      index: i,
      id: typeof idRuw === 'string' && /^\d{1,9}$/.test(idRuw) ? Number(idRuw) : null,
      naam,
      functie: v('functie', 120),
      branche: v('branche', 120),
      omschrijving: v('omschrijving', 2000),
      website: v('website', 300) ? netteUrl(body[`bedrijf_${i}_website`]) || null : null,
      email: email && isEmail(email) ? email.toLowerCase() : null,
      telefoon: v('telefoon', 40),
      adres: v('adres', 200),
      postcode: v('postcode', 20),
      plaats: v('plaats', 120),
      kvk: v('kvk', 20),
      linkedin: v('linkedin', 300) ? netteUrl(body[`bedrijf_${i}_linkedin`]) || null : null,
      hoofd: String(body.hoofdbedrijf) === String(i),
      logoVerwijderen: body[`bedrijf_${i}_logo_verwijderen`] === 'on',
      logo: (files || []).find((f) => f.fieldname === `bedrijf_${i}_logo`) || null
    });
    if (lijst.length >= MAX_BEDRIJVEN) break;
  }
  if (lijst.length && !lijst.some((b) => b.hoofd)) lijst[0].hoofd = true;
  return lijst;
}

// ---- Routes -------------------------------------------------------------------
router.get('/', requireLogin, async (req, res) => {
  const uid = req.session.user.id;
  const profiel = (await pool.query('SELECT * FROM users WHERE id = $1', [uid])).rows[0];
  const bedrijven = await haalBedrijven(uid);
  toon(res, { profiel, bedrijven });
});

router.post('/', requireLogin, uploads, async (req, res) => {
  const uid = req.session.user.id;
  const huidig = (await pool.query('SELECT * FROM users WHERE id = $1', [uid])).rows[0];
  const bestaand = await haalBedrijven(uid);
  const perId = new Map(bestaand.map((b) => [b.id, b]));

  const p = leesProfiel(req.body, huidig);
  const lijst = leesBedrijven(req.body, req.files);
  const fout = req.uploadFout || p.fout;
  if (fout) {
    return toon(res, {
      profiel: { ...huidig, ...p.waarden },
      bedrijven: lijst.map((b) => ({ ...b, logo_id: b.id && perId.has(b.id) ? perId.get(b.id).logo_id : null })),
      fout, status: 400
    });
  }

  const client = await pool.connect();
  const opruimen = []; // media-id's die na afloop weg mogen
  try {
    await client.query('BEGIN');

    // Persoonlijke foto
    const nieuweFoto = await bewaarAfbeelding((req.files || []).find((f) => f.fieldname === 'foto'), uid, client, { besloten: true });
    let fotoId = huidig.foto_id;
    if (nieuweFoto) fotoId = nieuweFoto;
    else if (req.body.foto_verwijderen === 'on') fotoId = null;
    if (huidig.foto_id && fotoId !== huidig.foto_id) opruimen.push(huidig.foto_id);

    const w = p.waarden;
    await client.query(
      `UPDATE users SET naam=$1, telefoon=$2, contact_email=$3, linkedin=$4, plaats=$5, bio=$6, expertise=$7, aanbod=$8, vraag=$9,
         defensie_relatie=$10, defensie_toelichting=$11, toon_telefoon=$12, toon_email=$13, foto_id=$14
       WHERE id=$15`,
      [w.naam, w.telefoon, w.contact_email, w.linkedin, w.plaats, w.bio, w.expertise, w.aanbod, w.vraag,
       w.defensie_relatie, w.defensie_toelichting, w.toon_telefoon, w.toon_email, fotoId, uid]
    );

    // Bedrijven: bijwerken, toevoegen, verwijderen
    const behouden = new Set();
    let volgorde = 0;
    for (const b of lijst) {
      const nieuwLogo = await bewaarAfbeelding(b.logo, uid, client, { besloten: true });
      const velden = [b.naam, b.functie, b.branche, b.omschrijving, b.website, b.email, b.telefoon, b.adres, b.postcode, b.plaats, b.kvk, b.linkedin];
      if (b.id && perId.has(b.id)) {
        const oud = perId.get(b.id);
        const logoId = nieuwLogo || (b.logoVerwijderen ? null : oud.logo_id);
        await client.query(
          `UPDATE bedrijven SET naam=$1, functie=$2, branche=$3, omschrijving=$4, website=$5, email=$6, telefoon=$7, adres=$8,
             postcode=$9, plaats=$10, kvk=$11, linkedin=$12, logo_id=$13, hoofd=$14, volgorde=$15
           WHERE id=$16 AND user_id=$17`,
          [...velden, logoId, b.hoofd, volgorde, b.id, uid]
        );
        if (oud.logo_id && logoId !== oud.logo_id) opruimen.push(oud.logo_id);
        behouden.add(b.id);
      } else {
        const r = await client.query(
          `INSERT INTO bedrijven (user_id, naam, functie, branche, omschrijving, website, email, telefoon, adres, postcode, plaats, kvk, linkedin, logo_id, hoofd, volgorde)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
          [uid, ...velden, nieuwLogo, b.hoofd, volgorde]
        );
        behouden.add(r.rows[0].id);
      }
      volgorde += 1;
    }
    for (const oud of bestaand) {
      if (behouden.has(oud.id)) continue;
      await client.query('DELETE FROM bedrijven WHERE id = $1 AND user_id = $2', [oud.id, uid]);
      if (oud.logo_id) opruimen.push(oud.logo_id);
    }

    // Hoofdbedrijf doorzetten naar de samenvatting op het profiel (ledengids, dashboard)
    const hoofd = (await client.query(
      'SELECT naam, functie, branche, website, logo_id FROM bedrijven WHERE user_id = $1 ORDER BY hoofd DESC, volgorde ASC, id ASC LIMIT 1', [uid]
    )).rows[0] || null;
    await client.query(
      'UPDATE users SET bedrijf=$1, functie=$2, branche=$3, website=$4, logo_id=$5 WHERE id=$6',
      [hoofd ? hoofd.naam : null, hoofd ? hoofd.functie : null, hoofd ? hoofd.branche : null, hoofd ? hoofd.website : null, hoofd ? hoofd.logo_id : null, uid]
    );

    // Oude afbeeldingen opruimen (pas nu: nergens meer naar verwezen)
    for (const mediaId of opruimen) {
      await client.query('DELETE FROM media WHERE id = $1 AND eigenaar_id = $2', [mediaId, uid]);
    }
    await client.query('COMMIT');

    req.session.flash = { type: 'succes', message: 'Je profiel is opgeslagen.' };
    res.redirect('/profiel');
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) { /* al afgebroken */ }
    console.error('[profiel opslaan]', err.message);
    req.session.flash = { type: 'fout', message: 'Opslaan mislukt. Probeer het opnieuw.' };
    res.redirect('/profiel');
  } finally {
    client.release();
  }
});

module.exports = router;
module.exports.DEFENSIE = DEFENSIE;
