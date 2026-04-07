import axios from 'axios';
import logger from '../utils/logger.js';

const BATCH_SIZE = 5;

function buildSystemPrompt(config = {}) {
  const product = config.product_description
    ? `\nProduct/Service context: ${config.product_description}`
    : '';
  const icp = config.icp_description
    ? `\nIdeal Customer Profile: ${config.icp_description}`
    : '';

  return `[SYSTEM]
You are a B2B lead enrichment and qualification engine.${product}${icp}

STRICT RULES:
- Output ONLY valid JSON. No markdown. No preamble. No code fences.
- Do NOT invent, hallucinate, or modify: full_name, company_name, email, company_domain. Return them EXACTLY as received.
- If a field cannot be inferred from available data, return "" (empty string).
- Enrich ONLY: pain_points, reason_for_outreach, lead_quality (hot|warm|cold), confidence_score (0-100).
- lead_quality = hot  → strong ICP fit, clear pain point, decision-maker role
- lead_quality = warm → partial fit or unclear seniority/role
- lead_quality = cold → poor fit, insufficient data, or clearly out of ICP

OUTPUT FORMAT (strict, no deviations):
{"leads":[{"full_name":"","job_title":"","company_name":"","company_domain":"","email":"","linkedin_url":"","location":"","pain_points":"","reason_for_outreach":"","lead_quality":"hot|warm|cold","confidence_score":0}]}
[/SYSTEM]`;
}

function stripJsonFences(text) {
  return text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
}

async function callOllama(endpoint, model, prompt) {
  const response = await axios.post(
    `${endpoint}/api/generate`,
    { model, prompt, stream: false },
    { timeout: 120_000 },
  );
  return response.data.response || '';
}

async function parseWithRetry(endpoint, model, prompt, context = 'batch') {
  let raw = '';
  try {
    raw = await callOllama(endpoint, model, prompt);
    return JSON.parse(stripJsonFences(raw));
  } catch {
    logger.warn({ context }, 'JSON parse failed — retrying with explicit instruction');
    try {
      const retryPrompt = `${prompt}\n\nIMPORTANT: Return ONLY the JSON object. No markdown, no explanation, no code fences.`;
      raw = await callOllama(endpoint, model, retryPrompt);
      return JSON.parse(stripJsonFences(raw));
    } catch (err) {
      logger.error({ context, raw: raw.slice(0, 200), err: err.message }, 'JSON parse failed after retry — skipping');
      return null;
    }
  }
}

/**
 * First pass: bulk enrichment in batches of BATCH_SIZE.
 */
export async function enrichBatch(leads, config = {}, io = null) {
  if (!leads.length) return leads;

  const endpoint = config.ollama_endpoint || 'http://localhost:11434';
  const model = config.ollama_model || 'mistral';
  const systemPrompt = buildSystemPrompt(config);
  const enriched = [...leads];

  // Check if Ollama is reachable
  try {
    await axios.get(`${endpoint}/api/tags`, { timeout: 5000 });
  } catch {
    logger.warn('Ollama unreachable — skipping enrichment');
    io?.emit('ollama_offline', { timestamp: new Date().toISOString() });
    return leads;
  }

  io?.emit('ollama_online', { timestamp: new Date().toISOString() });

  const chunks = [];
  for (let i = 0; i < leads.length; i += BATCH_SIZE) {
    chunks.push(leads.slice(i, i + BATCH_SIZE));
  }

  for (const chunk of chunks) {
    const prompt = `${systemPrompt}\n\nLeads to enrich:\n${JSON.stringify(chunk)}`;
    const result = await parseWithRetry(endpoint, model, prompt, 'enrichBatch');

    if (result?.leads && Array.isArray(result.leads)) {
      for (const enrichedLead of result.leads) {
        const idx = enriched.findIndex((l) => l.email === enrichedLead.email);
        if (idx !== -1) {
          enriched[idx] = {
            ...enriched[idx],
            pain_points: enrichedLead.pain_points || enriched[idx].pain_points,
            reason_for_outreach: enrichedLead.reason_for_outreach || enriched[idx].reason_for_outreach,
            lead_quality: enrichedLead.lead_quality || enriched[idx].lead_quality,
            confidence_score: enrichedLead.confidence_score ?? enriched[idx].confidence_score,
            enriched_at: new Date().toISOString(),
            status: 'enriched',
          };
        }
      }
    }
  }

  return enriched;
}

/**
 * Second pass: hyper-personalize reason_for_outreach per lead.
 */
export async function refineOutreach(leads, config = {}) {
  if (!leads.length) return leads;

  const endpoint = config.ollama_endpoint || 'http://localhost:11434';
  const model = config.ollama_model || 'mistral';
  const refined = [...leads];

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    if (!lead.enriched_at) continue; // skip unenriched leads

    const prompt = `[SYSTEM]
You are a B2B outreach copywriter. Improve ONLY the reason_for_outreach field.
Rules:
- Hyper-personalized: reference their specific company, role, and domain context
- Under 3 sentences — concise and direct
- No generic sales language ("synergies", "leverage", "solutions")
- Return ONLY this JSON (single lead object, NOT an array):
{"full_name":"","job_title":"","company_name":"","company_domain":"","email":"","linkedin_url":"","location":"","pain_points":"","reason_for_outreach":"","lead_quality":"","confidence_score":0}
[/SYSTEM]

Lead:
${JSON.stringify(lead)}`;

    const result = await parseWithRetry(endpoint, model, prompt, `refineOutreach:${lead.email}`);
    if (result && result.reason_for_outreach) {
      refined[i] = { ...refined[i], reason_for_outreach: result.reason_for_outreach };
    }
  }

  return refined;
}
