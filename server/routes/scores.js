import express from 'express';
import fs from 'fs';
import path from 'path';
import {
  getScores,
  getScoresBySection,
  getNextLap,
  canStartNewLap,
  createScore,
  updateScore,
  deleteScore,
  deleteAllScores,
  deleteAllData,
  getSections,
  getClasses,
  getLeaderboard
} from '../db.js';
import { broadcastScoreUpdate } from '../socket.js';
import { sendScoreToSheet } from '../sheets.js';

const router = express.Router();

// GET all sections
router.get('/sections', (req, res) => {
  try {
    const sections = getSections();
    res.json(sections);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET all scores
router.get('/', (req, res) => {
  try {
    const scores = getScores();
    res.json(scores);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET scores by section
router.get('/section/:sectionId', (req, res) => {
  try {
    const scores = getScoresBySection(req.params.sectionId);
    res.json(scores);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET leaderboard
router.get('/leaderboard', (req, res) => {
  try {
    const leaderboard = getLeaderboard();
    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET next lap for competitor at section
router.get('/next-lap/:competitorId/:sectionId', (req, res) => {
  try {
    const { competitorId, sectionId } = req.params;
    const nextLap = getNextLap(competitorId, sectionId);
    // Pass sectionId to check lap completion for the correct section type
    const lapStatus = canStartNewLap(competitorId, sectionId);
    
    // If the next lap would be higher than current lap + 1, they need to complete current lap first
    // Exception: if they've already scored this section for current lap, they can score it again (edit case)
    const wouldStartNewLap = nextLap > lapStatus.currentLap;
    const canScore = !wouldStartNewLap || lapStatus.canScore;
    
    res.json({ 
      nextLap, 
      canScore,
      currentLap: lapStatus.currentLap,
      incompleteSections: wouldStartNewLap && !lapStatus.canScore ? lapStatus.incompleteSections : []
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create score
router.post('/', async (req, res) => {
  try {
    const { competitor_id, section_id, points, is_dnf } = req.body;
    
    // Auto-determine lap number
    const lap = getNextLap(competitor_id, section_id);
    
    // Dynamic lap limit from class config
    const lapStatus = canStartNewLap(competitor_id, section_id);
    const maxLap = lapStatus.maxLap || 3;
    if (lap > maxLap) {
      return res.status(400).json({ error: `All ${maxLap} laps already scored for this section` });
    }
    
    const wouldStartNewLap = lap > lapStatus.currentLap;
    if (wouldStartNewLap && !lapStatus.canScore) {
      const missing = lapStatus.incompleteSections.join(', ');
      return res.status(400).json({ 
        error: `Must complete Lap ${lapStatus.currentLap} first. Missing: ${missing}` 
      });
    }
    
    const score = createScore({
      competitor_id,
      section_id,
      lap,
      points: points,
      is_dnf: is_dnf ? 1 : 0
    });
    
    const io = req.app.get('io');
    broadcastScoreUpdate(io, score);
    
    // Send to Google Sheet backup asynchronously
    sendScoreToSheet(score).catch(console.error);
    
    res.status(201).json(score);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update score
router.put('/:id', async (req, res) => {
  try {
    const { points, is_dnf } = req.body;
    
    const score = updateScore(req.params.id, {
      points: points,
      is_dnf: is_dnf ? 1 : 0
    });
    
    const io = req.app.get('io');
    broadcastScoreUpdate(io, score);
    
    // Send to Google Sheet backup asynchronously
    sendScoreToSheet(score).catch(console.error);
    
    res.json(score);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE all scores (must be before /:id route)
router.delete('/all', (req, res) => {
  try {
    deleteAllScores();
    
    const io = req.app.get('io');
    io.emit('leaderboard', getLeaderboard());
    
    res.status(204).send();
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE everything: competitors, scores, and photos
router.delete('/everything', (req, res) => {
  try {
    deleteAllData();

    const baseDir = fs.existsSync('/app/data') ? '/app/data' : path.join(path.dirname(new URL(import.meta.url).pathname), '../..');
    const uploadsDir = path.join(baseDir, 'uploads');
    if (fs.existsSync(uploadsDir)) {
      const photos = fs.readdirSync(uploadsDir).filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
      for (const photo of photos) {
        fs.unlinkSync(path.join(uploadsDir, photo));
      }
    }

    const io = req.app.get('io');
    io.emit('competitor_update');
    io.emit('score_update');
    io.emit('leaderboard', getLeaderboard());

    res.status(204).send();
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE score
router.delete('/:id', (req, res) => {
  try {
    deleteScore(req.params.id);
    
    const io = req.app.get('io');
    io.emit('leaderboard', getLeaderboard());
    
    res.status(204).send();
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
