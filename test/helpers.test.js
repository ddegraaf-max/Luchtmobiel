// Draai met: npm test
const test = require('node:test');
const assert = require('node:assert/strict');

const { blokken, kort, bestandsgrootte } = require('../lib/helpers');

test('blokken: alinea\'s op lege regels, "## " wordt een tussenkop met de alinea eronder', () => {
  const tekst = 'Intro.\r\n\r\n## Eerste kop\r\nTekst onder de kop.\nTweede regel.\r\n\r\n## Losse kop\r\n\r\nAlinea erna.\n\n\n\n##   Kop met spaties   \n   \nLaatste.';
  assert.deepEqual(blokken(tekst), [
    { type: 'alinea', tekst: 'Intro.' },
    { type: 'kop', tekst: 'Eerste kop' },
    { type: 'alinea', tekst: 'Tekst onder de kop.\nTweede regel.' },
    { type: 'kop', tekst: 'Losse kop' },
    { type: 'alinea', tekst: 'Alinea erna.' },
    { type: 'kop', tekst: 'Kop met spaties' },
    { type: 'alinea', tekst: 'Laatste.' }
  ]);
  assert.deepEqual(blokken(''), []);
  assert.deepEqual(blokken(null), []);
  assert.deepEqual(blokken('##zonder spatie is geen kop'), [{ type: 'alinea', tekst: '##zonder spatie is geen kop' }]);
  assert.deepEqual(blokken('## '), []);
});

test('kort: één regel, zonder kop-markeringen, met beletselteken', () => {
  assert.equal(kort('## Kop\nTekst  met   spaties\n\nMeer.', 100), 'Kop Tekst met spaties Meer.');
  assert.equal(kort('abcdef', 3), 'abc…');
  assert.equal(kort('', 10), '');
  assert.equal(kort(null, 10), '');
});

test('bestandsgrootte: kB en MB met komma', () => {
  assert.equal(bestandsgrootte(1059367), '1,0 MB');
  assert.equal(bestandsgrootte(77851), '76 kB');
  assert.equal(bestandsgrootte(500), '1 kB');
  assert.equal(bestandsgrootte(0), '');
  assert.equal(bestandsgrootte('onzin'), '');
});
