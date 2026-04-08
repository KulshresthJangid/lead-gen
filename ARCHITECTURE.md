# Lead-Gen Application Architecture

---

## Overview

A self-hosted B2B lead generation pipeline. It continuously scrapes public sources for potential leads, deduplicates them, tags them with AI scores, and presents them in a React dashboard. Runs on a single Linux server with Nginx as reverse proxy.

---

## System Topology

```
Internet
   │
   ▼
Nginx (reverse proxy)
   ├── /drip/          → client/dist/  (static files, SELinux: httpd_sys_content_t)
   └── /drip-api/      → localhost:3002 (Node.js server + WebSocket)
                               │
                    ┌──────────┴──────────┐
                    │   Express Server    │
                    │   server/index.js   │
                    └──────────┬──────────┘
                               │
              ┌────────────────┼───────────────────┐
              ▼                ▼                   ▼
         REST API          WebSocket           Workers
         (routes/)       (socket.io)        (workers/)
              │
    ┌─────────┼──────────┐
    ▼         ▼          ▼
 SQLite    Ollama     External
 (db.js)  :11434      APIs
```

---

## Backend — `server/`

### Entry Point — `index.js`
- Loads `.env` from `server/.env` (explicit path via dotenv)
- Mounts all routers under `/api/`
- Attaches Socket.io to the HTTP server
- Calls `initScheduler(io)` — starts the pipeline cron + enrichment cron

### Routes — `server/routes/`

| File | Endpoint | Purpose |
|------|----------|---------|
| `auth.js` | `POST /api/auth/login` `POST /api/auth/verify` | JWT auth (HS256) |
| `leads.js` | `GET /api/leads` | Paginated, filtered, sorted leads |
| `stats.js` | `GET /api/stats` | Counts by quality/category/source |
| `pipeline.js` | `GET/POST /api/pipeline` | Pipeline status + manual trigger |
| `settings.js` | `GET/PUT /api/settings` | Read/write config (Zod validated) |

### Middleware — `server/middleware/`

- `authMiddleware.js` — JWT Bearer token guard on all routes except auth
- `rateLimiter.js` — express-rate-limit (prevents abuse)
- `errorHandler.js` — global error handler, structured JSON errors
- `validate.js` — Zod schema helper

### Database — `server/db.js`

- **SQLite** (default) via `better-sqlite3` — single file at `server/data/leads.db`
- **PostgreSQL** adapter also supported via `DB_TYPE=postgres` env var
- 3 tables: `leads`, `pipeline_log`, `settings`
- Auto-runs migrations on startup
- Dedup via `email_hash` (SHA-256) unique index

**Schema — `leads` table:**

| Column | Type | Notes |
|--------|------|-------|
| `id` | INTEGER PK | Auto-increment |
| `full_name` | TEXT | |
| `job_title` | TEXT | |
| `company_name` | TEXT | |
| `company_domain` | TEXT | |
| `email` | TEXT UNIQUE | |
| `email_hash` | TEXT UNIQUE | SHA-256 of normalised email |
| `linkedin_url` | TEXT | |
| `location` | TEXT | |
| `pain_points` | TEXT | AI-generated |
| `reason_for_outreach` | TEXT | AI-generated |
| `lead_quality` | TEXT | `hot` / `warm` / `cold` — AI-tagged |
| `confidence_score` | INTEGER | 0–100 — AI-scored |
| `manual_category` | TEXT | `hot/warm/cold/disqualified/pending` — human override |
| `manual_notes` | TEXT | |
| `status` | TEXT | `new` / `enriched` |
| `source` | TEXT | `github` / `hackernews` / `gitlab` / `google` / `custom:*` |
| `enriched_at` | DATETIME | NULL = not yet processed by AI |
| `created_at` | DATETIME | |

---

### Workers — `server/workers/`

#### `scheduler.js` — Two crons

**Pipeline cron:**
- Runs `runPipeline()` on configured interval: `15` / `30` / `60` / `360` minutes
- Or **continuous mode** (`interval = 0`) — runs back-to-back forever with 2s gap

**Enrichment sweep cron:**
- Runs every hour at `:00`
- Finds up to 20 leads where `enriched_at IS NULL`
- Feeds them through Mistral → updates DB → emits `leads_enriched` socket event

---

#### `scraper.js` — 5 Adapters

| Type | Source | Auth | Notes |
|------|--------|------|-------|
| `github` | GitHub API `/search/users` | `GITHUB_TOKEN` Bearer | Optional — 60 req/hr unauth, 5000/hr with token |
| `hackernews` | Algolia HN API | None | "Who wants to be hired?" thread, paginated up to 600 comments |
| `gitlab` | GitLab public API `/users` | None | Returns users with `public_email` set |
| `google` | Google Custom Search JSON API | `GOOGLE_CSE_KEY` + `GOOGLE_CSE_CX` | 100 free queries/day |
| `custom` | Any URL via Cheerio CSS selectors | None | Configurable selector map |

**GitHub Query Pool (~80 queries):**

