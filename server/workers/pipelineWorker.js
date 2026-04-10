import { randomUUID } from 'crypto';
import { getDb } from '../db.js';
import { readConfig } from '../utils/config.js';
import { scrapeLeads, pushRuntimeQueries } from './scraper.js';
import { generateGitHubQueries, generateGoogleQueries } from './queryGenerator.js';
import { filter as dedupeFilter } from './deduplicator.js';
import { getChannel, EXCHANGE } from '../utils/rabbitmq.js';
import logger from '../utils/logger.js';

const QUEUE = 'pipeline_jobs';

export async function startPipelineConsumer(channel, db) {
  await channel.assertQueue(QUEUE, { durable: true });
  await channel.bindQueue(QUEUE, EXCHANGE, 'pipeline.#');
  channel.prefetch(1);

  channel.consume(QUEUE, async (msg) => {
    if (!msg) return;
    let payload;
    try {
      payload = JSON.parse(msg.content.toString());
    } catch {
      channel.nack(msg, false, false);
      return;
    }

    const { tenantId, campaignId, triggeredBy = 'scheduler' } = payload;
    try {
      await runCampaignPipeline(tenantId, campaignId, triggeredBy, db, channel);
      channel.ack(msg);
    } catch (err) {
      logger.error({ err, tenantId, campaignId }, '[PIPELINE-WORKER] Fatal error — nacking');
      channel.nack(msg, false, false);
    }
  });

  logger.info('[PIPELINE-WORKER] Consumer started');
}

async function runCampaignPipeline(tenantId, campaignId, triggeredBy, db, channel) {
  const runId = randomUUID();
  const errors = [];
  const stats = { scraped: 0, dupes: 0, inserted: 0, enriched: 0, errors: 0 };

  logger.info({ runId, tenantId, campaignId, triggeredBy }, '[PIPELINE] Starting');

  await db.run(
    `INSERT INTO pipeline_log (run_id, tenant_id, campaign_id, started_at, status, triggered_by)
     VALUES (?, ?, ?, ?, 'running', ?)`,
    [runId, tenantId, campaignId, new Date().toISOString(), triggeredBy],
  );

  const config = await readConfig(tenantId);

  // Pull campaign-specific target overrides
  const campaign = await db.get(
    `SELECT * FROM campaigns WHERE id = ? AND tenant_id = ?`,
    [campaignId, tenantId],
  );
  if (!campaign) {
    await db.run(
      `UPDATE pipeline_log SET finished_at=?, status='failed', errors_json=? WHERE run_id=?`,
      [new Date().toISOString(), JSON.stringify(['Campaign not found']), runId],
    );
    return;
  }

  const effectiveConfig = {
    ...config,
    product_description: campaign.product_description || config.product_description,
    icp_description:     campaign.icp_description     || config.icp_description,
    scraper_targets:     campaign.scraper_targets
      ? (typeof campaign.scraper_targets === 'string' ? JSON.parse(campaign.scraper_targets) : campaign.scraper_targets)
      : config.scraper_targets,
  };

  // Step 0: AI query generation
  try {
    const [githubQs, googleQs] = await Promise.all([
      generateGitHubQueries(effectiveConfig),
      generateGoogleQueries(effectiveConfig),
    ]);
    pushRuntimeQueries({ github: githubQs, google: googleQs });
  } catch (err) {
    logger.warn({ err: err.message }, '[PIPELINE] Query gen failed — continuing');
  }

  // Step 1: Scrape
  let raw = [];
  try {
    raw = await scrapeLeads(effectiveConfig.scraper_targets || []);
    stats.scraped = raw.length;
  } catch (err) {
    errors.push(`Scraper: ${err.message}`);
    logger.error({ runId, err }, '[PIPELINE] Scraper failed');
  }

  // Step 2: Dedup (tenant-scoped)
  let unique = raw;
  try {
    const result = await dedupeFilter(db, raw, tenantId);
    unique = result.unique;
    stats.dupes = result.dupes.length;
  } catch (err) {
    errors.push(`Dedup: ${err.message}`);
    logger.error({ runId, err }, '[PIPELINE] Dedup failed');
  }

  // Step 3: Insert
  let inserted = [];
  try {
    inserted = await db.insertLeads(unique, tenantId, campaignId);
    stats.inserted = inserted.length;
  } catch (err) {
    errors.push(`DB insert: ${err.message}`);
    logger.error({ runId, err }, '[PIPELINE] Insert failed');
  }

  stats.errors = errors.length;

  await db.run(
    `UPDATE pipeline_log
     SET finished_at=?, status='scraping_done', scraped_count=?, dupes_skipped=?,
         inserted_count=?, error_count=?, errors_json=?
     WHERE run_id=?`,
    [new Date().toISOString(), stats.scraped, stats.dupes,
     stats.inserted, errors.length, JSON.stringify(errors), runId],
  );

  // Publish enrich job if we inserted leads
  if (inserted.length > 0) {
    try {
      const ch = channel || getChannel();
      ch.publish(
        EXCHANGE,
        `enrich.${tenantId}.${campaignId}`,
        Buffer.from(JSON.stringify({ tenantId, campaignId, runId, leadIds: inserted.map((l) => l.id) })),
        { persistent: true },
      );
    } catch (err) {
      logger.warn({ err }, '[PIPELINE] Failed to publish enrich job');
    }
  }

  logger.info({ runId, stats }, '[PIPELINE] Done');
}
