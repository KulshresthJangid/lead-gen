import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { readConfig, writeConfig } from '../utils/config.js';
import { reschedule } from '../workers/scheduler.js';
import { getDb } from '../db.js';

const router = Router();

const settingsSchema = z.object({
  ollama_endpoint: z.string().url().optional(),
  ollama_model: z.string().min(1).optional(),
  scraping_interval: z.enum(['0', '15', '30', '60', '360']).optional(),
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
router.get('/', (req, res) => {
  const config = readConfig();
  res.json(config);
});

// ── PUT /api/settings ──────────────────────────────────────────────────────────
router.put('/', validate(settingsSchema), (req, res, next) => {
  try {
    const prev = readConfig();
    const updated = writeConfig(req.body);

    // Reschedule if interval changed
    if (req.body.scraping_interval != null && req.body.scraping_interval !== prev.scraping_interval) {
      reschedule(parseInt(req.body.scraping_interval, 10));
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
    writeConfig({ is_setup_complete: 'true' });

    // Also mirror to DB settings for redundancy
    const existing = await db.get(`SELECT key FROM settings WHERE key = 'is_setup_complete'`);
    if (existing) {
      await db.run(`UPDATE settings SET value = 'true' WHERE key = 'is_setup_complete'`);
    } else {
      await db.run(`INSERT INTO settings (key, value) VALUES ('is_setup_complete', 'true')`);
    }

    // Save any ICP/product description sent during wizard
    if (req.body) {
      const allowed = ['product_description', 'icp_description', 'ollama_endpoint', 'ollama_model', 'scraper_targets'];
      const partial = {};
      for (const key of allowed) {
        if (req.body[key] !== undefined) partial[key] = req.body[key];
      }
      if (Object.keys(partial).length > 0) writeConfig(partial);
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/settings/leads (danger zone) ──────────────────────────────────
router.delete('/leads', async (req, res, next) => {
  try {
    const { confirmation } = req.body || {};
    if (confirmation !== 'DELETE') {
      return res.status(400).json({ error: 'Type DELETE to confirm' });
    }
    const db = getDb();
    await db.run("DELETE FROM leads");
    res.json({ success: true, message: 'All leads deleted' });
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/settings/pipeline-logs (danger zone) ─────────────────────────
router.delete('/pipeline-logs', async (req, res, next) => {
  try {
    const { confirmation } = req.body || {};
    if (confirmation !== 'DELETE') {
      return res.status(400).json({ error: 'Type DELETE to confirm' });
    }
    const db = getDb();
    await db.run("DELETE FROM pipeline_log");
    res.json({ success: true, message: 'Pipeline logs cleared' });
  } catch (err) {
    next(err);
  }
});

export default router;
