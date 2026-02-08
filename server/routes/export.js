import express from 'express';
import { getCompetitors, getScores, getLeaderboard, getSettings, getSections, importData } from '../db.js';

const router = express.Router();

// GET export all data as JSON
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

// GET export standings as CSV with detailed section results
router.get('/csv', (req, res) => {
  try {
    const leaderboard = getLeaderboard();
    const settings = getSettings();
    const sections = getSections();
    const allScores = getScores();
    const LAPS = 3;

    // Separate section types
    const mainSections = sections.filter(s => s.type === 'main');
    const kidsSections = sections.filter(s => s.type === 'kids');
    const enduroSections = sections.filter(s => s.type === 'enduro');

    // Helper: build section columns and rows for a group of riders
    function buildClassTable(classLabel, riders, classSections, isEnduro) {
      if (riders.length === 0) return [];

      const maxSections = classSections.length * LAPS;

      // Separate completed vs incomplete
      const completed = riders.filter(r => {
        const done = isEnduro ? r.enduro_sections_done : r.main_sections_done;
        return done >= maxSections;
      });
      const incomplete = riders.filter(r => {
        const done = isEnduro ? r.enduro_sections_done : r.main_sections_done;
        return done < maxSections;
      });

      // Sort each group by total (lowest first), then by last scored time (earlier wins)
      const sortFn = (a, b) => {
        const aTotal = isEnduro ? a.enduro_total : a.main_total;
        const bTotal = isEnduro ? b.enduro_total : b.main_total;
        if (aTotal !== bTotal) return aTotal - bTotal;
        const aTime = isEnduro ? a.enduro_last_scored_at : a.main_last_scored_at;
        const bTime = isEnduro ? b.enduro_last_scored_at : b.main_last_scored_at;
        if (aTime && bTime && aTime !== bTime) return aTime < bTime ? -1 : 1;
        return 0;
      };
      completed.sort(sortFn);
      incomplete.sort(sortFn);

      // Assign ranks to completed riders
      let rank = 1;
      const rankedCompleted = completed.map((entry, i) => {
        if (i > 0) {
          const prevTotal = isEnduro ? completed[i - 1].enduro_total : completed[i - 1].main_total;
          const curTotal = isEnduro ? entry.enduro_total : entry.main_total;
          const prevTime = isEnduro ? completed[i - 1].enduro_last_scored_at : completed[i - 1].main_last_scored_at;
          const curTime = isEnduro ? entry.enduro_last_scored_at : entry.main_last_scored_at;
          if (curTotal !== prevTotal || curTime !== prevTime) rank = i + 1;
        }
        return { ...entry, rank };
      });

      const rankedIncomplete = incomplete.map(entry => ({ ...entry, rank: '-' }));
      const allRiders = [...rankedCompleted, ...rankedIncomplete];

      // Build section column headers ordered by lap: S1L1, S2L1, ..., S1L2, S2L2, ...
      const sectionHeaders = [];
      const sectionLapOrder = []; // { sec, lap } in column order
      for (let lap = 1; lap <= LAPS; lap++) {
        for (let i = 0; i < classSections.length; i++) {
          sectionHeaders.push(`S${i + 1}L${lap}`);
          sectionLapOrder.push({ sec: classSections[i], lap });
        }
      }

      const rows = [];
      rows.push([classLabel.toUpperCase()]);
      rows.push(['Rank', 'Number', 'Name', ...sectionHeaders, 'Total']);

      for (const rider of allRiders) {
        const row = [rider.rank, rider.number, `"${rider.name}"`];

        let total = 0;
        for (const { sec, lap } of sectionLapOrder) {
          // Find score for this rider, section, lap
          const score = allScores.find(s => 
            s.competitor_id === rider.id && 
            s.section_id === sec.id && 
            s.lap === lap
          );

          if (!score || score.points === null) {
            row.push(20);
            total += 20;
          } else {
            row.push(score.points);
            total += score.points;
          }
        }
        row.push(total);
        rows.push(row);
      }

      return rows;
    }

    // Build CSV content
    const csvRows = [];
    const eventName = settings.event_name || 'Trial';
    csvRows.push([`${eventName} - Results`]);
    csvRows.push([`Exported: ${new Date().toLocaleString()}`]);
    csvRows.push([]);

    // Kids
    const kidsRiders = leaderboard.filter(c => c.primary_class === 'kids');
    if (kidsRiders.length > 0) {
      csvRows.push(...buildClassTable('Kids', kidsRiders, kidsSections, false));
      csvRows.push([]);
    }

    // Clubman
    const clubmanRiders = leaderboard.filter(c => c.primary_class === 'clubman');
    if (clubmanRiders.length > 0) {
      csvRows.push(...buildClassTable('Clubman', clubmanRiders, mainSections, false));
      csvRows.push([]);
    }

    // Advanced
    const advancedRiders = leaderboard.filter(c => c.primary_class === 'advanced');
    if (advancedRiders.length > 0) {
      csvRows.push(...buildClassTable('Advanced', advancedRiders, mainSections, false));
      csvRows.push([]);
    }

    // Enduro Trial
    const enduroRiders = leaderboard.filter(c => c.enduro_trial === 1 || c.primary_class === 'enduro-trial');
    if (enduroRiders.length > 0) {
      csvRows.push(...buildClassTable('Enduro Trial', enduroRiders, enduroSections, true));
    }

    const csv = csvRows.map(r => r.join(',')).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="trial-standings-${Date.now()}.csv"`);
    res.send(csv);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST import data from JSON
router.post('/json', (req, res) => {
  try {
    const { settings, competitors, scores } = req.body;
    
    if (!competitors || !scores) {
      return res.status(400).json({ error: 'Invalid import data: missing competitors or scores' });
    }
    
    const result = importData({ settings, competitors, scores });
    
    // Broadcast update to all clients
    const io = req.app.get('io');
    if (io) {
      io.emit('competitor_update');
      io.emit('score_update');
    }
    
    res.json({ 
      success: true, 
      imported: {
        competitors: result.competitors,
        scores: result.scores
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
