// Draai met: npm test
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-sleutel-voor-unit-tests';

const totp = require('../lib/totp');
const bev = require('../lib/beveiliging');
const { detecteerAfbeelding } = require('../lib/upload');
const { netteUrl, toonUrl } = require('../lib/helpers');

test('base32 codeert en decodeert rond', () => {
  const buf = Buffer.from('12345678901234567890', 'ascii');
  const enc = totp.base32Encode(buf);
  assert.equal(enc, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  assert.deepEqual(totp.base32Decode(enc), buf);
  assert.deepEqual(totp.base32Decode(enc.toLowerCase().replace(/(.{4})/g, '$1 ')), buf);
});

test('TOTP komt overeen met de testvectoren uit RFC 6238 (SHA1)', () => {
  const sleutel = Buffer.from('12345678901234567890', 'ascii');
  const vectoren = [
    [59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'],
    [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130']
  ];
  for (const [t, verwacht] of vectoren) {
    assert.equal(totp.hotp(sleutel, Math.floor(t / 30), 8), verwacht, `T=${t}`);
    assert.equal(totp.hotp(sleutel, Math.floor(t / 30), 6), verwacht.slice(-6), `T=${t} (6 cijfers)`);
  }
});

test('controleer accepteert de huidige code, weigert herhaling en rommel', () => {
  const geheim = totp.nieuwGeheim();
  assert.equal(geheim.length, 32);
  const nu = 1700000000000;
  const stap = totp.huidigeStap(nu);
  const code = totp.hotp(totp.base32Decode(geheim), stap);

  assert.equal(totp.controleer(geheim, code, { nu }), stap);
  assert.equal(totp.controleer(geheim, code.slice(0, 3) + ' ' + code.slice(3), { nu }), stap, 'spaties toegestaan');
  assert.equal(totp.controleer(geheim, code, { nu: nu + 30 * 1000 }), stap, 'vorige stap binnen venster');
  assert.equal(totp.controleer(geheim, code, { nu, laatsteStap: stap }), null, 'geen hergebruik');
  assert.equal(totp.controleer(geheim, code, { nu: nu + 120 * 1000 }), null, 'buiten venster');
  assert.equal(totp.controleer(geheim, '000000', { nu }), null);
  assert.equal(totp.controleer(geheim, 'abcdef', { nu }), null);
  assert.equal(totp.controleer(geheim, '', { nu }), null);
});

test('otpauth-url bevat geheim, uitgever en account', () => {
  const url = totp.otpauthUrl({ geheim: 'ABCD', account: 'lid@voorbeeld.nl', uitgever: 'Business Club Luchtmobiel' });
  assert.match(url, /^otpauth:\/\/totp\/Business%20Club%20Luchtmobiel%3Alid%40voorbeeld\.nl\?/);
  assert.match(url, /secret=ABCD/);
  assert.match(url, /issuer=Business\+Club\+Luchtmobiel/);
});

test('versleutelen en ontsleutelen (AES-256-GCM)', () => {
  assert.ok(bev.sleutelBeschikbaar());
  const blob = bev.versleutel('GEHEIM123');
  assert.match(blob, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(bev.ontsleutel(blob), 'GEHEIM123');
  assert.notEqual(bev.versleutel('GEHEIM123'), blob, 'andere iv per keer');
  const kapot = blob.slice(0, -2) + (blob.endsWith('AA') ? 'BB' : 'AA');
  assert.throws(() => bev.ontsleutel(kapot));
  assert.throws(() => bev.ontsleutel('onzin'));
});

test('tokens en herstelcodes', () => {
  const t = bev.nieuwToken();
  assert.ok(bev.geldigTokenFormaat(t));
  assert.ok(!bev.geldigTokenFormaat('kort'));
  assert.ok(!bev.geldigTokenFormaat(t + '/../x'));
  assert.equal(bev.hashToken(t).length, 64);

  const codes = bev.nieuweHerstelcodes(8);
  assert.equal(codes.length, 8);
  assert.ok(codes.every((c) => /^[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(c) && !/[01OIL]/.test(c)));
  const hashes = codes.map(bev.hashHerstelcode);
  assert.equal(bev.vindHerstelcode(hashes, codes[3]), 3);
  assert.equal(bev.vindHerstelcode(hashes, codes[3].toLowerCase().replace('-', ' ')), 3, 'ongevoelig voor hoofdletters/streepje');
  assert.equal(bev.vindHerstelcode(hashes, 'AAAAA-AAAAA'), -1);
  assert.ok(bev.lijktHerstelcode(codes[0]));
  assert.ok(!bev.lijktHerstelcode('123456'));
});

test('afbeeldingen worden herkend aan de inhoud', () => {
  assert.equal(detecteerAfbeelding(Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8)])), 'image/png');
  assert.equal(detecteerAfbeelding(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(12)])), 'image/jpeg');
  assert.equal(detecteerAfbeelding(Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(8)])), 'image/gif');
  assert.equal(detecteerAfbeelding(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(4)])), 'image/webp');
  assert.equal(detecteerAfbeelding(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')), null);
  assert.equal(detecteerAfbeelding(Buffer.alloc(3)), null);
});

test('websites worden netjes genormaliseerd en getoond', () => {
  assert.equal(netteUrl('www.voorbeeld.nl'), 'https://www.voorbeeld.nl');
  assert.equal(netteUrl('https://aanenuitbouw.nl/'), 'https://aanenuitbouw.nl');
  assert.equal(netteUrl('https://https://aanenuitbouw.nl'), 'https://aanenuitbouw.nl');
  assert.equal(netteUrl('http://voorbeeld.nl/pad?x=1'), 'http://voorbeeld.nl/pad?x=1');
  assert.equal(netteUrl('   '), '');
  assert.equal(netteUrl('javascript:alert(1)'), '');
  assert.equal(toonUrl('https://https://aanenuitbouw.nl'), 'aanenuitbouw.nl');
  assert.equal(toonUrl('https://www.voorbeeld.nl/'), 'www.voorbeeld.nl');
});
