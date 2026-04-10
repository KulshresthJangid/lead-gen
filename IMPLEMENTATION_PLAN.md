# LeadGen Pro — Multi-tenant + Multi-campaign Implementation Plan

> **Scope:** Transform the current single-tenant, single-campaign lead-gen app into a full multi-tenant SaaS with role-based access control, multi-campaign pipelines per tenant, and RabbitMQ-backed job queuing.
>
> **Follow this file top-to-bottom. Complete each phase fully before starting the next.**

---

## Current State Snapshot

| Concern | Now |
|---|---|
| Auth | Hardcoded `AUTH_USERNAME` / `AUTH_PASSWORD` env vars, JWT with `{ sub: username }` |
| Tenancy | None — single global DB, single shared `config.json` |
| Campaigns | None — one `product_description` + `icp_description` + `scraper_targets` globally |
| Pipeline | Single global in-process cron (`node-cron`) |
| Queue | None — enrichment runs inline in the pipeline |
| Roles | None |
| DB | `leads`, `pipeline_log`, `settings` — no tenant or campaign FK |
| Config | `config.json` flat file, mirrored to `settings` K/V table |

---

## Target Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                        Browser (React)                        │
│  AuthContext { userId, tenantId, role }                       │
│  CampaignContext { activeCampaignId }                         │
│  Pages: Login | Register | Campaigns | Dashboard | Settings   │
└───────────────────────┬──────────────────────────────────────┘
                        │ REST + Socket.IO (JWT Bearer)
┌───────────────────────▼──────────────────────────────────────┐
│                   Express API (Node.js ESM)                   │
│  requireAuth  →  injects req.tenantId, req.userId, req.role  │
│  requireRole(roles[])  →  RBAC guard                         │
│                                                               │
│  /api/auth          public                                    │
│  /api/tenants       owner only                               │
│  /api/users         owner/admin                              │
│  /api/campaigns     owner/admin/member                       │
│  /api/leads         all authenticated                        │
│  /api/pipeline      owner/admin/member                       │
│  /api/settings      owner/admin                              │
│  /api/stats         all authenticated                        │
│  /api/ai-logs       all authenticated                       │
└───┬────────────────────────────────────────┬────────────────┘
    │ DB (SQLite dev / PG prod)              │ RabbitMQ
    │                                        │ exchange: leadgen
    │ tables:                                │ queues:
    │   tenants                              │   pipeline.{tenantId}.{campaignId}
    │   users                                │   enrich.{tenantId}.{campaignId}
    │   campaigns                            │
    │   leads (+ tenant_id, campaign_id)    └──► Worker process (scheduler.js)
    │   pipeline_log (+ tenant_id, campaign_id)   consumes pipeline.* queue
    │   settings (tenant_id, key, value)          publishes to enrich.* queue
    │   invitations                               ◄── Enricher worker consumes
    └────────────────────────────────────────────────────────────┘
