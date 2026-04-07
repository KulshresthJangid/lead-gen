import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../db.js';
import { validate } from '../middleware/validate.js';
import { leadsToCSV } from '../utils/csv.js';

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────
const ALLOWED_SORT = new Set(['confidence_score', 'created_at', 'lead_quality', 'full_name', 'company_name']);
const ALLOWED_DIR = new Set(['asc', 'desc']);

function buildWhereClause(query) {
  const conditions = ["status != 'archived'"];
  const params = [];

  if (query.search) {
    conditions.push('(full_name LIKE ? OR company_name LIKE ? OR email LIKE ?)');
    const s = `%${query.search}%`;
    params.push(s, s, s);
  }
  if (query.quality) { conditions.push('lead_quality = ?'); params.push(query.quality); }
  if (query.category) { conditions.push('manual_category = ?'); params.push(query.category); }
  if (query.source) { conditions.push('source = ?'); params.push(query.source); }
  if (query.dateFrom) { conditions.push('created_at >= ?'); params.push(query.dateFrom); }
  if (query.dateTo) { conditions.push('created_at <= ?'); params.push(`${query.dateTo}T23:59:59`); }

  return { where: `WHERE ${conditions.join(' AND ')}`, params };
}

// ── GET /api/leads ─────────────────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const db = getDb();
    const page = Math.max(1, parseInt(req.query.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '25', 10)));
    const offset = (page - 1) * limit;
    const sortBy = ALLOWED_SORT.has(req.query.sortBy) ? req.query.sortBy : 'created_at';
    const sortDir = ALLOWED_DIR.has(req.query.sortDir?.toLowerCase()) ? req.query.sortDir.toLowerCase() : 'desc';

    const { where, params } = buildWhereClause(req.query);

    const [{ total }] = await db.all(`SELECT COUNT(*) as total FROM leads ${where}`, params);
    const data = await db.all(
      `SELECT * FROM leads ${where} ORDER BY ${sortBy} ${sortDir} LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    res.json({ data, total, page, limit, totalPages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/leads/export ─────────────────────────────────────────────────────
router.post('/export', async (req, res, next) => {
  try {
    const db = getDb();
    const { where, params } = buildWhereClause(req.body || {});
    const leads = await db.all(`SELECT * FROM leads ${where} ORDER BY created_at DESC`, params);
    const csv = leadsToCSV(leads);
    const filename = `leads-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/leads/:id ────────────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const lead = await db.get('SELECT * FROM leads WHERE id = ?', [req.params.id]);
    if (!lead) return res.status(404).json({ error: 'Lead not found' });
    res.json(lead);
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/leads/:id/categorize ─────────────────────────────────────────────
const categorizeSchema = z.object({
  manual_category: z.enum(['hot', 'warm', 'cold', 'disqualified', 'pending']),
  manual_notes: z.string().max(1000).optional().default(''),
});

router.put('/:id/categorize', validate(categorizeSchema), async (req, res, next) => {
  try {
    const db = getDb();
    const { manual_category, manual_notes } = req.body;
    await db.run(
      `UPDATE leads SET manual_category=?, manual_notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [manual_category, manual_notes, req.params.id],
    );
    const updated = await db.get('SELECT * FROM leads WHERE id = ?', [req.params.id]);
    if (!updated) return res.status(404).json({ error: 'Lead not found' });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/leads/:id (soft delete) ───────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    const db = getDb();
    await db.run(
      `UPDATE leads SET status='archived', updated_at=CURRENT_TIMESTAMP WHERE id=?`,
      [req.params.id],
    );
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