Randomly samples 3 queries per run × random page (1–10). Covers:
- India — founders, CTOs, 8 cities, fullstack/ML/AI/devops/freelance
- USA — SF, NYC, Austin, SaaS founders, AI engineers
- UK — London, startup CTOs
- Europe — Germany/Berlin, Netherlands, France, Spain, Poland
- APAC — Singapore, Australia, Hong Kong, Philippines
- LATAM — Brazil/São Paulo, Mexico, Argentina
- Middle East/Africa — UAE/Dubai, Nigeria/Lagos, Kenya
- Global signals — `"hiring developers"`, `"contract developer"`, `indie hacker`, `bootstrapped founder`, `freelance developer`

With a GitHub token: ~4,500 unique result sets before any repetition.

---

#### `deduplicator.js` — Two-level dedup

1. **Exact** — SHA-256 `email_hash` lookup against DB
2. **Fuzzy** — Levenshtein distance < 3 on `full_name` within same `company_domain`

---

#### `enricher.js` — Two Mistral passes

**Pass 1 — `enrichBatch()`**
- Batches of 5 leads → single Ollama prompt
- Fills: `pain_points`, `reason_for_outreach`, `lead_quality` (hot/warm/cold), `confidence_score` (0–100)
- Guided by **Product Description** + **ICP Description** from Settings
- Timeout: none (CPU inference takes 2–5 min per batch)

**Pass 2 — `refineOutreach()`**
- Per-lead prompt → hyper-personalised outreach message
- References specific company, role, domain context
- Under 3 sentences, no generic sales language

---

## Pipeline Flow (one run)

```
Step 1  SCRAPE     Pick 3 random GitHub queries + all configured sources
           │         → GitHub API, HackerNews Algolia, GitLab API, Google CSE
           ▼
Step 2  DEDUP      SHA-256 email hash check + fuzzy name match against DB
           │         → drops already-seen leads
           ▼
Step 3  INSERT     Write unique leads to SQLite immediately
           │         → emits "new_leads" socket event → appears in UI instantly
           ▼
Step 4  ENRICH     Mistral (batches of 5) → pain_points, quality tag, score
           ▼
Step 5  REFINE     Mistral (per lead) → personalised outreach message
           ▼
Step 6  UPDATE DB  Write enrichment fields back to lead rows
```

---

## Scheduled Jobs

| Job | Schedule | What it does |
|-----|----------|-------------|
| Pipeline cron | 15 / 30 / 60 / 360 min or continuous | Full scrape → dedup → insert → enrich |
| Enrichment sweep | Every hour at :00 | Picks up unenriched leads (max 20 per sweep), runs Mistral |

---

## Frontend — `client/` (React + Vite)

### Pages

| Page | Purpose |
|------|---------|
| `Login.jsx` | JWT login form |
| `Dashboard.jsx` | Lead table with filters, sort, pagination, real-time updates via Socket.io |
| `LeadDetail.jsx` | Full lead view — AI scores, outreach message, manual category override |
| `Analytics.jsx` | Charts — quality distribution, source breakdown, timeline |
| `Settings.jsx` | Configure interval, scraper targets (source type + query), Ollama endpoint/model, product/ICP description |

### Hooks

| Hook | Purpose |
|------|---------|
| `useLeads.js` | React Query — `GET /api/leads` with filters/pagination |
| `usePipeline.js` | Pipeline status polling + manual trigger |
| `useSocket.js` | Socket.io client — listens for `new_leads`, `pipeline_done`, `leads_enriched` |

### Real-time flow

```
Server inserts lead  → emits "new_leads"       → useSocket → React Query refetch → table updates
Server enriches lead → emits "leads_enriched"  → same flow → quality tags appear
```

---

## Deployment

| Component | Value |
|-----------|-------|
| OS | Linux, SELinux enforcing |
| Node | v24.14.0 (pinned via `.nvmrc`) |
| Reverse proxy | Nginx — `/drip/` static, `/drip-api/` proxy to `:3002` |
| Static file SELinux label | `httpd_sys_content_t` (set by `deploy.sh` via `chcon`) |
| Process manager | nohup fallback → `/var/log/lead-gen-server.log` (PM2 optional via `ecosystem.config.cjs`) |
| Domain | `https://buildwithkulshresth.com` |
| AI model | Ollama + Mistral on `localhost:11434` |
| Database | SQLite at `server/data/leads.db` |
| Deploy script | `deploy.sh` — builds frontend, sets SELinux labels, restarts server |

### Environment variables — `server/.env`

| Variable | Required | Purpose |
|----------|----------|---------|
| `JWT_SECRET` | Yes | Signs auth tokens |
| `GITHUB_TOKEN` | Recommended | Raises GitHub API limit from 60 to 5000 req/hr |
| `GOOGLE_CSE_KEY` | For Google source | Google Custom Search API key |
| `GOOGLE_CSE_CX` | For Google source | Google Search Engine ID |
| `OLLAMA_ENDPOINT` | No | Defaults to `http://localhost:11434` |
| `DB_TYPE` | No | `sqlite` (default) or `postgres` |

---

## Data Flow Diagram

```
External Sources                  Server                        Client
──────────────                    ──────                        ──────
GitHub API   ──┐
HackerNews   ──┤── scraper.js ──► deduplicator.js ──► db.js ──► GET /api/leads
GitLab API   ──┤                                         │
Google CSE   ──┘                                         │ Socket.io
                                                         ▼
                                  enricher.js ◄── scheduler.js     "new_leads"
                                  (Ollama/Mistral)        │    ──► Dashboard
                                       │                  │
                                       └──► db.js UPDATE  └──► "leads_enriched"
```
