# Lead-Gen — Complete Product Breakdown
> Internal codename: **Drip**
> Generated: 11 April 2026

---

## SECTION 1: PRODUCT OVERVIEW

| Field | Detail |
|---|---|
| **Product Name** | Lead-Gen (basePath: `/drip/`, API: `/drip-api/`) |
| **Core Problem** | B2B lead generation is manual, expensive, and slow. Buying lead lists is full of stale data. Hiring SDRs is too costly for early-stage teams. Drip autonomously scrapes live public sources (GitHub, HackerNews, GitLab, Google), deduplicates contacts, enriches each lead with AI-generated pain points and personalised outreach reasons, then scores them hot/warm/cold — all without human intervention. |
| **Target Audience** | Founders, indie hackers, early-stage B2B SaaS teams (1–10 people) who need a steady stream of inbound-quality leads without a sales team. Specifically effective for developer-tool companies, technical SaaS, and products targeting engineers, CTOs, and startup founders. |
| **Product Maturity** | **MVP + Growth.** Core pipeline is fully working: scrape → deduplicate → enrich → score. Multi-tenant architecture and multi-campaign support have been implemented. RabbitMQ queue-backed workers are wired. The product is functional and self-hostable today. Missing: billing, email sequence triggers, CRM sync, and a public landing page. |
| **Key Differentiator** | The **Scrape → Deduplicate → Enrich → Score pipeline** runs autonomously on a cron, finds real active developers and founders from public intent signals (GitHub repos, HackerNews "who wants to be hired", public profiles), and uses local Ollama (Mistral 7B) to generate truly personalised outreach — not templates. Zero cost per lead once self-hosted. No data broker dependency. |

---

## SECTION 2: CORE FEATURES

### Feature 1: Multi-Campaign Lead Pipeline
- **What it does:** Each campaign maps to an ICP (Ideal Customer Profile) and a set of scraper targets. Multiple campaigns can run simultaneously under the same tenant, each with its own product description, ICP definition, scraping interval, and daily lead target. Campaigns have statuses: `active / paused / archived`.
- **Why it exists:** Different products or different buyer personas require completely different scraping queries and enrichment prompts. Campaigns isolate these contexts.
- **Who uses it:** Founder / marketing team.
- **Frequency:** Campaigns are set up once; leads flow in continuously based on the configured cron interval.
- **Classification:** ✅ MUST-HAVE (the root entity)

---

### Feature 2: Autonomous Lead Scraping
- **What it does:** On each pipeline run, the scraper hits 5 public sources:
  1. **GitHub** — searches developer profiles using a pool of ~80+ geographic/role query combinations (`founder location:India followers:>5`, `CTO location:Bangalore repos:>10`, etc.) — 3 random queries sampled per run to avoid repetition
  2. **HackerNews** — fetches "Who wants to be hired?" threads via Algolia API; parses structured lead data (email, skills, location) from comments
  3. **GitLab** — searches public user profiles (no auth required)
  4. **Google Custom Search** — queries via Google CSE API with custom keywords per campaign
  5. **Custom URL scraper** — any URL with configurable Cheerio CSS selectors for extracting name, email, title, company from arbitrary job boards, directories, or listing pages
- **Why it exists:** These sources contain people actively building, hiring, and signalling intent — the highest-quality cold outreach candidates available without paying a data broker.
- **Who uses it:** System (automated on cron), configured per campaign via `scraper_targets`.
- **Frequency:** Every 15 / 30 / 60 / 360 minutes (configurable per campaign).
- **Classification:** ✅ MUST-HAVE (the data generation engine)

---

### Feature 3: Smart Deduplication
- **What it does:** Two-pass dedup on every lead before insertion:
  1. **Exact match** — SHA-256 hash of normalised email checked against `email_hash` unique index in the DB
  2. **Fuzzy match** — Levenshtein distance on `name + company_domain` to catch the same person with slightly different name spellings
- **Why it exists:** Scraping the same person from multiple sources (GitHub + HackerNews) is guaranteed to happen. Inserting duplicates would poison the pipeline and waste enrichment tokens.
- **Who uses it:** System (automatic, no user interaction needed).
- **Frequency:** Every pipeline run.
- **Classification:** ✅ MUST-HAVE

