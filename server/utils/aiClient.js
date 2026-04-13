/**
 * Universal AI client — bring your own provider.
 *
 * Supported providers (set via config.ai_provider):
 *   ollama       — local Ollama (default; backward-compat)
 *   openrouter   — OpenRouter.ai (access Claude, GPT-4, Gemini, Llama, etc.)
 *   anthropic    — Anthropic Claude direct API
 *   gemini       — Google Gemini direct API
 *   openai       — OpenAI direct API
 *   copilot      — GitHub Copilot API (OpenAI-compatible)
 *   custom       — Any OpenAI-compatible endpoint (LM Studio, vLLM, Together, etc.)
 *
 * Config keys used:
 *   ai_provider    — one of the above strings (default: 'ollama')
 *   ai_api_key     — API key (not needed for ollama)
 *   ai_model       — model name (provider-specific, e.g. 'claude-3-haiku-20240307')
 *   ai_base_url    — base URL override for custom / self-hosted endpoints
 *
 * Legacy ollama keys still work when ai_provider === 'ollama':
 *   ollama_endpoint, ollama_model
 *
 * Returns: { text: string, done_reason: 'stop' | 'length' | 'error' }
 *   done_reason is normalised across all providers so the enricher's
 *   truncation-detection logic continues to work.
 */

import axios from 'axios';
import logger from './logger.js';

// ── Provider defaults ─────────────────────────────────────────────
const PROVIDER_DEFAULTS = {
  openrouter: {
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'anthropic/claude-3-haiku',
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-3-haiku-20240307',
    apiVersion: '2023-06-01',
  },
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-2.0-flash',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
  copilot: {
    baseUrl: 'https://api.githubcopilot.com',
    model: 'gpt-4o',
  },
};

// ── Normalise done_reason across providers ────────────────────────
function normaliseDoneReason(raw) {
  if (!raw) return 'stop';
  const v = String(raw).toLowerCase();
  // length / max_tokens / max-tokens all mean truncated
  if (v === 'length' || v === 'max_tokens' || v === 'max-tokens' || v === 'max_output_tokens') return 'length';
  return 'stop';
}

// ── OpenAI-compatible (OpenRouter, OpenAI, Copilot, Custom) ──────
async function callOpenAICompat(prompt, config, callOptions = {}) {
  const provider = config.ai_provider;
  const defaults = PROVIDER_DEFAULTS[provider] || {};

  const baseUrl = (
    config.ai_base_url ||
    defaults.baseUrl ||
    'https://api.openai.com/v1'
  ).replace(/\/$/, '');

  const model = config.ai_model || defaults.model || 'gpt-4o-mini';
  const apiKey = config.ai_api_key || '';

  const headers = {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    // OpenRouter expects a site URL/title for ranking — optional but polite
    ...(provider === 'openrouter' ? {
      'HTTP-Referer': 'https://leadgen.local',
      'X-Title': 'LeadGen AI',
    } : {}),
  };

  const body = {
    model,
    messages: [{ role: 'user', content: prompt }],
    temperature: callOptions.temperature ?? 0.1,
    ...(callOptions.maxTokens ? { max_tokens: callOptions.maxTokens } : {}),
  };

  const t0 = Date.now();
  const res = await axios.post(`${baseUrl}/chat/completions`, body, {
    headers,
    timeout: callOptions.timeout ?? 120_000,
  });

  const choice = res.data.choices?.[0];
  return {
    text: choice?.message?.content?.trim() || '',
    done_reason: normaliseDoneReason(choice?.finish_reason),
    duration_ms: Date.now() - t0,
  };
}

// ── Anthropic (Messages API) ──────────────────────────────────────
async function callAnthropic(prompt, config, callOptions = {}) {
  const defaults = PROVIDER_DEFAULTS.anthropic;
  const baseUrl = (config.ai_base_url || defaults.baseUrl).replace(/\/$/, '');
  const model = config.ai_model || defaults.model;
  const apiKey = config.ai_api_key || '';

  const t0 = Date.now();
  const res = await axios.post(
    `${baseUrl}/v1/messages`,
    {
      model,
      max_tokens: callOptions.maxTokens ?? 4096,
      temperature: callOptions.temperature ?? 0.1,
      messages: [{ role: 'user', content: prompt }],
    },
    {
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': defaults.apiVersion,
      },
      timeout: callOptions.timeout ?? 120_000,
    },
  );

  const content = res.data.content?.[0]?.text?.trim() || '';
  return {
    text: content,
    done_reason: normaliseDoneReason(res.data.stop_reason),
    duration_ms: Date.now() - t0,
  };
}

