import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
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
      `SELECT u.id, u.name, u.email, u.role, u.department_id, u.is_active, u.invited_by, u.created_at,
              d.name AS department_name, d.color AS department_color
       FROM users u
       LEFT JOIN departments d ON d.id = u.department_id
       WHERE u.tenant_id = ? ORDER BY u.created_at ASC`,
      [req.tenantId],
    );
    return res.json(users);
  } catch (err) {
    logger.error({ err }, 'GET /users');
    return res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// POST /api/users/create — admin creates a user with a password directly
const createUserSchema = z.object({
  name:          z.string().min(1).max(100),
  email:         z.string().email(),
  password:      z.string().min(8),
  role:          z.enum(['admin', 'member', 'viewer']).default('member'),
  department_id: z.string().uuid().optional().nullable(),
});

router.post('/create', requireRole('owner', 'admin'), async (req, res) => {
  const parse = createUserSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.issues });

  const { name, email, password, role, department_id } = parse.data;
  const db = getDb();

  try {
    const existing = await db.get(
      'SELECT id FROM users WHERE tenant_id = ? AND email = ?',
      [req.tenantId, email],
    );
    if (existing) return res.status(409).json({ error: 'User already in this organisation' });

    if (department_id) {
      const dept = await db.get(
        'SELECT id FROM departments WHERE id = ? AND tenant_id = ?',
        [department_id, req.tenantId],
      );
      if (!dept) return res.status(400).json({ error: 'Department not found' });
    }

    const hash   = await bcrypt.hash(password, 12);
    const userId = randomUUID();
    await db.run(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role, department_id, invited_by, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`,
      [userId, req.tenantId, email, hash, name, role, department_id || null, req.userId],
    );

    return res.status(201).json({ id: userId, name, email, role, department_id: department_id || null, is_active: 1 });
  } catch (err) {
    logger.error({ err }, 'POST /users/create');
    return res.status(500).json({ error: 'Failed to create user' });
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

    const appBase   = process.env.APP_URL || 'http://localhost:5173';
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

// PUT /api/users/:id/department
router.put('/:id/department', requireRole('owner', 'admin'), async (req, res) => {
  const { department_id } = req.body || {};
  const db = getDb();
  try {
    const target = await db.get(
      'SELECT id FROM users WHERE id = ? AND tenant_id = ?',
      [req.params.id, req.tenantId],
    );
    if (!target) return res.status(404).json({ error: 'User not found' });

    if (department_id) {
      const dept = await db.get(
        'SELECT id FROM departments WHERE id = ? AND tenant_id = ?',
        [department_id, req.tenantId],
      );
      if (!dept) return res.status(400).json({ error: 'Department not found' });
    }

    await db.run('UPDATE users SET department_id = ? WHERE id = ?',
      [department_id || null, req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'PUT /users/:id/department');
    return res.status(500).json({ error: 'Failed to update department' });
  }
});

// PUT /api/users/:id/active — enable/disable user
router.put('/:id/active', requireRole('owner', 'admin'), async (req, res) => {
  const { is_active } = req.body || {};
  if (typeof is_active !== 'boolean' && is_active !== 0 && is_active !== 1) {
    return res.status(400).json({ error: 'is_active must be boolean' });
  }
  if (req.params.id === req.userId) {
    return res.status(400).json({ error: 'Cannot deactivate yourself' });
  }
  const db = getDb();
  try {
    const target = await db.get(
      'SELECT id, role FROM users WHERE id = ? AND tenant_id = ?',
      [req.params.id, req.tenantId],
    );
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.role === 'owner') return res.status(403).json({ error: 'Cannot deactivate the owner' });

    await db.run('UPDATE users SET is_active = ? WHERE id = ?',
      [is_active ? 1 : 0, req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'PUT /users/:id/active');
    return res.status(500).json({ error: 'Failed to update user' });
  }
});

// PUT /api/users/:id/password — admin resets password for a team member
router.put('/:id/password', requireRole('owner', 'admin'), async (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  const db = getDb();
  try {
    const target = await db.get(
      'SELECT id, role FROM users WHERE id = ? AND tenant_id = ?',
      [req.params.id, req.tenantId],
    );
    if (!target) return res.status(404).json({ error: 'User not found' });
    if (target.role === 'owner' && req.role !== 'owner') {
      return res.status(403).json({ error: 'Only the owner can reset the owner password' });
    }
    const hash = await bcrypt.hash(password, 12);
    await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'PUT /users/:id/password');
    return res.status(500).json({ error: 'Failed to reset password' });
  }
});

// GET /api/users/:id/permissions — screen-level overrides
router.get('/:id/permissions', requireRole('owner', 'admin'), async (req, res) => {
  const db = getDb();
  try {
    const rows = await db.all(
      'SELECT screen, granted FROM user_permissions WHERE user_id = ? AND tenant_id = ?',
      [req.params.id, req.tenantId],
    );
    return res.json(rows);
  } catch (err) {
    logger.error({ err }, 'GET /users/:id/permissions');
    return res.status(500).json({ error: 'Failed to fetch permissions' });
  }
});

// PUT /api/users/:id/permissions — set screen-level overrides
const permissionsSchema = z.object({
  permissions: z.array(z.object({
    screen:  z.string().min(1),
    granted: z.boolean(),
  })),
});

router.put('/:id/permissions', requireRole('owner', 'admin'), async (req, res) => {
  const parse = permissionsSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.issues });

  const db = getDb();
  try {
    const target = await db.get(
      'SELECT id FROM users WHERE id = ? AND tenant_id = ?',
      [req.params.id, req.tenantId],
    );
    if (!target) return res.status(404).json({ error: 'User not found' });

    for (const { screen, granted } of parse.data.permissions) {
      await db.run(
        `INSERT INTO user_permissions (id, tenant_id, user_id, screen, granted)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id, screen) DO UPDATE SET granted = excluded.granted`,
        [randomUUID(), req.tenantId, req.params.id, screen, granted ? 1 : 0],
      );
    }
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'PUT /users/:id/permissions');
    return res.status(500).json({ error: 'Failed to update permissions' });
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
