const express = require('express');
const router = express.Router();
const multer = require('multer');
const pool = require('../db/pool');
const { requireLogin } = require('../middleware/auth');
const { netteUrl, isEmail } = require('../lib/helpers');

const STEUNTYPES = ['Financieel', 'Vrijwilligers', 'Expertise', 'Materiaal', 'Bekendheid', 'Overig'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(png|jpe?g|webp|gif)$/.test(file.mimetype))
});

async function bewaarAfbeelding(file, uid) {
  if (!file) return null;
  const m = await pool.query(
    'INSERT INTO media (mime, data, eigenaar_id) VALUES ($1,$2,$3) RETURNING id',
    [file.mimetype, file.buffer, uid]
  );
  return m.rows[0].id;
}

// Overzicht
router.get('/', async (req, res) => {
  const type = (req.query.type || '').trim();
  let sql = `SELECT p.*, u.naam AS plaatser FROM projecten p JOIN users u ON u.id = p.user_id WHERE 1=1`;
  const params = [];
  if (type) { params.push(type); sql += ` AND p.steun_type = $${params.length}`; }
  sql += ' ORDER BY p.aangemaakt DESC';
  try {
    const projecten = (await pool.query(sql, params)).rows;
    res.render('projecten/index', { title: 'Ondersteuningsprojecten', projecten, steuntypes: STEUNTYPES, type });
  } catch (err) {
    console.error('[projecten]', err.message);
    res.status(500).render('error', { title: 'Fout', bericht: 'De projecten konden niet worden geladen.' });
  }
});

// Nieuw
router.get('/nieuw', requireLogin, (req, res) => {
  res.render('projecten/form', {
    title: 'Project plaatsen', project: { contact_email: req.session.user.email },
    steuntypes: STEUNTYPES, actie: '/projecten/nieuw', fout: null
  });
});

