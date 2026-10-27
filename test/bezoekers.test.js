// Draai met: npm test
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-sleutel-voor-unit-tests';

const bezoekers = require('../lib/bezoekers');

test('zoekrobots en voorvertoningen worden herkend, gewone browsers niet', () => {
  for (const ua of [
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Mozilla/5.0 (compatible; bingbot/2.0)', 'facebookexternalhit/1.1', 'WhatsApp/2.23.20 A', 'LinkedInBot/1.0',
    'curl/8.4.0', 'python-requests/2.31', 'HeadlessChrome/120', '', null, undefined
  ]) assert.equal(bezoekers.isBot(ua), true, String(ua));
  for (const ua of [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0'
  ]) assert.equal(bezoekers.isBot(ua), false, ua);
});

test('de bezoekcookie wordt alleen herkend als hij er echt staat', () => {
  assert.equal(bezoekers.heeftCookie('connect.sid=abc; lm_bezoek=1'), true);
  assert.equal(bezoekers.heeftCookie('lm_bezoek=1'), true);
  assert.equal(bezoekers.heeftCookie('lm_bezoekje=1; anders=2'), false);
  assert.equal(bezoekers.heeftCookie(''), false);
  assert.equal(bezoekers.heeftCookie(undefined), false);
});

test('startwaarde uit BEZOEKERS_START, alleen als het een positief getal is', () => {
  const oud = process.env.BEZOEKERS_START;
  try {
    process.env.BEZOEKERS_START = '2500'; assert.equal(bezoekers.startwaarde(), 2500);
    process.env.BEZOEKERS_START = '-5'; assert.equal(bezoekers.startwaarde(), 0);
    process.env.BEZOEKERS_START = 'veel'; assert.equal(bezoekers.startwaarde(), 0);
    delete process.env.BEZOEKERS_START; assert.equal(bezoekers.startwaarde(), 0);
  } finally {
    if (oud === undefined) delete process.env.BEZOEKERS_START; else process.env.BEZOEKERS_START = oud;
  }
  assert.match(bezoekers.vandaag(), /^\d{4}-\d{2}-\d{2}$/);
});
