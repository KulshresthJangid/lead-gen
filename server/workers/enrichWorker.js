import { getDb } from '../db.js';
import { readConfig } from '../utils/config.js';
import { enrichBatch, refineOutreach } from './enricher.js';
import { getChannel, EXCHANGE } from '../utils/rabbitmq.js';
import { getIo } from './scheduler.js';
import logger from '../utils/logger.js';

const QUEUE = 'enrich_jobs';

export async function startEnrichConsumer(channel) {
  await channel.assertQueue(QUEUE, { durable: true });
  await channel.bindQueue(QUEUE, EXCHANGE, 'enrich.#');
  channel.prefetch(1); // process one batch at a time

  channel.consume(QUEUE, async (msg) => {
    if (!msg) return;
    let payload;
    try {
      payload = JSON.parse(msg.content.toString());
    } catch {
      channel.nack(msg, false, false);
      return;
    }

    const { tenantId, campaignId, runId, leadIds } = payload;
    try {
      await runEnrichBatch(tenantId, campaignId, runId, leadIds);
      channel.ack(msg);
    } catch (err) {
      logger.error({ err, tenantId, campaignId }, '[ENRICH-WORKER] Error — nacking');
      channel.nack(msg, false, false);
    }
  });

  logger.info('[ENRICH-WORKER] Consumer started');
}

async function runEnrichBatch(tenantId, campaignId, runId, leadIds) {
  const db  = getDb();
  const io  = getIo();
  const config = await readConfig(tenantId);

  // If no specific IDs, pick unenriched leads for this tenant
  let leads;
  if (leadIds && leadIds.length > 0) {
    const placeholders = leadIds.map(() => '?').join(',');
    leads = await db.all(
      `SELECT * FROM leads WHERE id IN (${placeholders}) AND tenant_id = ?`,
      [...leadIds, tenantId],
    );
  } else {
    leads = await db.all(
      `SELECT * FROM leads WHERE tenant_id = ? AND (enriched_at IS NULL OR enriched_at = '')
       AND email != '' ORDER BY created_at DESC LIMIT 5`,
      [tenantId],
    );
  }

  if (!leads.length) return;

  logger.info({ count: leads.length, tenantId }, '[ENRICH-WORKER] Enriching batch');

  const updateStmt = `UPDATE leads SET pain_points=?, reason_for_outreach=?, lead_quality=?,
    confidence_score=?, enriched_at=?, status=? WHERE id=? AND tenant_id=?`;

  for (const lead of leads) {
    try {
      const [enriched] = await enrichBatch([lead], config, io);
      const [refined]  = await refineOutreach([enriched], config);

      if (refined?.enriched_at) {
        await db.run(updateStmt, [
          refined.pain_points || '', refined.reason_for_outreach || '',
          refined.lead_quality || null, refined.confidence_score || null,
          refined.enriched_at, refined.status || 'enriched',
          lead.id, tenantId,
        ]);
        io?.emit('leads_enriched', { count: 1, tenantId });
      } else {
        await db.run(
          `UPDATE leads SET enrichment_attempts = enrichment_attempts + 1 WHERE id = ? AND tenant_id = ?`,
          [lead.id, tenantId],
        );
      }
    } catch (err) {
      logger.error({ email: lead.email, err }, '[ENRICH-WORKER] Failed on single lead');
      await db.run(
        `UPDATE leads SET enrichment_attempts = enrichment_attempts + 1 WHERE id = ? AND tenant_id = ?`,
        [lead.id, tenantId],
      ).catch(() => {});
    }
  }

  if (runId) {
    const enrichedCount = await db.get(
      `SELECT COUNT(*) as cnt FROM leads WHERE id IN (${(leadIds || []).map(() => '?').join(',') || 'NULL'}) AND enriched_at IS NOT NULL`,
      leadIds || [],
    );
    await db.run(
      `UPDATE pipeline_log SET enriched_count=? WHERE run_id=?`,
      [enrichedCount?.cnt ?? 0, runId],
    ).catch(() => {});
  }
}
