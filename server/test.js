#!/usr/bin/env node
/**
 * Enrichment diagnostic script.
 * Run from the project root: node server/test-enrichment.js
 *
 * Tests:
 *   1. Ollama reachability + model list
 *   2. Raw completion with a tiny JSON prompt (shows done_reason, num_ctx, token usage)
 *   3. DB state — how many leads total / unenriched
 *   4. Full enrichBatch on the 3 most-recent unenriched leads (dry-run, no DB write)
 *   5. Last 5 entries from ai-events.jsonl
 */

import 'dotenv/config';
import axios from 'axios';
import { createReadStream, existsSync } from 'fs';
import { createInterface } from 'readline';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const OLLAMA = process.env.OLLAMA_ENDPOINT || 'http://localhost:11434';
const MODEL  = process.env.OLLAMA_MODEL    || 'mistral';

// ── helpers ──────────────────────────────────────────────────────────────────
const sep  = (label) => console.log(`\n${'─'.repeat(60)}\n  ${label}\n${'─'.repeat(60)}`);
const ok   = (msg)   => console.log(`  ✅  ${msg}`);
const warn = (msg)   => console.log(`  ⚠️   ${msg}`);
const fail = (msg)   => console.log(`  ❌  ${msg}`);
const info = (msg)   => console.log(`  ℹ️   ${msg}`);

// ── 1. Ollama reachability ────────────────────────────────────────────────────
sep('1 / 5 — Ollama reachability');
let ollamaOk = false;
try {
  const { data } = await axios.get(`${OLLAMA}/api/tags`, { timeout: 5000 });
  const models = (data.models || []).map((m) => m.name);
  ok(`Ollama is reachable at ${OLLAMA}`);
  info(`Available models: ${models.join(', ') || '(none)'}`);
  if (models.some((m) => m.includes(MODEL.split(':')[0]))) {
    ok(`Model "${MODEL}" is present`);
    ollamaOk = true;
  } else {
    fail(`Model "${MODEL}" NOT found — run: ollama pull ${MODEL}`);
  }
} catch (e) {
  fail(`Cannot reach Ollama at ${OLLAMA}: ${e.message}`);
  fail('Enrichment will silently skip all leads until Ollama is running.');
}

// ── 2. Raw completion test ────────────────────────────────────────────────────
sep('2 / 5 — Raw completion (mini JSON prompt)');
if (!ollamaOk) {
  warn('Skipped — Ollama unreachable');
} else {
  const miniPrompt = `Return ONLY valid JSON. No markdown. No explanation.
Output: {"result":"ok","model":"${MODEL}"}`;

  const t0 = Date.now();
  try {
    const { data } = await axios.post(
      `${OLLAMA}/api/generate`,
      {
        model: MODEL,
        prompt: miniPrompt,
        stream: false,
        options: { num_predict: -1, num_ctx: 100000, temperature: 0 },
      },
      { timeout: 0 },
    );
    const ms = Date.now() - t0;
    const raw = data.response || '';
    const done = data.done_reason || 'stop';

    ok(`Completed in ${ms}ms`);
    info(`done_reason : ${done}`);
    info(`eval_count  : ${data.eval_count ?? 'n/a'} tokens generated`);
    info(`prompt_eval : ${data.prompt_eval_count ?? 'n/a'} prompt tokens`);
    info(`raw output  : ${raw.slice(0, 300)}`);

    if (done === 'length') {
      fail('done_reason=length — output was truncated even with num_ctx:100000 ⚠️');
    } else {
      try {
        JSON.parse(raw.trim());
        ok('JSON parses cleanly');
      } catch {
        warn('Output is not clean JSON (may have markdown fences) — repairTruncatedJson will attempt fix');
      }
    }
  } catch (e) {
    fail(`Completion request failed: ${e.message}`);
  }
}

