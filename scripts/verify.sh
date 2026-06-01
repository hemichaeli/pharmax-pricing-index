#!/usr/bin/env bash
# pharmax-pricing-index post-deploy verification (bash / WSL / macOS / Linux)
#
# Tries mcp.pharmax-ai.com first. Falls back to *.workers.dev if custom
# domain not yet wired (or if --workers-dev <url> is passed).
#
# Exit code 0 only if all checks pass.
#
# Usage:
#   ./scripts/verify.sh
#   ./scripts/verify.sh --workers-dev https://pharmax-pricing-index.acct.workers.dev
#   ./scripts/verify.sh --base https://mcp.pharmax-ai.com

set -uo pipefail

PRIMARY_BASE="https://mcp.pharmax-ai.com"
FALLBACK_BASE=""
OVERRIDE_BASE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --base)
      OVERRIDE_BASE="${2:-}"
      shift 2
      ;;
    --workers-dev)
      FALLBACK_BASE="${2:-}"
      shift 2
      ;;
    -h|--help)
      sed -n '2,15p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown arg: $1" 1>&2
      exit 2
      ;;
  esac
done

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

PASS=0
FAIL=0

pass() { printf "%b[PASS]%b %s\n" "${C_GREEN}" "${C_RESET}" "$*"; PASS=$((PASS+1)); }
fail() { printf "%b[FAIL]%b %s\n" "${C_RED}"   "${C_RESET}" "$*"; FAIL=$((FAIL+1)); }
info() { printf "%b[info]%b %s\n" "${C_CYAN}"  "${C_RESET}" "$*"; }
warn() { printf "%b[warn]%b %s\n" "${C_YELLOW}" "${C_RESET}" "$*"; }

if ! command -v curl >/dev/null 2>&1; then
  fail "curl not found on PATH."
  exit 1
fi

# Pick a base URL that actually resolves.
choose_base() {
  if [ -n "${OVERRIDE_BASE}" ]; then
    info "Using override base: ${OVERRIDE_BASE}"
    BASE="${OVERRIDE_BASE}"
    return
  fi

  info "Probing ${PRIMARY_BASE}/healthz ..."
  local code
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 "${PRIMARY_BASE}/healthz" 2>/dev/null) || code="000"
  if [ "${code}" = "200" ]; then
    info "Custom domain is live."
    BASE="${PRIMARY_BASE}"
    return
  fi

  warn "Custom domain not reachable (HTTP ${code}). Falling back to workers.dev."
  if [ -z "${FALLBACK_BASE}" ]; then
    # Best-effort guess. The script accepts --workers-dev for explicit override.
    FALLBACK_BASE="https://pharmax-pricing-index.workers.dev"
    warn "No --workers-dev URL provided. Trying ${FALLBACK_BASE} (this often fails because the subdomain includes your account name)."
  fi

  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 8 "${FALLBACK_BASE}/healthz" 2>/dev/null) || code="000"
  if [ "${code}" = "200" ]; then
    info "workers.dev fallback reachable: ${FALLBACK_BASE}"
    BASE="${FALLBACK_BASE}"
    return
  fi

  fail "Neither ${PRIMARY_BASE} nor ${FALLBACK_BASE} is reachable."
  echo ""
  echo "If you've just deployed, give DNS 1-5 minutes."
  echo "Otherwise pass the correct URL: ./scripts/verify.sh --workers-dev https://pharmax-pricing-index.<account>.workers.dev"
  exit 1
}

choose_base

printf "\n%b== Verifying %s ==%b\n\n" "${C_BOLD}" "${BASE}" "${C_RESET}"

# --- Check 1: /healthz ---
RESP="$(curl -sS --max-time 8 -w "\n__STATUS__%{http_code}" "${BASE}/healthz" || true)"
CODE="$(printf "%s" "${RESP}" | sed -n 's/.*__STATUS__\(.*\)/\1/p')"
BODY="$(printf "%s" "${RESP}" | sed 's/__STATUS__[0-9]*$//')"
if [ "${CODE}" = "200" ] && printf "%s" "${BODY}" | grep -q '"status":"ok"'; then
  pass "GET /healthz returned 200 and status:ok"
else
  fail "GET /healthz: HTTP ${CODE}, body: ${BODY}"
fi

