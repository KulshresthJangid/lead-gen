#!/usr/bin/env bash
# =============================================================================
# deploy.sh — Build & deploy LeadGen Pro (backend + frontend) to production
#
# Run on the production server after cloning / pulling the repo:
#   cd /root/apps/lead-gen
#   git pull
#   bash deploy.sh
# =============================================================================
set -euo pipefail

# ── Colours ───────────────────────────────────────────────────────────────────
G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; B='\033[1m'; NC='\033[0m'
log()     { echo -e "${G}▶${NC}  $*"; }
warn()    { echo -e "${Y}⚠${NC}   $*"; }
die()     { echo -e "${R}✖${NC}   $*" >&2; exit 1; }
section() { echo -e "\n${B}── $* ──${NC}"; }

# Helper: prompt with a default value; prints default if stdin is not a tty
ask() {
  local prompt="$1" default="$2" var_name="$3"
  if [ -t 0 ]; then
    read -r -p "  ${prompt} [${default}]: " _input
    printf -v "$var_name" '%s' "${_input:-$default}"
  else
    printf -v "$var_name" '%s' "$default"
  fi
}

# ── Interactive configuration ─────────────────────────────────────────────────
section "Configuration"
echo "  Press Enter to accept the default shown in [brackets]."
echo ""

ask "Production domain (e.g. https://example.com)"   "https://buildwithkulshresth.com"  PROD_DOMAIN
ask "Server port"                                      "3002"                              SERVER_PORT
ask "Vite API URL prefix  (nginx proxy path)"          "/drip-api"                         VITE_API_URL
ask "Vite base path       (frontend asset prefix)"     "/drip/"                            VITE_BASE

# JWT secret — generate a random one if not supplied
echo ""
if [ -t 0 ]; then
  read -r -p "  JWT secret (leave blank to auto-generate): " _jwt_input
  if [ -n "${_jwt_input}" ]; then
    JWT_SECRET="${_jwt_input}"
  else
    JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")"
    log "JWT_SECRET generated (saved to .env)"
  fi
else
  JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")"
fi

echo ""
echo "  ── Owner / migration account (press Enter to skip — uses admin@localhost / admin) ──"
ask "Owner email"    "admin@localhost"       OWNER_EMAIL
ask "Owner name"     "Admin"                 OWNER_NAME
ask "Owner password" "admin"                 OWNER_PASSWORD
ask "Org name"       "Default Organisation"  ORG_NAME

# Warn loudly if still on defaults
if [ "${OWNER_PASSWORD}" = "admin" ]; then
  warn "Using default password 'admin' — change it immediately after first login!"
fi
if [ "${OWNER_EMAIL}" = "admin@localhost" ]; then
  warn "Using default email 'admin@localhost' — set OWNER_EMAIL for a real address."
fi

echo ""

# ── Static config derived above ───────────────────────────────────────────────
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="${PROJECT_DIR}/server"
CLIENT_DIR="${PROJECT_DIR}/client"
PM2_APP_NAME="lead-gen-server"
VITE_SOCKET_PATH="${VITE_API_URL}/socket.io/"

# ── Pre-flight ────────────────────────────────────────────────────────────────
section "Pre-flight checks"

for cmd in node npm; do
  command -v "$cmd" >/dev/null 2>&1 || die "'$cmd' is not installed or not in PATH"
done
log "Node  $(node --version)"
log "npm   $(npm  --version)"

[ -d "${SERVER_DIR}" ] || die "Server directory not found: ${SERVER_DIR}"
[ -d "${CLIENT_DIR}" ] || die "Client directory not found: ${CLIENT_DIR}"

# ── Step 1: Server — install production dependencies ─────────────────────────
section "Server — installing production dependencies"
cd "${SERVER_DIR}"
npm ci --omit=dev
log "Server deps installed (devDependencies excluded)"

# ── Step 2: Client — install & build ─────────────────────────────────────────
section "Client — installing dependencies"
cd "${CLIENT_DIR}"
npm ci
log "Client deps installed"

section "Client — building for production"
VITE_API_URL="${VITE_API_URL}" \
VITE_SOCKET_URL="" \
VITE_SOCKET_PATH="${VITE_SOCKET_PATH}" \
  npx vite build --base "${VITE_BASE}"

log "Frontend built → ${CLIENT_DIR}/dist"

chmod -R a+rX "${CLIENT_DIR}/dist"
chcon -R -t httpd_sys_content_t "${CLIENT_DIR}/dist" 2>/dev/null || true
log "Permissions and SELinux context set on ${CLIENT_DIR}/dist"

# ── Step 3: Server .env ───────────────────────────────────────────────────────
section "Server — environment file"
ENV_FILE="${SERVER_DIR}/.env"
if [ ! -f "${ENV_FILE}" ]; then
  log "Creating ${ENV_FILE}"
  cat > "${ENV_FILE}" <<EOF
NODE_ENV=production
PORT=${SERVER_PORT}
DB_TYPE=sqlite
LOG_LEVEL=info
ALLOWED_ORIGINS=${PROD_DOMAIN}
JWT_SECRET=${JWT_SECRET}
OWNER_EMAIL=${OWNER_EMAIL}
OWNER_NAME=${OWNER_NAME}
OWNER_PASSWORD=${OWNER_PASSWORD}
ORG_NAME=${ORG_NAME}
EOF
  log ".env created"