// ── Google Gemini ─────────────────────────────────────────────────
async function callGemini(prompt, config, callOptions = {}) {
  const defaults = PROVIDER_DEFAULTS.gemini;
  const baseUrl = (config.ai_base_url || defaults.baseUrl).replace(/\/$/, '');
  const model = config.ai_model || defaults.model;
  const apiKey = config.ai_api_key || '';

  const t0 = Date.now();
  const res = await axios.post(
    `${baseUrl}/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: callOptions.temperature ?? 0.1,
        ...(callOptions.maxTokens ? { maxOutputTokens: callOptions.maxTokens } : {}),
      },
    },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: callOptions.timeout ?? 120_000,
    },
  );

  const candidate = res.data.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text).join('').trim() || '';
  const finishReason = candidate?.finishReason || 'STOP';

  return {
    text,
    done_reason: normaliseDoneReason(
      finishReason === 'MAX_TOKENS' ? 'length' : 'stop',
    ),
    duration_ms: Date.now() - t0,
  };
}

// ── Ollama (legacy / local) ───────────────────────────────────────
async function callOllama(prompt, config, callOptions = {}) {
  const endpoint = (config.ollama_endpoint || 'http://localhost:11434').replace(/\/$/, '');
  const model = config.ai_model || config.ollama_model || 'mistral';

  const t0 = Date.now();
  const res = await axios.post(
    `${endpoint}/api/generate`,
    {
      model,
      prompt,
      stream: false,
      options: {
        num_predict: callOptions.maxTokens ?? -1,
        num_ctx: 100_000,
        temperature: callOptions.temperature ?? 0.1,
      },
    },
    { timeout: callOptions.timeout ?? 0 }, // 0 = no timeout for local CPU inference
  );

  return {
    text: res.data.response?.trim() || '',
    done_reason: normaliseDoneReason(res.data.done_reason || 'stop'),
    duration_ms: Date.now() - t0,
  };
}

// ── Connectivity check ────────────────────────────────────────────
/**
 * Quick ping to verify the configured provider is reachable.
 * Returns { ok: boolean, provider: string, error?: string }
 */
export async function checkConnectivity(config = {}) {
  const provider = config.ai_provider || 'ollama';

  try {
    if (provider === 'ollama') {
      const endpoint = (config.ollama_endpoint || 'http://localhost:11434').replace(/\/$/, '');
      await axios.get(`${endpoint}/api/tags`, { timeout: 5000 });
      return { ok: true, provider };
    }

    // For all cloud providers, send a minimal one-token request
    const result = await callAI('Hi', config, { maxTokens: 5, timeout: 10_000, temperature: 0 });
    return { ok: result.text !== undefined, provider };
  } catch (err) {
    return { ok: false, provider, error: err.message };
  }
}

// ── Main entry point ──────────────────────────────────────────────
/**
 * Call the configured AI provider.
 *
 * @param {string} prompt         Full prompt text
 * @param {object} config         Tenant config (from readConfig)
 * @param {object} callOptions    { temperature, maxTokens, timeout }
 * @returns {Promise<{ text: string, done_reason: 'stop'|'length', duration_ms: number }>}
 */
export async function callAI(prompt, config = {}, callOptions = {}) {
  const provider = (config.ai_provider || 'ollama').toLowerCase();

  logger.debug({ provider, model: config.ai_model || config.ollama_model }, '[AI] callAI');

  switch (provider) {
    case 'ollama':
      return callOllama(prompt, config, callOptions);

    case 'anthropic':
      return callAnthropic(prompt, config, callOptions);

    case 'gemini':
      return callGemini(prompt, config, callOptions);

    case 'openrouter':
    case 'openai':
    case 'copilot':
    case 'custom':
      return callOpenAICompat(prompt, config, callOptions);

    default:
      throw new Error(`Unknown ai_provider: "${provider}". Valid: ollama, openrouter, anthropic, gemini, openai, copilot, custom`);
  }
}