# --- Check 2: /openapi.json ---
RESP="$(curl -sS --max-time 8 -w "\n__STATUS__%{http_code}" "${BASE}/openapi.json" || true)"
CODE="$(printf "%s" "${RESP}" | sed -n 's/.*__STATUS__\(.*\)/\1/p')"
BODY="$(printf "%s" "${RESP}" | sed 's/__STATUS__[0-9]*$//')"
if [ "${CODE}" = "200" ] && printf "%s" "${BODY}" | grep -q '"openapi": *"3\.1\.'; then
  pass "GET /openapi.json returned 200 with OpenAPI 3.1 spec"
else
  fail "GET /openapi.json: HTTP ${CODE} (or missing 'openapi: 3.1.x' field)"
fi

# --- Check 3: POST /mcp initialize ---
INIT_BODY='{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"verify.sh","version":"1.0.0"}}}'
RESP="$(curl -sS --max-time 8 -w "\n__STATUS__%{http_code}" \
  -X POST "${BASE}/mcp" \
  -H "Content-Type: application/json" \
  -d "${INIT_BODY}" || true)"
CODE="$(printf "%s" "${RESP}" | sed -n 's/.*__STATUS__\(.*\)/\1/p')"
BODY="$(printf "%s" "${RESP}" | sed 's/__STATUS__[0-9]*$//')"
if [ "${CODE}" = "200" ] && printf "%s" "${BODY}" | grep -q '"protocolVersion"' && printf "%s" "${BODY}" | grep -q '"capabilities"'; then
  pass "POST /mcp initialize returned protocolVersion + capabilities"
else
  fail "POST /mcp initialize: HTTP ${CODE} (missing protocolVersion or capabilities in body)"
fi

# --- Check 4: SSE headers on /mcp/sse ---
SSE_HEADERS="$(curl -sS --max-time 5 -N -D - -o /dev/null -H 'Accept: text/event-stream' "${BASE}/mcp/sse" 2>&1 | head -n 25 || true)"
SSE_CODE="$(printf "%s" "${SSE_HEADERS}" | head -n 1 | awk '{print $2}')"
if [ "${SSE_CODE}" = "200" ] && printf "%s" "${SSE_HEADERS}" | grep -qi 'content-type:[[:space:]]*text/event-stream'; then
  pass "GET /mcp/sse returned 200 with text/event-stream Content-Type"
else
  fail "GET /mcp/sse: status ${SSE_CODE}, missing text/event-stream content-type"
fi

# --- Check 5: tools/list returns 4 tools ---
TOOLS_BODY='{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
RESP="$(curl -sS --max-time 8 -w "\n__STATUS__%{http_code}" \
  -X POST "${BASE}/mcp" \
  -H "Content-Type: application/json" \
  -d "${TOOLS_BODY}" || true)"
CODE="$(printf "%s" "${RESP}" | sed -n 's/.*__STATUS__\(.*\)/\1/p')"
BODY="$(printf "%s" "${RESP}" | sed 's/__STATUS__[0-9]*$//')"

# Count tool entries by counting "name":"..." inside the tools array. Cheap but works.
TOOL_NAME_COUNT="$(printf "%s" "${BODY}" | grep -oE '"name":[[:space:]]*"[a-z_]+"' | wc -l | tr -d '[:space:]')"
EXPECTED_TOOLS="search_price list_category get_oopi get_disclosure_block"
ALL_PRESENT=1
for t in ${EXPECTED_TOOLS}; do
  if ! printf "%s" "${BODY}" | grep -q "\"${t}\""; then
    ALL_PRESENT=0
    break
  fi
done

if [ "${CODE}" = "200" ] && [ "${TOOL_NAME_COUNT}" -ge 4 ] && [ "${ALL_PRESENT}" -eq 1 ]; then
  pass "POST /mcp tools/list returned 4 expected tools"
else
  fail "POST /mcp tools/list: HTTP ${CODE}, found ${TOOL_NAME_COUNT} name fields, all_present=${ALL_PRESENT}"
fi

# --- Summary ---
TOTAL=$((PASS+FAIL))
printf "\n%b== Summary ==%b\n" "${C_BOLD}" "${C_RESET}"
printf "Base URL:  %s\n" "${BASE}"
printf "Passed:    %s/%s\n" "${PASS}" "${TOTAL}"
printf "Failed:    %s/%s\n" "${FAIL}" "${TOTAL}"

if [ "${FAIL}" -eq 0 ]; then
  printf "%b[OK]%b All checks passed.\n" "${C_GREEN}" "${C_RESET}"
  exit 0
else
  printf "%b[FAIL]%b One or more checks failed.\n" "${C_RED}" "${C_RESET}"
  exit 1
fi
