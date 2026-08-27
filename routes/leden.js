const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { requireLogin, idParams } = require('../middleware/auth');
const { tags } = require('../lib/helpers');

idParams(router);

const leeg = (v) => (typeof v === 'string' ? v.trim() : '');
const bevat = (waarde, zoek) => typeof waarde === 'string' && waarde.toLowerCase().includes(zoek);

// Bedrijven per lid groeperen (hoofdbedrijf eerst)
async function bedrijvenPerLid() {
  const per = {};
  const { rows } = await pool.query('SELECT * FROM bedrijven ORDER BY hoofd DESC, volgorde ASC, id ASC');
  for (const b of rows) (per[b.user_id] = per[b.user_id] || []).push(b);
  return per;
}

// Ledengids (besloten). Filteren gebeurt in JS: ook de bedrijven van een lid tellen mee.
router.get('/', requireLogin, async (req, res) => {
  const zoek = leeg(req.query.zoek).toLowerCase();
  const branche = leeg(req.query.branche);
  const plaats = leeg(req.query.plaats);

  try {
    const alle = (await pool.query(
      `SELECT id, naam, bedrijf, functie, branche, plaats, website, bio, expertise, logo_id, foto_id, rol, defensie_relatie
       FROM users WHERE actief = true ORDER BY naam ASC`
    )).rows;
    const per = await bedrijvenPerLid();

    const branches = new Set();
    const plaatsen = new Set();
    for (const l of alle) {
      l.bedrijven = per[l.id] || [];
      l.avatarId = l.foto_id || l.logo_id || null;
      l.tags = tags(l.expertise);
      if (l.branche) branches.add(l.branche);
      if (l.plaats) plaatsen.add(l.plaats);
      for (const b of l.bedrijven) {
        if (b.branche) branches.add(b.branche);
        if (b.plaats) plaatsen.add(b.plaats);
      }
    }

    const leden = alle.filter((l) => {
      if (branche && l.branche !== branche && !l.bedrijven.some((b) => b.branche === branche)) return false;
      if (plaats && l.plaats !== plaats && !l.bedrijven.some((b) => b.plaats === plaats)) return false;
      if (zoek) {
        const eigen = [l.naam, l.bedrijf, l.functie, l.branche, l.plaats, l.bio, l.expertise, l.defensie_relatie].some((v) => bevat(v, zoek));
        const viaBedrijf = l.bedrijven.some((b) => [b.naam, b.functie, b.branche, b.plaats, b.omschrijving].some((v) => bevat(v, zoek)));
        if (!eigen && !viaBedrijf) return false;
      }
      return true;
    });

    res.render('leden/index', {
      title: 'Ledengids', leden,
      branches: [...branches].sort((a, b) => a.localeCompare(b, 'nl')),
      plaatsen: [...plaatsen].sort((a, b) => a.localeCompare(b, 'nl')),
      zoek: leeg(req.query.zoek), branche, plaats
    });
  } catch (err) {
    console.error('[leden]', err.message);
    res.status(500).render('error', { title: 'Fout', bericht: 'De ledengids kon niet worden geladen.' });
  }
});

// Profieldetail
router.get('/:id', requireLogin, async (req, res) => {
  try {
    const lid = (await pool.query(
      'SELECT * FROM users WHERE id = $1 AND actief = true',
      [req.params.id]
    )).rows[0];
    if (!lid) return res.status(404).render('error', { title: 'Niet gevonden', bericht: 'Dit lid bestaat niet.' });

    const bedrijven = (await pool.query(
      'SELECT * FROM bedrijven WHERE user_id = $1 ORDER BY hoofd DESC, volgorde ASC, id ASC', [lid.id]
    )).rows;
    const vacatures = (await pool.query(
      'SELECT id, titel, plaats, dienstverband FROM vacatures WHERE user_id = $1 ORDER BY aangemaakt DESC',
      [lid.id]
    )).rows;
    const projecten = (await pool.query(
      'SELECT id, titel, steun_type FROM projecten WHERE user_id = $1 ORDER BY aangemaakt DESC',
      [lid.id]
    )).rows;

    const eigen = req.session.user.id === lid.id;
    res.render('leden/detail', {
      title: lid.naam, lid, bedrijven, vacatures, projecten, eigen,
      hoofdbedrijf: bedrijven[0] || null,
      avatarId: lid.foto_id || lid.logo_id || null,
      expertise: tags(lid.expertise),
      contactEmail: lid.contact_email || lid.email
    });
  } catch (err) {
    console.error('[leden detail]', err.message);
    res.status(500).render('error', { title: 'Fout', bericht: 'Het profiel kon niet worden geladen.' });
  }
});

module.exports = router;
