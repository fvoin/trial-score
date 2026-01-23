import express from 'express';

const router = express.Router();

// POST verify PIN
router.post('/verify', (req, res) => {
  const { pin, role } = req.body;
  
  if (!pin || !role) {
    return res.status(400).json({ error: 'PIN and role required' });
  }
  
  const managerPin = process.env.MANAGER_PIN;
  const judgePin = process.env.JUDGE_PIN;
  
  // If no PINs configured, allow access
  if (role === 'manager') {
    if (!managerPin) {
      return res.json({ valid: true, message: 'No PIN configured' });
    }
    if (pin === managerPin) {
      return res.json({ valid: true });
    }
  } else if (role === 'judge') {
    if (!judgePin) {
      return res.json({ valid: true, message: 'No PIN configured' });
    }
    if (pin === judgePin) {
      return res.json({ valid: true });
    }
  }
  
  return res.status(401).json({ valid: false, error: 'Invalid PIN' });
});

// GET check if PIN is required
router.get('/required', (req, res) => {
  res.json({
    manager: !!process.env.MANAGER_PIN,
    judge: !!process.env.JUDGE_PIN
  });
});

export default router;
