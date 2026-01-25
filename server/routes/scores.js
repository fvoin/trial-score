import express from 'express';
import {
  getScores,
  getScoresBySection,
  getNextLap,
  canStartNewLap,
  createScore,
  updateScore,
  deleteScore,
  getSections,
  getLeaderboard
} from '../db.js';
import { broadcastScoreUpdate } from '../socket.js';
import { sendScoreEmail } from '../email.js';

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
    const nextLap = getNextLap(req.params.competitorId, req.params.sectionId);
    const canStart = canStartNewLap(req.params.competitorId, req.params.sectionId);
    res.json({ nextLap, canStart });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST start a new lap (creates incomplete score)
router.post('/start-lap', async (req, res) => {
  try {
    const { competitor_id, section_id } = req.body;
    
    // Check if previous lap is complete
    if (!canStartNewLap(competitor_id, section_id)) {
      return res.status(400).json({ error: 'Previous lap not finished yet' });
    }
    
    // Auto-determine lap number
    const lap = getNextLap(competitor_id, section_id);
    
    if (lap > 3) {
      return res.status(400).json({ error: 'All 3 laps already scored for this section' });
    }
    
    // Create incomplete score (no points, not DNF)
    const score = createScore({
      competitor_id,
      section_id,
      lap,
      points: null,
      is_dnf: 0
    });
    
    res.status(201).json(score);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// POST create score (complete a lap directly without start-lap)
router.post('/', async (req, res) => {
  try {
    const { competitor_id, section_id, points, is_dnf } = req.body;
    
    // Check if previous lap is complete
    if (!canStartNewLap(competitor_id, section_id)) {
      return res.status(400).json({ error: 'Previous lap not finished yet' });
    }
    
    // Auto-determine lap number
    const lap = getNextLap(competitor_id, section_id);
    
    if (lap > 3) {
      return res.status(400).json({ error: 'All 3 laps already scored for this section' });
    }
    
    const score = createScore({
      competitor_id,
      section_id,
      lap,
      points: is_dnf ? null : points,
      is_dnf: is_dnf ? 1 : 0
    });
    
    const io = req.app.get('io');
    broadcastScoreUpdate(io, score);
    
    // Send email backup asynchronously
    sendScoreEmail(score).catch(console.error);
    
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
      points: is_dnf ? null : points,
      is_dnf: is_dnf ? 1 : 0
    });
    
    const io = req.app.get('io');
    broadcastScoreUpdate(io, score);
    
    // Send email backup for correction
    sendScoreEmail(score).catch(console.error);
    
    res.json(score);
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
