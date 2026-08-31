// Versie-informatie van de draaiende site: het versienummer uit package.json (wordt bij elke
// update opgehoogd, zie CHANGELOG.md) plus de korte code van de commit die Railway heeft
// uitgerold. Zo is in de voettekst en in Beheer te zien welke update online staat.

const pkg = require('../package.json');

function korteCommit() {
  const uitOmgeving = process.env.RAILWAY_GIT_COMMIT_SHA || process.env.GIT_COMMIT || process.env.SOURCE_VERSION || '';
  if (uitOmgeving) return uitOmgeving.slice(0, 7);
  try {
    // Lokaal (ontwikkelen): uit de git-werkkopie
    return require('child_process').execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }).toString().trim();
  } catch (e) {
    return '';
  }
}

const versie = {
  nummer: pkg.version,
  commit: korteCommit(),
  bericht: (process.env.RAILWAY_GIT_COMMIT_MESSAGE || '').split('\n')[0].slice(0, 200),
  tak: process.env.RAILWAY_GIT_BRANCH || '',
  gestart: new Date()
};

// Voor weergave: "1.1.0 · 2fdd7dd"
versie.label = versie.nummer + (versie.commit ? ' · ' + versie.commit : '');

module.exports = versie;