```

---

## Roles & Permissions

| Role | Description | Capabilities |
|---|---|---|
| `owner` | Created the tenant on sign-up | Everything + delete tenant, manage billing |
| `admin` | Promoted by owner | All campaign/lead/pipeline ops + manage members |
| `member` | Regular team user | View + edit leads, run pipeline, create campaigns |
| `viewer` | Read-only | View leads, stats, AI logs — no edits, no trigger |

### Permission matrix

| Action | owner | admin | member | viewer |
|---|---|---|---|---|
| View leads / stats / AI logs | ✅ | ✅ | ✅ | ✅ |
| Edit lead category / notes | ✅ | ✅ | ✅ | ❌ |
| Export leads | ✅ | ✅ | ✅ | ❌ |
| Trigger pipeline | ✅ | ✅ | ✅ | ❌ |
| Create / edit campaigns | ✅ | ✅ | ✅ | ❌ |
| Archive / delete campaigns | ✅ | ✅ | ❌ | ❌ |
| Invite users | ✅ | ✅ | ❌ | ❌ |
| Change user roles | ✅ | ✅ | ❌ | ❌ |
| Remove users | ✅ | ✅ | ❌ | ❌ |
| Edit global settings (Ollama) | ✅ | ✅ | ❌ | ❌ |
| Delete all leads (danger) | ✅ | ❌ | ❌ | ❌ |
| Delete tenant | ✅ | ❌ | ❌ | ❌ |

---

## New Packages Required

### Server (`server/package.json`)
```json
"bcryptjs": "^2.4.3",
"amqplib": "^0.10.3"
```

### Client (`client/package.json`)
No new packages needed.

---

## Phase 1 — Database Migrations

**File: `server/db.js`**

Add these migrations **in order** to the `MIGRATIONS` array. Each must be idempotent (`IF NOT EXISTS`, `IF NOT EXISTS` columns via separate ALTER statements handled in migration runner).

### Migration 1 — `tenants` table
```sql
CREATE TABLE IF NOT EXISTS tenants (
  id          TEXT PRIMARY KEY,           -- uuid
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,       -- url-safe lowercase name
  plan        TEXT DEFAULT 'free',        -- free | pro | enterprise
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

### Migration 2 — `users` table
```sql
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,         -- uuid
  tenant_id     TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member'
                  CHECK(role IN ('owner','admin','member','viewer')),
  invited_by    TEXT,                     -- user id who invited them
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, email)
)
```

### Migration 3 — `invitations` table
```sql
CREATE TABLE IF NOT EXISTS invitations (
  id          TEXT PRIMARY KEY,           -- uuid (also used as token)
  tenant_id   TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  role        TEXT NOT NULL DEFAULT 'member',
  invited_by  TEXT NOT NULL,              -- user id
  expires_at  DATETIME NOT NULL,
  accepted_at DATETIME,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(tenant_id, email)
)
```

### Migration 4 — `campaigns` table
```sql
CREATE TABLE IF NOT EXISTS campaigns (
  id                  TEXT PRIMARY KEY,   -- uuid
  tenant_id           TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  description         TEXT DEFAULT '',
  color               TEXT DEFAULT '#1A73E8',
  product_description TEXT DEFAULT '',
  icp_description     TEXT DEFAULT '',
  scraper_targets     TEXT DEFAULT '[]',  -- JSON array
  scraping_interval   INTEGER DEFAULT 30, -- minutes; 0 = manual only
  daily_lead_target   INTEGER DEFAULT 0,
  status              TEXT DEFAULT 'active'
                        CHECK(status IN ('active','paused','archived')),
  created_at          DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at          DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

### Migration 5 — add columns to `leads`
```sql
ALTER TABLE leads ADD COLUMN tenant_id   TEXT;
ALTER TABLE leads ADD COLUMN campaign_id TEXT;
```
- Run each `ALTER TABLE` only if the column does not exist (check `PRAGMA table_info(leads)` in SQLite, `information_schema.columns` in PG)
- After adding: `CREATE INDEX IF NOT EXISTS idx_leads_tenant ON leads(tenant_id)`
- After adding: `CREATE INDEX IF NOT EXISTS idx_leads_campaign ON leads(campaign_id)`

### Migration 6 — add columns to `pipeline_log`
```sql
ALTER TABLE pipeline_log ADD COLUMN tenant_id   TEXT;
ALTER TABLE pipeline_log ADD COLUMN campaign_id TEXT;
```
- `CREATE INDEX IF NOT EXISTS idx_plog_tenant   ON pipeline_log(tenant_id)`
- `CREATE INDEX IF NOT EXISTS idx_plog_campaign ON pipeline_log(campaign_id)`

### Migration 7 — rebuild `settings` table
Drop the `PRIMARY KEY` on `key` alone; add `tenant_id`:
```sql
CREATE TABLE IF NOT EXISTS tenant_settings (
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key       TEXT NOT NULL,
  value     TEXT NOT NULL,
  PRIMARY KEY (tenant_id, key)
)
```
Keep the old `settings` table temporarily during migration; copy global rows to `tenant_settings` once a default tenant exists.

### Migration helpers in `db.js`
- Write a `columnExists(table, column)` async helper that checks `PRAGMA table_info` (SQLite) or `information_schema` (PG) before running `ALTER TABLE`
- Run each migration inside a try/catch so repeated `ALTER TABLE` attempts on existing columns are silently skipped

### `insertLeads` adapter update
Add `tenant_id` and `campaign_id` to both the SQLite and PG `insertLeads` implementations. Both should be required non-null parameters passed in from the caller (the pipeline worker).

---

## Phase 2 — Auth Refactor

**File: `server/routes/auth.js`** — full rewrite

### POST `/api/auth/register`
```
Body: { name, email, password, tenantName }
```
1. Validate with zod: name (1-100), email (valid), password (min 8), tenantName (1-60)
2. Check `users` table — reject if email already exists across any tenant
3. Generate `tenant.id = uuid()`, `tenant.slug = slugify(tenantName)`
4. `bcryptjs.hash(password, 12)`
5. Insert tenant row, then user row with `role = 'owner'`
6. Seed default `tenant_settings` for the new tenant (same keys as current `DEFAULT_SETTINGS`)
7. Create a default campaign for the tenant (name = "Default Campaign") so the UI is never empty
8. Return JWT: `{ sub: user.id, tenantId: tenant.id, role: 'owner' }` + `{ token, user: { id, name, email, role, tenantId, tenantName } }`

### POST `/api/auth/login`
```
Body: { email, password }
```
1. Lookup user by `email` across users table
2. `bcryptjs.compare(password, user.password_hash)`
3. Fetch tenant name from `tenants`
4. Return JWT + user object (same shape as register)

### POST `/api/auth/verify`
- Unchanged behaviour; now also returns `{ valid, user: { id, role, tenantId } }` on success

### POST `/api/auth/invite/accept`
```
Body: { token, name, password }
```
1. Lookup `invitations` by `id = token` — check not expired, not accepted
2. Hash password, insert user row with role from invitation
3. Mark invitation `accepted_at = NOW()`
4. Return JWT

### JWT shape (new)
```json
{ "sub": "<userId>", "tenantId": "<tenantId>", "role": "owner|admin|member|viewer" }
```

**File: `server/middleware/authMiddleware.js`** — update
- Decode new JWT fields
- `req.userId = decoded.sub`
- `req.tenantId = decoded.tenantId`
- `req.role = decoded.role`

### New middleware: `server/middleware/requireRole.js`
```js
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}
```

**File: `server/routes/users.js`** — new file

```
GET  /api/users              — list all users in tenant (admin/owner)
POST /api/users/invite        — send invitation (admin/owner)
  Body: { email, role }
  Creates invitation row, returns invite link (token in URL)