---

### Feature 4: AI Lead Enrichment (via Ollama)
- **What it does:** After a lead is inserted, the enrichment worker pulls it through Ollama (local Mistral 7B inference, or any configured model). The AI receives the lead's public data + the campaign's `product_description` + `icp_description`, and outputs:
  - `pain_points` — what problems this specific person likely faces
  - `reason_for_outreach` — why your product is relevant to this person specifically
  - `lead_quality` — `hot` / `warm` / `cold` classification
  - `confidence_score` — 0–100 relevance score
- **Why it exists:** Raw scraped data is just contact info. Enrichment converts it into actionable intelligence — "this CTO at a 12-person startup using Python has been posting about deployment pain, here's why our DevOps tool is relevant." Without enrichment, Drip is just a scraper.
- **Who uses it:** System (automated). Visible to all users in lead detail view.
- **Frequency:** Continuous — enrichment runs in parallel with scraping via a separate RabbitMQ queue (`enrich.{tenantId}.{campaignId}`).
- **Classification:** ✅ MUST-HAVE (primary value prop)

---

### Feature 5: Personalised Outreach Message Generation
- **What it does:** The enrichment AI also generates a `reason_for_outreach` — a ≤3-sentence personalised cold outreach message per lead, grounded in the lead's actual public profile and the campaign's product context. No generic templates. Each message is explicitly constrained to avoid salesly language.
- **Why it exists:** Cold outreach is only effective if personalised. Writing 1 sentence of genuine personalisation per lead is the biggest bottleneck in any SDR workflow. This eliminates it entirely.
- **Who uses it:** Sales/founder — copy and send the pre-drafted message directly.
- **Frequency:** Generated automatically per enrichment run; visible on lead detail card.
- **Classification:** ✅ MUST-HAVE (differentiating feature)

---

### Feature 6: Lead Scoring + Human Override
- **What it does:** Every lead gets an AI quality tag (`hot/warm/cold`) and `confidence_score` (0–100) from the enrichment model. Users can override the AI classification with a manual category (`hot/warm/cold/disqualified/pending`) and add free-text notes per lead.
- **Why it exists:** AI scoring is directional but not perfect. The human override closes the feedback loop — the sales person marks a lead disqualified or promoted and that human signal stays permanent.
- **Who uses it:** Sales rep / founder.
- **Frequency:** Per lead review session (daily or weekly).
- **Classification:** ✅ MUST-HAVE

---

### Feature 7: Lead Dashboard (Table + Filters)
- **What it does:** Full-featured lead table with:
  - Pagination and server-side sorting
  - Filters: AI quality, manual category, lead source, date range, full-text search
  - Per-lead expandable detail panel: pain points, outreach message, confidence score, source URL, enriched_at timestamp
  - Real-time updates via Socket.io — new leads appear without page refresh
  - Inline category override
  - Direct link to `linkedin_url` and `email` fields
- **Why it exists:** Core operational UI for the sales team to action leads.
- **Who uses it:** All roles (viewer = read-only, member+ = edit/categorize).
- **Frequency:** Daily.
- **Classification:** ✅ MUST-HAVE

---

### Feature 8: CSV Export
- **What it does:** Exports the current filtered lead set to CSV. Respects all active filter parameters (quality, category, source, date range, search) so users can export only the hot leads from a specific campaign in a date range.
- **Why it exists:** Enables leads to flow into any downstream tool: HubSpot, Apollo, Mailchimp, Notion, Airtable — without a native integration.
- **Who uses it:** Founder/sales team.
- **Frequency:** Weekly or per campaign.
- **Classification:** ✅ MUST-HAVE (integration escape hatch until CRM sync is built)

---

### Feature 9: Analytics Dashboard
- **What it does:** Visual metrics across leads:
  - Quality distribution (hot/warm/cold breakdown — pie or bar chart)
  - Source breakdown (which scraper (GitHub/HN/GitLab/Google/Custom) is producing leads)
  - Daily timeline (leads inserted per day — trend chart)
  - Top companies by lead count
  - Average confidence score
  - Duplicate rate (dupe_rate from pipeline log)
