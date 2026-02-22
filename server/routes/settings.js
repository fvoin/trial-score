import express from 'express';
import { getSettings, updateSettings } from '../db.js';

const router = express.Router();

// GET settings
router.get('/', (req, res) => {
  try {
    const settings = getSettings();
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT update settings
router.put('/', (req, res) => {
  try {
    const settings = updateSettings(req.body);
    res.json(settings);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