PUT  /api/users/:id/role      — change role (owner only; cannot change own role)
DELETE /api/users/:id         — remove user (admin/owner; cannot remove self)
```

---

## Phase 3 — Config Migration (file → DB)

**File: `server/utils/config.js`** — full rewrite

```js
// readConfig(tenantId) — reads from tenant_settings table
// writeConfig(tenantId, data) — upserts into tenant_settings table
// getDefaultConfig() — returns the DEFAULT_SETTINGS object (no DB call)
```

All existing callers of `readConfig()` / `writeConfig()` must be updated to pass `tenantId`:
- `server/workers/scheduler.js`
- `server/workers/enricher.js`
- `server/workers/queryGenerator.js`
- `server/routes/settings.js`
- `server/routes/pipeline.js` (via `readConfig`)

The `config.json` flat file is deprecated. On first boot, if `config.json` exists, migrate its values into `tenant_settings` for the default tenant (if one exists) and then leave the file in place as a backup — do not delete it.

---

## Phase 4 — Campaigns CRUD

**File: `server/routes/campaigns.js`** — new file

All routes are under `/api/campaigns`. All require `requireAuth`. Tenant isolation is automatic — always filter by `req.tenantId`.

```
GET    /api/campaigns
  → List all campaigns for tenant (all roles)
  → Returns: [{ id, name, description, color, status, product_description, icp_description,
                daily_lead_target, leadCount, lastRunAt, lastRunStatus }]

POST   /api/campaigns
  → Create new campaign (owner/admin/member)
  Body: { name, description?, color?, product_description, icp_description,
          scraper_targets?, scraping_interval?, daily_lead_target? }
  → Zod validation
  → Returns: campaign row

GET    /api/campaigns/:id
  → Get single campaign + last 5 pipeline runs (all roles)

PUT    /api/campaigns/:id
  → Update campaign (owner/admin/member)
  → Same body fields as POST
  → Must verify campaign.tenant_id === req.tenantId

DELETE /api/campaigns/:id
  → Soft-delete: set status = 'archived' (owner/admin only)
  → Does NOT delete leads — they remain with campaign_id FK intact

POST   /api/campaigns/:id/trigger
  → Manually trigger pipeline for this campaign (owner/admin/member)
  → Publishes a message to RabbitMQ: exchange=leadgen, routingKey=pipeline, body={ tenantId, campaignId, triggeredBy: 'manual' }
  → Returns: { queued: true, message: 'Pipeline job queued' }
```

Register in `server/index.js`:
```js
import campaignsRouter from './routes/campaigns.js';
app.use('/api/campaigns', requireAuth, campaignsRouter);
```

---

## Phase 5 — Tenant Isolation in Existing Routes

Every existing route must add `tenant_id` to every DB query. No exceptions.

### `server/routes/leads.js`
- `buildWhereClause` must always start with `["tenant_id = ?", "status != 'archived'"]` and prepend `req.tenantId` to params
- `GET /` — add `tenant_id` filter
- `GET /:id` — add `AND tenant_id = ?` check
- `PUT /:id/categorize` — add `AND tenant_id = ?` to UPDATE
- `POST /:id/enrich` — add `AND tenant_id = ?`
- `DELETE /:id` — add `AND tenant_id = ?`
- `POST /export` — add `tenant_id` to where clause
- All routes accept optional `?campaignId=` query param / body field to filter by campaign

### `server/routes/stats.js`
- All queries get `WHERE tenant_id = ? AND ...`
- Accept optional `?campaignId=` to scope stats to one campaign

### `server/routes/pipeline.js` (route file)
- `GET /status` — filter `pipeline_log` by `tenant_id`; accept `?campaignId=`
- `POST /trigger` — now deprecated in favour of `POST /api/campaigns/:id/trigger` but keep for backward compat; route should publish to RabbitMQ instead of calling `triggerNow()` directly

### `server/routes/settings.js`
- `readConfig` / `writeConfig` calls updated to pass `req.tenantId`
- Setup wizard `POST /api/settings/setup/complete` — creates default campaign if none exists for tenant
- Danger-zone deletes scope to `tenant_id`

### `server/routes/ai-logs.js`
- If AI logs are stored in a file, gate read by `tenantId` (or move to DB)

---

## Phase 6 — RabbitMQ Integration

### Connection module: `server/utils/rabbitmq.js` — new file

```js
import amqplib from 'amqplib';
import logger from './logger.js';

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://localhost';
const EXCHANGE     = 'leadgen';

let _conn    = null;
let _channel = null;

export async function connectRabbitMQ() {
  _conn    = await amqplib.connect(RABBITMQ_URL);
  _channel = await _conn.createChannel();
  await _channel.assertExchange(EXCHANGE, 'topic', { durable: true });
  // Queues declared by consumers
  logger.info('[RABBITMQ] Connected');
  return _channel;
}

export function getChannel() {
  if (!_channel) throw new Error('RabbitMQ not connected');
  return _channel;
}