router.post('/nieuw', requireLogin, upload.single('afbeelding'), async (req, res) => {
  const { titel, samenvatting, omschrijving, steun_type, doel, plaats, contact_email } = req.body;
  if (!titel) {
    return res.status(400).render('projecten/form', {
      title: 'Project plaatsen', project: req.body, steuntypes: STEUNTYPES,
      actie: '/projecten/nieuw', fout: 'Geef het project minimaal een titel.'
    });
  }
  try {
    const afbId = await bewaarAfbeelding(req.file, req.session.user.id);
    const { rows } = await pool.query(
      `INSERT INTO projecten (user_id, titel, samenvatting, omschrijving, steun_type, doel, plaats, afbeelding_id, contact_email)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [req.session.user.id, titel.trim(), samenvatting || null, omschrijving || null, steun_type || null,
       doel || null, plaats || null, afbId, contact_email && isEmail(contact_email) ? contact_email.trim() : null]
    );
    req.session.flash = { type: 'succes', message: 'Je project staat online.' };
    res.redirect('/projecten/' + rows[0].id);
  } catch (err) {
    console.error('[project nieuw]', err.message);
    res.status(500).render('projecten/form', {
      title: 'Project plaatsen', project: req.body, steuntypes: STEUNTYPES,
      actie: '/projecten/nieuw', fout: 'Opslaan mislukt. Probeer het opnieuw.'
    });
  }
});

// Detail
router.get('/:id', async (req, res) => {
  try {
    const project = (await pool.query(
      `SELECT p.*, u.naam AS plaatser FROM projecten p JOIN users u ON u.id = p.user_id WHERE p.id = $1`,
      [req.params.id]
    )).rows[0];
    if (!project) return res.status(404).render('error', { title: 'Niet gevonden', bericht: 'Dit project bestaat niet (meer).' });

    const u = req.session.user;
    const mag = !!u && (u.id === project.user_id || u.rol === 'admin');
    const aanmeldingen = mag
      ? (await pool.query(
          `SELECT a.bericht, a.aangemaakt, u.naam, u.id AS uid FROM project_aanmeldingen a
           JOIN users u ON u.id = a.user_id WHERE a.project_id = $1 ORDER BY a.aangemaakt DESC`,
          [project.id]
        )).rows
      : [];
    const alAangemeld = u ? (await pool.query(
      'SELECT 1 FROM project_aanmeldingen WHERE project_id = $1 AND user_id = $2',
      [project.id, u.id]
    )).rows.length > 0 : false;

    res.render('projecten/detail', { title: project.titel, project, mag, aanmeldingen, alAangemeld });
  } catch (err) {
    console.error('[project detail]', err.message);
    res.status(500).render('error', { title: 'Fout', bericht: 'Het project kon niet worden geladen.' });
  }
});

// Aanmelden voor een project
router.post('/:id/aanmelden', requireLogin, async (req, res) => {
  const { bericht } = req.body;
  try {
    const project = (await pool.query('SELECT id FROM projecten WHERE id = $1', [req.params.id])).rows[0];
    if (!project) return res.redirect('/projecten');
    const bestaat = (await pool.query(
      'SELECT 1 FROM project_aanmeldingen WHERE project_id=$1 AND user_id=$2', [project.id, req.session.user.id]
    )).rows.length > 0;
    if (!bestaat) {
      await pool.query(
        'INSERT INTO project_aanmeldingen (project_id, user_id, bericht) VALUES ($1,$2,$3)',
        [project.id, req.session.user.id, bericht || null]
      );
    }
    req.session.flash = { type: 'succes', message: 'Bedankt! De plaatser ziet jouw aanmelding in zijn dashboard.' };
  } catch (err) {
    console.error('[aanmelden]', err.message);
  }
  res.redirect('/projecten/' + req.params.id);
});

// Bewerken
router.get('/:id/bewerken', requireLogin, async (req, res) => {
  const project = (await pool.query('SELECT * FROM projecten WHERE id = $1', [req.params.id])).rows[0];
  if (!project) return res.status(404).render('error', { title: 'Niet gevonden', bericht: 'Dit project bestaat niet.' });
  if (req.session.user.id !== project.user_id && req.session.user.rol !== 'admin')
    return res.status(403).render('error', { title: 'Geen toegang', bericht: 'Je mag dit project niet bewerken.' });
  res.render('projecten/form', {
    title: 'Project bewerken', project, steuntypes: STEUNTYPES,
    actie: '/projecten/' + project.id + '/bewerken', fout: null
  });
});

router.post('/:id/bewerken', requireLogin, upload.single('afbeelding'), async (req, res) => {
  const project = (await pool.query('SELECT * FROM projecten WHERE id = $1', [req.params.id])).rows[0];
  if (!project) return res.status(404).render('error', { title: 'Niet gevonden', bericht: 'Dit project bestaat niet.' });
  if (req.session.user.id !== project.user_id && req.session.user.rol !== 'admin')
    return res.status(403).render('error', { title: 'Geen toegang', bericht: 'Je mag dit project niet bewerken.' });

  const { titel, samenvatting, omschrijving, steun_type, doel, plaats, contact_email } = req.body;
  const afbId = (await bewaarAfbeelding(req.file, req.session.user.id)) || project.afbeelding_id;
  await pool.query(
    `UPDATE projecten SET titel=$1, samenvatting=$2, omschrijving=$3, steun_type=$4, doel=$5, plaats=$6, afbeelding_id=$7, contact_email=$8 WHERE id=$9`,
    [titel.trim(), samenvatting || null, omschrijving || null, steun_type || null, doel || null,
     plaats || null, afbId, contact_email && isEmail(contact_email) ? contact_email.trim() : null, project.id]
  );
  req.session.flash = { type: 'succes', message: 'Project bijgewerkt.' };
  res.redirect('/projecten/' + project.id);
});

// Verwijderen
router.post('/:id/verwijderen', requireLogin, async (req, res) => {
  const project = (await pool.query('SELECT * FROM projecten WHERE id = $1', [req.params.id])).rows[0];
  if (project && (req.session.user.id === project.user_id || req.session.user.rol === 'admin')) {
    await pool.query('DELETE FROM projecten WHERE id = $1', [project.id]);
    req.session.flash = { type: 'succes', message: 'Project verwijderd.' };
  }
  res.redirect('/projecten');
});

module.exports = router;