- **Why it exists:** Gives the team signal on which config is working — if GitHub is generating 90% of leads but they're all cold, the ICP query pool needs tuning. If confidence is dropping, the Ollama model or product description needs updating.
- **Who uses it:** Owner/admin.
- **Frequency:** Weekly review.
- **Classification:** ✅ MUST-HAVE

---

### Feature 10: Pipeline Status + Manual Trigger
- **What it does:** Real-time pipeline state view:
  - Current run status (`idle / running / failed`)
  - Run history with counts: scraped, dupes skipped, inserted, enriched, errors
  - Ollama health check
  - Today's insert count vs. configured daily lead target
  - Per-campaign manual trigger button (publishes a job to RabbitMQ immediately, bypassing the cron)
- **Why it exists:** Operators need to see if the pipeline is working, debug failures, and force a run when needed without waiting for the next cron window.
- **Who uses it:** Owner/admin.
- **Frequency:** As-needed (debugging, on-demand runs).
- **Classification:** ✅ MUST-HAVE

---

### Feature 11: AI Logs Viewer
- **What it does:** Full inspection of every Ollama API call Drip has made — prompt text, model, response JSON, `duration_ms`, truncation flag, `parsed_ok` boolean. Logs are stored as JSONL in `server/data/ai-events.jsonl`.
- **Why it exists:** LLM calls are a black box. When enrichment quality degrades (pain points are generic, `parsed_ok = false`), you need to see the exact prompt + response to diagnose whether the issue is the prompt, the model, or the input data.
- **Who uses it:** Technical admin / founder debugging enrichment quality.
- **Frequency:** Ad-hoc (when investigating quality drops).
- **Classification:** 🟡 NICE-TO-HAVE for most users; ✅ MUST-HAVE for anyone debugging

---

### Feature 12: Multi-Tenant SaaS Model
- **What it does:** Full tenant isolation. Registration creates a tenant (organization) + owner user + default campaign. Every DB row (leads, campaigns, pipeline_log, settings) is scoped to `tenant_id`. JWT payload carries `{ sub, tenantId, role }`. All queries are tenant-filtered server-side.
- **Why it exists:** Enables the product to serve multiple independent companies from one deployment, making it viable as a SaaS rather than a one-off self-hosted tool.
- **Who uses it:** System-enforced. Transparent to users.
- **Frequency:** Always active.
- **Classification:** ✅ MUST-HAVE for SaaS; can be ignored for pure self-host use

---

### Feature 13: Role-Based Access Control (RBAC)
- **What it does:** 4 roles per tenant:
  - `owner` — full access including delete tenant
  - `admin` — all ops + manage members
  - `member` — view/edit leads, run pipeline, create campaigns
  - `viewer` — read-only across everything
  User invitation flow via invite tokens with expiry. Role change restricted to owner/admin.
- **Why it exists:** Teams share the dashboard. An intern should not be able to delete all leads or change Ollama settings.
- **Who uses it:** Owner managing the team.
- **Frequency:** Rarely (setup, occasional role changes).
- **Classification:** 🟡 NICE-TO-HAVE for solo use; ✅ MUST-HAVE for team tier

---

### Feature 14: Bring-Your-Own-AI (Ollama Config)
- **What it does:** Ollama endpoint and model are configurable per tenant via the Settings page (`ollama_endpoint`, `ollama_model`). Default is `http://localhost:11434` / `mistral`. Any Ollama-compatible model can be swapped in (Llama 3, Mixtral, Phi-3, Qwen2, etc.).
- **Why it exists:** Mistral 7B is good but not best-in-class for every use case. Users running a server with more VRAM should be able to use Mixtral 8x7B. Users who want zero data egress must keep inference local.
- **Who uses it:** Technical admin.
- **Frequency:** Once on setup, rarely changed.
- **Classification:** ✅ MUST-HAVE for self-hosted target market

---

## SECTION 3: TECH ARCHITECTURE

### Frontend Stack

| Layer | Technology |
|---|---|
| Framework | React 18 + Vite |
| Language | JavaScript (JSX) — **no TypeScript** |
| Styling | Tailwind CSS v3 |
| State Management | React Query v5 (server state) + React Context (auth, campaign) |
| Routing | React Router v6 |
| Charts | Recharts |
| Icons | lucide-react |
| Notifications | react-hot-toast |
| Date utilities | date-fns |
| Base Path | `/drip/` — served as sub-path via Nginx |
| Build | Vite + ES modules |

