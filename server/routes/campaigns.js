import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { getDb } from '../db.js';
import { requireRole } from '../middleware/requireRole.js';
import { publishJob } from '../utils/rabbitmq.js';
import logger from '../utils/logger.js';

const router = Router();
// Mounted at /api/campaigns — requireAuth applied in index.js

const sourceSchema = z.object({
  type:  z.enum(['github', 'google', 'gitlab', 'hackernews', 'custom']),
  query: z.string().max(500).optional().default(''),
  url:   z.string().max(1000).optional().default(''),
});

const campaignSchema = z.object({
  name:                z.string().min(1).max(100),
  description:         z.string().max(500).optional().default(''),
  color:               z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().default('#1A73E8'),
  product_description: z.string().max(5000).optional().default(''),
  icp_description:     z.string().max(5000).optional().default(''),
  // Accept either a JSON string or a pre-parsed array from the client
  scraper_targets:     z.union([
    z.array(sourceSchema),
    z.string().transform((s) => {
      try { return JSON.parse(s); } catch { return []; }
    }),
  ]).optional().default([]),
  scraping_interval:   z.coerce.number().int().min(0).optional().default(30),
  daily_lead_target:   z.coerce.number().int().min(0).optional().default(0),
});

// GET /api/campaigns
router.get('/', async (req, res) => {
  const db = getDb();
  try {
    // owners and admins see all campaigns; members/viewers only see campaigns they have access to
    const isPrivileged = ['owner', 'admin'].includes(req.role);
    const campaigns = isPrivileged
      ? await db.all(
          `SELECT c.*,
                  (SELECT COUNT(*) FROM leads l WHERE l.campaign_id = c.id AND l.status != 'archived') AS leadCount,
                  (SELECT started_at FROM pipeline_log pl WHERE pl.campaign_id = c.id ORDER BY started_at DESC LIMIT 1) AS lastRunAt,
                  (SELECT status     FROM pipeline_log pl WHERE pl.campaign_id = c.id ORDER BY started_at DESC LIMIT 1) AS lastRunStatus
           FROM campaigns c
           WHERE c.tenant_id = ?
           ORDER BY c.created_at ASC`,
          [req.tenantId],
        )
      : await db.all(
          `SELECT c.*,
                  cm.access AS my_access,
                  (SELECT COUNT(*) FROM leads l WHERE l.campaign_id = c.id AND l.status != 'archived') AS leadCount,
                  (SELECT started_at FROM pipeline_log pl WHERE pl.campaign_id = c.id ORDER BY started_at DESC LIMIT 1) AS lastRunAt,
                  (SELECT status     FROM pipeline_log pl WHERE pl.campaign_id = c.id ORDER BY started_at DESC LIMIT 1) AS lastRunStatus
           FROM campaigns c
           JOIN campaign_members cm ON cm.campaign_id = c.id AND cm.user_id = ?
           WHERE c.tenant_id = ?
           ORDER BY c.created_at ASC`,
          [req.userId, req.tenantId],
        );
    return res.json(campaigns);
  } catch (err) {
    logger.error({ err }, 'GET /campaigns');
    return res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

// POST /api/campaigns
router.post('/', requireRole('owner', 'admin', 'member'), async (req, res) => {
  const parse = campaignSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.issues });

  const db = getDb();
  try {
    const id = randomUUID();
    const { name, description, color, product_description, icp_description,
            scraper_targets, scraping_interval, daily_lead_target } = parse.data;

    await db.run(
      `INSERT INTO campaigns
         (id, tenant_id, name, description, color, product_description, icp_description,
          scraper_targets, scraping_interval, daily_lead_target, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      [id, req.tenantId, name, description, color, product_description, icp_description,
       JSON.stringify(scraper_targets), scraping_interval, daily_lead_target],
    );
    const campaign = await db.get('SELECT * FROM campaigns WHERE id = ?', [id]);
    return res.status(201).json(campaign);
  } catch (err) {
    logger.error({ err }, 'POST /campaigns');
    return res.status(500).json({ error: 'Failed to create campaign' });
  }
});

// GET /api/campaigns/:id
router.get('/:id', async (req, res) => {
  const db = getDb();
  try {
    const campaign = await db.get(
      'SELECT * FROM campaigns WHERE id = ? AND tenant_id = ?',
      [req.params.id, req.tenantId],
    );
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const recentRuns = await db.all(
      `SELECT * FROM pipeline_log
       WHERE campaign_id = ? AND tenant_id = ?
       ORDER BY started_at DESC LIMIT 5`,
      [req.params.id, req.tenantId],
    );
    return res.json({ ...campaign, recentRuns });
  } catch (err) {
    logger.error({ err }, 'GET /campaigns/:id');
    return res.status(500).json({ error: 'Failed to fetch campaign' });
  }
});

// PUT /api/campaigns/:id
router.put('/:id', requireRole('owner', 'admin', 'member'), async (req, res) => {
  const parse = campaignSchema.partial().safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.issues });

  const db = getDb();
  try {
    const campaign = await db.get(
      'SELECT id FROM campaigns WHERE id = ? AND tenant_id = ?',
      [req.params.id, req.tenantId],
    );
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const fields = parse.data;
    // Ensure scraper_targets is stored as a JSON string
    if (fields.scraper_targets !== undefined && Array.isArray(fields.scraper_targets)) {
      fields.scraper_targets = JSON.stringify(fields.scraper_targets);
    }
    const sets = Object.keys(fields).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(fields), new Date().toISOString(), req.params.id];

    await db.run(
      `UPDATE campaigns SET ${sets}, updated_at = ? WHERE id = ?`,
      values,
    );
    const updated = await db.get('SELECT * FROM campaigns WHERE id = ?', [req.params.id]);
    return res.json(updated);
  } catch (err) {
    logger.error({ err }, 'PUT /campaigns/:id');
    return res.status(500).json({ error: 'Failed to update campaign' });
  }
});

// DELETE /api/campaigns/:id — soft delete (archive)
router.delete('/:id', requireRole('owner', 'admin'), async (req, res) => {
  const db = getDb();
  try {
    const campaign = await db.get(
      'SELECT id FROM campaigns WHERE id = ? AND tenant_id = ?',
      [req.params.id, req.tenantId],
    );
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    await db.run(
      `UPDATE campaigns SET status = 'archived', updated_at = ? WHERE id = ?`,
      [new Date().toISOString(), req.params.id],
    );
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'DELETE /campaigns/:id');
    return res.status(500).json({ error: 'Failed to archive campaign' });
  }
});

// POST /api/campaigns/:id/trigger
router.post('/:id/trigger', requireRole('owner', 'admin', 'member'), async (req, res) => {
  const db = getDb();
  try {
    const campaign = await db.get(
      `SELECT id FROM campaigns WHERE id = ? AND tenant_id = ? AND status != 'archived'`,
      [req.params.id, req.tenantId],
    );
    if (!campaign) return res.status(404).json({ error: 'Campaign not found or archived' });

    await publishJob(`pipeline.${req.tenantId}.${req.params.id}`, {
      tenantId:    req.tenantId,
      campaignId:  req.params.id,
      triggeredBy: 'manual',
    });
    return res.json({ queued: true, message: 'Pipeline job queued' });
  } catch (err) {
    logger.error({ err }, 'POST /campaigns/:id/trigger');
    return res.status(500).json({ error: 'Failed to queue pipeline job' });
  }
});

// ── Campaign member access ──────────────────────────────────────────────────

// GET /api/campaigns/:id/members
router.get('/:id/members', requireRole('owner', 'admin'), async (req, res) => {
  const db = getDb();
  try {
    const campaign = await db.get(
      'SELECT id FROM campaigns WHERE id = ? AND tenant_id = ?',
      [req.params.id, req.tenantId],
    );
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const members = await db.all(
      `SELECT cm.user_id, cm.access, cm.granted_at,
              u.name, u.email, u.role AS user_role,
              d.name AS department_name
       FROM campaign_members cm
       JOIN users u ON u.id = cm.user_id
       LEFT JOIN departments d ON d.id = u.department_id
       WHERE cm.campaign_id = ?
       ORDER BY u.name ASC`,
      [req.params.id],
    );
    return res.json(members);
  } catch (err) {
    logger.error({ err }, 'GET /campaigns/:id/members');
    return res.status(500).json({ error: 'Failed to fetch campaign members' });
  }
});

// POST /api/campaigns/:id/members — grant access to a user or department
const memberSchema = z.object({
  user_id:       z.string().uuid().optional(),
  department_id: z.string().uuid().optional(),
  access:        z.enum(['viewer', 'editor', 'manager']).default('viewer'),
}).refine(d => d.user_id || d.department_id, {
  message: 'Provide user_id or department_id',
});

router.post('/:id/members', requireRole('owner', 'admin'), async (req, res) => {
  const parse = memberSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: parse.error.issues });

  const db = getDb();
  try {
    const campaign = await db.get(
      'SELECT id FROM campaigns WHERE id = ? AND tenant_id = ?',
      [req.params.id, req.tenantId],
    );
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });

    const { user_id, department_id, access } = parse.data;

    if (department_id) {
      // Grant access to all members of a department
      const dept = await db.get(
        'SELECT id FROM departments WHERE id = ? AND tenant_id = ?',
        [department_id, req.tenantId],
      );
      if (!dept) return res.status(404).json({ error: 'Department not found' });

      const deptUsers = await db.all(
        'SELECT id FROM users WHERE department_id = ? AND tenant_id = ?',
        [department_id, req.tenantId],
      );
      for (const u of deptUsers) {
        await db.run(
          `INSERT INTO campaign_members (campaign_id, user_id, access, granted_by, granted_at)
           VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(campaign_id, user_id) DO UPDATE SET access = excluded.access`,
          [req.params.id, u.id, access, req.userId],
        );
      }
      return res.status(201).json({ granted: deptUsers.length, department_id, access });
    }

    // Single user
    const targetUser = await db.get(
      'SELECT id FROM users WHERE id = ? AND tenant_id = ?',
      [user_id, req.tenantId],
    );
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    await db.run(
      `INSERT INTO campaign_members (campaign_id, user_id, access, granted_by, granted_at)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(campaign_id, user_id) DO UPDATE SET access = excluded.access`,
      [req.params.id, user_id, access, req.userId],
    );
    return res.status(201).json({ user_id, campaign_id: req.params.id, access });
  } catch (err) {
    logger.error({ err }, 'POST /campaigns/:id/members');
    return res.status(500).json({ error: 'Failed to grant campaign access' });
  }
});

// DELETE /api/campaigns/:id/members/:userId
router.delete('/:id/members/:userId', requireRole('owner', 'admin'), async (req, res) => {
  const db = getDb();
  try {
    await db.run(
      'DELETE FROM campaign_members WHERE campaign_id = ? AND user_id = ?',
      [req.params.id, req.params.userId],
    );
    return res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'DELETE /campaigns/:id/members/:userId');
    return res.status(500).json({ error: 'Failed to revoke campaign access' });
  }
});

export default router;
