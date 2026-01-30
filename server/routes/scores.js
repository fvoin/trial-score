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
    
    if (lap > 3) {
      return res.status(400).json({ error: 'All 3 laps already scored for this section' });
    }
    
    // Check if previous lap is complete at all sections of this type
    const lapStatus = canStartNewLap(competitor_id, section_id);
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
