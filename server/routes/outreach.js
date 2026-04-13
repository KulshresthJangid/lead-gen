/**
 * Secret outreach route — password-protected, no JWT required.
 *
 * POST /api/outreach/send
 *   multipart/form-data fields:
 *     secret       — must match OUTREACH_SECRET env var (fallback: "drip-secret-2026")
 *     quality      — hot | warm | cold  (default: hot)
 *     campaignId   — (optional) restrict to a specific campaign
 *     tenantId     — (optional) restrict to a specific tenant; omit to use first tenant
 *     subject      — email subject line
 *     templatePrompt — what the email should communicate (AI uses this to write the body)
 *     attachments  — any number of files to attach to every email
 *
 * The AI (Ollama / same model as enrichment) generates a personalised email body
 * per lead using the templatePrompt + lead's enriched data.
 */

import { Router } from 'express';
import multer from 'multer';
import nodemailer from 'nodemailer';
import { getDb } from '../db.js';
import { readConfig } from '../utils/config.js';
import { callAI } from '../utils/aiClient.js';
import logger from '../utils/logger.js';

const router = Router();

// ── Config ────────────────────────────────────────────────────────────────────
const OUTREACH_SECRET = process.env.OUTREACH_SECRET || 'drip-secret-2026';

// Store files in memory so we can attach them to emails directly
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 10 }, // 10 MB per file, max 10 files
});

// ── Nodemailer transport (SMTP via env) ───────────────────────────────────────
// Set these env vars to match your email provider:
//   SMTP_HOST, SMTP_PORT, SMTP_SECURE (true/false), SMTP_USER, SMTP_PASS
//   OUTREACH_FROM — e.g. "Kulshresth <mail@example.com>"
function createTransport() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
    port:   parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

// ── AI body generation ────────────────────────────────────────────────────────
async function generateEmailBody(lead, templatePrompt, config) {
  const prompt = `You are writing a personalised cold outreach email.

SENDER CONTEXT:
${config.product_description || '(product context not set)'}

TEMPLATE GOAL:
${templatePrompt}

LEAD DATA:
- Name: ${lead.full_name || 'there'}
- Job title: ${lead.job_title || ''}
- Company: ${lead.company_name || ''}
- Pain points: ${lead.pain_points || ''}
- Why they were flagged: ${lead.reason_for_outreach || ''}

RULES:
- Write ONLY the email body (no subject line, no headers).
- 3–5 short paragraphs max.
- First paragraph must reference something specific about the lead.
- Do NOT use generic filler phrases like "I hope this email finds you well."
- Tone: warm, direct, peer-to-peer. Not salesy.
- End with a low-friction CTA (e.g. "Worth a quick call?").
- Plain text only — no markdown, no bullet points.

Output only the email body text.`;

  const { text } = await callAI(prompt, config, { temperature: 0.7, maxTokens: 600, timeout: 60_000 });
  return text;
}

