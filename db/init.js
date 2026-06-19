const pool = require('./pool');
const bcrypt = require('bcryptjs');

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
  `);

  // Adminaccount seeden vanuit omgevingsvariabelen.
  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const adminPass = process.env.ADMIN_PASSWORD;
  const adminNaam = process.env.ADMIN_NAAM || 'Beheerder';

  if (adminEmail && adminPass) {
    const { rows } = await pool.query('SELECT id, rol FROM users WHERE email = $1', [adminEmail]);
    if (rows.length === 0) {
      const hash = await bcrypt.hash(adminPass, 10);
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

  console.log('[db] Initialisatie voltooid.');
}

module.exports = init;
