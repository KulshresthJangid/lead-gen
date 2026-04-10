import { Router } from 'express';
import { getDb } from '../db.js';

const router = Router();

// ── GET /api/stats ─────────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const db = getDb();
    const tenantId = req.tenantId;
    const campaignId = req.query.campaignId || null;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const campaignFilter = campaignId ? ' AND campaign_id = ?' : '';
    const logParams = campaignId ? [tenantId, campaignId] : [tenantId];

    // Optional source filter — 'hackernews' covers both hackernews + hackernews_hiring
    const rawSource = req.query.source;
    let sourceClause = '';
    let sourceParam = null;
    if (rawSource && rawSource !== 'all') {
      if (rawSource === 'hackernews') {
        sourceClause = `AND source LIKE 'hackernews%'`;
      } else if (rawSource === 'custom') {
        sourceClause = `AND source LIKE 'custom:%'`;
      } else {
        sourceClause = `AND source = ?`;
        sourceParam = rawSource;
      }
    }

    // Build param arrays: [tenantId, (campaignId?), ..., (sourceParam?)]
    function p(mid = []) {
      const base = [tenantId, ...(campaignId ? [campaignId] : []), ...mid];
      return sourceParam ? [...base, sourceParam] : base;
    }

    const [
      totalRow,
      qualityRows,
      categoryRows,
      avgRow,
      daily,
      companies,
      pendingRow,
      enrichedRow,
      logRows,
    ] = await Promise.all([
      db.get(`SELECT COUNT(*) as count FROM leads WHERE tenant_id = ?${campaignFilter} AND status != 'archived' ${sourceClause}`, p()),
      db.all(`SELECT lead_quality, COUNT(*) as count FROM leads WHERE tenant_id = ?${campaignFilter} AND status != 'archived' ${sourceClause} GROUP BY lead_quality`, p()),
      db.all(`SELECT manual_category, COUNT(*) as count FROM leads WHERE tenant_id = ?${campaignFilter} AND status != 'archived' ${sourceClause} GROUP BY manual_category`, p()),
      db.get(`SELECT AVG(confidence_score) as avg FROM leads WHERE tenant_id = ?${campaignFilter} AND confidence_score IS NOT NULL AND status != 'archived' ${sourceClause}`, p()),
      db.all(
        `SELECT DATE(created_at) as date, COUNT(*) as count
         FROM leads WHERE tenant_id = ?${campaignFilter} AND created_at >= ? AND status != 'archived' ${sourceClause}
         GROUP BY DATE(created_at) ORDER BY date ASC`,
        p([thirtyDaysAgo]),
      ),
      db.all(
        `SELECT company_name, COUNT(*) as count FROM leads
         WHERE tenant_id = ?${campaignFilter} AND status != 'archived' AND company_name != '' ${sourceClause}
         GROUP BY company_name ORDER BY count DESC LIMIT 10`,
        p(),
      ),
      db.get(`SELECT COUNT(*) as count FROM leads WHERE tenant_id = ?${campaignFilter} AND manual_category = 'pending' AND status != 'archived' ${sourceClause}`, p()),
      db.get(`SELECT COUNT(*) as count FROM leads WHERE tenant_id = ?${campaignFilter} AND enriched_at IS NOT NULL AND status != 'archived' ${sourceClause}`, p()),
      db.all(
        `SELECT dupes_skipped, inserted_count FROM pipeline_log
         WHERE tenant_id = ?${campaignId ? ' AND campaign_id = ?' : ''} AND status != 'running' ORDER BY started_at DESC LIMIT 100`,
        logParams,
      ),
    ]);

    const totalLeads = totalRow?.count || 0;
    const qualityMap = Object.fromEntries(qualityRows.map((r) => [r.lead_quality, r.count]));
    const categoryMap = Object.fromEntries(categoryRows.map((r) => [r.manual_category, r.count]));

    const totalDupes = logRows.reduce((s, r) => s + (r.dupes_skipped || 0), 0);
    const totalInserted = logRows.reduce((s, r) => s + (r.inserted_count || 0), 0);
    const dupSkipRate =
      totalDupes + totalInserted > 0
        ? Math.round((totalDupes / (totalDupes + totalInserted)) * 100)
        : 0;

    const enrichmentSuccessRate =
      totalLeads > 0 ? Math.round(((enrichedRow?.count || 0) / totalLeads) * 100) : 0;

    res.json({
      totalLeads,
      hotCount: qualityMap.hot || 0,
      warmCount: qualityMap.warm || 0,
      coldCount: qualityMap.cold || 0,
      pendingReview: pendingRow?.count || 0,
      avgConfidenceScore: Math.round(avgRow?.avg || 0),
      enrichmentSuccessRate,
      duplicateSkipRate: dupSkipRate,
      dailyTrend: daily,
      topCompanies: companies,
      categoryBreakdown: categoryMap,
      totalPipelineRuns: logRows.length,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
