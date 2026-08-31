// Draai met: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-sleutel-voor-unit-tests';

const ni = require('../lib/nieuws-import');
const fixture = (naam) => fs.readFileSync(path.join(__dirname, 'fixtures', naam), 'utf8');

test('overzichtspagina: alle artikelen, geen categorie-/auteurpagina\'s, geen dubbelen', () => {
  const nieuws = ni.leesLijst(fixture('bclmb-nieuws-lijst.html'), 'nieuws');
  assert.deepEqual(nieuws, [
    'terugblik-ai-bijeenkomst',
    'wij-stellen-voor-2-dennis-waterreus-vicevoorzitter-business-club-luchtmobiel',
    'bijeenkomst-18-september-2025',
    'binnenkomst-en-baretuitreiking-nieuwe-rode-baretten',
    'de-club-is-opgericht'
  ]);
  const blog = ni.leesLijst(fixture('bclmb-blog-lijst.html'), 'blog');
  assert.deepEqual(blog, ['de-rode-baret-in-het-bedrijfsleven', 'missie-gedreven-ondernemen']);
  assert.deepEqual(ni.leesLijst(fixture('bclmb-blog-lijst.html'), 'nieuws'), [], 'blogpagina bevat geen nieuwsartikelen');
  assert.deepEqual(ni.leesLijst('', 'nieuws'), []);
});

test('nieuwsartikel: titel, datum, afbeeldingen en nette tekst zonder carrousel, meta en reacties', () => {
  const a = ni.leesArtikel(fixture('bclmb-nieuws-detail.html'), 'nieuws');
  assert.equal(a.titel, 'Terugblik: AI-bijeenkomst');
  assert.equal(a.datum.toISOString(), '2025-11-27T15:57:00.000Z', '27 nov 2025 16:57 Amsterdamse tijd');
  assert.equal(a.afbeeldingen.length, 2);
  assert.match(a.afbeeldingen[0], /ace19e3166464abcac82599dfaabb12a-lg\.jfif$/);
  assert.equal(a.auteur, null);
  assert.match(a.tekst, /^Vorige week stond onze bijeenkomst/);
  assert.match(a.tekst, /\n\nEen interactieve avond\n\n/, 'tussenkop op eigen regel');
  assert.match(a.tekst, /• Veel van jullie AI nu vooral/, 'opsomming');
  assert.match(a.tekst, /zo’n bijzondere plek/, 'entities gedecodeerd');
  assert.match(a.tekst, /📅 De volgende bijeenkomst vindt plaats op 18 maart\.\nDan gaan we/, 'br wordt regeleinde');
  assert.doesNotMatch(a.tekst, /Terugblik: AI-bijeenkomst/, 'titel niet in de tekst');
  assert.doesNotMatch(a.tekst, /27 nov 2025|Reacties|Log in|<|carousel/);
  assert.doesNotMatch(a.tekst, /\n{3,}/, 'geen driedubbele regeleinden');
});

test('blogartikel: titel, auteur, categorie, tekst zonder andere teasers', () => {
  const b = ni.leesArtikel(fixture('bclmb-blog-detail.html'), 'blog');
  assert.equal(b.titel, 'De rode baret in het bedrijfsleven');
  assert.equal(b.datum.toISOString(), '2026-04-30T09:08:00.000Z', '30 apr 2026 11:08 zomertijd');
  assert.equal(b.auteur, 'Gerben Nijmeijer');
  assert.equal(b.categorie, 'Zakelijke inspiratie');
  assert.match(b.afbeeldingen[0], /b3bb0ee9dbdc40d49c079b50e141f340\.webp$/);
  assert.match(b.tekst, /^Wie denkt aan militairen, denkt aan bevelen\. Aan hiërarchie\./);
  assert.match(b.tekst, /Voorzitter business club luchtmobiel$/);
  assert.doesNotMatch(b.tekst, /Mijn dochter vraagt|Reacties|Log in|</);
});

test('lege of vreemde pagina geeft geen titel en geen crash', () => {
  const x = ni.leesArtikel('<html><body>niets</body></html>', 'nieuws');
  assert.equal(x.titel, null);
  assert.equal(x.datum, null);
  assert.deepEqual(x.afbeeldingen, []);
  assert.equal(x.tekst, '');
  assert.equal(ni.amsterdamNaarDate('onzin'), null);
  assert.equal(ni.amsterdamNaarDate('2026-01-15 10:00:00').toISOString(), '2026-01-15T09:00:00.000Z', 'wintertijd');
  assert.equal(ni.amsterdamNaarDate('2026-07-15 10:00:00').toISOString(), '2026-07-15T08:00:00.000Z', 'zomertijd');
});

