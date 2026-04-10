import { Router } from 'express';
import { createReadStream, existsSync, truncateSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createInterface } from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_FILE  = join(__dirname, '..', 'data', 'ai-events.jsonl');

const router = Router();

async function readAllEvents() {
  if (!existsSync(LOG_FILE)) return [];
  const lines = [];
  const rl = createInterface({ input: createReadStream(LOG_FILE), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try { lines.push(JSON.parse(line)); } catch { /* skip corrupt lines */ }
  }
  return lines;
}

// GET /api/ai-logs?filter=all|truncated|failed|repaired&page=1&limit=50
router.get('/', async (req, res, next) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page   || '1',  10));
    const limit  = Math.min(100, Math.max(1, parseInt(req.query.limit || '50', 10)));
    const filter = req.query.filter || 'all';

    const all = (await readAllEvents()).reverse(); // newest first

    const stats = {
      total:       all.length,
      truncated:   all.filter((e) => e.truncated).length,
      repaired:    all.filter((e) => e.repaired).length,
      failed:      all.filter((e) => e.parsed_ok === false).length,
      avgDuration: all.length
        ? Math.round(all.reduce((s, e) => s + (e.duration_ms || 0), 0) / all.length)
        : 0,
    };

    let filtered = all;
    if (filter === 'truncated') filtered = all.filter((e) => e.truncated);
    if (filter === 'failed')    filtered = all.filter((e) => e.parsed_ok === false);
    if (filter === 'repaired')  filtered = all.filter((e) => e.repaired);

    const total  = filtered.length;
    // Strip full_prompt / full_response from list view (too heavy)
    const events = filtered
      .slice((page - 1) * limit, page * limit)
      // eslint-disable-next-line no-unused-vars
      .map(({ full_prompt, full_response, ...e }) => e);

    res.json({ events, total, page, limit, stats });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/ai-logs — truncate the log file
router.delete('/', async (req, res, next) => {
  try {
    if (existsSync(LOG_FILE)) truncateSync(LOG_FILE, 0);
    res.json({ success: true, message: 'AI logs cleared' });
  } catch (err) {
    next(err);
  }
});

export default router;
