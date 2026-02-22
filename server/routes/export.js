import express from 'express';
import archiver from 'archiver';
import AdmZip from 'adm-zip';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getCompetitors, getScores, getLeaderboard, getSettings, getSections, getClasses, importData } from '../db.js';

const router = express.Router();
const uploadZip = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

const baseDir = fs.existsSync('/app/data') ? '/app/data' : path.join(path.dirname(new URL(import.meta.url).pathname), '../..');
const uploadsDir = path.join(baseDir, 'uploads');

// GET export full event as ZIP
router.get('/event', (req, res) => {
  try {
    const data = {
      exported_at: new Date().toISOString(),
      settings: getSettings(),
      competitors: getCompetitors(),
      sections: getSections(),
      scores: getScores(),
      leaderboard: getLeaderboard()
    };

    const archive = archiver('zip', { zlib: { level: 5 } });
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="trial-event-${Date.now()}.zip"`);
    archive.pipe(res);
    archive.append(JSON.stringify(data, null, 2), { name: 'data.json' });

    if (fs.existsSync(uploadsDir)) {
      const photos = fs.readdirSync(uploadsDir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
      for (const photo of photos) {
        archive.file(path.join(uploadsDir, photo), { name: `photos/${photo}` });
      }
    }
    archive.finalize();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST import full event from ZIP
router.post('/event', uploadZip.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const zip = new AdmZip(req.file.buffer);
    const dataEntry = zip.getEntry('data.json');
    if (!dataEntry) return res.status(400).json({ error: 'Invalid backup: missing data.json' });

    const data = JSON.parse(dataEntry.getData().toString('utf8'));
    const { settings, competitors, scores } = data;
    if (!competitors || !scores) return res.status(400).json({ error: 'Invalid backup: missing competitors or scores' });

    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    const photoEntries = zip.getEntries().filter(e => e.entryName.startsWith('photos/') && !e.isDirectory);
    for (const entry of photoEntries) {
      fs.writeFileSync(path.join(uploadsDir, path.basename(entry.entryName)), entry.getData());
    }

    const result = importData({ settings, competitors, scores });

    const io = req.app.get('io');
    if (io) { io.emit('competitor_update'); io.emit('score_update'); }

    res.json({ success: true, imported: { competitors: result.competitors, scores: result.scores, photos: photoEntries.length } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET export standings as CSV
router.get('/csv', (req, res) => {
  try {
    const leaderboard = getLeaderboard();
    const settings = getSettings();
    const allSections = getSections();
    const allScores = getScores();
    const classes = getClasses();

    function buildClassTable(cls) {
      const riders = leaderboard.filter(c => (c.classes || []).includes(cls.id));
      if (riders.length === 0) return [];

      const classSections = allSections.filter(s => cls.section_ids.includes(s.id));
      const maxSections = classSections.length * cls.laps;

      const completed = riders.filter(r => {
        const ct = r.class_totals?.[cls.id];
        return ct && ct.sections_done >= maxSections;
      });
      const incomplete = riders.filter(r => {
        const ct = r.class_totals?.[cls.id];
        return !ct || ct.sections_done < maxSections;
      });

      const sortFn = (a, b) => {
        const aT = a.class_totals?.[cls.id]?.total ?? 0;
        const bT = b.class_totals?.[cls.id]?.total ?? 0;
        if (aT !== bT) return aT - bT;
        const aTime = a.class_totals?.[cls.id]?.last_scored_at || '';
        const bTime = b.class_totals?.[cls.id]?.last_scored_at || '';
        if (aTime !== bTime) return aTime < bTime ? -1 : 1;
        return 0;
      };
      completed.sort(sortFn);
      incomplete.sort(sortFn);

      let rank = 1;
      const rankedCompleted = completed.map((entry, i) => {
        if (i > 0) {
          const prev = completed[i - 1].class_totals?.[cls.id];
          const cur = entry.class_totals?.[cls.id];
          if ((cur?.total ?? 0) !== (prev?.total ?? 0) || (cur?.last_scored_at || '') !== (prev?.last_scored_at || '')) rank = i + 1;
        }
        return { ...entry, rank };
      });
      const rankedIncomplete = incomplete.map(entry => ({ ...entry, rank: '-' }));
      const allRiders = [...rankedCompleted, ...rankedIncomplete];

      // Build headers: S1L1, S2L1, ..., S1L2, ...
      const sectionHeaders = [];
      const sectionLapOrder = [];
      for (let lap = 1; lap <= cls.laps; lap++) {
        for (let i = 0; i < classSections.length; i++) {
          sectionHeaders.push(`S${i + 1}L${lap}`);
          sectionLapOrder.push({ sec: classSections[i], lap });
        }
      }

      const rows = [];
      rows.push([cls.name.toUpperCase()]);
      rows.push(['Rank', 'Number', 'Name', ...sectionHeaders, 'Total']);

      for (const rider of allRiders) {
        const row = [rider.rank, rider.number, `"${rider.name}"`];
        let total = 0;
        for (const { sec, lap } of sectionLapOrder) {
          const score = allScores.find(s =>
            s.competitor_id === rider.id && s.section_id === sec.id && s.lap === lap
          );
          if (!score || score.points === null) { row.push(20); total += 20; }
          else { row.push(score.points); total += score.points; }
        }
        row.push(total);
        rows.push(row);
      }
      return rows;
    }

    const csvRows = [];
    const eventName = settings.event_name || 'Trial';
    csvRows.push([`${eventName} - Results`]);
    csvRows.push([`Exported: ${new Date().toLocaleString()}`]);
    csvRows.push([]);

    for (const cls of classes) {
      const table = buildClassTable(cls);
      if (table.length > 0) {
        csvRows.push(...table);
        csvRows.push([]);
      }
    }

    const csv = csvRows.map(r => r.join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="trial-standings-${Date.now()}.csv"`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET export all data as JSON (backward compat)
router.get('/json', (req, res) => {
  try {
    const data = {
      exported_at: new Date().toISOString(),
      settings: getSettings(),
      competitors: getCompetitors(),
      sections: getSections(),
      scores: getScores(),
      leaderboard: getLeaderboard()
    };
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="trial-export-${Date.now()}.json"`);
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST import data from JSON (backward compat)
router.post('/json', (req, res) => {
  try {
    const { settings, competitors, scores } = req.body;
    if (!competitors || !scores) return res.status(400).json({ error: 'Invalid import data' });
    const result = importData({ settings, competitors, scores });
    const io = req.app.get('io');
    if (io) { io.emit('competitor_update'); io.emit('score_update'); }
    res.json({ success: true, imported: { competitors: result.competitors, scores: result.scores } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