test('LinkedIn: activiteit-id en itemvalidatie', () => {
  assert.equal(ni.linkedinActiviteitId('https://nl.linkedin.com/posts/11-luchtmobiele-brigade_x-activity-7040989309109202944-UAp3'), 'activity-7040989309109202944');
  assert.equal(ni.linkedinActiviteitId('https://voorbeeld.nl/geen-activity'), null);

  const it = ni.valideerLinkedInItem({
    url: 'https://nl.linkedin.com/posts/11-luchtmobiele-brigade_x-activity-7040989309109202944-UAp3',
    titel: '  De huidige veiligheidssituatie  vraagt om een hogere gereedheid ',
    tekst: 'Regel 1\r\nRegel 2', datum: '2026-08-30', pagina: '11 Luchtmobiele Brigade', gevonden_op: '2026-08-31'
  });
  assert.equal(it.uid, 'activity-7040989309109202944');
  assert.equal(it.titel, 'De huidige veiligheidssituatie vraagt om een hogere gereedheid');
  assert.equal(it.tekst, 'Regel 1\nRegel 2');
  assert.equal(it.datum.toISOString().slice(0, 10), '2026-08-30');
  assert.equal(it.pagina, '11 Luchtmobiele Brigade');

  // Facebook
  const fb = ni.valideerLinkedInItem({ url: 'https://m.facebook.com/story.php/?story_fbid=411472094798370&id=100078067485502', titel: 'Reünie aangekondigd', pagina: '11 Luchtmobiele Brigade, Veteranenzaken' });
  assert.equal(fb.uid, 'fb-411472094798370');
  assert.equal(fb.platform, 'facebook');
  assert.equal(fb.platformNaam, 'Facebook');
  assert.equal(ni.facebookBerichtId('https://www.facebook.com/100078067485502/posts/724532383492338/'), 'fb-724532383492338');
  assert.equal(ni.facebookBerichtId('https://www.facebook.com/x/posts/pfbid0AbC123xyz'), 'fb-pfbid0AbC123xyz');
  assert.equal(ni.facebookBerichtId('https://www.facebook.com/people/x/100078067485502/'), null);
  assert.equal(ni.valideerLinkedInItem({ url: 'https://www.facebook.com/x/posts/pfbid0AbC123xyz' }).titel, 'Bericht op Facebook');
  assert.equal(ni.valideerLinkedInItem({ url: 'https://nepfacebook.com/x/posts/724532383492338' }), null, 'nep-domein');

  assert.equal(ni.valideerLinkedInItem({ url: 'https://kwaadaardig.nl/posts/x-activity-7040989309109202944-x', titel: 'x' }), null, 'alleen linkedin.com of facebook.com');
  assert.equal(ni.valideerLinkedInItem({ url: 'https://nl.linkedin.com/posts/zonder-id', titel: 'x' }), null, 'zonder id geen item');
  assert.equal(ni.valideerLinkedInItem({ url: 'https://evil-linkedin.com/posts/x-activity-7040989309109202944-x' }), null, 'nep-domein');
  assert.equal(ni.valideerLinkedInItem(null), null);
  assert.equal(ni.valideerLinkedInItem({ id: 'activity-123456789012', url: 'https://www.linkedin.com/posts/y' }).titel, 'Bericht op LinkedIn', 'standaardtitel');
});

test('configuratie: standaard elke 6 uur met blogs; 0 zet uit', () => {
  const oud = { u: process.env.NIEUWS_IMPORT_UREN, b: process.env.NIEUWS_IMPORT_BLOG };
  try {
    delete process.env.NIEUWS_IMPORT_UREN; delete process.env.NIEUWS_IMPORT_BLOG;
    assert.equal(ni.config().uren, 6);
    assert.equal(ni.config().blog, true);
    assert.equal(ni.config().site, 'https://www.bclmb.nl');
    process.env.NIEUWS_IMPORT_UREN = '0'; process.env.NIEUWS_IMPORT_BLOG = '0';
    assert.equal(ni.config().uren, 0);
    assert.equal(ni.config().blog, false);
  } finally {
    if (oud.u === undefined) delete process.env.NIEUWS_IMPORT_UREN; else process.env.NIEUWS_IMPORT_UREN = oud.u;
    if (oud.b === undefined) delete process.env.NIEUWS_IMPORT_BLOG; else process.env.NIEUWS_IMPORT_BLOG = oud.b;
  }
});
