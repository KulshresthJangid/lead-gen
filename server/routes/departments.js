import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { getDb } from '../db.js';
import { requireRole } from '../middleware/requireRole.js';
import logger from '../utils/logger.js';

const router = Router();
// Mounted at /api/departments — requireAuth applied in index.js

const deptSchema = z.object({
  name:  z.string().min(1).max(80),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().default('#6366F1'),
});

// GET /api/departments
router.get('/', async (req, res) => {
  const db = getDb();
  try {
    const depts = await db.all(
      `SELECT d.*, COUNT(u.id) AS member_count
       FROM departments d
       LEFT JOIN users u ON u.department_id = d.id AND u.tenant_id = d.tenant_id
       WHERE d.tenant_id = ?
       GROUP BY d.id
       ORDER BY d.name ASC`,
      [req.tenantId],
    );
    return res.json(depts);
  } catch (err) {
    logger.error({ err }, 'GET /departments');
    return res.status(500).json({ error: 'Failed to fetch departments' });
  }
});

// POST /api/departments
router.post('/', requireRole('owner', 'admin'), async (req, res) => {
  const parse = deptSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.issues });

  const { name, color } = parse.data;
  const db = getDb();
  try {
    const id = randomUUID();
    await db.run(
      `INSERT INTO departments (id, tenant_id, name, color, created_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [id, req.tenantId, name, color],
    );
    return res.status(201).json({ id, name, color, member_count: 0 });
  } catch (err) {
    if (err.code === 'SQLITE_CONSTRAINT' || err.message?.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Department name already exists' });
    }
    logger.error({ err }, 'POST /departments');
    return res.status(500).json({ error: 'Failed to create department' });
  }
});

// PUT /api/departments/:id
router.put('/:id', requireRole('owner', 'admin'), async (req, res) => {
  const parse = deptSchema.partial().safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.issues });

  const db = getDb();
  try {
    const dept = await db.get(
      'SELECT id FROM departments WHERE id = ? AND tenant_id = ?',
      [req.params.id, req.tenantId],
    );
    if (!dept) return res.status(404).json({ error: 'Department not found' });

    const fields = [];
    const vals   = [];
    if (parse.data.name  !== undefined) { fields.push('name = ?');  vals.push(parse.data.name); }
    if (parse.data.color !== undefined) { fields.push('color = ?'); vals.push(parse.data.color); }
    if (!fields.length) return res.status(400).json({ error: 'Nothing to update' });

    vals.push(req.params.id);
    await db.run(`UPDATE departments SET ${fields.join(', ')} WHERE id = ?`, vals);
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'PUT /departments/:id');
    return res.status(500).json({ error: 'Failed to update department' });
  }
});

// DELETE /api/departments/:id
router.delete('/:id', requireRole('owner', 'admin'), async (req, res) => {
  const db = getDb();
  try {
    const dept = await db.get(
      'SELECT id FROM departments WHERE id = ? AND tenant_id = ?',
      [req.params.id, req.tenantId],
    );
    if (!dept) return res.status(404).json({ error: 'Department not found' });

    // Unassign users from this dept before deleting
    await db.run('UPDATE users SET department_id = NULL WHERE department_id = ?', [req.params.id]);
    await db.run('DELETE FROM departments WHERE id = ?', [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'DELETE /departments/:id');
    return res.status(500).json({ error: 'Failed to delete department' });
  }
});

export default router;
