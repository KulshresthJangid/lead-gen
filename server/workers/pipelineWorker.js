import { randomUUID } from 'crypto';
import { getDb } from '../db.js';
import { readConfig } from '../utils/config.js';
import { scrapeLeads, pushRuntimeQueries } from './scraper.js';
import { generateGitHubQueries, generateGoogleQueries, expandQueriesFromSources } from './queryGenerator.js';
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
  };

  // Parse campaign sources (scraper_targets) — the user-defined sources for this campaign
  const campaignSources = (() => {
    try {
      const raw = campaign.scraper_targets;
      return Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
    } catch { return []; }
  })();

  // Previously AI-generated queries (seeded back in to avoid repetition)
  const previousAiQueries = (() => {
    try {
      const raw = campaign.ai_queries;
      return Array.isArray(raw) ? raw : JSON.parse(raw || '[]');
    } catch { return []; }
  })();

  // Step 0: AI query generation + source expansion
  let scrapeTargets = campaignSources;
  try {
    const [githubQs, googleQs, expanded] = await Promise.all([
      generateGitHubQueries(effectiveConfig),
      generateGoogleQueries(effectiveConfig),
      expandQueriesFromSources(effectiveConfig, campaignSources, previousAiQueries),
    ]);

    // Push generic AI queries into the scraper's rotation pool
    pushRuntimeQueries({ github: githubQs, google: googleQs });

    // Build per-source-type expanded sets and merge into campaign sources for this run
    const newAiQueries = [];
    const expandedSources = [...campaignSources];

    for (const q of expanded.github) {
      expandedSources.push({ type: 'github', query: q });
      newAiQueries.push({ type: 'github', query: q });
    }
    for (const q of expanded.google) {
      expandedSources.push({ type: 'google', query: q });
      newAiQueries.push({ type: 'google', query: q });
    }
    for (const q of expanded.gitlab) {
      expandedSources.push({ type: 'gitlab', query: q });
      newAiQueries.push({ type: 'gitlab', query: q });
    }

    // Persist AI-generated queries back to campaign so next run can avoid repeats
    if (newAiQueries.length > 0) {
      await db.run(
        'UPDATE campaigns SET ai_queries = ?, updated_at = ? WHERE id = ?',
        [JSON.stringify(newAiQueries), new Date().toISOString(), campaignId],
      );
    }

    scrapeTargets = expandedSources;
  } catch (err) {
    logger.warn({ err: err.message }, '[PIPELINE] Query gen/expansion failed — using campaign sources only');
  }

  // Step 1: Scrape
  let raw = [];
  try {
    raw = await scrapeLeads(scrapeTargets);
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
