import { Router } from 'express';
import jwt from 'jsonwebtoken';

const router = Router();

// ── Hardcoded credentials (override via env vars) ─────────────────────────────
const AUTH_USERNAME = process.env.AUTH_USERNAME || 'admin';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD || 'admin';
const JWT_SECRET    = process.env.JWT_SECRET    || 'leadgen-dev-secret-change-in-production';
const JWT_EXPIRES   = '12h';

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};

  if (
    typeof username !== 'string' ||
    typeof password !== 'string' ||
    username.trim() !== AUTH_USERNAME ||
    password !== AUTH_PASSWORD
  ) {
    // Uniform error — don't hint which field was wrong
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ sub: username }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
  return res.json({ token, expiresIn: JWT_EXPIRES });
});

// POST /api/auth/verify  — lets the frontend silently re-validate a stored token
router.post('/verify', (req, res) => {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ valid: false });

  try {
    jwt.verify(token, JWT_SECRET);
    return res.json({ valid: true });
  } catch {
    return res.status(401).json({ valid: false });
  }
});

export default router;
export { JWT_SECRET };