export async function publishJob(routingKey, payload) {
  const ch = getChannel();
  ch.publish(
    EXCHANGE,
    routingKey,
    Buffer.from(JSON.stringify(payload)),
    { persistent: true },
  );
}
```

Call `connectRabbitMQ()` in `server/index.js` `start()` function, after `initDb()`.

### Queue naming convention
- Pipeline jobs: `routing key = pipeline.{tenantId}.{campaignId}` → bound to queue `pipeline_jobs`
- Enrichment jobs: `routing key = enrich.{tenantId}.{campaignId}` → bound to queue `enrich_jobs`
  - Use binding pattern `pipeline.#` and `enrich.#` so one durable queue receives all tenants

### Publishing (campaigns route / pipeline route)
```js
await publishJob(`pipeline.${req.tenantId}.${campaignId}`, {
  tenantId: req.tenantId,
  campaignId,
  triggeredBy: 'manual',    // or 'scheduler'
});
```

### Scheduler rewrite: `server/workers/scheduler.js`

Remove the single global cron + global `isRunning` flag.

New design:
1. On startup, read all active campaigns across all tenants from DB
2. For each tenant+campaign with `scraping_interval > 0`, schedule a `node-cron` job
3. Each cron job publishes to `pipeline.{tenantId}.{campaignId}` — it does NOT run inline
4. Export `reschedule(tenantId, campaignId, intervalMinutes)` — called by settings/campaigns PUT routes to update a specific campaign's cron without restarting
5. Export `getState(tenantId, campaignId)` — returns `{ isRunning, lastRunAt, nextRunAt, todayInserted, dailyTarget }`

Pipeline state is stored per `{tenantId}:{campaignId}` key in a `Map`.

### Pipeline worker: `server/workers/pipeline.js` — new file (not the route)

> **Note:** Currently `server/workers/pipeline.js` is the Express router. Rename the router to `server/routes/pipeline.js` (it already lives there: `server/routes/pipeline.js` is the route; `server/workers/pipeline.js` does not yet exist as a worker). Create the worker:

`server/workers/pipelineWorker.js` — new file

```js
export async function startPipelineConsumer(channel, db) {
  const EXCHANGE = 'leadgen';
  const QUEUE    = 'pipeline_jobs';

  await channel.assertQueue(QUEUE, { durable: true });
  await channel.bindQueue(QUEUE, EXCHANGE, 'pipeline.#');
  channel.prefetch(1); // process one campaign pipeline at a time per worker process

  channel.consume(QUEUE, async (msg) => {
    if (!msg) return;
    const { tenantId, campaignId, triggeredBy } = JSON.parse(msg.content.toString());

    try {
      await runCampaignPipeline(tenantId, campaignId, triggeredBy, db, channel);
      channel.ack(msg);
    } catch (err) {
      logger.error({ tenantId, campaignId, err }, '[PIPELINE-WORKER] Fatal error');
      channel.nack(msg, false, false); // dead-letter
    }
  });
}
```

`runCampaignPipeline(tenantId, campaignId, triggeredBy, db, channel)`:
1. Load campaign row from DB; if not found or archived → skip
2. Load tenant settings via `readConfig(tenantId)` (Ollama config)
3. Build a merged config object: `{ ...tenantSettings, ...campaign }` — campaign fields override
4. Run: Step 0 (AI query gen), Step 1 (scrape), Step 2 (dedup scoped to tenant+campaign), Step 3 (insert with tenant_id + campaign_id)
5. After insert: publish `enrich.{tenantId}.{campaignId}` with the list of inserted lead IDs
6. Update `pipeline_log` (with tenant_id, campaign_id)
7. Emit Socket.IO event `pipeline_update` with `{ tenantId, campaignId, stats }`

### Enrichment worker: `server/workers/enrichWorker.js` — new file

```js
export async function startEnrichConsumer(channel, db) {
  const EXCHANGE = 'leadgen';
  const QUEUE    = 'enrich_jobs';

  await channel.assertQueue(QUEUE, { durable: true });
  await channel.bindQueue(QUEUE, EXCHANGE, 'enrich.#');
  channel.prefetch(1);

  channel.consume(QUEUE, async (msg) => {
    if (!msg) return;
    const { tenantId, campaignId, leadIds, runId } = JSON.parse(msg.content.toString());
    // Load leads, run enrichBatch + refineOutreach, update rows
    // Emit socket event on completion
    channel.ack(msg);
  });
}
```

### Dedup update: `server/workers/deduplicator.js`
Add `tenant_id` (and optionally `campaign_id`) scope to `isDuplicate` DB queries:
```sql
SELECT id FROM leads WHERE email_hash = ? AND tenant_id = ?
```

---

## Phase 7 — Frontend Changes

### 7.1 Auth Context (`client/src/context/AuthContext.jsx`) — update

New stored state:
```js
{
  authenticated: null | false | true,
  user: {
    id, name, email, role,        // 'owner'|'admin'|'member'|'viewer'
    tenantId, tenantName
  }
}
```
- Parse the JWT payload on login to extract `role`, `tenantId`
- Store user object in `localStorage` alongside the token (as JSON, key `lg_user`)
- Export `useCanEdit()`, `useCanAdmin()` hooks:
  ```js
  export function useCanEdit() {
    const { user } = useAuth();
    return ['owner','admin','member'].includes(user?.role);
  }
  export function useCanAdmin() {
    const { user } = useAuth();
    return ['owner','admin'].includes(user?.role);
  }
  ```

