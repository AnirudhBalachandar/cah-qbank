#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

DB_RUNTIME_STATE_FILE=".cah-launch-state"
DB_RUNTIME_LOG_PREFIX="CAH Stop"
source "$PROJECT_ROOT/scripts/lib/db_runtime.sh"

log() { echo "[CAH Stop] $*"; }

stop_app_processes() {
  if ! command -v lsof >/dev/null 2>&1; then
    log "lsof not available; skipping app process stop."
    return
  fi

  local pids
  pids="$(lsof -ti tcp:3000 || true)"
  if [[ -z "$pids" ]]; then
    log "No process listening on port 3000."
    return
  fi

  for pid in $pids; do
    local cmd
    cmd="$(ps -p "$pid" -o command= || true)"
    if [[ "$cmd" == *"next dev"* || "$cmd" == *"pnpm dev"* || "$cmd" == *"--filter app dev"* || "$cmd" == *"next-server (v"* || "$cmd" == *"next/dist/bin/next"* ]]; then
      log "Stopping app process PID $pid"
      kill "$pid" >/dev/null 2>&1 || true
    else
      log "Skipping PID $pid on port 3000 (not recognized as CAH app server): $cmd"
    fi
  done
}

stop_app_processes
strategy="$(read_db_strategy_state)"
if [[ -n "$strategy" ]]; then
  log "Stopping DB runtime using strategy: $strategy"
  stop_db_runtime_by_state "$strategy"
else
  log "No launch strategy marker found; trying safe postgres stop fallbacks."
  stop_db_runtime_fallback_all
fi

rm -f "$DB_RUNTIME_STATE_FILE"
log "Done."
