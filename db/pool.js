const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('[db] Geen DATABASE_URL gevonden. Stel deze in op Railway (Postgres) of lokaal in .env');
}

// Railway Postgres vereist meestal SSL. Lokaal niet. We zetten SSL aan
// zodra de verbinding niet naar localhost wijst.
const isLocal = /localhost|127\.0\.0\.1/.test(connectionString || '');

const pool = new Pool({
  connectionString,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000
});

pool.on('error', (err) => {
  console.error('[db] Onverwachte poolfout:', err.message);
});

module.exports = pool;