### 7.2 Campaign Context (`client/src/context/CampaignContext.jsx`) — new file

```js
// Stores the currently selected campaign across all pages
// Falls back to first active campaign or 'all' aggregate view
const CampaignContext = createContext(null);

export function CampaignProvider({ children })  // wraps app
export function useCampaign()                   // returns { activeCampaign, setActiveCampaign, campaigns, isLoading }
```
- Fetches `/api/campaigns` on mount, caches via TanStack Query `queryKey: ['campaigns']`
- Persists `activeCampaignId` in `localStorage` key `lg_activeCampaign`
- If stored ID no longer exists in the list, falls back to first campaign

### 7.3 New Pages

#### `client/src/pages/Register.jsx`
Form: Name, Work email, Password (min 8), Organisation name
- POST `/api/auth/register`
- On success → `login(token)` → redirect to `/`

#### `client/src/pages/Campaigns.jsx`
- Campaign cards grid: name (with colour dot), description, status badge, lead count, last pipeline run
- "New Campaign" button → opens `CampaignFormModal`
- Each card: Edit (pencil), Archive (trash) — both guarded by role
- Click card → `/campaigns/:id`

#### `client/src/pages/CampaignDetail.jsx` (`/campaigns/:id`)
- Tabs: Overview | Settings | Pipeline History
- **Overview:** lead count stats for just this campaign, recent leads table
- **Settings:** Edit name/colour/description, product description, ICP description, scraper targets (same target editor from current Settings page), scraping interval, daily target — Save button (member+ only)
- **Pipeline History:** table of pipeline_log rows for this campaign

#### `client/src/pages/TeamSettings.jsx` (`/settings/team`)
- Member list: name, email, role badge, "Change role" dropdown (admin/owner), "Remove" button (admin/owner)
- "Invite member" button → modal with email + role select → POST `/api/users/invite` → shows invite link

### 7.4 Modified Pages

#### `client/src/pages/Login.jsx`
- Add "Create a free account →" link pointing to `/register`
- POST body changes: `{ email, password }` (username removed — now email-based)

#### `client/src/pages/Dashboard.jsx`
- Add campaign filter: a small campaign selector bar above StatsCards
- Use `useCampaign()` to get activeCampaign; pass `campaignId` to `useLeads()` and stats queries
- "All campaigns" option shows aggregate

#### `client/src/pages/Settings.jsx`
- Remove product_description, icp_description, scraper_targets, daily_lead_target from this page (they move to CampaignDetail)
- Keep: Ollama endpoint, model, global scraping interval, danger zone
- Add "Team" tab → renders TeamSettings inline or links to `/settings/team`

### 7.5 New Components

#### `client/src/components/CampaignSwitcher.jsx`
- Dropdown in the sidebar (below the logo area)
- Shows active campaign name with colour dot
- Clicking opens a popover listing all campaigns + "All" option
- "+ New Campaign" button at bottom of popover → opens CampaignFormModal

#### `client/src/components/CampaignFormModal.jsx`
- Modal for create/edit campaign
- Fields: Name, Description, Colour picker (6 preset colours), Product description (textarea), ICP description (textarea), Scraper targets (reuse existing target editor component)

#### `client/src/components/RoleBadge.jsx`
- Small coloured pill: owner (purple), admin (blue), member (green), viewer (grey)

### 7.6 Modified Components

#### `client/src/components/SetupWizard.jsx`
- Step 1 already creates org name (remove — now done at register)
- Rename to "Campaign Setup Wizard" — creates the first real campaign
- PUT `/api/campaigns/:id` instead of `/api/settings`

#### `client/src/hooks/useLeads.js`
- Accept `campaignId` in params; pass as `?campaignId=X` to API

#### `client/src/api/client.js`
- Interceptor already attaches Bearer token — no change needed
- Add response interceptor: on 403, show toast "You don't have permission to do that"

### 7.7 Router (`client/src/App.jsx`)
New routes to add:
```jsx
<Route path="/register"             element={<Register />} />
<Route path="/campaigns"            element={<Campaigns />} />
<Route path="/campaigns/:id"        element={<CampaignDetail />} />
<Route path="/settings/team"        element={<TeamSettings />} />
```
The `<CampaignProvider>` wraps all authenticated routes.

---

## Phase 8 — Environment Variables

Add to `server/.env` / production env:

```
RABBITMQ_URL=amqp://localhost          # or amqp://user:pass@host:5672
JWT_SECRET=<strong-random-secret>      # must change from default
NODE_ENV=production
DB_TYPE=postgres                       # or sqlite
DATABASE_URL=postgres://...

# One-time migration env vars (remove after first successful boot)
OWNER_EMAIL=admin@yourcompany.com      # becomes the owner login email
OWNER_PASSWORD=StrongPassword123!      # bcrypt-hashed on arrival; remove from env after migration
OWNER_NAME=Admin                       # display name for the owner account
ORG_NAME=Default Organisation          # tenant display name
```

Remove from env (no longer used):
```
AUTH_USERNAME
AUTH_PASSWORD
```

---

## Phase 9 — Migration of Existing Data (admin/admin → Tenant 1)