### Backend Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js ESM (`"type": "module"`) |
| Framework | Express |
| Database | SQLite (`better-sqlite3`) by default; PostgreSQL (`pg` driver) via `DB_TYPE=postgres` |
| Queue | RabbitMQ (`amqplib`) — topic exchange `leadgen` |
| Real-time | Socket.io — events: `new_leads`, `leads_enriched` |
| AI / LLM | Ollama HTTP (local inference, default model: `mistral`) |
| Scraping | Axios + Cheerio |
| Auth | JWT HS256 (`jsonwebtoken`) — 12h expiry, `bcryptjs` password hashing |
| Validation | Zod |
| Process manager | PM2 (`ecosystem.config.cjs`) |
| Reverse proxy | Nginx — `/drip/` → Vite static, `/drip-api/` → `localhost:3002` |

### Database Schema

```
tenants
  └── users (tenant_id FK)
  └── invitations (tenant_id FK)
  └── tenant_settings (tenant_id FK) — K/V store: ollama config, ICP defaults
  └── campaigns (tenant_id FK)
        └── leads (campaign_id FK, tenant_id FK)
        └── pipeline_log (campaign_id FK, tenant_id FK)
```

**Key tables:**

| Table | Key Columns |
|---|---|
| `tenants` | id (UUID), name, slug, plan (`free/pro/enterprise`) |
| `users` | id, tenant_id, email, password_hash, name, role |
| `invitations` | id (= token), tenant_id, email, role, expires_at |
| `campaigns` | id, tenant_id, name, product_description, icp_description, scraper_targets (JSON), scraping_interval, daily_lead_target, status |
| `leads` | id, tenant_id, campaign_id, full_name, job_title, company_name, email, email_hash, linkedin_url, pain_points, reason_for_outreach, lead_quality, confidence_score, manual_category, manual_notes, status, source |
| `pipeline_log` | run_id, tenant_id, campaign_id, status, scraped_count, dupes_skipped, inserted_count, enriched_count, error_count |
| `tenant_settings` | tenant_id, key, value |

### Worker Architecture

Two concurrent worker processes managed by PM2:

| Worker | Queue key | Does |
|---|---|---|
| `pipelineWorker.js` | `pipeline.{tenantId}.{campaignId}` | Scrape → dedup → insert leads → emit `new_leads` Socket.io event |
| `enrichWorker.js` | `enrich.{tenantId}.{campaignId}` | Pull unenriched leads → call Ollama → update pain_points / quality / score → emit `leads_enriched` |

The pipeline worker publishes to the enrich queue after each insert batch. Workers run independently — enrichment does not block the scraper.

### API Route Map

| Endpoint | Auth | Role | Purpose |
|---|---|---|---|
| `POST /api/auth/register` | Public | — | Create tenant + owner user + default campaign |
| `POST /api/auth/login` | Public | — | Returns JWT |
| `POST /api/auth/verify` | Public | — | Verify JWT validity |
| `GET /api/leads` | JWT | any | Paginated/filtered leads for tenant+campaign |
| `POST /api/leads/export` | JWT | member+ | CSV export of filtered leads |
| `PUT /api/leads/:id/categorize` | JWT | member+ | Human category + notes override |
| `POST /api/leads/:id/enrich` | JWT | member+ | On-demand enrichment of single lead |
| `GET /api/campaigns` | JWT | any | List campaigns with stats |
| `POST /api/campaigns` | JWT | member+ | Create campaign |
| `PUT /api/campaigns/:id` | JWT | member+ | Update campaign |
| `DELETE /api/campaigns/:id` | JWT | admin+ | Archive/delete campaign |
| `POST /api/campaigns/:id/trigger` | JWT | member+ | Publish to RabbitMQ pipeline queue |
| `GET /api/pipeline/status` | JWT | any | Run state, history, Ollama health, daily target |
| `GET /api/stats` | JWT | any | Quality/source/timeline/company analytics |
| `GET /api/ai-logs` | JWT | any | Full JSONL log of every Ollama call |
| `GET/PUT /api/settings` | JWT | admin+ | Read/write Ollama config |
| `GET /api/users` | JWT | admin+ | List team members |
| `POST /api/users/invite` | JWT | admin+ | Send invite token |
| `PUT /api/users/:id/role` | JWT | admin+ | Change user role |

