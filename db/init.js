const pool = require('./pool');
const bcrypt = require('bcryptjs');
const { isoLokaal } = require('../lib/helpers');

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS media (
      id          SERIAL PRIMARY KEY,
      mime        TEXT NOT NULL,
      data        BYTEA NOT NULL,
      eigenaar_id INTEGER,
      aangemaakt  TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS users (
      id              SERIAL PRIMARY KEY,
      naam            TEXT NOT NULL,
      email           TEXT UNIQUE NOT NULL,
      wachtwoord_hash TEXT NOT NULL,
      rol             TEXT NOT NULL DEFAULT 'lid',
      actief          BOOLEAN NOT NULL DEFAULT true,
      bedrijf         TEXT,
      functie         TEXT,
      telefoon        TEXT,
      website         TEXT,
      branche         TEXT,
      plaats          TEXT,
      bio             TEXT,
      logo_id         INTEGER REFERENCES media(id) ON DELETE SET NULL,
      aangemaakt      TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS vacatures (
      id                  SERIAL PRIMARY KEY,
      user_id             INTEGER REFERENCES users(id) ON DELETE CASCADE,
      titel               TEXT NOT NULL,
      bedrijf             TEXT,
      plaats              TEXT,
      dienstverband       TEXT,
      omschrijving        TEXT,
      link                TEXT,
      contact_email       TEXT,
      veteraan_vriendelijk BOOLEAN DEFAULT false,
      aangemaakt          TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS projecten (
      id            SERIAL PRIMARY KEY,
      user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
      titel         TEXT NOT NULL,
      samenvatting  TEXT,
      omschrijving  TEXT,
      steun_type    TEXT,
      doel          TEXT,
      plaats        TEXT,
      afbeelding_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
      contact_email TEXT,
      aangemaakt    TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS project_aanmeldingen (
      id          SERIAL PRIMARY KEY,
      project_id  INTEGER REFERENCES projecten(id) ON DELETE CASCADE,
      user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
      bericht     TEXT,
      aangemaakt  TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS veteraan_resources (
      id          SERIAL PRIMARY KEY,
      titel       TEXT NOT NULL,
      categorie   TEXT,
      omschrijving TEXT,
      link        TEXT,
      auteur_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      aangemaakt  TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS galerij (
      id          SERIAL PRIMARY KEY,
      media_id    INTEGER REFERENCES media(id) ON DELETE CASCADE,
      pagina      TEXT NOT NULL DEFAULT 'brigade',
      bijschrift  TEXT,
      volgorde    INTEGER DEFAULT 0,
      auteur_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
      aangemaakt  TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS evenementen (
      id            SERIAL PRIMARY KEY,
      titel         TEXT NOT NULL,
      categorie     TEXT,
      omschrijving  TEXT,
      locatie       TEXT,
      start_op      TEXT NOT NULL,
      eind_op       TEXT,
      aanmelden     BOOLEAN NOT NULL DEFAULT true,
      max_plaatsen  INTEGER,
      afbeelding_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
      auteur_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
      aangemaakt    TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS evenement_aanmeldingen (
      id            SERIAL PRIMARY KEY,
      evenement_id  INTEGER REFERENCES evenementen(id) ON DELETE CASCADE,
      user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
      aantal        INTEGER NOT NULL DEFAULT 1,
      opmerking     TEXT,
      aangemaakt    TIMESTAMPTZ DEFAULT now(),
      UNIQUE (evenement_id, user_id)
    );
  `);

  // Uitbreidingen (idempotent)
  await pool.query(`ALTER TABLE galerij ADD COLUMN IF NOT EXISTS evenement_id INTEGER REFERENCES evenementen(id) ON DELETE CASCADE;`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nieuws (
      id           SERIAL PRIMARY KEY,
      titel        TEXT NOT NULL,
      inhoud       TEXT,
      gepubliceerd BOOLEAN NOT NULL DEFAULT true,
      auteur_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      aangemaakt   TIMESTAMPTZ DEFAULT now(),
      bijgewerkt   TIMESTAMPTZ DEFAULT now()
    );
  `);

  // Besloten media: profielfoto's en bedrijfslogo's alleen voor ingelogde leden
  await pool.query(`ALTER TABLE media ADD COLUMN IF NOT EXISTS besloten BOOLEAN NOT NULL DEFAULT false;`);
  try {
    const ids = new Set();
    for (const r of (await pool.query('SELECT logo_id, foto_id FROM users WHERE logo_id IS NOT NULL OR foto_id IS NOT NULL')).rows) {
      if (r.logo_id) ids.add(r.logo_id);
      if (r.foto_id) ids.add(r.foto_id);
    }
    try {
      for (const r of (await pool.query('SELECT logo_id FROM bedrijven WHERE logo_id IS NOT NULL')).rows) ids.add(r.logo_id);
    } catch (e) { /* bedrijventabel bestaat bij een eerste start nog niet */ }
    for (const id of ids) await pool.query('UPDATE media SET besloten = true WHERE id = $1 AND besloten = false', [id]);
  } catch (err) {
    console.error('[db] Markeren besloten media mislukt:', err.message);
  }

  // Agenda: hele-dag-evenementen en automatische import vanaf bclmb.nl
  await pool.query(`ALTER TABLE evenementen ADD COLUMN IF NOT EXISTS hele_dag BOOLEAN NOT NULL DEFAULT false;`);
  await pool.query(`ALTER TABLE evenementen ADD COLUMN IF NOT EXISTS bron TEXT;`);
  await pool.query(`ALTER TABLE evenementen ADD COLUMN IF NOT EXISTS bron_uid TEXT;`);
  await pool.query(`ALTER TABLE evenementen ADD COLUMN IF NOT EXISTS bron_url TEXT;`);
  await pool.query(`ALTER TABLE evenementen ADD COLUMN IF NOT EXISTS bron_hash TEXT;`);
  await pool.query(`ALTER TABLE evenementen ADD COLUMN IF NOT EXISTS bron_afbeelding_url TEXT;`);
  await pool.query(`ALTER TABLE evenementen ADD COLUMN IF NOT EXISTS bron_bijgewerkt TIMESTAMPTZ;`);
  await pool.query(`CREATE INDEX IF NOT EXISTS evenementen_bron_idx ON evenementen(bron, bron_uid);`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agenda_import_negeer (
      id          SERIAL PRIMARY KEY,
      bron        TEXT NOT NULL,
      bron_uid    TEXT NOT NULL,
      aangemaakt  TIMESTAMPTZ DEFAULT now()
    );
  `);

  // Uitgebreid profiel: meerdere bedrijven per lid + extra persoonlijke velden
  await pool.query(`
    CREATE TABLE IF NOT EXISTS bedrijven (
      id            SERIAL PRIMARY KEY,
      user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
      naam          TEXT NOT NULL,
      functie       TEXT,
      branche       TEXT,
      omschrijving  TEXT,
      website       TEXT,
      email         TEXT,
      telefoon      TEXT,
      adres         TEXT,
      postcode      TEXT,
      plaats        TEXT,
      kvk           TEXT,
      linkedin      TEXT,
      logo_id       INTEGER REFERENCES media(id) ON DELETE SET NULL,
      hoofd         BOOLEAN NOT NULL DEFAULT false,
      volgorde      INTEGER NOT NULL DEFAULT 0,
      aangemaakt    TIMESTAMPTZ DEFAULT now()
    );
  `);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS foto_id INTEGER REFERENCES media(id) ON DELETE SET NULL;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_email TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS linkedin TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS expertise TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS aanbod TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS vraag TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS defensie_relatie TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS defensie_toelichting TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS toon_telefoon BOOLEAN NOT NULL DEFAULT true;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS toon_email BOOLEAN NOT NULL DEFAULT true;`);

  // Eenmalig: bestaande bedrijfsgegevens op het profiel overzetten naar de bedrijventabel.
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.bedrijf, u.functie, u.branche, u.plaats, u.website, u.logo_id
       FROM users u LEFT JOIN bedrijven b ON b.user_id = u.id
       WHERE b.id IS NULL AND u.bedrijf IS NOT NULL AND u.bedrijf <> ''`
    );
    for (const u of rows) {
      await pool.query(
        `INSERT INTO bedrijven (user_id, naam, functie, branche, plaats, website, logo_id, hoofd)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true)`,
        [u.id, u.bedrijf, u.functie, u.branche, u.plaats, u.website, u.logo_id]
      );
    }
    if (rows.length) console.log('[db] Bedrijfsgegevens overgezet naar de bedrijventabel voor', rows.length, 'leden.');
  } catch (err) {
    console.error('[db] Overzetten bedrijven mislukt:', err.message);
  }

  // Partners & initiatieven
  await pool.query(`
    CREATE TABLE IF NOT EXISTS partners (
      id              SERIAL PRIMARY KEY,
      naam            TEXT NOT NULL,
      categorie       TEXT,
      samenvatting    TEXT,
      omschrijving    TEXT,
      website         TEXT,
      contact_email   TEXT,
      logo_id         INTEGER REFERENCES media(id) ON DELETE SET NULL,
      uitgelicht      BOOLEAN NOT NULL DEFAULT false,
      gepubliceerd    BOOLEAN NOT NULL DEFAULT true,
      volgorde        INTEGER NOT NULL DEFAULT 0,
      aangedragen_door INTEGER REFERENCES users(id) ON DELETE SET NULL,
      auteur_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
      aangemaakt      TIMESTAMPTZ DEFAULT now(),
      bijgewerkt      TIMESTAMPTZ DEFAULT now()
    );
  `);

  // Sponsorverzoeken voor militairen en veteranen (gevonden door de assistent of handmatig; eerst controle, dan publiek)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sponsorverzoeken (
      id                   SERIAL PRIMARY KEY,
      titel                TEXT NOT NULL,
      organisatie          TEXT,
      samenvatting         TEXT,
      omschrijving         TEXT,
      url                  TEXT,
      url_sleutel          TEXT,
      titel_sleutel        TEXT,
      bron                 TEXT NOT NULL DEFAULT 'handmatig',
      bron_uid             TEXT,
      bron_naam            TEXT,
      doelgroep            TEXT,
      plaats               TEXT,
      doelbedrag           TEXT,
      einddatum            TEXT,
      gepubliceerd_op_bron TIMESTAMPTZ,
      zoekterm             TEXT,
      status               TEXT NOT NULL DEFAULT 'nieuw',
      uitgelicht           BOOLEAN NOT NULL DEFAULT false,
      beoordeeld_door      INTEGER REFERENCES users(id) ON DELETE SET NULL,
      beoordeeld_op        TIMESTAMPTZ,
      auteur_id            INTEGER REFERENCES users(id) ON DELETE SET NULL,
      aangemaakt           TIMESTAMPTZ DEFAULT now(),
      bijgewerkt           TIMESTAMPTZ DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS sponsorverzoeken_status_idx ON sponsorverzoeken(status);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS sponsorverzoeken_url_idx ON sponsorverzoeken(url_sleutel);`);

  // Beveiliging: tweestapsverificatie en wachtwoord-herstel (idempotent)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_ingeschakeld BOOLEAN NOT NULL DEFAULT false;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_laatste_stap BIGINT;`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS backup_codes TEXT[] NOT NULL DEFAULT '{}';`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wachtwoord_resets (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
      token_hash  TEXT UNIQUE NOT NULL,
      verloopt_op TIMESTAMPTZ NOT NULL,
      gebruikt_op TIMESTAMPTZ,
      aangemaakt  TIMESTAMPTZ DEFAULT now()
    );
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS wachtwoord_resets_user_idx ON wachtwoord_resets(user_id);`);

  // Adminaccount seeden vanuit omgevingsvariabelen.
  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const adminPass = process.env.ADMIN_PASSWORD;
  const adminNaam = process.env.ADMIN_NAAM || 'Beheerder';

  if (adminEmail && adminPass) {
    const { rows } = await pool.query('SELECT id, rol FROM users WHERE email = $1', [adminEmail]);
    if (rows.length === 0) {
      const hash = await bcrypt.hash(adminPass, 12);
      await pool.query(
        `INSERT INTO users (naam, email, wachtwoord_hash, rol, actief)
         VALUES ($1, $2, $3, 'admin', true)`,
        [adminNaam, adminEmail, hash]
      );
      console.log('[db] Adminaccount aangemaakt voor', adminEmail);
    } else if (rows[0].rol !== 'admin') {
      await pool.query("UPDATE users SET rol = 'admin' WHERE email = $1", [adminEmail]);
      console.log('[db] Bestaand account gepromoveerd tot admin:', adminEmail);
    }
  } else {
    console.warn('[db] ADMIN_EMAIL/ADMIN_PASSWORD niet ingesteld; geen admin geseed.');
  }

  // Voorbeeld-evenementen seeden (alleen als er nog geen agenda is).
  try {
    const telling = (await pool.query('SELECT COUNT(*)::int AS n FROM evenementen')).rows[0].n;
    if (telling === 0) {
      const admin = (await pool.query("SELECT id FROM users WHERE rol = 'admin' ORDER BY id LIMIT 1")).rows[0];
      const auteurId = admin ? admin.id : null;
      const overDagen = (dagen, uur, min) => {
        const d = new Date();
        d.setDate(d.getDate() + dagen);
        d.setHours(uur, min, 0, 0);
        return isoLokaal(d);
      };
      const voorbeelden = [
        ['BCLMB Sportdag', 'Sportief',
         'Sportieve teamdag voor leden en de brigade — militaire hindernisbaan, teamspellen en een gezamenlijke afsluiting.',
         'Oranjekazerne, Schaarsbergen', overDagen(25, 10, 0), overDagen(25, 16, 0), true, 60],
        ['Baretuitreiking', 'Ceremonieel',
         'Bijzonder moment waarop nieuwe luchtmobiele militairen hun rode baret ontvangen. Als club zijn we hierbij aanwezig.',
         'Oranjekazerne, Schaarsbergen', overDagen(45, 14, 0), null, true, null],
        ['Excursie Falcon Leap', 'Excursie',
         'Bezoek aan de grote internationale para-oefening Falcon Leap op en rond de Ginkelse Heide.',
         'Ginkelse Heide, Ede', overDagen(75, 9, 30), overDagen(75, 13, 0), true, 40],
        ['Relatie-event op de kazerne', 'Netwerk',
         'Netwerkavond voor leden en relaties, met een kijkje achter de schermen bij de brigade en volop gelegenheid om bij te praten.',
         'Oranjekazerne, Schaarsbergen', overDagen(110, 17, 0), overDagen(110, 21, 0), true, 80]
      ];
      for (const v of voorbeelden) {
        await pool.query(
          `INSERT INTO evenementen (titel, categorie, omschrijving, locatie, start_op, eind_op, aanmelden, max_plaatsen, auteur_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [...v, auteurId]
        );
      }
      console.log('[db] Voorbeeld-evenementen geseed.');
    }
  } catch (err) {
    console.error('[db] Seeden evenementen mislukt:', err.message);
  }

  // Voorbeeld-nieuwsbericht seeden.
  try {
    const n = (await pool.query('SELECT COUNT(*)::int AS n FROM nieuws')).rows[0].n;
    if (n === 0) {
      const admin = (await pool.query("SELECT id FROM users WHERE rol='admin' ORDER BY id LIMIT 1")).rows[0];
      await pool.query(
        `INSERT INTO nieuws (titel, inhoud, auteur_id) VALUES ($1,$2,$3)`,
        ['Welkom op het vernieuwde platform',
         'Fijn dat je er bent! Op dit platform vind je de agenda met onze evenementen, de ledengids, vacatures en projecten, en alles rond veteranenzaken.\n\nHoud de agenda in de gaten voor de eerstvolgende activiteiten en meld je direct aan. Tot snel!',
         admin ? admin.id : null]
      );
      console.log('[db] Voorbeeld-nieuwsbericht geseed.');
    }
  } catch (err) { console.error('[db] Seeden nieuws mislukt:', err.message); }

  console.log('[db] Initialisatie voltooid.');
}

module.exports = init;
