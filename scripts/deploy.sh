#!/usr/bin/env bash
# pharmax-pricing-index deploy script (bash / WSL / macOS / Linux)
# Idempotent. Safe to re-run. Stops on first failure.
#
# Steps:
#   1. cd into project root (one level above scripts/)
#   2. Ensure node_modules exists (npm install if missing)
#   3. typecheck
#   4. Verify wrangler login
#   5. wrangler deploy
#   6. Extract worker URL and print next-step instructions

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_ROOT}"

# Color helpers. Disabled when not a TTY.
if [ -t 1 ]; then
  C_RED="\033[31m"
  C_GREEN="\033[32m"
  C_YELLOW="\033[33m"
  C_CYAN="\033[36m"
  C_BOLD="\033[1m"
  C_RESET="\033[0m"
else
  C_RED=""
  C_GREEN=""
  C_YELLOW=""
  C_CYAN=""
  C_BOLD=""
  C_RESET=""
fi

log()   { printf "%b[deploy]%b %s\n" "${C_CYAN}" "${C_RESET}" "$*"; }
ok()    { printf "%b[ ok ]%b %s\n"   "${C_GREEN}" "${C_RESET}" "$*"; }
warn()  { printf "%b[warn]%b %s\n"   "${C_YELLOW}" "${C_RESET}" "$*"; }
fail()  { printf "%b[fail]%b %s\n"   "${C_RED}" "${C_RESET}" "$*" 1>&2; }
step()  { printf "\n%b== %s ==%b\n"  "${C_BOLD}" "$*" "${C_RESET}"; }

# ---------- Step 1: prerequisites ----------
step "Step 1 of 6  Prerequisites"

if ! command -v node >/dev/null 2>&1; then
  fail "node not found on PATH. Install Node 20+ and re-run."
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "${NODE_MAJOR}" -lt 20 ]; then
  fail "Node ${NODE_MAJOR} detected. Need Node 20 or higher."
  exit 1
fi
ok "Node $(node -v) detected."

if ! command -v npm >/dev/null 2>&1; then
  fail "npm not found on PATH."
  exit 1
fi
ok "npm $(npm -v) detected."

if ! command -v npx >/dev/null 2>&1; then
  fail "npx not found on PATH."
  exit 1
fi

# ---------- Step 2: install dependencies if missing ----------
step "Step 2 of 6  Dependencies"

if [ -d "node_modules" ] && [ -f "node_modules/.package-lock.json" ]; then
  ok "node_modules already present. Skipping npm install."
else
  log "node_modules missing. Running npm install ..."
  npm install
  ok "npm install complete."
fi

# ---------- Step 3: typecheck ----------
step "Step 3 of 6  Typecheck"
log "Running npm run typecheck ..."
if npm run typecheck; then
  ok "Typecheck passed."
else
  fail "Typecheck failed. Fix TypeScript errors before deploying."
  exit 1
fi

# ---------- Step 4: wrangler auth ----------
step "Step 4 of 6  Cloudflare auth"

# wrangler whoami exits 0 if logged in, non-zero if not.
# We capture output so we can print the account name on success.
set +e
WHOAMI_OUTPUT="$(npx --no-install wrangler whoami 2>&1)"
WHOAMI_STATUS=$?
set -e

if [ "${WHOAMI_STATUS}" -ne 0 ]; then
  fail "Not logged into wrangler."
  echo ""
  echo "Run this in a fresh terminal, then re-run this script:"
  echo ""
  echo "    npx wrangler login"
  echo ""
  echo "wrangler will open a browser tab to authorize your Cloudflare account."
  exit 1
fi

# Extract email if present in output
ACCOUNT_LINE="$(echo "${WHOAMI_OUTPUT}" | grep -i -E '(email|account)' | head -n 2 || true)"
ok "wrangler is authenticated."
if [ -n "${ACCOUNT_LINE}" ]; then
  echo "${ACCOUNT_LINE}"
fi

# ---------- Step 5: deploy ----------
step "Step 5 of 6  Deploy"
log "Running wrangler deploy ..."

DEPLOY_LOG="$(mktemp -t wrangler-deploy.XXXXXX)"
trap 'rm -f "${DEPLOY_LOG}"' EXIT

if npx --no-install wrangler deploy 2>&1 | tee "${DEPLOY_LOG}"; then
  ok "wrangler deploy succeeded."
else
  fail "wrangler deploy failed. See output above."
  exit 1
fi

# Extract the workers.dev URL from output. Wrangler prints lines like:
#   Published pharmax-pricing-index (1.23 sec)
#     https://pharmax-pricing-index.example.workers.dev
WORKER_URL="$(grep -E -o 'https://[a-zA-Z0-9._-]+\.workers\.dev' "${DEPLOY_LOG}" | head -n 1 || true)"

if [ -z "${WORKER_URL}" ]; then
  warn "Could not auto-detect workers.dev URL from output."
  WORKER_URL="https://pharmax-pricing-index.<account>.workers.dev"
fi

# ---------- Step 6: next steps ----------
step "Step 6 of 6  Next steps"

cat <<EOF

${C_BOLD}Deploy complete.${C_RESET}

Worker URL:    ${WORKER_URL}
Target domain: https://mcp.pharmax-ai.com

${C_BOLD}1. Smoke test the workers.dev URL (works immediately):${C_RESET}

    curl ${WORKER_URL}/healthz
    curl ${WORKER_URL}/.well-known/mcp.json

${C_BOLD}2. Attach the custom domain mcp.pharmax-ai.com (one-time, browser step):${C_RESET}

    a) Open https://dash.cloudflare.com
    b) Select the pharmax-ai.com zone.
    c) Workers and Pages, then click pharmax-pricing-index.
    d) Settings, Triggers, Custom Domains, Add Custom Domain.
    e) Enter: mcp.pharmax-ai.com
    f) Cloudflare auto-creates the proxied record. DNS propagation: 1-5 min.

${C_BOLD}3. Uncomment the routes block in wrangler.toml${C_RESET}

    Then re-run: ./scripts/deploy.sh

${C_BOLD}4. Run verification once mcp.pharmax-ai.com resolves:${C_RESET}

    ./scripts/verify.sh

${C_BOLD}5. Submit to the 3 MCP directories:${C_RESET}

    npx tsx scripts/submit-directories.ts

    Submission text lives in DIRECTORIES.md. The script reads from it,
    so any edits there flow through.

    Directories:
      - https://mcp.directory/submit
      - https://smithery.ai/new
      - https://glama.ai/mcp/submit

EOF

ok "Done."
