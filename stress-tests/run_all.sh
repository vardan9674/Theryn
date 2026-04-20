#!/bin/bash
# ╔══════════════════════════════════════════════════════════════╗
# ║         Theryn Stress Test Suite — Master Runner            ║
# ╚══════════════════════════════════════════════════════════════╝
#
# Usage:  bash stress-tests/run_all.sh
#         (from the project root: /Users/vardanchennupati/Downloads/GYM App/theryn)
#
# Exit codes:
#   0 — all tests passed
#   1 — at least one test warned
#   2 — at least one test failed

set -euo pipefail

# ─── Colour helpers ──────────────────────────────────────────────────────────
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

# ─── Banner ──────────────────────────────────────────────────────────────────
TS="$(date '+%Y-%m-%d %H:%M:%S')"
echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║          THERYN STRESS TEST SUITE — MASTER RUNNER       ║"
printf "║  %-56s║\n" "$TS"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ─── Preflight: node ─────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo -e "${RED}ERROR: 'node' is not installed or not in PATH.${RESET}"
  echo ""
  echo "  Install Node.js 22+ from https://nodejs.org"
  echo "  or via nvm:  nvm install 22 && nvm use 22"
  exit 2
fi

NODE_VERSION="$(node --version)"
echo -e "  Node version   : ${CYAN}${NODE_VERSION}${RESET}"

# ─── Preflight: correct directory ────────────────────────────────────────────
if [[ ! -f "package.json" ]]; then
  echo -e "${RED}ERROR: package.json not found.${RESET}"
  echo "  Run this script from the project root:"
  echo "    cd \"/Users/vardanchennupati/Downloads/GYM App/theryn\""
  echo "    bash stress-tests/run_all.sh"
  exit 2
fi

PKG_NAME="$(node -e "try{process.stdout.write(JSON.parse(require('fs').readFileSync('package.json','utf8')).name||'')}catch(e){}")"
if [[ "$PKG_NAME" != "theryn" ]]; then
  echo -e "${YELLOW}WARN: package.json name is '${PKG_NAME}', expected 'theryn'.${RESET}"
  echo "  Continuing anyway — are you in the right directory?"
fi

echo -e "  Project        : ${CYAN}${PKG_NAME}${RESET}"
echo -e "  Working dir    : ${CYAN}$(pwd)${RESET}"
echo ""

# ─── Test registry ───────────────────────────────────────────────────────────
# Format: "script_path|display_name|browser_only"
TESTS=(
  "stress-tests/01_api_load.js|01_api_load|node"
  "stress-tests/02_concurrent_users.js|02_concurrent_users|node"
  "stress-tests/03_workflow_test.js|03_workflow_test|node"
  "stress-tests/04_data_volume.js|04_data_volume|node"
  "stress-tests/05_frontend_perf.html|05_frontend_perf|browser"
  "stress-tests/06_design_edges.js|06_design_edges|node"
  "stress-tests/07_realtime_stress.js|07_realtime_stress|node"
)

# ─── Result tracking ─────────────────────────────────────────────────────────
declare -A RESULT_STATUS   # PASS | WARN | FAIL | SKIP | MISSING
declare -A RESULT_DETAIL   # human-readable detail line
SUITE_START="$(date +%s%3N)"   # milliseconds

