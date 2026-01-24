import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import sharp from 'sharp';
import {
  getCompetitors,
  getCompetitor,
  createCompetitor,
  updateCompetitor,
  deleteCompetitor,
  getScoresByCompetitor
} from '../db.js';
import { broadcastCompetitorUpdate } from '../socket.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for photo uploads (memory storage for processing)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit (before resize)
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only image files allowed'));
    }
  }
});

// Resize and save image
async function processAndSaveImage(buffer) {
  const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
  const filename = `photo-${uniqueSuffix}.jpg`;
  const filepath = path.join(uploadsDir, filename);
  
  await sharp(buffer)
    .rotate() // Auto-orient based on EXIF data
    .resize(300, 300, {
      fit: 'cover',
      position: 'center'
    })
    .jpeg({ quality: 80 })
    .toFile(filepath);
  
  return `/uploads/${filename}`;
}

// GET all competitors
router.get('/', (req, res) => {
  try {
    const competitors = getCompetitors();
    res.json(competitors);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET single competitor with scores
router.get('/:id', (req, res) => {
  try {
    const competitor = getCompetitor(req.params.id);
    if (!competitor) {
      return res.status(404).json({ error: 'Competitor not found' });
    }
    const scores = getScoresByCompetitor(req.params.id);
    res.json({ ...competitor, scores });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST create competitor
router.post('/', upload.single('photo'), async (req, res) => {
  try {
    const { number, name, primary_class, enduro_trial } = req.body;
    
    let photo_url = null;
    if (req.file) {
      photo_url = await processAndSaveImage(req.file.buffer);
    }
    
    const competitor = createCompetitor({
      number: parseInt(number),
      name,
      primary_class,
      enduro_trial: enduro_trial === 'true' || enduro_trial === '1' ? 1 : 0,
      photo_url
    });
    
    const io = req.app.get('io');
    broadcastCompetitorUpdate(io);
    
    res.status(201).json(competitor);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// PUT update competitor
router.put('/:id', upload.single('photo'), async (req, res) => {
  try {
    const { number, name, primary_class, enduro_trial } = req.body;
    
    let photo_url = null;
    if (req.file) {
      photo_url = await processAndSaveImage(req.file.buffer);
    }
    
    const competitor = updateCompetitor(req.params.id, {
      number: parseInt(number),
      name,
      primary_class,
      enduro_trial: enduro_trial === 'true' || enduro_trial === '1' ? 1 : 0,
      photo_url
    });
    
    const io = req.app.get('io');
    broadcastCompetitorUpdate(io);
    
    res.json(competitor);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// DELETE competitor
router.delete('/:id', (req, res) => {
  try {
    deleteCompetitor(req.params.id);
    
    const io = req.app.get('io');
    broadcastCompetitorUpdate(io);
    
    res.status(204).send();
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
