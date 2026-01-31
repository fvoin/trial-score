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

// GET export standings as CSV
router.get('/csv', (req, res) => {
  try {
    const leaderboard = getLeaderboard();
    const settings = getSettings();
    
    // Sort by class then by total
    const sorted = [...leaderboard].sort((a, b) => {
      if (a.primary_class !== b.primary_class) {
        const order = ['kids', 'clubman', 'advanced'];
        return order.indexOf(a.primary_class) - order.indexOf(b.primary_class);
      }
      return a.main_total - b.main_total;
    });
    
    // Add rank within class
    let currentClass = '';
    let rank = 0;
    const ranked = sorted.map(entry => {
      if (entry.primary_class !== currentClass) {
        currentClass = entry.primary_class;
        rank = 1;
      } else {
        rank++;
      }
      return { ...entry, rank };
    });
    
    // Build CSV
    const headers = ['Rank', 'Number', 'Name', 'Class', 'Sections Done', 'Total Points', 'DNS'];
    const rows = ranked.map(e => [
      e.rank,
      e.number,
      `"${e.name}"`,
      e.primary_class.toUpperCase(),
      e.main_sections_done,
      e.main_total,
      e.main_dnf_count
    ]);
    
    // Add enduro section if any enduro competitors
    const enduroEntries = leaderboard.filter(e => e.enduro_trial);
    if (enduroEntries.length > 0) {
      rows.push([]);
      rows.push(['ENDURO TRIAL']);
      rows.push(['Rank', 'Number', 'Name', 'Enduro Sections', 'Enduro Total', 'DNS']);
      
      const enduroSorted = [...enduroEntries].sort((a, b) => a.enduro_total - b.enduro_total);
      enduroSorted.forEach((e, i) => {
        rows.push([i + 1, e.number, `"${e.name}"`, e.enduro_sections_done, e.enduro_total, e.enduro_dnf_count]);
      });
    }
    
    const eventName = settings.event_name || 'Trial';
    const csv = [
      `${eventName} - Results`,
      `Exported: ${new Date().toLocaleString()}`,
      '',
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');
    
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
