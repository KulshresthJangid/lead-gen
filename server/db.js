import 'dotenv/config';
import BetterSqlite3 from 'better-sqlite3';
import pg from 'pg';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import logger from './utils/logger.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_TYPE = process.env.DB_TYPE || 'sqlite';

let db = null;

// ---------------------------------------------------------------------------
// Migrations (SQLite dialect; postgres adapter handles syntax conversion)
// ---------------------------------------------------------------------------
const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS leads (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name           TEXT NOT NULL,
    job_title           TEXT,
    company_name        TEXT,
    company_domain      TEXT,
    email               TEXT UNIQUE NOT NULL,
    linkedin_url        TEXT,
    location            TEXT,
    pain_points         TEXT,
    reason_for_outreach TEXT,
    lead_quality        TEXT CHECK(lead_quality IN ('hot','warm','cold')),
    confidence_score    INTEGER CHECK(confidence_score BETWEEN 0 AND 100),
    manual_category     TEXT CHECK(manual_category IN ('hot','warm','cold','disqualified','pending')) DEFAULT 'pending',
    manual_notes        TEXT,
    status              TEXT DEFAULT 'new',
    source              TEXT,
    enrichment_attempts INTEGER DEFAULT 0,
    enriched_at         DATETIME,
    email_hash          TEXT UNIQUE NOT NULL,
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS pipeline_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id          TEXT UNIQUE NOT NULL,
    started_at      DATETIME NOT NULL,
    finished_at     DATETIME,
    status          TEXT DEFAULT 'running',
    scraped_count   INTEGER DEFAULT 0,
    dupes_skipped   INTEGER DEFAULT 0,
    inserted_count  INTEGER DEFAULT 0,
    enriched_count  INTEGER DEFAULT 0,
    error_count     INTEGER DEFAULT 0,
    errors_json     TEXT,
    triggered_by    TEXT DEFAULT 'scheduler'
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS idx_leads_quality   ON leads(lead_quality)`,
  `CREATE INDEX IF NOT EXISTS idx_leads_category  ON leads(manual_category)`,
  `CREATE INDEX IF NOT EXISTS idx_leads_domain    ON leads(company_domain)`,
  `CREATE INDEX IF NOT EXISTS idx_leads_created   ON leads(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_leads_hash      ON leads(email_hash)`,
];

const DEFAULT_SETTINGS = {
  ollama_endpoint: 'http://localhost:11434',
  ollama_model: 'mistral',
  scraping_interval: '30',
  is_setup_complete: 'false',
  product_description: '',
  icp_description: '',
  scraper_targets: '[]',
};

// ---------------------------------------------------------------------------
// SQLite interface (better-sqlite3 is synchronous, wrapped for async compat)
// ---------------------------------------------------------------------------
function createSQLiteInterface(rawDb) {
  return {
    get: async (sql, params = []) => {
      const flat = Array.isArray(params) ? params : [params];
      return rawDb.prepare(sql).get(...flat) ?? null;
    },
    all: async (sql, params = []) => {
      const flat = Array.isArray(params) ? params : [params];
      return rawDb.prepare(sql).all(...flat);
    },
    run: async (sql, params = []) => {
      const flat = Array.isArray(params) ? params : [params];
      return rawDb.prepare(sql).run(...flat);
    },
    exec: async (sql) => rawDb.exec(sql),
    insertLeads: async (leads) => {
      const stmt = rawDb.prepare(`
        INSERT OR IGNORE INTO leads
          (full_name, job_title, company_name, company_domain, email, linkedin_url, location,
           pain_points, reason_for_outreach, lead_quality, confidence_score, source, email_hash,
           enrichment_attempts, enriched_at, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const insertTx = rawDb.transaction((items) => {
        const inserted = [];
        for (const lead of items) {
          const res = stmt.run(
            lead.full_name || '',
            lead.job_title || '',
            lead.company_name || '',
            lead.company_domain || '',
            lead.email,
            lead.linkedin_url || '',
            lead.location || '',
            lead.pain_points || '',
            lead.reason_for_outreach || '',
            lead.lead_quality || null,
            lead.confidence_score || null,
            lead.source || '',
            lead.email_hash,
            lead.enrichment_attempts || 0,
            lead.enriched_at || null,
            lead.status || 'new',
          );
          if (res.changes > 0) inserted.push(lead);
        }
        return inserted;
      });
      return insertTx(leads);
    },
    _type: 'sqlite',
  };
}

// ---------------------------------------------------------------------------
// PostgreSQL interface (converts ? → $N placeholders)
// ---------------------------------------------------------------------------
function toPostgresParams(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function createPgInterface(pool) {
  return {
    get: async (sql, params = []) => {
      const res = await pool.query(toPostgresParams(sql), params);
      return res.rows[0] ?? null;
    },
    all: async (sql, params = []) => {
      const res = await pool.query(toPostgresParams(sql), params);
      return res.rows;
    },
    run: async (sql, params = []) => {
      const res = await pool.query(toPostgresParams(sql), params);
      return { changes: res.rowCount };
    },
    exec: async (sql) => pool.query(sql),
    insertLeads: async (leads) => {
      const client = await pool.connect();
      const inserted = [];
      try {
        await client.query('BEGIN');
        for (const lead of leads) {
          const res = await client.query(
            `INSERT INTO leads
               (full_name, job_title, company_name, company_domain, email, linkedin_url, location,
                pain_points, reason_for_outreach, lead_quality, confidence_score, source, email_hash,
                enrichment_attempts, enriched_at, status)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
             ON CONFLICT (email) DO NOTHING
             RETURNING id`,
            [
              lead.full_name || '', lead.job_title || '', lead.company_name || '',
              lead.company_domain || '', lead.email, lead.linkedin_url || '',
              lead.location || '', lead.pain_points || '', lead.reason_for_outreach || '',
              lead.lead_quality || null, lead.confidence_score || null, lead.source || '',
              lead.email_hash, lead.enrichment_attempts || 0, lead.enriched_at || null,
              lead.status || 'new',
            ],
          );
          if (res.rows.length > 0) inserted.push(lead);
        }
        await client.query('COMMIT');
        return inserted;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
    _type: 'postgres',
  };
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
export async function initDb() {
  if (DB_TYPE === 'postgres') {
    const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    for (const migration of MIGRATIONS) {
      const pgMigration = migration
        .replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, 'SERIAL PRIMARY KEY')
        .replace(/DATETIME/gi, 'TIMESTAMP');
      await pool.query(pgMigration);
    }
    db = createPgInterface(pool);
  } else {
    const dataDir = join(__dirname, 'data');
    mkdirSync(dataDir, { recursive: true });
    const rawDb = new BetterSqlite3(join(dataDir, 'leads.db'));
    rawDb.pragma('journal_mode = WAL');
    rawDb.pragma('foreign_keys = ON');
    for (const migration of MIGRATIONS) rawDb.exec(migration);
    db = createSQLiteInterface(rawDb);
  }

  // Seed default settings (check-first to avoid overwriting user data)
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    const existing = await db.get('SELECT key FROM settings WHERE key = ?', [key]);
    if (!existing) {
      await db.run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value]);
    }
  }

  logger.info(`Database initialized (${DB_TYPE})`);
  return db;
}

export function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}
