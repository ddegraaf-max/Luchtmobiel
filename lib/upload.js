// Veilige uploads: bestandstype wordt uit de inhoud zelf bepaald (magic bytes), niet uit
// wat de browser opgeeft. SVG is niet toegestaan (kan scripts bevatten). Naast afbeeldingen
// kan een nieuwsbericht een PDF-bijlage krijgen (bijv. een nieuwsbrief). Te grote bestanden
// geven een nette melding.

const multer = require('multer');
const pool = require('../db/pool');
const { kapInvoer } = require('../middleware/security');

const TOEGESTAAN = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

// Bepaalt het echte type van een afbeelding aan de hand van de eerste bytes.
function detecteerAfbeelding(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  const kop6 = buf.subarray(0, 6).toString('ascii');
  if (kop6 === 'GIF87a' || kop6 === 'GIF89a') return 'image/gif';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

// Een echt PDF-bestand begint met "%PDF-".
function detecteerPdf(buf) {
  if (!buf || buf.length < 8) return null;
  return buf.subarray(0, 5).toString('ascii') === '%PDF-' ? 'application/pdf' : null;
}

/**
 * Middleware: één afbeeldingsveld uploaden (in het geheugen).
 * Bij een ongeldig of te groot bestand wordt req.file leeggemaakt en
 * req.uploadFout gevuld met een leesbare melding.
 */
function afbeelding(veld, { maxMb = 2 } = {}) {
  const m = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxMb * 1024 * 1024, files: 1 },
    fileFilter: (req, file, cb) => cb(null, TOEGESTAAN.includes(file.mimetype))
  }).single(veld);

  return (req, res, next) => {
    m(req, res, (err) => {
      kapInvoer(req.body); // multipart-velden: zelfde begrenzing als gewone formulieren
      if (err) {
        req.file = undefined;
        req.uploadFout = err.code === 'LIMIT_FILE_SIZE'
          ? `De afbeelding is te groot (maximaal ${maxMb} MB).`
          : 'Het bestand kon niet worden geüpload.';
        return next();
      }
      if (req.file) {
        const echt = detecteerAfbeelding(req.file.buffer);
        if (!echt) {
          req.file = undefined;
          req.uploadFout = 'Kies een geldige afbeelding (JPG, PNG, WebP of GIF).';
        } else {
          req.file.mimetype = echt; // vertrouw op de inhoud, niet op de browser
        }
      }
      next();
    });
  };
}

/**
 * Middleware: meerdere afbeeldingsvelden met wisselende namen (bijv. één logo per
 * bedrijf). Geldige bestanden komen in req.files (met .fieldname); ongeldige of te
 * grote bestanden zetten req.uploadFout.
 */
function afbeeldingen({ maxMb = 2, maxBestanden = 12 } = {}) {
  const m = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxMb * 1024 * 1024, files: maxBestanden },
    fileFilter: (req, file, cb) => cb(null, TOEGESTAAN.includes(file.mimetype))
  }).any();

  return (req, res, next) => {
    m(req, res, (err) => {
      kapInvoer(req.body);
      if (err) {
        req.files = [];
        req.uploadFout = err.code === 'LIMIT_FILE_SIZE'
          ? `Een van de afbeeldingen is te groot (maximaal ${maxMb} MB per bestand).`
          : 'De bestanden konden niet worden geüpload.';
        return next();
      }
      const goed = [];
      for (const f of req.files || []) {
        const echt = detecteerAfbeelding(f.buffer);
        if (!echt) req.uploadFout = 'Een van de gekozen bestanden is geen geldige afbeelding (alleen JPG, PNG, WebP of GIF).';
        else { f.mimetype = echt; goed.push(f); }
      }
      req.files = goed;
      next();
    });
  };
}

/**
 * Middleware: één afbeeldingsveld plus één PDF-veld (bijlage) in hetzelfde formulier,
 * zoals bij een nieuwsbericht. Een geldige afbeelding komt in req.file, een geldige PDF in
 * req.bijlage; een ongeldig of te groot bestand laat dat veld leeg en zet req.uploadFout.
 */
function afbeeldingEnPdf(afbVeld, pdfVeld, { maxMb = 2, maxMbPdf = 10 } = {}) {
  const m = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: Math.max(maxMb, maxMbPdf) * 1024 * 1024, files: 2 },
    fileFilter: (req, file, cb) => {
      if (file.fieldname === afbVeld) return cb(null, TOEGESTAAN.includes(file.mimetype));
      if (file.fieldname === pdfVeld) return cb(null, file.mimetype === 'application/pdf' || file.mimetype === 'application/octet-stream');
      cb(null, false);
    }
  }).fields([{ name: afbVeld, maxCount: 1 }, { name: pdfVeld, maxCount: 1 }]);

  return (req, res, next) => {
    m(req, res, (err) => {
      kapInvoer(req.body);
      req.file = undefined;
      req.bijlage = undefined;
      if (err) {
        req.uploadFout = err.code === 'LIMIT_FILE_SIZE'
          ? `Een bestand is te groot (afbeelding maximaal ${maxMb} MB, PDF maximaal ${maxMbPdf} MB).`
          : 'Het bestand kon niet worden geüpload.';
        return next();
      }
      const afb = req.files && req.files[afbVeld] && req.files[afbVeld][0];
      const pdf = req.files && req.files[pdfVeld] && req.files[pdfVeld][0];
      if (afb) {
        const echt = detecteerAfbeelding(afb.buffer);
        if (!echt) req.uploadFout = 'Kies een geldige afbeelding (JPG, PNG, WebP of GIF).';
        else if (afb.size > maxMb * 1024 * 1024) req.uploadFout = `De afbeelding is te groot (maximaal ${maxMb} MB).`;
        else { afb.mimetype = echt; req.file = afb; }
      }
      if (pdf) {
        if (!detecteerPdf(pdf.buffer)) req.uploadFout = req.uploadFout || 'De bijlage is geen geldig PDF-bestand.';
        else { pdf.mimetype = 'application/pdf'; req.bijlage = pdf; }
      }
      next();
    });
  };
}

// Slaat een gevalideerde upload (afbeelding of PDF) op in de media-tabel; geeft het id terug
// (of null). Optioneel met een eigen client (binnen een transactie). besloten = alleen zichtbaar
// voor ingelogde leden (profielfoto's en bedrijfslogo's uit de ledengids).
async function bewaarAfbeelding(file, eigenaarId, db = pool, { besloten = false } = {}) {
  if (!file) return null;
  const { rows } = await db.query(
    'INSERT INTO media (mime, data, eigenaar_id, besloten) VALUES ($1, $2, $3, $4) RETURNING id',
    [file.mimetype, file.buffer, eigenaarId, besloten]
  );
  return rows[0].id;
}

module.exports = { afbeelding, afbeeldingen, afbeeldingEnPdf, bewaarAfbeelding, detecteerAfbeelding, detecteerPdf, TOEGESTAAN };