// ── POST /api/outreach/send ───────────────────────────────────────────────────
router.post('/send', upload.array('attachments'), async (req, res) => {
  // ── Authenticate ──────────────────────────────────────────────────────────
  const { secret, quality = 'hot', subject, templatePrompt, campaignId, tenantId } = req.body;

  if (!secret || secret !== OUTREACH_SECRET) {
    return res.status(401).json({ error: 'Invalid secret' });
  }

  if (!subject?.trim()) return res.status(400).json({ error: 'subject is required' });
  if (!templatePrompt?.trim()) return res.status(400).json({ error: 'templatePrompt is required' });

  const ALLOWED_QUALITY = new Set(['hot', 'warm', 'cold']);
  if (!ALLOWED_QUALITY.has(quality)) {
    return res.status(400).json({ error: 'quality must be hot | warm | cold' });
  }

  const db = getDb();

  // ── Resolve tenant ────────────────────────────────────────────────────────
  let resolvedTenantId = tenantId;
  if (!resolvedTenantId) {
    const firstTenant = await db.get('SELECT id FROM tenants LIMIT 1');
    if (!firstTenant) return res.status(400).json({ error: 'No tenants found' });
    resolvedTenantId = firstTenant.id;
  }

  // ── Load AI config for this tenant ────────────────────────────────────────
  const config = await readConfig(resolvedTenantId);

  // ── Fetch matching leads that have an email ────────────────────────────────
  let query = `SELECT * FROM leads WHERE tenant_id = ? AND lead_quality = ? AND email IS NOT NULL AND email != '' AND status != 'archived'`;
  const params = [resolvedTenantId, quality];

  if (campaignId) {
    query += ` AND campaign_id = ?`;
    params.push(campaignId);
  }

  query += ` ORDER BY confidence_score DESC`;

  const leads = await db.all(query, params);

  if (leads.length === 0) {
    return res.json({ sent: 0, failed: 0, skipped: 0, message: 'No matching leads with email addresses found' });
  }

  // ── Build file attachments ────────────────────────────────────────────────
  const fileAttachments = (req.files || []).map((f) => ({
    filename: f.originalname,
    content:  f.buffer,
    contentType: f.mimetype,
  }));

  // ── Send emails ───────────────────────────────────────────────────────────
  const transport = createTransport();
  const fromAddress = process.env.OUTREACH_FROM || process.env.SMTP_USER || 'noreply@example.com';

  const results = { sent: 0, failed: 0, skipped: 0, errors: [] };

  logger.info({ total: leads.length, quality, tenantId: resolvedTenantId }, 'Starting outreach batch');

  for (const lead of leads) {
    try {
      // Generate personalised body via Ollama
      let body;
      try {
        body = await generateEmailBody(lead, templatePrompt, config);
      } catch (aiErr) {
        logger.warn({ leadId: lead.id, err: aiErr.message }, 'AI generation failed — skipping lead');
        results.skipped++;
        results.errors.push({ leadId: lead.id, email: lead.email, reason: `AI error: ${aiErr.message}` });
        continue;
      }

      if (!body) {
        results.skipped++;
        continue;
      }

      await transport.sendMail({
        from:        fromAddress,
        to:          lead.email,
        subject:     subject.trim(),
        text:        body,
        attachments: fileAttachments,
      });

      results.sent++;
      logger.info({ leadId: lead.id, email: lead.email }, 'Outreach email sent');
    } catch (sendErr) {
      results.failed++;
      results.errors.push({ leadId: lead.id, email: lead.email, reason: sendErr.message });
      logger.error({ leadId: lead.id, email: lead.email, err: sendErr.message }, 'Failed to send outreach email');
    }
  }

  logger.info(results, 'Outreach batch complete');

  res.json({
    sent:    results.sent,
    failed:  results.failed,
    skipped: results.skipped,
    total:   leads.length,
    errors:  results.errors,
  });
});

// ── GET /api/outreach/preview ─────────────────────────────────────────────────
// Preview how many leads match + sample the AI-generated body for the first one.
router.post('/preview', upload.none(), async (req, res) => {
  const { secret, quality = 'hot', templatePrompt, campaignId, tenantId } = req.body;

  if (!secret || secret !== OUTREACH_SECRET) {
    return res.status(401).json({ error: 'Invalid secret' });
  }

  const db = getDb();

  let resolvedTenantId = tenantId;
  if (!resolvedTenantId) {
    const firstTenant = await db.get('SELECT id FROM tenants LIMIT 1');
    if (!firstTenant) return res.status(400).json({ error: 'No tenants found' });
    resolvedTenantId = firstTenant.id;
  }

  const config = await readConfig(resolvedTenantId);

  let query = `SELECT COUNT(*) as total FROM leads WHERE tenant_id = ? AND lead_quality = ? AND email IS NOT NULL AND email != '' AND status != 'archived'`;
  const params = [resolvedTenantId, quality];
  if (campaignId) { query += ` AND campaign_id = ?`; params.push(campaignId); }

  const { total } = await db.get(query, params);

  let sampleBody = null;
  let sampleLead = null;
  if (total > 0 && templatePrompt) {
    const leadQuery = query.replace('COUNT(*) as total', '*').replace('COUNT(*) as total', '*') + ' ORDER BY confidence_score DESC LIMIT 1';
    // rebuild properly
    let lq = `SELECT * FROM leads WHERE tenant_id = ? AND lead_quality = ? AND email IS NOT NULL AND email != '' AND status != 'archived'`;
    const lp = [resolvedTenantId, quality];
    if (campaignId) { lq += ` AND campaign_id = ?`; lp.push(campaignId); }
    lq += ` ORDER BY confidence_score DESC LIMIT 1`;

    sampleLead = await db.get(lq, lp);
    if (sampleLead) {
      try {
        sampleBody = await generateEmailBody(sampleLead, templatePrompt, config);
      } catch { sampleBody = '(AI generation failed — check Ollama connection)'; }
    }
  }

  res.json({
    matchingLeads: total,
    quality,
    sampleLead: sampleLead ? { name: sampleLead.full_name, email: sampleLead.email, company: sampleLead.company_name } : null,
    sampleBody,
  });
});

export default router;
