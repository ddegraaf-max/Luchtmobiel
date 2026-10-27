// Draai met: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-sleutel-voor-unit-tests';

const reclame = require('../lib/reclame');

test('netteHex normaliseert kleuren en weigert rommel', () => {
  assert.equal(reclame.netteHex('#FF7A00'), '#ff7a00');
  assert.equal(reclame.netteHex('ff7a00'), '#ff7a00');
  assert.equal(reclame.netteHex(' #abc '), '#aabbcc');
  for (const slecht of ['', null, undefined, 'rood', '#ff7a0', '#ff7a000', 'url(x)', '#ff7a00;color:red']) {
    assert.equal(reclame.netteHex(slecht), null, String(slecht));
  }
});

test('tekstKleur kiest leesbare tekst op de accentkleur', () => {
  const donker = '#1c1714', licht = '#fbf9f4';
  assert.equal(reclame.tekstKleur('#ffffff'), donker);
  assert.equal(reclame.tekstKleur('#ff7a00'), donker);   // oranje: zwarte tekst leest beter
  assert.equal(reclame.tekstKleur('#a98443'), donker);   // messing, zoals de knoppen in de paginakop
  assert.equal(reclame.tekstKleur('#1a1a1a'), licht);
  assert.equal(reclame.tekstKleur('#6e2230'), licht);    // baret
  assert.equal(reclame.tekstKleur('onzin'), donker);
});

test('telefoon- en WhatsApp-links uit Nederlandse nummers', () => {
  assert.equal(reclame.waUrl('06 46 15 01 60'), 'https://wa.me/31646150160');
  assert.equal(reclame.waUrl('+31 6 46150160'), 'https://wa.me/31646150160');
  assert.equal(reclame.waUrl('0031646150160'), 'https://wa.me/31646150160');
  assert.equal(reclame.telHref('06 46 15 01 60'), 'tel:+31646150160');
  assert.equal(reclame.telHref('020-1234567'), 'tel:+31201234567');
  for (const slecht of ['', null, '123', 'bel mij', '12345678901234567']) {
    assert.equal(reclame.waUrl(slecht), null, String(slecht));
    assert.equal(reclame.telHref(slecht), null, String(slecht));
  }
});

test('status en periode van een blok', () => {
  const dag = '2026-10-27';
  assert.equal(reclame.status({ actief: false }, dag), 'uit');
  assert.equal(reclame.status({ actief: true }, dag), 'actief');
  assert.equal(reclame.status({ actief: true, van: '2026-11-01' }, dag), 'gepland');
  assert.equal(reclame.status({ actief: true, tot: '2026-10-26' }, dag), 'verlopen');
  assert.equal(reclame.status({ actief: true, van: '2026-10-27', tot: '2026-10-27' }, dag), 'actief');
  assert.equal(reclame.loopt({ actief: true, van: '2026-10-01', tot: '2026-12-31' }, dag), true);
  assert.equal(reclame.loopt({ actief: true, tot: '2026-10-26' }, dag), false);
  assert.match(reclame.vandaag(), /^\d{4}-\d{2}-\d{2}$/);
});

test('kiesGewogen kiest alleen lopende blokken, naar gewicht', () => {
  const dag = '2026-10-27';
  const a = { id: 1, actief: true, gewicht: 1 };
  const b = { id: 2, actief: true, gewicht: 3 };
  const uit = { id: 3, actief: false, gewicht: 5 };
  const verlopen = { id: 4, actief: true, gewicht: 5, tot: '2026-01-01' };
  assert.equal(reclame.kiesGewogen([], Math.random, dag), null);
  assert.equal(reclame.kiesGewogen([uit, verlopen], Math.random, dag), null);
  assert.equal(reclame.kiesGewogen([a, b, uit, verlopen], () => 0, dag).id, 1);
  assert.equal(reclame.kiesGewogen([a, b, uit, verlopen], () => 0.5, dag).id, 2);
  assert.equal(reclame.kiesGewogen([a, b, uit, verlopen], () => 0.999, dag).id, 2);
  assert.equal(reclame.kiesGewogen([a, b], () => 1, dag).id, 2); // randgeval: nooit undefined
  let na = 0, nb = 0;
  for (let i = 0; i < 4000; i++) { if (reclame.kiesGewogen([a, b], Math.random, dag).id === 1) na++; else nb++; }
  assert.ok(nb > na * 2, `gewicht 3 moet duidelijk vaker winnen dan gewicht 1 (a=${na}, b=${nb})`);
  assert.equal(reclame.gewichtVan({ gewicht: 99 }), 5);
  assert.equal(reclame.gewichtVan({ gewicht: 'x' }), 1);
});

test('lijsten en afbeeldingsbronnen', () => {
  assert.deepEqual(reclame.lijst('Kozijnen, Dakkapellen,, Uitbouwen\nRenovaties'), ['Kozijnen', 'Dakkapellen', 'Uitbouwen', 'Renovaties']);
  assert.deepEqual(reclame.lijst(''), []);
  assert.equal(reclame.logoSrc({ logo_id: 5, logo_url: '/x.png' }), '/media/5');
  assert.equal(reclame.logoSrc({ logo_url: '/x.png' }), '/x.png');
  assert.equal(reclame.fotoSrc({}), null);
  assert.equal(reclame.contactAdres(), (process.env.RECLAME_CONTACT || 'info@bclmb.nl'));
});

test('startblok De Graaf Bouwbedrijf is compleet, geldig en heeft zijn afbeeldingen', () => {
  const s = reclame.STARTBLOK;
  assert.equal(s.naam, 'De Graaf Bouwbedrijf');
  assert.equal(s.sleutel, 'degraaf-bouwbedrijf');
  assert.ok(reclame.netteHex(s.accent));
  assert.ok(reclame.netteHex(s.logo_achtergrond));
  assert.ok(reclame.waUrl(s.whatsapp));
  assert.ok(reclame.telHref(s.telefoon));
  assert.match(s.website, /^https:\/\//);
  assert.match(s.cta_url, /^https:\/\//);
  assert.ok(reclame.THEMAS[s.thema]);
  const diensten = reclame.lijst(s.diensten);
  assert.ok(diensten.length >= 10 && diensten.length <= 14, 'alle diensten passen in het blok');
  const kenmerken = reclame.lijst(s.kenmerken, 6);
  assert.ok(kenmerken.length >= 4 && kenmerken.length <= 6);
  for (const p of [s.logo_url, s.foto_url]) {
    const bestand = path.join(__dirname, '..', 'public', p.replace(/^\/static\//, ''));
    assert.ok(fs.existsSync(bestand), 'ontbreekt: ' + bestand);
  }
  assert.ok(reclame.loopt({ ...s, id: 1 }));
});

test('telVertoning negeert ongeldige nummers zonder fout', () => {
  assert.doesNotThrow(() => { reclame.telVertoning(0); reclame.telVertoning('x'); reclame.telVertoning(null); });
});
