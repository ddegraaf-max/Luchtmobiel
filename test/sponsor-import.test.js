// Draai met: npm test
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-sleutel-voor-unit-tests';

const si = require('../lib/sponsor-import');

test('url-sleutel herkent dezelfde pagina ondanks www, tracking en slash', () => {
  const a = si.normaliseerUrl('https://www.doneeractie.nl/steun-veteraan-jan/-12345?utm_source=fb&fbclid=abc#top');
  const b = si.normaliseerUrl('doneeractie.nl/steun-veteraan-jan/-12345/');
  assert.equal(a, 'doneeractie.nl/steun-veteraan-jan/-12345');
  assert.equal(a, b);
  assert.equal(si.normaliseerUrl('https://voorbeeld.nl/actie?b=2&a=1'), 'voorbeeld.nl/actie?a=1&b=2', 'parameters gesorteerd');
  assert.equal(si.normaliseerUrl('onzin'), null);
  assert.equal(si.normaliseerUrl(''), null);
});

test('titel-sleutel negeert hoofdletters, leestekens en accenten', () => {
  assert.equal(si.titelSleutel('Sponsorloop vóór Veteranen — 2026!'), 'sponsorloop voor veteranen 2026');
  assert.equal(si.titelSleutel(''), '');
});

test('doelgroep wordt herkend uit vrije tekst', () => {
  assert.equal(si.bepaalDoelgroep('Veteranen'), 'Veteranen');
  assert.equal(si.bepaalDoelgroep('veteraan met PTSS'), 'Veteranen');
  assert.equal(si.bepaalDoelgroep('militairen en veteranen'), 'Militairen & veteranen');
  assert.equal(si.bepaalDoelgroep('actieve militairen van de landmacht'), 'Militairen');
  assert.equal(si.bepaalDoelgroep('nabestaanden van omgekomen militairen'), 'Nabestaanden & gezinnen');
  assert.equal(si.bepaalDoelgroep(''), 'Overig');
  assert.equal(si.bepaalDoelgroep(undefined), 'Overig');
});

test('items worden gevalideerd en opgeschoond', () => {
  const goed = si.valideerItem({
    titel: '  Sponsorloop   voor veteranen ', url: 'www.voorbeeld.nl/actie/', organisatie: 'Stichting X',
    samenvatting: 'Korte tekst.', omschrijving: 'Regel 1\r\n\r\n\r\n\r\nRegel 2  ', doelgroep: 'veteranen',
    doelbedrag: '€ 5.000', einddatum: '2026-12-31', gepubliceerd_op_bron: '2026-08-30T10:00:00Z', plaats: 'Arnhem'
  });
  assert.equal(goed.fout, undefined);
  assert.equal(goed.item.titel, 'Sponsorloop voor veteranen');
  assert.equal(goed.item.url, 'https://www.voorbeeld.nl/actie');
  assert.equal(goed.item.url_sleutel, 'voorbeeld.nl/actie');
  assert.equal(goed.item.bron_naam, 'voorbeeld.nl', 'bron uit de link afgeleid');
  assert.equal(goed.item.doelgroep, 'Veteranen');
  assert.equal(goed.item.omschrijving, 'Regel 1\n\nRegel 2');
  assert.equal(goed.item.einddatum, '2026-12-31');
  assert.equal(goed.item.gepubliceerd_op_bron.toISOString(), '2026-08-30T10:00:00.000Z');
  assert.match(goed.item.uid, /^[0-9a-f]{40}$/, 'zonder id: hash van de url');

  assert.equal(si.valideerItem({ id: 'abc', titel: 'Met id', url: 'https://x.nl/a' }).item.uid, 'abc');
  assert.equal(si.valideerItem({ titel: 'Foute datum', url: 'https://x.nl/a', einddatum: '31-12-2026' }).item.einddatum, null);
  assert.equal(si.valideerItem({ titel: 'Foute datum 2', url: 'https://x.nl/a', gepubliceerd_op_bron: 'gisteren' }).item.gepubliceerd_op_bron, null);

  assert.match(si.valideerItem({ url: 'https://x.nl' }).fout, /zonder titel/);
  assert.match(si.valideerItem({ titel: 'Zonder link' }).fout, /webadres/);
  assert.match(si.valideerItem({ titel: 'Intern adres', url: 'http://127.0.0.1/geheim' }).fout, /webadres/, 'geen SSRF via interne adressen');
  assert.match(si.valideerItem({ titel: 'Ftp', url: 'ftp://x.nl/a' }).fout, /webadres/);
  assert.match(si.valideerItem(null).fout, /Onbruikbaar/);
  assert.match(si.valideerItem('tekst').fout, /Onbruikbaar/);
  assert.equal(si.valideerItem({ titel: 'x'.repeat(500), url: 'https://x.nl/a' }).item.titel.length, 200, 'titel begrensd');
});

test('het bestand van de assistent wordt gelezen in beide vormen', () => {
  const met = si.leesInbox(JSON.stringify({ bijgewerkt: '2026-08-31T05:10:00Z', items: [{ titel: 'A', url: 'https://x.nl/a' }] }));
  assert.equal(met.items.length, 1);
  assert.equal(met.bijgewerkt.toISOString(), '2026-08-31T05:10:00.000Z');
  const kaal = si.leesInbox('[{"titel":"B","url":"https://x.nl/b"}]');
  assert.equal(kaal.items.length, 1);
  assert.equal(kaal.bijgewerkt, null);
  assert.equal(si.leesInbox('{"bijgewerkt":"onzin","items":[]}').bijgewerkt, null);
  assert.throws(() => si.leesInbox('geen json'), /geen geldige JSON/);
  assert.throws(() => si.leesInbox('{"iets":1}'), /geen lijst/);
  assert.throws(() => si.leesInbox('null'), /geen lijst/);
});

test('configuratie: standaard elke 3 uur, 0 zet uit, onzin valt terug', () => {
  const oud = { uren: process.env.SPONSOR_IMPORT_UREN, url: process.env.SPONSOR_INBOX_URL };
  try {
    delete process.env.SPONSOR_IMPORT_UREN; delete process.env.SPONSOR_INBOX_URL;
    assert.equal(si.config().uren, 3);
    assert.match(si.config().url, /^https:\/\/raw\.githubusercontent\.com\/.*\/claude\/sponsor-inbox\/data\/sponsorverzoeken\.json$/);
    process.env.SPONSOR_IMPORT_UREN = '0';
    assert.equal(si.config().uren, 0);
    process.env.SPONSOR_IMPORT_UREN = 'abc';
    assert.equal(si.config().uren, 3);
    process.env.SPONSOR_INBOX_URL = ' https://voorbeeld.nl/lijst.json ';
    assert.equal(si.config().url, 'https://voorbeeld.nl/lijst.json');
  } finally {
    if (oud.uren === undefined) delete process.env.SPONSOR_IMPORT_UREN; else process.env.SPONSOR_IMPORT_UREN = oud.uren;
    if (oud.url === undefined) delete process.env.SPONSOR_INBOX_URL; else process.env.SPONSOR_INBOX_URL = oud.url;
  }
});