### Infrastructure

| Component | Detail |
|---|---|
| Deployment | Single Linux VPS — all services on one host |
| Reverse proxy | Nginx — static files at `/drip/`, API at `/drip-api/` |
| Process manager | PM2 — server + pipeline worker + enrich worker as separate processes |
| Containerisation | `deploy.sh` present — Docker optional (not required) |
| CI/CD | None — `deploy.sh` is a manual shell script |
| Database files | `server/data/leads.db` (SQLite) — single file, easy to backup |
| AI inference | Ollama running locally on same host (default: `http://localhost:11434`) |

### Real-Time Components

| Event | Emitter | Payload | Consumer |
|---|---|---|---|
| `new_leads` | Pipeline worker (after insert batch) | `{ count }` | Lead table auto-refresh badge |
| `leads_enriched` | Enrich worker (after enrichment batch) | implicit | Lead table quality badge update |

### Third-Party Integrations

**Live:**
| Integration | Type | Auth |
|---|---|---|
| GitHub API | Lead source (user search) | Optional Bearer token (`GITHUB_TOKEN`) |
| HackerNews Algolia API | Lead source (WHO WANTS TO BE HIRED threads) | None (public) |
| GitLab API | Lead source (public user search) | None (public) |
| Google Custom Search API | Lead source (keyword targeting) | API Key + CX ID |
| Ollama (Mistral / any model) | AI enrichment + scoring | None (local HTTP) |

**Not yet integrated:**
- Email delivery (sending outreach messages — requires Postmark, SendGrid, or Resend)
- CRM sync (HubSpot, Pipedrive, Clay — currently CSV export is the only bridge)
- LinkedIn Sales Navigator API (direct profile data enrichment)
- Apollo.io / Hunter.io (email verification)
- Slack / Discord notifications on hot lead batch

### Current Bottlenecks and Risks

| # | Risk | Severity |
|---|---|---|
| 1 | **JWT stored in `localStorage`** — XSS vulnerability. Should use HttpOnly cookies. | 🔴 Critical (security) |
| 2 | **No JWT refresh** — 12h expiry causes hard session expiry, users must re-login. No silent refresh. | 🔴 High |
| 3 | **SQLite in production** — single file DB is fine for 1 tenant/low volume, but concurrent writes under RabbitMQ workers can cause `SQLITE_BUSY` errors at scale. Must migrate to PostgreSQL for production multi-tenant use. | 🔴 High |
| 4 | **Ollama must be on the same host** — no remote Ollama support in default config. Makes cloud deployment (Render, Railway, Vercel) impossible without config change. | 🟡 Medium |
| 5 | **No email verification** — lead emails are scraped but not validated (typos, dead addresses). Without Hunter.io or Neverbounce check, bounce rate on outreach will be high. | 🟡 Medium |
| 6 | **No rate limiting on GitHub API** — unauthenticated GitHub API calls are capped at 60/hr. At high scraping frequency this will hit 429 errors. `GITHUB_TOKEN` env var is optional but should be required. | 🟡 Medium |
| 7 | **Frontend has no TypeScript** — all client code is plain JSX. Type safety gaps make refactoring risky. | 🟡 Medium |
| 8 | **No pagination state persistence** — navigating away from lead table resets filters and page. | 🟢 Low |
| 9 | **AI log file is unbounded JSONL** — `ai-events.jsonl` will grow indefinitely. No rotation, no max size limit. | 🟢 Low |

---

## SECTION 4: USER FLOW

### Step-by-Step Journey: Signup → First Hot Lead