// ── 3. DB state ───────────────────────────────────────────────────────────────
sep('3 / 5 — Database state');
let unenrichedLeads = [];
try {
  const { getDb, initDb } = await import('./db.js');
  await initDb();
  const db = getDb();

  const [{ total }]      = await db.all('SELECT COUNT(*) as total FROM leads');
  const [{ unenriched }] = await db.all(`SELECT COUNT(*) as unenriched FROM leads WHERE (enriched_at IS NULL OR enriched_at='') AND email != ''`);
  const [{ enriched }]   = await db.all(`SELECT COUNT(*) as enriched   FROM leads WHERE enriched_at IS NOT NULL AND enriched_at != ''`);

  info(`Total leads   : ${total}`);
  info(`Enriched      : ${enriched}`);
  info(`Unenriched    : ${unenriched}`);

  if (unenriched === 0 && total > 0) {
    ok('All leads are enriched — DB looks good!');
  } else if (unenriched > 0) {
    warn(`${unenriched} leads have no enrichment data`);
  }

  unenrichedLeads = await db.all(
    `SELECT id, full_name, email, enrichment_attempts FROM leads
     WHERE (enriched_at IS NULL OR enriched_at='') AND email != ''
     ORDER BY created_at DESC LIMIT 3`,
  );

  if (unenrichedLeads.length) {
    info('3 most-recent unenriched leads:');
    unenrichedLeads.forEach((l) =>
      info(`  [${l.id}] ${l.full_name} <${l.email}> — attempts: ${l.enrichment_attempts}`),
    );
  }
} catch (e) {
  fail(`DB error: ${e.message}`);
}

// ── 4. Full enrichBatch dry-run ────────────────────────────────────────────────
sep('4 / 5 — Full enrichBatch dry-run (no DB write)');
if (!ollamaOk) {
  warn('Skipped — Ollama unreachable');
} else if (!unenrichedLeads.length) {
  warn('Skipped — no unenriched leads in DB');
} else {
  try {
    const { enrichBatch } = await import('./workers/enricher.js');
    const { readConfig }  = await import('./utils/config.js');
    const config = readConfig();

    info(`Running enrichBatch on ${unenrichedLeads.length} lead(s)…`);
    const t0 = Date.now();
    const result = await enrichBatch(unenrichedLeads, config);
    const ms = Date.now() - t0;

    ok(`enrichBatch returned in ${ms}ms`);
    for (const r of result) {
      if (r.enriched_at) {
        ok(`[${r.full_name}]`);
        info(`  pain_points         : ${(r.pain_points || '').slice(0, 80)}`);
        info(`  reason_for_outreach : ${(r.reason_for_outreach || '').slice(0, 80)}`);
        info(`  lead_quality        : ${r.lead_quality}`);
        info(`  confidence_score    : ${r.confidence_score}`);
      } else {
        fail(`[${r.full_name || r.email}] — enrichment FAILED (enriched_at not set)`);
      }
    }
  } catch (e) {
    fail(`enrichBatch threw: ${e.message}`);
    console.error(e);
  }
}

// ── 5. Last 5 AI log entries ──────────────────────────────────────────────────
sep('5 / 5 — Last 5 AI log entries');
const logFile = join(__dirname, 'data', 'ai-events.jsonl');
if (!existsSync(logFile)) {
  warn('No ai-events.jsonl yet — enrichment has never run on this machine');
} else {
  const lines = [];
  const rl = createInterface({ input: createReadStream(logFile), crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.trim()) lines.push(line);
  }
  const last5 = lines.slice(-5);
  if (!last5.length) {
    warn('Log file is empty');
  } else {
    last5.forEach((line) => {
      try {
        const e = JSON.parse(line);
        const status = e.parsed_ok ? '✅' : '❌';
        const trunc  = e.truncated ? ' [TRUNCATED]' : '';
        console.log(`  ${status} ${e.timestamp} | attempt:${e.attempt} | done:${e.done_reason}${trunc} | parsed:${e.parsed_ok} | ${e.context}`);
        if (!e.parsed_ok) {
          console.log(`     raw preview: ${(e.raw_preview || '').slice(0,120)}`);
        }
      } catch {
        console.log(`  (unparseable line)`);
      }
    });
  }
}

sep('Done');
console.log('');
