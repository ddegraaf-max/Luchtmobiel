// Draai met: npm test
// Controleert de startinhoud (VRB-nieuwsbrief, sponsorverzoek Anjerperkje) vóór hij online komt:
// bestanden aanwezig en van het juiste type, velden binnen de grenzen van de formulieren.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-sleutel-voor-unit-tests';

const start = require('../lib/startinhoud');
const { detecteerAfbeelding, detecteerPdf } = require('../lib/upload');
const si = require('../lib/sponsor-import');
const { kort } = require('../lib/helpers');

test('nieuwsberichten van de startinhoud zijn compleet en hun bestanden bestaan', () => {
  assert.ok(start.NIEUWSBERICHTEN.length >= 1);
  const markers = new Set();
  for (const b of start.NIEUWSBERICHTEN) {
    assert.match(b.marker, /^nieuws_[a-z0-9_]+$/);
    assert.ok(!markers.has(b.marker), 'marker dubbel: ' + b.marker);
    markers.add(b.marker);
    assert.ok(b.titel && b.titel.length <= 200, 'titel');
    assert.ok(b.inhoud && b.inhoud.length <= 50000, 'inhoud');
    assert.ok(!b.categorie || b.categorie.length <= 60, 'categorie');
    if (b.bijlage) {
      assert.equal(detecteerPdf(fs.readFileSync(path.join(start.MAP, b.bijlage))), 'application/pdf', b.bijlage);
      assert.ok(b.bijlage_naam && b.bijlage_naam.length <= 120, 'bijlage_naam');
    }
    if (b.afbeelding) {
      assert.ok(detecteerAfbeelding(fs.readFileSync(path.join(start.MAP, b.afbeelding))), b.afbeelding);
    }
    // De eerste alinea is de samenvatting in het overzicht en de deelvoorvertoning: geen tussenkop.
    assert.ok(!/^##/.test(b.inhoud), 'inhoud begint met een tussenkop');
    assert.ok(!/##/.test(kort(b.inhoud, 200)), 'samenvatting bevat een kop-markering');
  }
});

test('de VRB-nieuwsbrief bevat de kernpunten en het donatieadres', () => {
  const b = start.NIEUWSBERICHTEN.find((x) => x.marker === 'nieuws_vrb_nieuwsbrief_2026_4');
  assert.ok(b);
  for (const kop of ['Van de voorzitter', 'De Witte Kapel', 'Memorial Tour', 'DVLMB', 'Recovery on the Battlefield', 'Herdenking Market Garden 2026', 'Ondersteuning Market Garden 2026', '8 juli 2027']) {
    assert.ok(b.inhoud.includes(kop), 'ontbreekt: ' + kop);
  }
  assert.match(b.inhoud, /NL40 INGB 0000 1008 59/);
  assert.match(b.inhoud, /Vereniging Veteranen Grenadiers en Jagers/);
  assert.equal(b.bijlage, 'vrb-nieuwsbrief-2026-4.pdf');
  assert.equal(b.afbeelding, 'vrb-nieuwsbrief-2026-4.jpg');
});

test('sponsorverzoeken van de startinhoud passen in het formulier en de controle', () => {
  assert.ok(start.SPONSORVERZOEKEN.length >= 1);
  for (const s of start.SPONSORVERZOEKEN) {
    assert.match(s.marker, /^sponsor_[a-z0-9_]+$/);
    assert.ok(s.titel && s.titel.length <= 200, 'titel');
    assert.ok(si.DOELGROEPEN.includes(s.doelgroep), 'doelgroep');
    assert.ok(!s.samenvatting || s.samenvatting.length <= 300, 'samenvatting te lang');
    assert.ok(!s.omschrijving || s.omschrijving.length <= 5000, 'omschrijving te lang');
    assert.ok(si.normaliseerUrl(s.url), 'url ongeldig');
    assert.ok(si.titelSleutel(s.titel));
  }
  const anjer = start.SPONSORVERZOEKEN.find((x) => x.marker === 'sponsor_anjerperkje_witte_kapel');
  assert.ok(anjer);
  assert.match(anjer.omschrijving, /NL40 INGB 0000 1008 59/);
  assert.match(anjer.omschrijving, /Anjerperkje Witte Kapel/);
  assert.match(anjer.url, /^https:\/\/www\.ing\.nl\/payreq\/m\/\?trxid=/);
  assert.equal(anjer.uitgelicht, true);
});