```
Step 1  REGISTER
        ↓ Name + email + password + company name
        ↓ Creates: tenant + owner user + default campaign
        ↓ JWT returned → stored in localStorage

Step 2  CONFIGURE CAMPAIGN
        ↓ Campaigns page → edit default campaign (or create new)
        ↓ Fill: product_description ("We build X for Y")
        ↓ Fill: icp_description ("We target CTOs at 5-50 person B2B SaaS companies...")
        ↓ Select: scraper_targets (GitHub / HN / GitLab / Google / Custom URL)
        ↓ Set: scraping_interval (30min recommended to start)
        ↓ Set: daily_lead_target (e.g. 20)

Step 3  CONFIGURE OLLAMA  (if not done during deploy)
        ↓ Settings page → Ollama endpoint + model
        ↓ Pipeline Status page → verify Ollama health = ✅

Step 4  RUN PIPELINE (FIRST TIME)
        ↓ Click "Trigger Now" on campaign
        ↓ Pipeline job published to RabbitMQ
        ↓ Scraper runs in background (15–60 sec per source)
        ↓ Socket.io emits `new_leads` → lead count badge appears in UI
        ↓ Enrich worker picks up unenriched leads → Ollama call per lead
        ↓ Socket.io emits `leads_enriched` → quality scores appear

Step 5  REVIEW LEADS
        ↓ Leads page → filter by lead_quality = hot
        ↓ Click lead → read pain_points + reason_for_outreach
        ↓ Mark as hot/warm/disqualified manually if needed
        ↓ Copy outreach message → paste into LinkedIn or email

Step 6  EXPORT / ACT
        ↓ Filter + Export CSV → import to HubSpot/Apollo/Airtable
        ↓ ——— or ——— manually copy messages to outreach tool

Step 7  CONTINUOUS OPERATION
        ↓ Cron runs every N minutes without further input
        ↓ New leads appear in real-time
        ↓ Analytics page tracks pipeline quality over time
```

### Time to First Value
> **Estimated: 20–40 minutes** including Ollama model pull (if not pre-installed) and campaign configuration. First leads appear within minutes of the initial pipeline trigger.

### Retention Hooks
| Hook | Mechanism |
|---|---|
| Real-time Socket.io feed | New leads appear without refresh — makes the dashboard feel alive |
| Daily lead target | Progress bar drives daily check-in ("did we hit 20 today?") |
| Hot lead spike | A batch of hot leads creates urgency to act |
| Pipeline status page | Operational dashboard → daily check habit |

### Drop-Off Points
1. **Ollama setup** — requires local install + model pull; 1–3GB download; highest friction in the entire onboarding
2. **Campaign ICP config** — "product_description" and "icp_description" are textboxes with no guidance; most users write short generic descriptions → poor enrichment quality → poor leads → they blame the product
3. **First scrape returns 0 leads** — if GitHub token is missing and rate limit hits, or scraper_targets misconfigured, first run fails silently
4. **Enrichment quality is bad** — if Ollama model is under-resourced (1–2GB RAM) the output is garbage JSON; no clear error shown to users
5. **No follow-up tooling** — after getting leads, users have no place to go; CSV export is a manual dead-end

---

## SECTION 5: CURRENT TRACTION

> ⚠️ **UNKNOWN.** Zero telemetry, zero analytics instrumentation. No Mixpanel, PostHog, Segment, or GA4 anywhere in the frontend or backend.

| Event | Instrumented? |
|---|---|
| User registered | ❌ |
| Campaign created | ❌ |
| Pipeline triggered | ❌ |
| Lead viewed/categorized | ❌ |
| CSV exported | ❌ |
| Hot lead created | ❌ |

**Minimum viable tracking to install (PostHog or Mixpanel):**
- `tenant_registered`
- `campaign_created`
- `pipeline_triggered`
- `lead_categorized` (with category value)
- `csv_exported`
- `pipeline_run_completed` (with scraped_count, inserted_count, enriched_count)

---

## SECTION 6: PRICING

> ⚠️ **DOES NOT EXIST.** No billing, no payment gateway (no Stripe, no Paddle), no plan gating. The `tenants.plan` column exists in the DB schema (`free/pro/enterprise`) but no logic checks it anywhere.

### Suggested Pricing Model (SaaS self-serve)