### Context

The production instance currently runs with hardcoded credentials (`AUTH_USERNAME=admin` / `AUTH_PASSWORD=admin`). All existing leads, pipeline logs, and settings belong to this implicit single user. This migration preserves every row of that data by assigning it to a proper `owner` account under a new tenant called **"Default Organisation"**.

---

### 9.1 — Pre-migration checklist (do before deploying new code)

Set these env vars on the server **before** the new code boots for the first time:

```bash
# The email and password the existing admin will log in with after migration.
# Choose a real email — this becomes the owner account.
OWNER_EMAIL=admin@yourcompany.com
OWNER_PASSWORD=YourNewStrongPassword123!
OWNER_NAME="Admin"
ORG_NAME="Default Organisation"

# Keep the old vars set during the transition window so the old auth route
# still works if you need to roll back before the new code is fully live.
AUTH_USERNAME=admin
AUTH_PASSWORD=admin
```

> **Security:** `OWNER_PASSWORD` must be at least 8 characters. Do not reuse `admin`. The old `AUTH_USERNAME` / `AUTH_PASSWORD` env vars are ignored by the new auth code but harmless to leave set.

---

### 9.2 — `migrateExistingData(db)` — implementation spec

**Location:** `server/db.js`, exported function, called from `initDb()` after all DDL migrations run.

**Guard:** The function must be fully idempotent. It checks at the top:
```js
const tenantCount = await db.get('SELECT COUNT(*) as n FROM tenants');
const oldLeadCount = await db.get("SELECT COUNT(*) as n FROM leads WHERE tenant_id IS NULL");
if (tenantCount.n > 0 && oldLeadCount.n === 0) return; // already migrated
```
This makes it safe to run on every boot without repeating work.

**Steps inside the function:**

#### Step A — Resolve env vars with safe fallbacks
```js
const ownerEmail    = process.env.OWNER_EMAIL    || 'admin@localhost';
const ownerPassword = process.env.OWNER_PASSWORD || 'admin';
const ownerName     = process.env.OWNER_NAME     || 'Admin';
const orgName       = process.env.ORG_NAME       || 'Default Organisation';
```

If `OWNER_EMAIL` is not set, log a **loud warning** and proceed with the fallback so the server doesn't crash — but the admin must change these immediately after first login.

#### Step B — Create tenant (if not exists)
```js
// slug = url-safe lowercase of orgName
const tenantId = uuidv4();
await db.run(
  `INSERT OR IGNORE INTO tenants (id, name, slug, plan, created_at)
   VALUES (?, ?, ?, 'free', CURRENT_TIMESTAMP)`,
  [tenantId, orgName, slugify(orgName)]
);
// Re-fetch in case it existed already (idempotent)
const tenant = await db.get('SELECT id FROM tenants WHERE slug = ?', [slugify(orgName)]);
const resolvedTenantId = tenant.id;
```

#### Step C — Create owner user account (if not exists)
```js
import bcrypt from 'bcryptjs';
const passwordHash = await bcrypt.hash(ownerPassword, 12);
const userId = uuidv4();
await db.run(
  `INSERT OR IGNORE INTO users
     (id, tenant_id, email, password_hash, name, role, created_at)
   VALUES (?, ?, ?, ?, ?, 'owner', CURRENT_TIMESTAMP)`,
  [userId, resolvedTenantId, ownerEmail, passwordHash, ownerName]
);
```
Log at INFO level: `[MIGRATION] Owner account created: ${ownerEmail} — CHANGE YOUR PASSWORD after first login`

#### Step D — Copy settings into `tenant_settings`
```js
const oldSettings = await db.all('SELECT key, value FROM settings');
for (const { key, value } of oldSettings) {
  await db.run(
    `INSERT OR IGNORE INTO tenant_settings (tenant_id, key, value) VALUES (?, ?, ?)`,
    [resolvedTenantId, key, value]
  );
}
```
Also seed any missing default keys (same `DEFAULT_SETTINGS` map, `INSERT OR IGNORE`).

#### Step E — Create the default campaign

