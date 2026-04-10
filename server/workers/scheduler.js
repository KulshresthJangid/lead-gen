import cron from 'node-cron';
import { getDb } from '../db.js';
import { readConfig } from '../utils/config.js';
import { publishJob } from '../utils/rabbitmq.js';
import logger from '../utils/logger.js';

// Per-{tenantId:campaignId} state map
const stateMap  = new Map(); // key → { isRunning, lastRunAt, nextRunAt, status, todayInserted, dailyTarget }
const cronMap   = new Map(); // key → { task, continuous }

let ioInstance = null;

function stateKey(tenantId, campaignId) {
  return `${tenantId}:${campaignId}`;
}

function getOrInitState(tenantId, campaignId) {
  const key = stateKey(tenantId, campaignId);
  if (!stateMap.has(key)) {
    stateMap.set(key, {
      isRunning: false, lastRunAt: null, nextRunAt: null,
      status: 'idle', todayInserted: 0, dailyTarget: 0,
    });
  }
  return stateMap.get(key);
}

// ── Public API ────────────────────────────────────────────────────────────────
export function getState(tenantId, campaignId) {
  if (!tenantId) return { isRunning: false, status: 'idle', todayInserted: 0, dailyTarget: 0 };
  return { ...getOrInitState(tenantId, campaignId) };
}

export function reschedule(tenantId, campaignId, intervalMinutes) {
  if (!tenantId || !campaignId) return;
  const key = stateKey(tenantId, campaignId);

  const existing = cronMap.get(key);
  if (existing?.task) { existing.task.stop(); }
  cronMap.delete(key);

  const interval = Number(intervalMinutes);
  if (interval === 0) return; // manual only

  const valid = [15, 30, 60, 360];
  const min = valid.includes(interval) ? interval : 30;
  const cronExpr = `*/${min} * * * *`;

  const state = getOrInitState(tenantId, campaignId);
  state.nextRunAt = new Date(Date.now() + min * 60 * 1000).toISOString();

  const task = cron.schedule(cronExpr, async () => {
    try {
      await publishJob(`pipeline.${tenantId}.${campaignId}`, {
        tenantId, campaignId, triggeredBy: 'scheduler',
      });
      state.nextRunAt = new Date(Date.now() + min * 60 * 1000).toISOString();
    } catch (err) {
      logger.error({ err, tenantId, campaignId }, '[SCHEDULER] Failed to publish cron job');
    }
  });

  cronMap.set(key, { task });
  logger.info({ tenantId, campaignId, cronExpr }, '[SCHEDULER] Campaign scheduled');
}

export async function initScheduler(io) {
  ioInstance = io;
  const db   = getDb();

  try {
    const campaigns = await db.all(
      `SELECT id, tenant_id, scraping_interval FROM campaigns WHERE status = 'active'`,
    );
    for (const c of campaigns) {
      const interval = parseInt(c.scraping_interval || '30', 10);
      if (interval > 0) reschedule(c.tenant_id, c.id, interval);
    }
    logger.info(`[SCHEDULER] Initialized ${campaigns.length} campaign schedules`);
  } catch (err) {
    logger.error({ err }, '[SCHEDULER] Failed to initialize schedules');
  }
}

export function getIo() { return ioInstance; }

