import 'dotenv/config';
import BetterSqlite3 from 'better-sqlite3';
import pg from 'pg';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
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
  // Multi-tenancy migrations
  `CREATE TABLE IF NOT EXISTS tenants (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    slug        TEXT UNIQUE NOT NULL,
    plan        TEXT DEFAULT 'free',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email         TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    name          TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'member'
                    CHECK(role IN ('owner','admin','member','viewer')),
    invited_by    TEXT,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, email)
  )`,
  `CREATE TABLE IF NOT EXISTS invitations (
    id          TEXT PRIMARY KEY,
    tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email       TEXT NOT NULL,
    role        TEXT NOT NULL DEFAULT 'member',
    invited_by  TEXT NOT NULL,
    expires_at  DATETIME NOT NULL,
    accepted_at DATETIME,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, email)
  )`,
  `CREATE TABLE IF NOT EXISTS campaigns (
    id                  TEXT PRIMARY KEY,
    tenant_id           TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name                TEXT NOT NULL,
    description         TEXT DEFAULT '',
    color               TEXT DEFAULT '#1A73E8',
    product_description TEXT DEFAULT '',
    icp_description     TEXT DEFAULT '',
    scraper_targets     TEXT DEFAULT '[]',
    ai_queries          TEXT DEFAULT '[]',
    scraping_interval   INTEGER DEFAULT 30,
    daily_lead_target   INTEGER DEFAULT 0,
    status              TEXT DEFAULT 'active'
                          CHECK(status IN ('active','paused','archived')),
    created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS tenant_settings (
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    key       TEXT NOT NULL,
    value     TEXT NOT NULL,
    PRIMARY KEY (tenant_id, key)
  )`,
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
function columnExistsSQLite(rawDb, table, column) {
  const cols = rawDb.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some(c => c.name === column);
}

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
    columnExists: async (table, column) => columnExistsSQLite(rawDb, table, column),
    insertLeads: async (leads, tenantId, campaignId) => {
      const stmt = rawDb.prepare(`
        INSERT OR IGNORE INTO leads
          (full_name, job_title, company_name, company_domain, email, linkedin_url, location,
           pain_points, reason_for_outreach, lead_quality, confidence_score, source, email_hash,
           enrichment_attempts, enriched_at, status, tenant_id, campaign_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            tenantId || null,
            campaignId || null,
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
    columnExists: async (table, column) => {
      const res = await pool.query(
        `SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`,
        [table, column],
      );
      return res.rowCount > 0;
    },
    insertLeads: async (leads, tenantId, campaignId) => {
      const client = await pool.connect();
      const inserted = [];
      try {
        await client.query('BEGIN');
        for (const lead of leads) {
          const res = await client.query(
            `INSERT INTO leads
               (full_name, job_title, company_name, company_domain, email, linkedin_url, location,
                pain_points, reason_for_outreach, lead_quality, confidence_score, source, email_hash,
                enrichment_attempts, enriched_at, status, tenant_id, campaign_id)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
             ON CONFLICT (email) DO NOTHING
             RETURNING id`,
            [
              lead.full_name || '', lead.job_title || '', lead.company_name || '',
              lead.company_domain || '', lead.email, lead.linkedin_url || '',
              lead.location || '', lead.pain_points || '', lead.reason_for_outreach || '',
              lead.lead_quality || null, lead.confidence_score || null, lead.source || '',
              lead.email_hash, lead.enrichment_attempts || 0, lead.enriched_at || null,
              lead.status || 'new', tenantId || null, campaignId || null,
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

  // ALTER TABLE: add new columns if they don't exist yet
  const alterations = [
    { table: 'leads',        column: 'tenant_id',   ddl: 'ALTER TABLE leads ADD COLUMN tenant_id TEXT' },
    { table: 'leads',        column: 'campaign_id',  ddl: 'ALTER TABLE leads ADD COLUMN campaign_id TEXT' },
    { table: 'pipeline_log', column: 'tenant_id',   ddl: 'ALTER TABLE pipeline_log ADD COLUMN tenant_id TEXT' },
    { table: 'pipeline_log', column: 'campaign_id',  ddl: 'ALTER TABLE pipeline_log ADD COLUMN campaign_id TEXT' },
    { table: 'campaigns',    column: 'ai_queries',    ddl: "ALTER TABLE campaigns ADD COLUMN ai_queries TEXT DEFAULT '[]'" },
  ];
  for (const { table, column, ddl } of alterations) {
    const exists = await db.columnExists(table, column);
    if (!exists) {
      await db.run(ddl);
      logger.info(`[DB] Added column ${table}.${column}`);
    }
  }

  // Indexes for new columns
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_leads_tenant    ON leads(tenant_id)',
    'CREATE INDEX IF NOT EXISTS idx_leads_campaign  ON leads(campaign_id)',
    'CREATE INDEX IF NOT EXISTS idx_plog_tenant     ON pipeline_log(tenant_id)',
    'CREATE INDEX IF NOT EXISTS idx_plog_campaign   ON pipeline_log(campaign_id)',
  ];
  for (const idx of indexes) await db.run(idx);

  // Seed default settings (legacy table — keep for backward compat during migration)
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    const existing = await db.get('SELECT key FROM settings WHERE key = ?', [key]);
    if (!existing) {
      await db.run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value]);
    }
  }

  await migrateExistingData(db);

  logger.info(`Database initialized (${DB_TYPE})`);
  return db;
}

export function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDb() first.');
  return db;
}

// ---------------------------------------------------------------------------
// Slug helper
// ---------------------------------------------------------------------------
function slugify(str) {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ---------------------------------------------------------------------------
// Phase 9 — Migrate legacy admin/admin data to Default Organisation (Tenant 1)
// ---------------------------------------------------------------------------
export async function migrateExistingData(database) {
  try {
    const tenantCount = await database.get('SELECT COUNT(*) as n FROM tenants');
    const unassignedLeads = await database.get('SELECT COUNT(*) as n FROM leads WHERE tenant_id IS NULL');

    // Already migrated and nothing left to assign
    if (tenantCount.n > 0 && unassignedLeads.n === 0) return;

    // Nothing to migrate
    if (unassignedLeads.n === 0) {
      const settingsCount = await database.get('SELECT COUNT(*) as n FROM settings');
      if (settingsCount.n === 0) return;
    }

    logger.info('[MIGRATION] Starting legacy data migration…');

    // Step A — resolve tenant identity
    const orgName    = process.env.ORG_NAME || 'Default Organisation';
    const tenantSlug = slugify(orgName) || 'default';

    // Step B — create tenant if not exists
    let tenant = await database.get('SELECT id FROM tenants WHERE slug = ?', [tenantSlug]);
    if (!tenant) {
      const tenantId = randomUUID();
      await database.run(
        `INSERT INTO tenants (id, name, slug, plan, created_at) VALUES (?, ?, ?, 'free', CURRENT_TIMESTAMP)`,
        [tenantId, orgName, tenantSlug],
      );
      tenant = { id: tenantId };
      logger.info(`[MIGRATION] Tenant created: "${orgName}" (${tenantId})`);
    }
    const resolvedTenantId = tenant.id;

    // Step C — copy settings into tenant_settings
    const oldSettings = await database.all('SELECT key, value FROM settings');
    for (const { key, value } of oldSettings) {
      const exists = await database.get(
        'SELECT 1 FROM tenant_settings WHERE tenant_id = ? AND key = ?',
        [resolvedTenantId, key],
      );
      if (!exists) {
        await database.run(
          'INSERT INTO tenant_settings (tenant_id, key, value) VALUES (?, ?, ?)',
          [resolvedTenantId, key, value],
        );
      }
    }
    // Seed any missing defaults
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      const exists = await database.get(
        'SELECT 1 FROM tenant_settings WHERE tenant_id = ? AND key = ?',
        [resolvedTenantId, key],
      );
      if (!exists) {
        await database.run(
          'INSERT INTO tenant_settings (tenant_id, key, value) VALUES (?, ?, ?)',
          [resolvedTenantId, key, value],
        );
      }
    }

    // Step E — create default campaign
    let campaign = await database.get(
      `SELECT id FROM campaigns WHERE tenant_id = ? AND name = 'Default Campaign'`,
      [resolvedTenantId],
    );
    if (!campaign) {
      const findSetting = (k) => oldSettings.find(r => r.key === k)?.value;
      const campaignId = randomUUID();
      await database.run(
        `INSERT INTO campaigns
           (id, tenant_id, name, product_description, icp_description, scraper_targets,
            scraping_interval, daily_lead_target, status, created_at, updated_at)
         VALUES (?, ?, 'Default Campaign', ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          campaignId,
          resolvedTenantId,
          findSetting('product_description') || '',
          findSetting('icp_description')     || '',
          findSetting('scraper_targets')     || '[]',
          parseInt(findSetting('scraping_interval') || '30', 10),
          parseInt(findSetting('daily_lead_target')  || '0',  10),
        ],
      );
      campaign = { id: campaignId };
      logger.info(`[MIGRATION] Default Campaign created (${campaignId})`);
    }
    const resolvedCampaignId = campaign.id;

    // Step F — reassign orphaned leads
    if (unassignedLeads.n > 0) {
      await database.run(
        'UPDATE leads SET tenant_id = ?, campaign_id = ? WHERE tenant_id IS NULL',
        [resolvedTenantId, resolvedCampaignId],
      );
      logger.info(`[MIGRATION] ${unassignedLeads.n} leads assigned to Default Organisation / Default Campaign`);
    }

    // Step G — reassign orphaned pipeline_log rows
    const unassignedLogs = await database.get('SELECT COUNT(*) as n FROM pipeline_log WHERE tenant_id IS NULL');
    if (unassignedLogs.n > 0) {
      await database.run(
        'UPDATE pipeline_log SET tenant_id = ?, campaign_id = ? WHERE tenant_id IS NULL',
        [resolvedTenantId, resolvedCampaignId],
      );
      logger.info(`[MIGRATION] ${unassignedLogs.n} pipeline_log rows assigned`);
    }

    logger.info(`[MIGRATION] ✅ Existing data migration complete (tenant=${resolvedTenantId}, campaign=${resolvedCampaignId})`);
  } catch (err) {
    logger.error({ err }, '[MIGRATION] ❌ Migration failed — server will continue but data may need manual recovery');
  }
}
