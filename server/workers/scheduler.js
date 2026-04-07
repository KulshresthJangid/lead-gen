import cron from 'node-cron';
import { v4 as uuidv4 } from 'uuid';
import { scrapeLeads } from './scraper.js';
import { filter as dedupeFilter } from './deduplicator.js';
import { enrichBatch, refineOutreach } from './enricher.js';
import { getDb } from '../db.js';
import { readConfig } from '../utils/config.js';
import logger from '../utils/logger.js';

let cronTask = null;
let ioInstance = null;
let isRunning = false;

const pipelineState = {
  lastRunAt: null,
  nextRunAt: null,
  status: 'idle',
  lastRunStats: null,
};

// ── Pipeline runner ───────────────────────────────────────────────────────────
export async function runPipeline(triggeredBy = 'scheduler') {
  if (isRunning) {
    logger.warn('Pipeline already running — skipping trigger');
    return null;
  }

  isRunning = true;
  const runId = uuidv4();
  const db = getDb();
  const errors = [];
  pipelineState.status = 'running';

  ioInstance?.emit('pipeline_start', { runId, triggeredBy });

  await db.run(
    `INSERT INTO pipeline_log (run_id, started_at, status, triggered_by) VALUES (?, ?, 'running', ?)`,
    [runId, new Date().toISOString(), triggeredBy],
  );

  const stats = { scraped: 0, dupes: 0, inserted: 0, enriched: 0, errors: 0 };

  try {
    const config = readConfig();

    // Step 1: Scrape
    logger.info({ runId }, '[PIPELINE] Step 1: Scraping');
    let raw = [];
    try {
      raw = await scrapeLeads(config.scraper_targets || []);
      stats.scraped = raw.length;
      logger.info({ runId, count: raw.length }, '[PIPELINE] Scraping complete');
    } catch (err) {
      errors.push(`Scraper: ${err.message}`);
      logger.error({ runId, err }, '[PIPELINE] Scraper failed');
    }

    // Step 2: Dedup
    logger.info({ runId }, '[PIPELINE] Step 2: Deduplicating');
    let unique = raw;
    try {
      const { unique: u, dupes } = await dedupeFilter(db, raw);
      unique = u;
      stats.dupes = dupes.length;
      logger.info({ runId, unique: u.length, dupes: dupes.length }, '[PIPELINE] Dedup complete');
    } catch (err) {
      errors.push(`Dedup: ${err.message}`);
      logger.error({ runId, err }, '[PIPELINE] Dedup failed');
    }

    // Step 3: Insert leads immediately so they appear in the UI right away
    logger.info({ runId }, '[PIPELINE] Step 3: Inserting leads');
    let inserted = [];
    try {
      inserted = await db.insertLeads(unique);
      stats.inserted = inserted.length;
      logger.info({ runId, inserted: inserted.length }, '[PIPELINE] Insertion complete');
      if (inserted.length > 0) {
        ioInstance?.emit('new_leads', { count: inserted.length, runId });
      }
    } catch (err) {
      errors.push(`DB insert: ${err.message}`);
      logger.error({ runId, err }, '[PIPELINE] DB insertion failed');
    }

    // Step 4: Enrich inserted leads in background (Mistral can be slow)
    logger.info({ runId }, '[PIPELINE] Step 4: Enriching leads');
    let enriched = inserted;
    try {
      enriched = await enrichBatch(inserted, config, ioInstance);
      stats.enriched = enriched.filter((l) => l.enriched_at).length;
      logger.info({ runId, enriched: stats.enriched }, '[PIPELINE] Enrichment complete');
    } catch (err) {
      errors.push(`Enrichment: ${err.message}`);
      logger.error({ runId, err }, '[PIPELINE] Enrichment failed');
    }

    // Step 5: Refine outreach and update enriched fields in DB
    logger.info({ runId }, '[PIPELINE] Step 5: Refining outreach');
    let refined = enriched;
    try {
      refined = await refineOutreach(enriched, config);
      logger.info({ runId }, '[PIPELINE] Outreach refinement complete');
    } catch (err) {
      errors.push(`Refinement: ${err.message}`);
      logger.error({ runId, err }, '[PIPELINE] Refinement failed');
    }

    // Step 6: Update enriched fields in DB
    logger.info({ runId }, '[PIPELINE] Step 6: Updating enrichment in DB');
    try {
      const updateStmt = `UPDATE leads SET pain_points=?, reason_for_outreach=?, lead_quality=?,
        confidence_score=?, enriched_at=?, status=? WHERE email=?`;
      for (const lead of refined) {
        if (lead.enriched_at) {
          await db.run(updateStmt, [
            lead.pain_points || '', lead.reason_for_outreach || '',
            lead.lead_quality || null, lead.confidence_score || null,
            lead.enriched_at, lead.status || 'enriched', lead.email,
          ]);
        }
      }
      logger.info({ runId }, '[PIPELINE] DB enrichment update complete');
    } catch (err) {
      errors.push(`DB enrichment update: ${err.message}`);
      logger.error({ runId, err }, '[PIPELINE] DB enrichment update failed');
    }

    stats.errors = errors.length;
    const finalStatus =
      errors.length === 0 ? 'success' : stats.inserted > 0 ? 'partial' : 'failed';

    await db.run(
      `UPDATE pipeline_log
       SET finished_at=?, status=?, scraped_count=?, dupes_skipped=?,
           inserted_count=?, enriched_count=?, error_count=?, errors_json=?
       WHERE run_id=?`,
      [
        new Date().toISOString(), finalStatus, stats.scraped, stats.dupes,
        stats.inserted, stats.enriched, stats.errors, JSON.stringify(errors),
        runId,
      ],
    );

    pipelineState.lastRunAt = new Date().toISOString();
    pipelineState.status = 'idle';
    pipelineState.lastRunStats = stats;

    ioInstance?.emit('pipeline_done', { runId, stats });

    logger.info({ runId, stats }, '[PIPELINE] Run complete');
    return { runId, stats };
  } catch (err) {
    logger.error({ runId, err }, '[PIPELINE] Fatal error');
    errors.push(`Fatal: ${err.message}`);
    await db.run(
      `UPDATE pipeline_log SET finished_at=?, status='failed', errors_json=? WHERE run_id=?`,
      [new Date().toISOString(), JSON.stringify(errors), runId],
    );
    pipelineState.status = 'idle';
    ioInstance?.emit('pipeline_error', { runId, error: err.message });
    return null;
  } finally {
    isRunning = false;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────
export function getState() {
  return { ...pipelineState, isRunning };
}

export async function triggerNow() {
  if (isRunning) return { conflict: true };
  // Run async — don't await, return immediately
  setTimeout(() => runPipeline('manual'), 0);
  return { conflict: false };
}

let continuousLoopActive = false;

async function continuousLoop() {
  continuousLoopActive = true;
  logger.info('Continuous pipeline loop started');
  while (continuousLoopActive) {
    await runPipeline('scheduler');
    if (!continuousLoopActive) break;
    // Small breathing gap between runs
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  logger.info('Continuous pipeline loop stopped');
}

export function reschedule(intervalMinutes) {
  // Stop any existing cron
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
  }
  // Stop any existing continuous loop
  continuousLoopActive = false;

  if (Number(intervalMinutes) === 0) {
    // Continuous mode — run immediately and loop forever
    pipelineState.nextRunAt = new Date().toISOString();
    continuousLoop();
    logger.info('Scheduler started in continuous mode');
    return;
  }

  const valid = [15, 30, 60, 360];
  const interval = valid.includes(Number(intervalMinutes)) ? Number(intervalMinutes) : 30;
  const cronExpr = `*/${interval} * * * *`;

  cronTask = cron.schedule(cronExpr, () => runPipeline('scheduler'));
  pipelineState.nextRunAt = new Date(Date.now() + interval * 60 * 1000).toISOString();

  logger.info({ cronExpr, interval }, 'Scheduler started');
}

export function initScheduler(io) {
  ioInstance = io;
  const config = readConfig();
  reschedule(parseInt(config.scraping_interval || '30', 10));
  logger.info('Scheduler initialized');
}
