import axios from 'axios';
import logger from '../utils/logger.js';
import { logAiEvent } from '../utils/aiLogger.js';

// One lead per batch: simplest way to prevent output truncation.
// Per-lead prompts are short enough that Mistral never hits the token cap.
const BATCH_SIZE = 1;

// -1 = no token limit. Local Ollama can run as long as needed.
const NUM_PREDICT = -1;

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

/**
 * Attempt to salvage a truncated JSON response.
 * Mistral 7B sometimes stops mid-object when it hits the token limit.
 * Strategy: find the last fully-closed lead object and close the array/wrapper.
 */
function repairTruncatedJson(raw) {
  try {
    const cleaned = stripJsonFences(raw);
    const leadsMatch = cleaned.match(/\{"leads"\s*:\s*\[/);
    if (!leadsMatch) return null;

    const leadsStart = cleaned.indexOf('[', leadsMatch.index + leadsMatch[0].length - 1);
    const content = cleaned.slice(leadsStart);

    // Walk through the content tracking brace depth to find the last complete object
    let depth = 0;
    let lastCompleteIdx = -1;
    let inString = false;
    let escape = false;

    for (let i = 0; i < content.length; i++) {
      const c = content[i];
      if (escape) { escape = false; continue; }
      if (c === '\\' && inString) { escape = true; continue; }
      if (c === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (c === '{') depth++;
      if (c === '}') {
        depth--;
        if (depth === 0) lastCompleteIdx = i;
      }
    }

    if (lastCompleteIdx === -1) return null;

    const repaired = `{"leads":[${content.slice(1, lastCompleteIdx + 1)}]}`;
    return JSON.parse(repaired);
  } catch {
    return null;
  }
}

/**
 * Call Ollama and return the raw response text, done_reason, and duration.
 * Sets num_predict so we can detect truncation via done_reason === 'length'.
 */
async function callOllama(endpoint, model, prompt) {
  const t0 = Date.now();
  const response = await axios.post(
    `${endpoint}/api/generate`,
    {
      model,
      prompt,
      stream: false,
      options: {
        num_predict: NUM_PREDICT,
        temperature: 0.1, // low temperature → more deterministic JSON output
      },
    },
    { timeout: 0 }, // no timeout — Mistral on CPU takes several minutes per batch
  );
  return {
    raw: response.data.response || '',
    done_reason: response.data.done_reason || 'stop',
    duration_ms: Date.now() - t0,
  };
}

/**
 * Call Ollama, parse JSON, detect/repair truncation, retry once on failure.
 * Logs every attempt to ai-events.jsonl via aiLogger.
 */
async function parseWithRetry(endpoint, model, prompt, context = 'batch', leadIds = []) {
  const logBase = { model, context, lead_ids: leadIds };
  let raw = '';
  let done_reason = 'stop';
  let duration_ms = 0;

  // ── Attempt 1 ──────────────────────────────────────────────────────────────
  try {
    ({ raw, done_reason, duration_ms } = await callOllama(endpoint, model, prompt));
  } catch (err) {
    logAiEvent({ ...logBase, attempt: 1, error: err.message, parsed_ok: false, duration_ms });
    throw err;
  }

  const truncated1 = done_reason === 'length';
  if (truncated1) {
    logger.warn({ context }, 'Ollama response hit token limit (done_reason=length) — attempting JSON repair');
  }

  let parsed = null;
  let repaired = false;
  try {
    parsed = JSON.parse(stripJsonFences(raw));
  } catch {
    if (truncated1) {
      parsed = repairTruncatedJson(raw);
      repaired = parsed !== null;
      if (repaired) logger.info({ context }, 'Truncated JSON repaired — partial results saved');
    }
  }

  logAiEvent({
    ...logBase,
    attempt: 1,
    prompt_length: prompt.length,
    prompt_preview: prompt.slice(0, 400),
    full_prompt: prompt,
    raw_length: raw.length,
    raw_preview: raw.slice(0, 600),
    full_response: raw,
    done_reason,
    truncated: truncated1,
    repaired,
    parsed_ok: parsed !== null,
    duration_ms,
  });

  if (parsed) return parsed;

  // ── Attempt 2 (retry with stronger instruction) ────────────────────────────
  logger.warn({ context }, 'JSON parse failed — retrying with explicit instruction');
  const retryPrompt = `${prompt}\n\nCRITICAL: Return ONLY the raw JSON object. ` +
    `No markdown, no code fences, no explanation. Do not stop early — complete the entire JSON.`;

  let raw2 = '', done_reason2 = 'stop', duration_ms2 = 0;
  try {
    ({ raw: raw2, done_reason: done_reason2, duration_ms: duration_ms2 } =
      await callOllama(endpoint, model, retryPrompt));
  } catch (err) {
    logAiEvent({ ...logBase, attempt: 2, error: err.message, parsed_ok: false, duration_ms: duration_ms2 });
    return null;
  }

  const truncated2 = done_reason2 === 'length';
  let parsed2 = null;
  let repaired2 = false;
  try {
    parsed2 = JSON.parse(stripJsonFences(raw2));
  } catch {
    if (truncated2) {
      parsed2 = repairTruncatedJson(raw2);
      repaired2 = parsed2 !== null;
    }
  }

  logAiEvent({
    ...logBase,
    attempt: 2,
    prompt_length: retryPrompt.length,
    prompt_preview: retryPrompt.slice(0, 400),
    full_prompt: retryPrompt,
    raw_length: raw2.length,
    raw_preview: raw2.slice(0, 600),
    full_response: raw2,
    done_reason: done_reason2,
    truncated: truncated2,
    repaired: repaired2,
    parsed_ok: parsed2 !== null,
    duration_ms: duration_ms2,
  });

  if (!parsed2) {
    logger.error({ context, raw_preview: raw.slice(0, 200) }, 'JSON parse failed after retry — skipping batch');
  }
  return parsed2;
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
    const chunkIds = chunk.map((l) => l.email);
    const prompt = `${systemPrompt}\n\nLeads to enrich:\n${JSON.stringify(chunk)}`;
    let result = await parseWithRetry(endpoint, model, prompt, 'enrichBatch', chunkIds);

    // If the batch failed entirely, fall back to one lead at a time
    if (!result?.leads || !Array.isArray(result.leads) || result.leads.length === 0) {
      logger.warn({ chunkSize: chunk.length }, '[ENRICH] Batch failed — falling back to per-lead enrichment');
      result = { leads: [] };
      for (const singleLead of chunk) {
        const singlePrompt = `${systemPrompt}\n\nLeads to enrich:\n${JSON.stringify([singleLead])}`;
        const singleResult = await parseWithRetry(
          endpoint, model, singlePrompt, `enrichBatch:single:${singleLead.email}`, [singleLead.email],
        );
        if (singleResult?.leads?.length) {
          result.leads.push(...singleResult.leads);
        }
      }
    }

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

    const result = await parseWithRetry(endpoint, model, prompt, `refineOutreach`, [lead.email]);
    if (result && result.reason_for_outreach) {
      refined[i] = { ...refined[i], reason_for_outreach: result.reason_for_outreach };
    }
  }

  return refined;
}
