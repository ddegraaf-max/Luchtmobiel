// Draai met: npm test
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-sleutel-voor-unit-tests';

const { youtubeId } = require('../lib/galerij');

test('YouTube-id wordt uit alle gangbare linkvormen gehaald', () => {
  const id = 'dQw4w9WgXcQ';
  for (const url of [
    `https://www.youtube.com/watch?v=${id}`,
    `https://www.youtube.com/watch?app=desktop&v=${id}&t=42s`,
    `https://youtube.com/watch?v=${id}#t=10`,
    `https://youtu.be/${id}`,
    `https://youtu.be/${id}?si=abcDEF123`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube.com/live/${id}?feature=share`,
    `https://www.youtube-nocookie.com/embed/${id}`,
    ` ${id} `
  ]) {
    assert.equal(youtubeId(url), id, url);
  }
});

test('ongeldige invoer geeft null', () => {
  for (const slecht of [
    '', null, undefined,
    'https://www.youtube.com/', 'https://www.youtube.com/watch', 'https://youtu.be/',
    'https://vimeo.com/12345678', 'https://voorbeeld.nl/watch?v=dQw4w9WgXcQx',
    'https://www.youtube.com/watch?v=tekort', 'dQw4w9WgXc', 'dQw4w9WgXcQQ',
    'javascript:alert(1)', '<script>alert(1)</script>'
  ]) {
    assert.equal(youtubeId(slecht), null, String(slecht));
  }
});
