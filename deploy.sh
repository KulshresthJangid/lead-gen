#!/usr/bin/env bash
# =============================================================================
# deploy.sh — Build & deploy LeadGen Pro (backend + frontend) to production
#
# Run on the production server after cloning / pulling the repo:
#   cd /root/apps/lead-gen
#   git pull
#   bash deploy.sh
#
# Override defaults via env vars before running:
#   SERVER_PORT=3002 PROD_DOMAIN=https://example.com bash deploy.sh
# =============================================================================
set -euo pipefail

# ── Configuration (override via env) ─────────────────────────────────────────
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="${PROJECT_DIR}/server"
CLIENT_DIR="${PROJECT_DIR}/client"
SERVER_PORT="${SERVER_PORT:-3002}"
PM2_APP_NAME="lead-gen-server"
PROD_DOMAIN="${PROD_DOMAIN:-https://buildwithkulshresth.com}"

# ── Colours ───────────────────────────────────────────────────────────────────
G='\033[0;32m'; Y='\033[1;33m'; R='\033[0;31m'; B='\033[1m'; NC='\033[0m'
log()     { echo -e "${G}▶${NC}  $*"; }
warn()    { echo -e "${Y}⚠${NC}   $*"; }
die()     { echo -e "${R}✖${NC}   $*" >&2; exit 1; }
section() { echo -e "\n${B}── $* ──${NC}"; }

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
# Base path   : /drip/        → Vite embeds this in all asset URLs
# API URL     : /drip-api     → nginx strips prefix, proxies to Express on :3002
# Socket path : /drip-api/socket.io/ → nginx strips prefix, Socket.IO default path lands at /socket.io/
VITE_API_URL=/drip-api \
VITE_SOCKET_URL="" \
VITE_SOCKET_PATH=/drip-api/socket.io/ \
  npx vite build --base /drip/

log "Frontend built → ${CLIENT_DIR}/dist"

# Ensure nginx worker can read the built files (same pattern as other apps on this server)
chmod -R a+rX "${CLIENT_DIR}/dist"
log "Permissions set on ${CLIENT_DIR}/dist"

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
EOF
  warn ".env created — review ALLOWED_ORIGINS if your domain differs"
else
  log ".env already exists at ${ENV_FILE} — skipping (delete to regenerate)"
fi

# ── Step 4: Backend — PM2 start / reload ─────────────────────────────────────
section "Backend — PM2 process management"
if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe "${PM2_APP_NAME}" &>/dev/null; then
    log "Reloading existing PM2 process: ${PM2_APP_NAME}"
    pm2 reload "${PM2_APP_NAME}" --update-env
  else
    log "Starting new PM2 process from ${PROJECT_DIR}/ecosystem.config.cjs"
    pm2 start "${PROJECT_DIR}/ecosystem.config.cjs" --env production
    pm2 save
    log "PM2 startup saved (survives reboots)"
    # Enable PM2 to start on system boot (prints a command to run as root)
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

# ── Step 5: Nginx — managed manually by ops ──────────────────────────────────
section "Nginx — skipped (managed manually)"
log "service.conf is in the repo root — copy it manually when needed:"
log "  cp ${PROJECT_DIR}/service.conf /etc/nginx/sites-available/service.conf"
log "  nginx -t && systemctl reload nginx"

# ── Done ──────────────────────────────────────────────────────────────────────
section "Deployment complete"
echo -e "${G}${B}✔  LeadGen Pro is live!${NC}"
echo ""
echo "  Frontend  →  ${PROD_DOMAIN}/drip/"
echo "  Backend   →  ${PROD_DOMAIN}/drip-api/  (internal port ${SERVER_PORT})"
echo ""
echo "  Useful commands:"
echo "    pm2 logs ${PM2_APP_NAME}       # stream backend logs"
echo "    pm2 monit                       # live process monitor"
echo "    pm2 restart ${PM2_APP_NAME}    # hard restart"

echo ""
