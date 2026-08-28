// Draai met: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const ai = require('../lib/agenda-import');
const fixture = fs.readFileSync(path.join(__dirname, 'fixtures', 'bclmb-voorbeeld.ics'), 'utf8');

test('iCal-feed van bclmb.nl wordt gelezen', () => {
  const events = ai.parseIcs(fixture);
  assert.equal(events.length, 6);
  const met = events.find((e) => e.uid === 'bijeenkomst-3-2026');
  assert.equal(met.summary, 'Bijeenkomst: de veteranenbegraafplaats & LinkedIn');
  assert.equal(met.location, 'Nationale Veteranenbegraafplaats, Loenen');
  assert.deepEqual({ y: met.start.y, m: met.start.m, d: met.start.d, h: met.start.h, utc: met.start.utc, heleDag: met.start.heleDag }, { y: 2026, m: 9, d: 16, h: 16, utc: true, heleDag: false });
  const hele = events.find((e) => e.uid === 'relatie-event-op-de-kazerne');
  assert.equal(hele.start.heleDag, true);
  assert.match(hele.description, /tweedaags relatie-event/);
});

test('tijden: UTC-tijden worden Nederlandse tijd, hele dagen blijven hele dagen', () => {
  const events = ai.parseIcs(fixture);
  const met = events.find((e) => e.uid === 'bijeenkomst-3-2026');
  assert.deepEqual(ai.bepaalTijden(met, null), { start_op: '2026-09-16T18:00', eind_op: '2026-09-16T22:00', hele_dag: false });
  const hele = events.find((e) => e.uid === 'relatie-event-op-de-kazerne');
  assert.deepEqual(ai.bepaalTijden(hele, null), { start_op: '2026-12-09T00:00', eind_op: '2026-12-10T23:59', hele_dag: true }, 'zonder site-datum: iCal (DTEND exclusief)');
  assert.deepEqual(ai.bepaalTijden(hele, ai.parseDatumTekst('10 - 11 dec 2026')), { start_op: '2026-12-10T00:00', eind_op: '2026-12-11T23:59', hele_dag: true }, 'site-datum gaat voor');
  const ntb = events.find((e) => e.uid === 'bijeenkomst-4-2026');
  assert.deepEqual(ai.bepaalTijden(ntb, ai.parseDatumTekst('19 nov 2026')), { start_op: '2026-11-19T00:00', eind_op: '2026-11-19T23:59', hele_dag: true });
  assert.deepEqual(ai.bepaalTijden(met, ai.parseDatumTekst('16 sep 2026 18:00 - 22:00')), { start_op: '2026-09-16T18:00', eind_op: '2026-09-16T22:00', hele_dag: false });
});

test('datumtekst van de site in alle voorkomende vormen', () => {
  const d = (t) => ai.parseDatumTekst(t);
  assert.deepEqual(d('19 nov 2026'), { start: { y: 2026, m: 11, d: 19, h: null, mi: null }, eind: null });
  assert.deepEqual(d('16 sep 2026 18:00 - 22:00'), { start: { y: 2026, m: 9, d: 16, h: 18, mi: 0 }, eind: { y: 2026, m: 9, d: 16, h: 22, mi: 0 } });
  assert.deepEqual(d('10 - 11 dec 2026'), { start: { y: 2026, m: 12, d: 10, h: null, mi: null }, eind: { y: 2026, m: 12, d: 11, h: null, mi: null } });
  assert.deepEqual(d('30 nov - 2 dec 2026'), { start: { y: 2026, m: 11, d: 30, h: null, mi: null }, eind: { y: 2026, m: 12, d: 2, h: null, mi: null } });
  assert.deepEqual(d('4 sep 2026 09:30 - 5 sep 2026 16:00'), { start: { y: 2026, m: 9, d: 4, h: 9, mi: 30 }, eind: { y: 2026, m: 9, d: 5, h: 16, mi: 0 } });
  assert.deepEqual(d('4 september 2026 19.30'), { start: { y: 2026, m: 9, d: 4, h: 19, mi: 30 }, eind: null });
  assert.deepEqual(d('<span class="x">16 sep 2026</span> 18:00 &ndash; 22:00'.replace('&ndash;', '–')), { start: { y: 2026, m: 9, d: 16, h: 18, mi: 0 }, eind: { y: 2026, m: 9, d: 16, h: 22, mi: 0 } });
  assert.equal(d('nog te bepalen'), null);
  assert.equal(d(''), null);
});

test('html naar tekst en detailpagina lezen', () => {
  assert.equal(ai.htmlNaarTekst('<h2><strong>Kop</strong></h2><p>Een &amp; twee</p><p>Drie<br>Vier</p><ul><li>a</li><li>b</li></ul>'), 'Kop\n\nEen & twee\n\nDrie\nVier\n\n• a\n• b');
  const html = `<dl><dt>Categorie</dt><dd>Vereniging</dd><dt>Datum</dt><dd>16 sep 2026 18:00 - 22:00</dd><dt>Locatie</dt><dd>Loenen</dd></dl>
    <div class="paragraphs col-md-9"><div class="row"><div class=" col-md-12 paragraph-text"><p class="heading-image"><img src="https://cdn.example/x.png" alt=""></p><h2>Titel</h2><p>Alinea &eacute;&eacute;n.</p></div></div>
    <div class="row"><div class="col-md-12 paragraph-text"><p>Alinea twee.</p></div></div></div>`;
  const det = ai.leesDetail(html);
  assert.equal(det.datumTekst, '16 sep 2026 18:00 - 22:00');
  assert.equal(det.locatie, 'Loenen');
  assert.equal(det.afbeelding, 'https://cdn.example/x.png');
  assert.equal(det.omschrijving, 'Titel\n\nAlinea één.\n\nAlinea twee.');
  assert.equal(ai.leesDetail('<html></html>').datumTekst, null);
  assert.equal(ai.leesDetail('<dl><dt>Datum en tijd</dt> <dd>16 sep 2026 18:00 - 22:00</dd></dl>').datumTekst, '16 sep 2026 18:00 - 22:00', 'label "Datum en tijd" bij evenementen met tijd');
});

test('categorie raden en entities', () => {
  assert.equal(ai.raadCategorie('Excursie: Oefening Falcon Leap'), 'Excursie');
  assert.equal(ai.raadCategorie('Intocht Fearless Falcon & Baretuitreiking'), 'Ceremonieel');
  assert.equal(ai.raadCategorie('BCLMB Sportdag'), 'Sportief');
  assert.equal(ai.raadCategorie('Bijeenkomst: nog te bepalen!'), 'Netwerk');
  assert.equal(ai.decodeEntities('Fearless Falcon &amp; Baret &#39;26 &eacute; &onbekend;'), "Fearless Falcon & Baret '26 é &onbekend;");
});
