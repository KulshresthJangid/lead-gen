import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { readConfig, writeConfig } from '../utils/config.js';
import { reschedule } from '../workers/scheduler.js';
import { getDb } from '../db.js';
import { requireRole } from '../middleware/requireRole.js';

const router = Router();

const settingsSchema = z.object({
  ollama_endpoint: z.string().url().optional(),
  ollama_model: z.string().min(1).optional(),
  scraping_interval: z.enum(['0', '15', '30', '60', '360']).optional(),
  daily_lead_target: z.coerce.number().int().min(0).max(100000).optional(),
  product_description: z.string().max(1000).optional(),
  icp_description: z.string().max(1000).optional(),
  scraper_targets: z.array(
    z.object({
      name: z.string().optional(),
      url: z.string().optional(),
      type: z.string().optional(),
      query: z.string().optional(),
      selectors: z.record(z.string()).optional(),
    }).passthrough(),
  ).optional(),
});

// ── GET /api/settings ──────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const config = await readConfig(req.tenantId);
  res.json(config);
});

// ── PUT /api/settings ──────────────────────────────────────────────────────────
router.put('/', requireRole('owner', 'admin'), validate(settingsSchema), async (req, res, next) => {
  try {
    const prev = await readConfig(req.tenantId);
    const updated = await writeConfig(req.tenantId, req.body);

    if (req.body.scraping_interval != null && req.body.scraping_interval !== prev.scraping_interval) {
      // Pass tenant-scoped reschedule if available
      try { reschedule(req.tenantId, null, parseInt(req.body.scraping_interval, 10)); } catch { /* ok if not ready */ }
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/setup/complete ───────────────────────────────────────────────────
router.post('/setup/complete', async (req, res, next) => {
  try {
    const db = getDb();
    await writeConfig(req.tenantId, { is_setup_complete: 'true' });

    // Ensure a default campaign exists for this tenant
    const existing = await db.get(
      `SELECT id FROM campaigns WHERE tenant_id = ? AND status != 'archived'`,
      [req.tenantId],
    );
    if (!existing && req.body) {
      const { randomUUID } = await import('crypto');
      const campaignId = randomUUID();
      const allowed = ['product_description', 'icp_description', 'scraper_targets'];
      const partial = {};
      for (const key of allowed) {
        if (req.body[key] !== undefined) partial[key] = req.body[key];
      }
      await db.run(
        `INSERT INTO campaigns (id, tenant_id, name, product_description, icp_description,
          scraper_targets, status, created_at, updated_at)
         VALUES (?, ?, 'Default Campaign', ?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [campaignId, req.tenantId, partial.product_description || '',
         partial.icp_description || '', partial.scraper_targets || '[]'],
      );
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/settings/leads (danger zone — owner only) ────────────────────
router.delete('/leads', requireRole('owner'), async (req, res, next) => {
  try {
    const { confirmation } = req.body || {};
    if (confirmation !== 'DELETE') {
      return res.status(400).json({ error: 'Type DELETE to confirm' });
    }
    const db = getDb();
    await db.run('DELETE FROM leads WHERE tenant_id = ?', [req.tenantId]);
    res.json({ success: true, message: 'All leads deleted' });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/settings/pipeline-logs (danger zone) ─────────────────────────
router.delete('/pipeline-logs', requireRole('owner'), async (req, res, next) => {
  try {
    const { confirmation } = req.body || {};
    if (confirmation !== 'DELETE') {
      return res.status(400).json({ error: 'Type DELETE to confirm' });
    }
    const db = getDb();
    await db.run('DELETE FROM pipeline_log WHERE tenant_id = ?', [req.tenantId]);
    res.json({ success: true, message: 'Pipeline logs cleared' });
  } catch (err) {
    next(err);
  }
});

export default router;