| Plan | Price | Limits |
|---|---|---|
| **Free** | $0 | 1 campaign, 100 leads/month, community Ollama |
| **Pro** | $49/mo | 5 campaigns, 1,000 leads/month, bring-your-own Ollama/OpenAI |
| **Team** | $149/mo | Unlimited campaigns, 5,000 leads/month, team seats (admin/member/viewer) |
| **Enterprise** | Custom | Unlimited everything, SLA, custom scraper targets, dedicated support |

---

## SECTION 7: COMPETITION

### Direct Competitors

| Product | Strength | Weakness vs Drip |
|---|---|---|
| **Apollo.io** | Massive contact database, email sequencing, CRM | $99+/mo, stale data, generic AI personalization |
| **Clay** | Powerful enrichment waterfall, highly flexible | Expensive ($149+/mo), requires technical setup, no autonomous scraping |
| **Hunter.io** | Email finding, verification | No lead discovery, no AI enrichment |
| **LinkedIn Sales Navigator** | Highest-quality B2B data | $79+/mo per seat, no automation, no AI |
| **PhantomBuster** | GitHub/LinkedIn automation | No AI enrichment, scraping only |
| **Instantly / Lemlist** | Email sequencing + lead finding | Outreach tool, not a discovery pipeline; data quality limited |
| **Rocketreach** | Contact data enrichment | Database-only, no autonomous scraping |

### Indirect Competitors
- **HubSpot Free CRM** — contact management without discovery
- **ChatGPT + manual research** — users doing this manually
- **Lusha Browser Extension** — contact finding while browsing LinkedIn
- **ZoomInfo** — enterprise contact database ($10k+/yr)

### What Competitors Do Better
- Scale of contact database (Apollo has 275M+ contacts; Drip only finds what it scrapes)
- Email sequencing (Drip has no outreach automation today — CSV export only)
- Email verification (Apollo/Hunter verify emails; Drip does not)
- CRM integrations (Apollo, Clay, Instantly all integrate with HubSpot, Salesforce, Pipedrive)
- Mobile apps
- Customer support and documentation

### What Drip Does Better
- **Zero marginal cost per lead** — once self-hosted, no per-contact fees
- **Privacy-first** — all inference is local (Ollama); no data leaves your server
- **Real intent signals** — GitHub/HackerNews leads are people actively building and publishing; Apollo's database includes inactive contacts
- **Developer-focused ICP** — uniquely good at finding technical founders and engineers
- **Fully autonomous** — no human in the loop required; Apollo requires a human to search and export
- **Open / self-hostable** — unlike every competitor, this can run on-prem

---

## SECTION 8: SCALABILITY READINESS

### Current System Limits

| Constraint | Current State | Limit |
|---|---|---|
| Database | SQLite single file | ~10k leads fine; >50k concurrent writes with workers will hit `SQLITE_BUSY` |
| AI inference | Single Ollama thread | ~3–5 enrichments/minute on Mistral 7B (CPU) |
| GitHub API | 60 req/hr unauthenticated | ~180 leads/hr max with token (5000 req/hr) |
| Socket.io | In-process, single Node instance | Fine up to ~1,000 concurrent connections |
| RabbitMQ | External queue | Scales independently; handles burst job spikes cleanly |

### Known Technical Debt

| # | Issue | Impact |
|---|---|---|
| 1 | JWT in `localStorage` | XSS vulnerability — must fix before any public launch |
| 2 | SQLite in multi-tenant production | Concurrent write failures at scale — migrate to PostgreSQL |
| 3 | No email bounce validation | High bounce rate on outreach will damage sender reputation |
| 4 | Frontend is plain JSX, no TypeScript | Refactoring risk; harder to catch bugs at build time |
| 5 | AI logs JSONL file unbounded | Disk fill risk on busy servers — needs log rotation |
| 6 | Ollama must be local | Blocks cloud-hosted SaaS deployment without architectural change |
| 7 | No error boundaries in React | Unhandled errors render blank screens |
| 8 | `config.json` flat file alongside DB | Duplicate source of truth for settings — should be DB-only |

### Observability and Monitoring

> **None.** No Sentry, no Datadog, no Pino remote transport, no uptime monitoring. Workers can die silently without any alert. Pipeline failures are logged to SQLite but not surfaced unless the user visits the Pipeline Status page.

