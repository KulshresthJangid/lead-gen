import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getDb } from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '..', '..', 'config.json');

export const DEFAULT_SETTINGS = {
  // Legacy Ollama settings (kept for backward compatibility)
  ollama_endpoint: 'http://localhost:11434',
  ollama_model: 'mistral',
  // Universal AI provider settings
  ai_provider: 'ollama',   // ollama | openrouter | anthropic | gemini | openai | copilot | custom
  ai_api_key: '',
  ai_model: '',            // blank = fall back to ollama_model for backward compat
  ai_base_url: '',         // override endpoint for ollama / custom providers
  scraping_interval: '30',
  is_setup_complete: 'false',
  product_description: '',
  icp_description: '',
  scraper_targets: '[]',
};

// Read all tenant settings from DB and return as a flat key→value object.
// Falls back to config.json values for any missing key (backward compat).
export async function readConfig(tenantId) {
  try {
    const db   = getDb();
    const rows = await db.all(
      'SELECT key, value FROM tenant_settings WHERE tenant_id = ?',
      [tenantId],
    );
    const dbConfig = Object.fromEntries(rows.map(r => [r.key, r.value]));

    // Fill in any missing keys from the flat file or defaults
    let fileConfig = {};
    try { fileConfig = JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')); } catch { /* ok */ }

    return { ...DEFAULT_SETTINGS, ...fileConfig, ...dbConfig };
  } catch {
    // DB not ready yet — fall back to file
    try { return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8')); } catch { return { ...DEFAULT_SETTINGS }; }
  }
}

// Upsert an object of key→value pairs into tenant_settings.
export async function writeConfig(tenantId, data) {
  const db = getDb();
  for (const [key, value] of Object.entries(data)) {
    await db.run(
      `INSERT INTO tenant_settings (tenant_id, key, value) VALUES (?, ?, ?)
       ON CONFLICT(tenant_id, key) DO UPDATE SET value = excluded.value`,
      [tenantId, key, String(value)],
    );
  }
  return readConfig(tenantId);
}

export function getDefaultConfig() {
  return { ...DEFAULT_SETTINGS };
}

