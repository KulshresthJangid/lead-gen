import { Router } from 'express';
import axios from 'axios';
import { getDb } from '../db.js';
import { getState, triggerNow } from '../workers/scheduler.js';
import { readConfig } from '../utils/config.js';

const router = Router();

// ── GET /api/pipeline/status ───────────────────────────────────────────────────
router.get('/status', async (req, res, next) => {
  try {
    const db = getDb();
    const config = readConfig();

    const state = getState();
    const history = await db.all(
      `SELECT * FROM pipeline_log ORDER BY started_at DESC LIMIT 10`,
    );

    // Check if Ollama is reachable
    let ollamaOnline = false;
    try {
      await axios.get(`${config.ollama_endpoint || 'http://localhost:11434'}/api/tags`, {
        timeout: 3000,
      });
      ollamaOnline = true;
    } catch {
      ollamaOnline = false;
    }

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
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/pipeline/trigger ────────────────────────────────────────────────
router.post('/trigger', async (req, res, next) => {
  try {
    const result = await triggerNow();
    if (result?.conflict) {
      return res.status(409).json({ error: 'Pipeline is already running' });
    }
    const runId = result?.runId || 'pending';
    res.json({ runId, message: 'Pipeline started' });
  } catch (err) {
    next(err);
  }
});

export default router;