**Minimum monitoring to add:**
- Sentry (server-side error tracking — free tier covers this)
- PM2's built-in `pm2 monit` for process health
- A simple health check endpoint (`GET /api/health`) that checks DB + Ollama + RabbitMQ connectivity

---

## SECTION 9: CONTENT + BRAND

| Gap | Detail |
|---|---|
| No public landing page | The app lives at `/drip/` — there is no marketing site |
| No SEO | All pages are React client-side; zero search engine discoverability |
| No brand guide | No design token system, color palette document, or typography spec |
| **Product naming** | Repo folder: `lead-gen` · Internal PM2 name: `drip-server` / `drip-client` · API path: `/drip-api/`. "Drip" appears to be the intended product name — commit to it. |

---

## SECTION 10: SALES MOTION

> **None currently.** No CRM, no demo request flow, no pricing page, no waitlist.

### Who Would Buy This
- Technical founders with a developer-tool product needing a steady top-of-funnel without hiring an SDR
- Indie hackers doing B2B SaaS who want founder-led sales at zero cost
- Agencies running outreach for dev-tool clients
- Growth engineers at early-stage B2B SaaS who want custom scraping logic not available in Apollo

### Buying Trigger
- Founder is manually writing 10 cold LinkedIn DMs a day and wants to automate discovery
- Team just moved to Apollo and got shocked by the bill
- Someone who prefers self-hosting and data control over a SaaS subscription

### Sales Cycle
Self-serve, product-led growth (PLG). Install → see leads → pay.

---

## SECTION 11: GOALS

> ⚠️ Cannot be filled without your input.

**Questions requiring your answers:**
1. Is Drip meant to be a standalone SaaS or a component of a larger marketing platform (alongside Lumen)?
2. What is the 3-month target — first paying customer, or feature completion?
3. Is self-hosted the primary distribution model, or are you moving to cloud-hosted SaaS?
4. Do you want to add email outreach sequencing inside Drip, or keep it as discovery-only?

---

## SECTION 12: CONSTRAINTS

| Constraint | Status |
|---|---|
| Team size | Small / solo |
| Backend language | Node.js (ESM) — not all hosting providers support ESM modules natively |
| AI inference cost | $0 (local Ollama) — but requires a server with ≥8GB RAM to run Mistral 7B |
| Cloud deployment | Blocked by local Ollama dependency — requires a VPS with GPU or migration to cloud AI (OpenAI, Groq) |
| Monthly infra cost | ~$20–40/month (small VPS + RabbitMQ) when self-hosted |

---

## FINAL BRUTALLY HONEST ASSESSMENT

---

### Can This Realistically Become a Scalable SaaS?

**Yes — and it has a cleaner path than most lead-gen tools because the core pipeline actually works.**

The scrape → enrich → score loop is genuinely novel. GitHub/HackerNews as a lead source captures active builders — a higher-intent audience than any static contact database. The zero-marginal-cost model (self-hosted Ollama) is a real competitive moat for cost-sensitive founders.

However, the product has a **critical drop-off point: Ollama setup.** Requiring users to run a local LLM server will kill conversion for anyone not technical. The #1 thing that would unlock growth is adding a cloud AI option (Groq, OpenAI, or Anthropic as an alternative to Ollama) so the product can be deployed on Render/Railway/Heroku without any local inference.

After that, **email sequencing** is the most requested feature in any lead-gen tool. Drip currently stops at "here's a lead and a message" — the handoff to outreach is manual. A basic email send flow (via Resend or Postmark) would complete the top-of-funnel → outreach cycle without needing Apollo.

---

### Biggest Risks to Failure

| Risk | Mitigation |
|---|---|
| Ollama setup friction kills onboarding | Add cloud AI option (OpenAI/Groq fallback) |
| Lead quality is poor due to weak ICP config | Add guided ICP wizard with examples and quality score preview |
| No email validation → high bounce rate | Integrate Hunter.io or Neverbounce for free-tier email check |
| SQLite blows up under load | Default to PostgreSQL in production `deploy.sh` |
| No outreach capability → users churn after export | Build basic email send / LinkedIn message copy flow |
| No pricing → no revenue signal | Add Stripe integration to validate willingness to pay |
