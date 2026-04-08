/**
 * AI Event Logger
 *
 * Appends one JSON line per AI call to server/data/ai-events.jsonl.
 * Each line records everything sent to the model and everything received,
 * including truncation detection and parse outcomes.
 *
 * Tail the log in real-time:
 *   tail -f server/data/ai-events.jsonl | jq .
 *
 * Find all truncated calls:
 *   grep '"truncated":true' server/data/ai-events.jsonl | jq .
 *
 * Find all failed parses:
 *   grep '"parsed_ok":false' server/data/ai-events.jsonl | jq .
 */

import { appendFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LOG_DIR   = join(__dirname, '..', 'data');
const LOG_FILE  = join(LOG_DIR, 'ai-events.jsonl');

// Ensure the data directory exists (created by db.js too, but guard here)
try { mkdirSync(LOG_DIR, { recursive: true }); } catch { /* already exists */ }

/**
 * Log a single AI interaction event.
 *
 * @param {object} event
 * @param {string}   event.context        - Where the call came from, e.g. 'enrichBatch', 'refineOutreach', 'refineOutreach:john@acme.com'
 * @param {string}   event.model          - Ollama model name, e.g. 'mistral'
 * @param {number}   event.attempt        - 1 = first try, 2 = retry
 * @param {number}   event.prompt_length  - Total prompt character count
 * @param {string}   event.prompt_preview - First 400 chars of the prompt sent
 * @param {string}   event.full_prompt    - Complete prompt (may be large)
 * @param {number}   event.raw_length     - Total raw response character count
 * @param {string}   event.raw_preview    - First 600 chars of the raw response
 * @param {string}   event.full_response  - Complete raw response
 * @param {string}   event.done_reason    - Ollama done_reason: 'stop' | 'length' | 'error'
 * @param {boolean}  event.truncated      - true if done_reason === 'length'
 * @param {boolean}  event.repaired       - true if truncated JSON was successfully repaired
 * @param {boolean}  event.parsed_ok      - true if final result was valid JSON
 * @param {number}   event.duration_ms    - Total round-trip time in ms
 * @param {string[]} event.lead_ids       - Lead emails processed in this call
 * @param {string}   [event.error]        - Error message if the call threw
 */
export function logAiEvent(event) {
  const entry = {
    ts: new Date().toISOString(),
    ...event,
  };
  try {
    appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
  } catch {
    // Non-blocking — never crash the pipeline over a logging failure
  }
}