# ─── Run each test ───────────────────────────────────────────────────────────
for entry in "${TESTS[@]}"; do
  IFS='|' read -r SCRIPT NAME TYPE <<< "$entry"

  echo "──────────────────────────────────────────────────────────"
  echo -e "  ${BOLD}Running: ${NAME}${RESET}"

  # Browser-only test — skip automatically
  if [[ "$TYPE" == "browser" ]]; then
    echo -e "  ${CYAN}SKIP${RESET} — browser-only test (open manually in browser)"
    RESULT_STATUS["$NAME"]="SKIP"
    RESULT_DETAIL["$NAME"]="open in browser"
    echo ""
    continue
  fi

  # Missing script
  if [[ ! -f "$SCRIPT" ]]; then
    echo -e "  ${YELLOW}MISSING${RESET} — ${SCRIPT} not found, skipping"
    RESULT_STATUS["$NAME"]="MISSING"
    RESULT_DETAIL["$NAME"]="file not found"
    echo ""
    continue
  fi

  T_START="$(date +%s%3N)"
  set +e
  node "$SCRIPT"
  EXIT_CODE=$?
  set -e
  T_END="$(date +%s%3N)"
  ELAPSED=$(( T_END - T_START ))

  case $EXIT_CODE in
    0)
      echo -e "  ${GREEN}PASS${RESET} (exit 0) — ${ELAPSED}ms"
      RESULT_STATUS["$NAME"]="PASS"
      RESULT_DETAIL["$NAME"]="${ELAPSED}ms"
      ;;
    1)
      echo -e "  ${YELLOW}WARN${RESET} (exit 1) — ${ELAPSED}ms"
      RESULT_STATUS["$NAME"]="WARN"
      RESULT_DETAIL["$NAME"]="${ELAPSED}ms — warnings"
      ;;
    *)
      echo -e "  ${RED}FAIL${RESET} (exit ${EXIT_CODE}) — ${ELAPSED}ms"
      RESULT_STATUS["$NAME"]="FAIL"
      RESULT_DETAIL["$NAME"]="${ELAPSED}ms — exit ${EXIT_CODE}"
      ;;
  esac
  echo ""
done

# ─── Final summary table ─────────────────────────────────────────────────────
SUITE_END="$(date +%s%3N)"
SUITE_ELAPSED=$(( SUITE_END - SUITE_START ))

PASS_COUNT=0
WARN_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║              THERYN STRESS TEST RESULTS                  ║"
echo "╠══════════════════════════════════════════════════════════╣"

for entry in "${TESTS[@]}"; do
  IFS='|' read -r _ NAME TYPE <<< "$entry"
  STATUS="${RESULT_STATUS[$NAME]:-MISSING}"
  DETAIL="${RESULT_DETAIL[$NAME]:-}"

  case "$STATUS" in
    PASS)
      ICON="✅ PASS"
      (( PASS_COUNT++ )) || true
      ;;
    WARN)
      ICON="⚠️  WARN"
      (( WARN_COUNT++ )) || true
      ;;
    FAIL)
      ICON="❌ FAIL"
      (( FAIL_COUNT++ )) || true
      ;;
    SKIP)
      ICON="🔵 SKIP"
      (( SKIP_COUNT++ )) || true
      ;;
    MISSING)
      ICON="❓ MISS"
      (( FAIL_COUNT++ )) || true
      ;;
  esac

  # Build row — truncate detail if too long
  DETAIL_TRUNC="${DETAIL:0:20}"
  ROW="$(printf "  %-22s %-8s (%s)" "$NAME" "$ICON" "$DETAIL_TRUNC")"
  printf "║ %-56s ║\n" "$ROW"
done

echo "╠══════════════════════════════════════════════════════════╣"

NODE_COUNT=$(( PASS_COUNT + WARN_COUNT + FAIL_COUNT ))
TOTAL_TESTS=${#TESTS[@]}

if (( FAIL_COUNT > 0 )); then
  OVERALL_STATUS="❌ ${PASS_COUNT}/${TOTAL_TESTS} PASS — review failures before release"
  OVERALL_EXIT=2
elif (( WARN_COUNT > 0 )); then
  OVERALL_STATUS="⚠️  ${PASS_COUNT}/${TOTAL_TESTS} PASS — warnings need attention"
  OVERALL_EXIT=1
else
  OVERALL_STATUS="✅ ${PASS_COUNT}/${TOTAL_TESTS} PASS — App ready for production"
  OVERALL_EXIT=0
fi

printf "║  %-56s║\n" "$OVERALL_STATUS"
printf "║  Suite duration: %-39s║\n" "${SUITE_ELAPSED}ms"
echo "╚══════════════════════════════════════════════════════════╝"

echo ""
echo "──────────────────────────────────────────────────────────"
echo "  Browser test (manual step required):"
echo ""
echo "  📋 Open stress-tests/05_frontend_perf.html in your browser"
echo "     for frontend performance tests."
echo ""
echo "  macOS:  open stress-tests/05_frontend_perf.html"
echo "  Linux:  xdg-open stress-tests/05_frontend_perf.html"
echo "──────────────────────────────────────────────────────────"
echo ""

exit $OVERALL_EXIT
