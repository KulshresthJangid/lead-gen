import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { getDb } from '../db.js';
import { requireRole } from '../middleware/requireRole.js';
import logger from '../utils/logger.js';

const router = Router();
// All routes here are mounted under /api/users — requireAuth applied at index.js

// GET /api/users — list all users in tenant
router.get('/', requireRole('owner', 'admin'), async (req, res) => {
  const db = getDb();
  try {
    const users = await db.all(
      `SELECT id, name, email, role, invited_by, created_at
       FROM users WHERE tenant_id = ? ORDER BY created_at ASC`,
      [req.tenantId],
    );
    return res.json(users);
  } catch (err) {
    logger.error({ err }, 'GET /users');
    return res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// POST /api/users/invite
const inviteSchema = z.object({
  email: z.string().email(),
  role:  z.enum(['admin', 'member', 'viewer']),
});

router.post('/invite', requireRole('owner', 'admin'), async (req, res) => {
  const parse = inviteSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.issues });

  const { email, role } = parse.data;
  const db = getDb();

  try {
    const existing = await db.get(
      'SELECT id FROM users WHERE tenant_id = ? AND email = ?',
      [req.tenantId, email],
    );
    if (existing) return res.status(409).json({ error: 'User already in this organisation' });

    const inviteId  = randomUUID();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

    await db.run(
      `INSERT OR REPLACE INTO invitations
         (id, tenant_id, email, role, invited_by, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [inviteId, req.tenantId, email, role, req.userId, expiresAt],
    );

    const appBase  = process.env.APP_URL || 'http://localhost:5173';
    const inviteUrl = `${appBase}/invite/accept?token=${inviteId}`;

    return res.status(201).json({ inviteUrl, expiresAt });
  } catch (err) {
    logger.error({ err }, 'POST /users/invite');
    return res.status(500).json({ error: 'Failed to create invitation' });
  }
});

// PUT /api/users/:id/role
router.put('/:id/role', requireRole('owner', 'admin'), async (req, res) => {
  const { role } = req.body || {};
  const validRoles = ['admin', 'member', 'viewer'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  if (req.params.id === req.userId) {
    return res.status(400).json({ error: 'Cannot change your own role' });
  }

  const db = getDb();
  try {
    const target = await db.get(
      'SELECT id, role FROM users WHERE id = ? AND tenant_id = ?',
      [req.params.id, req.tenantId],
    );
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.role === 'owner') return res.status(403).json({ error: 'Cannot change owner role' });

    await db.run('UPDATE users SET role = ? WHERE id = ?', [role, req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'PUT /users/:id/role');
    return res.status(500).json({ error: 'Failed to update role' });
  }
});

// DELETE /api/users/:id
router.delete('/:id', requireRole('owner', 'admin'), async (req, res) => {
  if (req.params.id === req.userId) {
    return res.status(400).json({ error: 'Cannot remove yourself' });
  }

  const db = getDb();
  try {
    const target = await db.get(
      'SELECT id, role FROM users WHERE id = ? AND tenant_id = ?',
      [req.params.id, req.tenantId],
    );
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.role === 'owner') return res.status(403).json({ error: 'Cannot remove the owner' });

    await db.run('DELETE FROM users WHERE id = ?', [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'DELETE /users/:id');
    return res.status(500).json({ error: 'Failed to remove user' });
  }
});

export default router;
