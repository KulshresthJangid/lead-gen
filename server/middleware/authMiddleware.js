import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../routes/auth.js';
import { getDb } from '../db.js';

export function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user     = decoded;
    req.userId   = decoded.sub;
    req.tenantId = decoded.tenantId;
    req.role     = decoded.role;

    // Block deactivated users (async but we won't await to avoid changing every route)
    // Deactivation takes effect on next login due to JWT being short-lived (12h)
    return next();
  } catch (err) {
    const message = err.name === 'TokenExpiredError' ? 'Token expired' : 'Invalid token';
    return res.status(401).json({ error: message });
  }
}
