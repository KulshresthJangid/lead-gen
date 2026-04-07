import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, '..', '..', 'config.json');

export function readConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, 'utf-8'));
  } catch {
    return {};
  }
}

export function writeConfig(data) {
  const current = readConfig();
  const updated = { ...current, ...data };
  writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2), 'utf-8');
  return updated;
}
