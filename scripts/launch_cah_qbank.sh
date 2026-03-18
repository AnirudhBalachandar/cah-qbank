#!/usr/bin/env bash

set -euo pipefail

APP_HOST_LOCAL="127.0.0.1"
APP_PORT=3000
START_TIMEOUT_SECONDS=150
DB_TIMEOUT_SECONDS=90
REINDEX=false
SKIP_BROWSER=false
USE_HTTPS=false
DB_RUNTIME_MODE_OVERRIDE=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --reindex)
      REINDEX=true
      shift
      ;;
    --skip-browser)
      SKIP_BROWSER=true
      shift
      ;;
    --https)
      USE_HTTPS=true
      shift
      ;;
    --db-runtime)
      DB_RUNTIME_MODE_OVERRIDE="${2:-}"
      shift 2
      ;;
    --db-runtime=*)
      DB_RUNTIME_MODE_OVERRIDE="${1#*=}"
      shift
      ;;
    *)
      echo "Unknown argument: $1"
      echo "Usage: $0 [--reindex] [--skip-browser] [--https] [--db-runtime brew|docker|auto]"
      exit 1
      ;;
  esac
done

if [[ "$USE_HTTPS" == "true" ]]; then
  APP_SCHEME="https"
  APP_DEV_SCRIPT="dev:https"
else
  APP_SCHEME="http"
  APP_DEV_SCRIPT="dev"
fi
APP_URL="${APP_SCHEME}://${APP_HOST_LOCAL}:${APP_PORT}"
APP_HEALTH_URL="${APP_SCHEME}://${APP_HOST_LOCAL}:${APP_PORT}/api/health"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

BOOTSTRAP_LOG_PREFIX="CAH Bootstrap"
source "$PROJECT_ROOT/scripts/lib/bootstrap_fresh_mac.sh"
DB_RUNTIME_STATE_FILE=".cah-launch-state"
DB_RUNTIME_LOG_PREFIX="CAH Launcher"
source "$PROJECT_ROOT/scripts/lib/db_runtime.sh"

log() { echo "[CAH Launcher] $*"; }
die() { echo "[CAH Launcher] ERROR: $*" >&2; exit 1; }

bootstrap_run_first_time_setup "$PROJECT_ROOT" "${DB_RUNTIME_MODE_OVERRIDE:-${DB_RUNTIME_MODE:-auto}}" || die "Fresh-mac bootstrap failed."
bootstrap_eval_brew_shellenv || true

ensure_workspace_deps() {
  if [[ ! -d node_modules || pnpm-lock.yaml -nt node_modules/.modules.yaml ]]; then
    log "Installing workspace dependencies..."
    pnpm install || die "pnpm install failed."
  fi
  log "Generating Prisma client..."
  pnpm db:generate || die "Prisma client generation failed."
}

warn_if_placeholder_env() {
  local env_file="$1"
  if grep -Eq '^AUTH_SECRET=replace_with_a_long_random_secret$' "$env_file"; then
    log "Warning: AUTH_SECRET in .env is still the example placeholder."
  fi
  if grep -Eq '^OPENAI_API_KEY=$' "$env_file"; then
    log "Warning: OPENAI_API_KEY is empty. Generation/embeddings features will be unavailable."
  fi
}

sync_app_env_file() {
  cp .env app/.env.local
  log "Synced app env file at app/.env.local"
}

app_is_healthy() {
  local curl_args=(-fsS)
  if [[ "$USE_HTTPS" == "true" ]]; then
    curl_args+=(-k)
  fi
  local status
  status="$(curl "${curl_args[@]}" -o /dev/null -w "%{http_code}" "$APP_HEALTH_URL" 2>/dev/null || true)"
  [[ "$status" == "200" ]]
}

wait_for_app() {
  local elapsed=0
  while (( elapsed < START_TIMEOUT_SECONDS )); do
    if app_is_healthy; then
      return 0
    fi
    sleep 1
    elapsed=$(( elapsed + 1 ))
  done
  return 1
}

start_dev_server_in_terminal() {
  local escaped_path
  escaped_path="$(printf "%q" "$PROJECT_ROOT")"
  local script_cmd="cd $escaped_path && pnpm --filter app $APP_DEV_SCRIPT"
  osascript <<OSA >/dev/null
tell application "Terminal"
  activate
  do script "$script_cmd"
end tell
OSA
}

maybe_open_browser() {
  if [[ "$SKIP_BROWSER" == "true" ]]; then
    log "Skipping browser open (--skip-browser)."
    return
  fi
  open "$APP_URL"
}

run_migrations() {
  log "Running migrations..."
  pnpm db:migrate || die "Migration step failed."
}

run_seed() {
  log "Running seed..."
  pnpm db:seed || die "Seed step failed."
}

imported_published_question_count() {
  node -e '
const { PrismaClient } = require("./app/src/lib/generated/prisma");
const prisma = new PrismaClient();
(async () => {
  try {
    const count = await prisma.question.count({ where: { status: "published", createdBy: "import" } });
    process.stdout.write(String(count));
  } finally {
    await prisma.$disconnect();
  }
})();
'
}

has_question_docs() {
  find "$PROJECT_ROOT/content/CAH_qbank" \( -path '*/import_source/questions/*' -o -path '*/CAH Questions and papers/*' \) -type f -name '*.docx' 2>/dev/null | head -n1 | grep -q .
}

run_ingest_if_needed() {
  local import_count
  import_count="$(imported_published_question_count)" || die "Imported question count check failed."

  if [[ "$REINDEX" == "true" ]]; then
    if has_question_docs; then
      log "Forced reindex enabled. Running ingest..."
      pnpm ingest || die "Ingestion failed during forced reindex."
    else
      log "No question DOCX files found. Skipping forced reindex."
    fi
    return
  fi

  if [[ "$import_count" == "0" ]] && has_question_docs; then
    log "No imported questions found. Running initial ingest..."
    pnpm ingest || die "Initial ingestion failed."
  else
    log "Imported question count: $import_count"
  fi
}

ensure_workspace_deps
warn_if_placeholder_env .env
sync_app_env_file
ensure_db_runtime "$DB_TIMEOUT_SECONDS" "${DB_RUNTIME_MODE_OVERRIDE:-${DB_RUNTIME_MODE:-auto}}" || die "Database runtime failed to start."
run_migrations
run_seed
run_ingest_if_needed

if lsof -nP -iTCP:"$APP_PORT" -sTCP:LISTEN >/dev/null 2>&1 && app_is_healthy; then
  log "App already running at $APP_URL"
  maybe_open_browser
  exit 0
fi

log "Starting Next.js development server..."
start_dev_server_in_terminal
wait_for_app || die "Development server did not become healthy at $APP_URL"
log "App ready at $APP_URL"
maybe_open_browser
