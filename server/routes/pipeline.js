import { Router } from 'express';
import { getDb } from '../db.js';
import { getState } from '../workers/scheduler.js';
import { readConfig } from '../utils/config.js';
import { publishJob } from '../utils/rabbitmq.js';
import { checkConnectivity } from '../utils/aiClient.js';

const router = Router();

// ── GET /api/pipeline/status ───────────────────────────────────────────────────
router.get('/status', async (req, res, next) => {
  try {
    const db = getDb();
    const config = await readConfig(req.tenantId);
    const campaignId = req.query.campaignId || null;

    const state = getState(req.tenantId, campaignId);
    const historyParams = campaignId
      ? [req.tenantId, campaignId]
      : [req.tenantId];
    const historySql = campaignId
      ? `SELECT * FROM pipeline_log WHERE tenant_id = ? AND campaign_id = ? ORDER BY started_at DESC LIMIT 10`
      : `SELECT * FROM pipeline_log WHERE tenant_id = ? ORDER BY started_at DESC LIMIT 10`;
    const history = await db.all(historySql, historyParams);

    const { ok: ollamaOnline } = await checkConnectivity(config).catch(() => ({ ok: false }));

    const lastRun = history[0] || null;

    res.json({
      lastRunAt: state.lastRunAt,
      nextRunAt: state.nextRunAt,
      status: state.status,
      isRunning: state.isRunning,
      todayInserted: state.todayInserted ?? 0,
      dailyTarget: state.dailyTarget ?? 0,
      ollamaOnline,
      lastRun: lastRun
        ? {
            runId: lastRun.run_id,
            status: lastRun.status,
            scraped: lastRun.scraped_count,
            dupesSkipped: lastRun.dupes_skipped,
            inserted: lastRun.inserted_count,
            enriched: lastRun.enriched_count,
            errors: lastRun.error_count,
            startedAt: lastRun.started_at,
            finishedAt: lastRun.finished_at,
          }
        : null,
      history: history.map((r) => ({
        runId: r.run_id,
        status: r.status,
        startedAt: r.started_at,
        finishedAt: r.finished_at,
        scraped: r.scraped_count,
        inserted: r.inserted_count,
        dupes: r.dupes_skipped,
        errors: r.error_count,
        triggeredBy: r.triggered_by,
        campaignId: r.campaign_id || null,
        orgId: r.org_id || null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/pipeline/trigger ────────────────────────────────────────────────
// Deprecated — prefer POST /api/campaigns/:id/trigger
// Kept for backward compat; uses first active campaign if no campaignId given
router.post('/trigger', async (req, res, next) => {
  try {
    const db = getDb();
    let { campaignId, org_id: orgId = null } = req.body || {};

    if (!campaignId) {
      const campaign = await db.get(
        `SELECT id FROM campaigns WHERE tenant_id = ? AND status = 'active' ORDER BY created_at ASC LIMIT 1`,
        [req.tenantId],
      );
      if (!campaign) return res.status(404).json({ error: 'No active campaign found' });
      campaignId = campaign.id;
    }

    await publishJob(`pipeline.${req.tenantId}.${campaignId}`, {
      tenantId: req.tenantId,
      campaignId,
      orgId,
      triggeredBy: 'manual',
    });
    res.json({ queued: true, message: 'Pipeline job queued', campaignId, orgId });
  } catch (err) {
    next(err);
  }
});

export default router;
