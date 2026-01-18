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
    const { event_name, event_date, email_backup_address, email_backup_enabled } = req.body;
    
    const settings = updateSettings({
      event_name,
      event_date,
      email_backup_address,
      email_backup_enabled: email_backup_enabled ? 1 : 0
    });
    
    res.json(settings);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