else
  log ".env already exists at ${ENV_FILE}"
  log "Updating migration-related vars (OWNER_*, ORG_NAME, JWT_SECRET) in place…"
  # Update or append each key
  update_env() {
    local key="$1" val="$2"
    if grep -q "^${key}=" "${ENV_FILE}"; then
      sed -i "s|^${key}=.*|${key}=${val}|" "${ENV_FILE}"
    else
      echo "${key}=${val}" >> "${ENV_FILE}"
    fi
  }
  update_env JWT_SECRET      "${JWT_SECRET}"
  update_env OWNER_EMAIL     "${OWNER_EMAIL}"
  update_env OWNER_NAME      "${OWNER_NAME}"
  update_env OWNER_PASSWORD  "${OWNER_PASSWORD}"
  update_env ORG_NAME        "${ORG_NAME}"
  log ".env updated"
fi

# ── Step 4: Backend — PM2 start / reload ─────────────────────────────────────
section "Backend — PM2 process management"
cd "${PROJECT_DIR}"
if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe "${PM2_APP_NAME}" &>/dev/null; then
    log "Reloading existing PM2 process: ${PM2_APP_NAME}"
    pm2 reload "${PM2_APP_NAME}" --update-env
  else
    log "Starting new PM2 process from ${PROJECT_DIR}/ecosystem.config.cjs"
    pm2 start "${PROJECT_DIR}/ecosystem.config.cjs" --env production
    pm2 save
    log "PM2 startup saved (survives reboots)"
    pm2 startup || true
  fi
  echo ""
  pm2 list
else
  warn "PM2 not installed — install it with: npm install -g pm2"
  warn "Falling back to nohup (not persistent across reboots)"
  LOG_FILE="/var/log/lead-gen-server.log"
  PORT="${SERVER_PORT}" NODE_ENV=production \
    nohup node "${SERVER_DIR}/index.js" >> "${LOG_FILE}" 2>&1 &
  log "Backend started (PID $!) — logs at ${LOG_FILE}"
fi

# ── Step 5: Verify migration ran ─────────────────────────────────────────────
section "Migration verification"
log "Waiting 4 s for server to boot and run migrations…"
sleep 4

# Find the SQLite DB file
DB_FILE="${SERVER_DIR}/leads.db"
if [ ! -f "${DB_FILE}" ]; then
  DB_FILE="${PROJECT_DIR}/leads.db"
fi

if [ -f "${DB_FILE}" ]; then
  log "Found database: ${DB_FILE}"
  DB_FILE="${DB_FILE}" node --input-type=module <<'JSEOF'
import Database from 'better-sqlite3';
const db = new Database(process.env.DB_FILE);
const tenants   = db.prepare('SELECT id, name, slug FROM tenants').all();
const users     = db.prepare('SELECT id, email, role FROM users').all();
const campaigns = db.prepare('SELECT id, name, status FROM campaigns').all();
const leads     = db.prepare('SELECT COUNT(*) as n FROM leads').get();
const assigned  = db.prepare('SELECT COUNT(*) as n FROM leads WHERE tenant_id IS NOT NULL').get();
console.log('');
console.log('  Tenants   :', tenants.length,  '—', tenants.map(t => `${t.name} (${t.slug})`).join(', ') || 'none');
console.log('  Users     :', users.length,    '—', users.map(u => `${u.email} [${u.role}]`).join(', ')  || 'none');
console.log('  Campaigns :', campaigns.length,'—', campaigns.map(c => `${c.name} [${c.status}]`).join(', ') || 'none');
console.log('  Leads     :', leads.n, 'total,', assigned.n, 'assigned to a tenant');
console.log('');
if (tenants.length === 0) {
  console.error('  ✖  No tenants found — migration may not have run yet.');
  console.error('      Check logs:  pm2 logs lead-gen-server --lines 50');
  process.exit(1);
}
if (Number(assigned.n) < Number(leads.n)) {
  console.warn('  ⚠  ' + (leads.n - assigned.n) + ' lead(s) not assigned — check migration logs.');
} else {
  console.log('  ✔  Migration verified — all data assigned!');
}
JSEOF
else
  warn "Database file not found at ${DB_FILE} — skipping migration check."
  warn "If using PostgreSQL, check server logs for [MIGRATION] lines instead."
fi

# ── Step 6: Nginx — managed manually by ops ──────────────────────────────────
section "Nginx — skipped (managed manually)"
log "service.conf is in the repo root — copy it manually when needed:"
log "  cp ${PROJECT_DIR}/service.conf /etc/nginx/sites-available/service.conf"
log "  nginx -t && systemctl reload nginx"

# ── Done ──────────────────────────────────────────────────────────────────────
section "Deployment complete"
echo -e "${G}${B}✔  LeadGen Pro is live!${NC}"
echo ""
echo "  Frontend  →  ${PROD_DOMAIN}${VITE_BASE}"
echo "  Backend   →  ${PROD_DOMAIN}${VITE_API_URL}/  (internal port ${SERVER_PORT})"
echo ""
echo "  Login with:  ${OWNER_EMAIL}  /  (password you set)"
echo ""
echo "  Useful commands:"
echo "    pm2 logs ${PM2_APP_NAME}       # stream backend logs"
echo "    pm2 monit                       # live process monitor"
echo "    pm2 restart ${PM2_APP_NAME}    # hard restart"
echo ""