Pull product/ICP/targets from the old settings rows:
```js
const product   = oldSettings.find(r => r.key === 'product_description')?.value || '';
const icp       = oldSettings.find(r => r.key === 'icp_description')?.value     || '';
const targets   = oldSettings.find(r => r.key === 'scraper_targets')?.value     || '[]';
const interval  = parseInt(oldSettings.find(r => r.key === 'scraping_interval')?.value || '30', 10);
const dailyTgt  = parseInt(oldSettings.find(r => r.key === 'daily_lead_target')?.value || '0', 10);

const campaignId = uuidv4();
await db.run(
  `INSERT OR IGNORE INTO campaigns
     (id, tenant_id, name, product_description, icp_description,
      scraper_targets, scraping_interval, daily_lead_target, status, created_at, updated_at)
   VALUES (?, ?, 'Default Campaign', ?, ?, ?, ?, ?, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
  [campaignId, resolvedTenantId, product, icp, targets, interval, dailyTgt]
);
// Re-fetch in case it already existed
const campaign = await db.get(
  "SELECT id FROM campaigns WHERE tenant_id = ? AND name = 'Default Campaign'",
  [resolvedTenantId]
);
const resolvedCampaignId = campaign.id;
```

#### Step F — Reassign all orphaned leads
```js
// Only touch rows that have not been assigned yet
const unassignedLeadCount = await db.get(
  'SELECT COUNT(*) as n FROM leads WHERE tenant_id IS NULL'
);
if (unassignedLeadCount.n > 0) {
  await db.run(
    'UPDATE leads SET tenant_id = ?, campaign_id = ? WHERE tenant_id IS NULL',
    [resolvedTenantId, resolvedCampaignId]
  );
  logger.info(
    { count: unassignedLeadCount.n, tenantId: resolvedTenantId, campaignId: resolvedCampaignId },
    '[MIGRATION] Leads reassigned to Default Organisation / Default Campaign'
  );
}
```

#### Step G — Reassign all orphaned pipeline_log rows
```js
await db.run(
  'UPDATE pipeline_log SET tenant_id = ?, campaign_id = ? WHERE tenant_id IS NULL',
  [resolvedTenantId, resolvedCampaignId]
);
```

#### Step H — Log completion
```js
logger.info(
  { tenantId: resolvedTenantId, campaignId: resolvedCampaignId, ownerEmail },
  '[MIGRATION] ✅ Existing data migration complete'
);
```

---

### 9.3 — Rollback plan

If the migration produces incorrect results or the new code has a critical bug:

1. `git revert` the deployment commit and redeploy the old code
2. The old code only reads `leads`, `pipeline_log`, `settings` — none of those tables are dropped or structurally changed; only new columns and new tables are added
3. The old columns (`tenant_id`, `campaign_id`) are `NULL`-able — old code ignores unknown columns
4. Old `AUTH_USERNAME` / `AUTH_PASSWORD` env vars are still set → old login works immediately
5. No data is deleted at any point during the migration

**Recovery after rollback:** Truncate only the new tables (`tenants`, `users`, `invitations`, `campaigns`, `tenant_settings`) and NULL-out the new columns to return to a clean pre-migration state if you need to re-run the migration:
```sql
DELETE FROM tenants;
DELETE FROM users;
DELETE FROM invitations;
DELETE FROM campaigns;
DELETE FROM tenant_settings;
UPDATE leads SET tenant_id = NULL, campaign_id = NULL;
UPDATE pipeline_log SET tenant_id = NULL, campaign_id = NULL;
```

---

### 9.4 — Post-migration actions (required within 24 hours)

| Action | How |
|---|---|
| Change your password | Login with `OWNER_EMAIL` + `OWNER_PASSWORD`, go to Settings → Account → Change password |
| Remove old env vars | Delete `AUTH_USERNAME`, `AUTH_PASSWORD` from server environment |
| Remove `OWNER_PASSWORD` | Once migration is confirmed complete, remove from env (keep `OWNER_EMAIL` for reference) |
| Verify lead count | Dashboard should show same lead count as before |
| Verify campaign settings | Campaign Detail → Settings should show the old product/ICP config |
| Verify pipeline history | Analytics / Pipeline page should show historical pipeline_log rows |

---

## Implementation Order (step-by-step for Copilot)

Execute these steps in order. Each step should be committed separately.

### Step 1 — Install new server packages
```bash
cd server && npm install bcryptjs amqplib
```

### Step 2 — DB migrations
- Edit `server/db.js`
- Add `columnExists()` helper
- Add all 7 migrations to `MIGRATIONS` array
- Add `migrateExistingData()` function
- Call it from `initDb()` after migrations run

### Step 3 — RabbitMQ utility
- Create `server/utils/rabbitmq.js`
- Wire `connectRabbitMQ()` into `server/index.js` `start()`

### Step 4 — Auth rewrite
- Rewrite `server/routes/auth.js` (register, login, verify, invite/accept)
- Update `server/middleware/authMiddleware.js`
- Create `server/middleware/requireRole.js`
- Create `server/routes/users.js`
- Wire users router into `server/index.js`

### Step 5 — Config utility rewrite
- Rewrite `server/utils/config.js` to read from `tenant_settings`
- Update all callers to pass `tenantId`

### Step 6 — Campaigns route
- Create `server/routes/campaigns.js`
- Wire into `server/index.js`

### Step 7 — Tenant isolation in existing routes
- Update `server/routes/leads.js`
- Update `server/routes/stats.js`
- Update `server/routes/settings.js`
- Update `server/routes/pipeline.js`
- Update `server/routes/ai-logs.js`

### Step 8 — Scheduler + RabbitMQ workers
- Rewrite `server/workers/scheduler.js` (publish to RabbitMQ, per-campaign cron)
- Create `server/workers/pipelineWorker.js`
- Create `server/workers/enrichWorker.js`
- Update `server/workers/deduplicator.js` (tenant-scoped dedup)
- Start workers inside `server/index.js` `start()` after RabbitMQ connects

### Step 9 — Frontend: Auth & contexts
- Update `client/src/context/AuthContext.jsx`
- Create `client/src/context/CampaignContext.jsx`
- Create `client/src/pages/Register.jsx`
- Update `client/src/pages/Login.jsx`

### Step 10 — Frontend: Campaign surfaces
- Create `client/src/pages/Campaigns.jsx`
- Create `client/src/pages/CampaignDetail.jsx`
- Create `client/src/components/CampaignSwitcher.jsx`
- Create `client/src/components/CampaignFormModal.jsx`
- Create `client/src/pages/TeamSettings.jsx`
- Create `client/src/components/RoleBadge.jsx`

### Step 11 — Frontend: Wire everything together
- Update `client/src/App.jsx` (new routes, CampaignProvider)
- Update `client/src/pages/Dashboard.jsx` (campaign-scoped)
- Update `client/src/pages/Settings.jsx` (trim to global settings)
- Update `client/src/components/SetupWizard.jsx`
- Update `client/src/hooks/useLeads.js`
- Update `client/src/api/client.js` (403 interceptor)
- Add `CampaignSwitcher` to `Sidebar` in `App.jsx`

### Step 12 — Data migration & smoke test

**Before deploying:**
- Set `OWNER_EMAIL`, `OWNER_PASSWORD`, `OWNER_NAME`, `ORG_NAME` on the server (see Phase 9.1)
- Take a DB backup: `cp server/data/leads.db server/data/leads.db.pre-migration-backup`

**On first boot:**
- Watch server logs for `[MIGRATION]` lines — confirm tenant, owner, campaign created
- Confirm logged message: `✅ Existing data migration complete`

**Verify data integrity:**
- `SELECT COUNT(*) FROM leads WHERE tenant_id IS NULL` → must be **0**
- `SELECT COUNT(*) FROM pipeline_log WHERE tenant_id IS NULL` → must be **0**
- `SELECT COUNT(*) FROM leads` before and after must be **identical**

**Login test:**
- Open UI → login with `OWNER_EMAIL` + `OWNER_PASSWORD`
- Dashboard shows same lead count as before migration
- Campaign Detail → Settings shows old product/ICP/targets
- Pipeline History shows old pipeline_log rows

**New account test:**
- Register a second account (new org) via `/register`
- Confirm that second org sees **0 leads** (no cross-tenant data leak)

**RabbitMQ test:**
- Trigger pipeline from Campaign Detail → verify job appears in RabbitMQ queue and worker processes it
- Check `pipeline_log` new row has correct `tenant_id` + `campaign_id`

**Post-migration cleanup:**
- Remove `AUTH_USERNAME`, `AUTH_PASSWORD`, `OWNER_PASSWORD` from env
- Restart server and confirm login still works

---

## File Map (all files that change or are created)

### New Files
```
server/utils/rabbitmq.js
server/middleware/requireRole.js
server/routes/campaigns.js
server/routes/users.js
server/workers/pipelineWorker.js
server/workers/enrichWorker.js
client/src/context/CampaignContext.jsx
client/src/pages/Register.jsx
client/src/pages/Campaigns.jsx
client/src/pages/CampaignDetail.jsx
client/src/pages/TeamSettings.jsx
client/src/components/CampaignSwitcher.jsx
client/src/components/CampaignFormModal.jsx
client/src/components/RoleBadge.jsx
```

### Modified Files
```
server/package.json              — add bcryptjs, amqplib
server/db.js                     — migrations + migrateExistingData (Phase 9)
server/index.js                  — wire RabbitMQ, new routers, workers
server/utils/config.js           — rewrite (DB-backed, tenant-scoped)
server/routes/auth.js            — full rewrite
server/routes/leads.js           — tenant isolation + campaignId filter
server/routes/stats.js           — tenant isolation + campaignId filter
server/routes/settings.js        — tenant-scoped config reads
server/routes/pipeline.js        — publish to RabbitMQ
server/routes/ai-logs.js         — tenant isolation
server/middleware/authMiddleware.js — new JWT fields
server/workers/scheduler.js      — per-campaign cron + publish
server/workers/deduplicator.js   — tenant-scoped queries
client/src/context/AuthContext.jsx   — new user state shape
client/src/App.jsx               — new routes + CampaignProvider
client/src/pages/Login.jsx       — email-based, register link
client/src/pages/Dashboard.jsx   — campaign-scoped
client/src/pages/Settings.jsx    — global settings only
client/src/components/SetupWizard.jsx — campaign-first setup
client/src/hooks/useLeads.js     — campaignId param
client/src/api/client.js         — 403 interceptor
```

---

## Constraints & Rules for Copilot

1. **Never delete existing DB columns** — only add new ones via `ALTER TABLE`
2. **All DB queries must include `tenant_id = ?`** — no exceptions; enforce this at review
3. **Passwords are always stored as bcrypt hashes** — never plain text, never logged
4. **JWT secret must come from env** — the hardcoded fallback is only for local dev; warn loudly if the default is used in `NODE_ENV=production`
5. **RabbitMQ publish is fire-and-forget** from the API route — the route returns immediately; the worker handles failures
6. **Pipeline state per campaign** — `Map<"tenantId:campaignId", state>` — never a single global `isRunning`
7. **Role checks use `requireRole()` middleware** — inline `if (req.role !== ...)` checks are not allowed; always use the middleware
8. **The `viewer` role cannot mutate anything** — any `POST`, `PUT`, `DELETE` route must include `requireRole('owner','admin','member')` at minimum
9. **Invitations expire in 7 days** — enforce this on `invite/accept`
10. **ESM only** — all new files use `import/export`, no `require()`
