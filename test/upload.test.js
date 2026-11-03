// Draai met: npm test
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-sleutel-voor-unit-tests';

const { detecteerAfbeelding, detecteerPdf } = require('../lib/upload');

test('detecteerPdf herkent alleen echte PDF-bestanden', () => {
  assert.equal(detecteerPdf(Buffer.from('%PDF-1.7\n%âãÏÓ\n1 0 obj')), 'application/pdf');
  assert.equal(detecteerPdf(Buffer.from('PDF-1.7 zonder procentteken')), null);
  assert.equal(detecteerPdf(Buffer.from('<html>%PDF-</html>')), null);
  assert.equal(detecteerPdf(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])), null);
  assert.equal(detecteerPdf(Buffer.from('%PDF')), null); // te kort
  assert.equal(detecteerPdf(Buffer.alloc(0)), null);
  assert.equal(detecteerPdf(null), null);
});

test('detecteerAfbeelding kijkt naar de inhoud, niet naar de extensie', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(12)]);
  const gif = Buffer.concat([Buffer.from('GIF89a'), Buffer.alloc(8)]);
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), Buffer.alloc(4)]);
  assert.equal(detecteerAfbeelding(png), 'image/png');
  assert.equal(detecteerAfbeelding(jpg), 'image/jpeg');
  assert.equal(detecteerAfbeelding(gif), 'image/gif');
  assert.equal(detecteerAfbeelding(webp), 'image/webp');
  assert.equal(detecteerAfbeelding(Buffer.from('%PDF-1.7 dit is geen afbeelding')), null);
  assert.equal(detecteerAfbeelding(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  assert.equal(detecteerAfbeelding(null), null);
});
