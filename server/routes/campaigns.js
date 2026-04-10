import { Router } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { getDb } from '../db.js';
import { requireRole } from '../middleware/requireRole.js';
import { publishJob } from '../utils/rabbitmq.js';
import logger from '../utils/logger.js';

const router = Router();
// Mounted at /api/campaigns — requireAuth applied in index.js

const campaignSchema = z.object({
  name:                z.string().min(1).max(100),
  description:         z.string().max(500).optional().default(''),
  color:               z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().default('#1A73E8'),
  product_description: z.string().max(5000).optional().default(''),
  icp_description:     z.string().max(5000).optional().default(''),
  scraper_targets:     z.string().optional().default('[]'),
  scraping_interval:   z.coerce.number().int().min(0).optional().default(30),
  daily_lead_target:   z.coerce.number().int().min(0).optional().default(0),
});

// GET /api/campaigns
router.get('/', async (req, res) => {
  const db = getDb();
  try {
    const campaigns = await db.all(
      `SELECT c.*,
              (SELECT COUNT(*) FROM leads l WHERE l.campaign_id = c.id AND l.status != 'archived') AS leadCount,
              (SELECT started_at FROM pipeline_log pl WHERE pl.campaign_id = c.id ORDER BY started_at DESC LIMIT 1) AS lastRunAt,
              (SELECT status     FROM pipeline_log pl WHERE pl.campaign_id = c.id ORDER BY started_at DESC LIMIT 1) AS lastRunStatus
       FROM campaigns c
       WHERE c.tenant_id = ?
       ORDER BY c.created_at ASC`,
      [req.tenantId],
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
       scraper_targets, scraping_interval, daily_lead_target],
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

export default router;
