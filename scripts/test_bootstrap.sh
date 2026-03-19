#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_ROOT"

DB_TIMEOUT_SECONDS=90
REINDEX=false

for arg in "$@"; do
  case "$arg" in
    --reindex)
      REINDEX=true
      ;;
    *)
      echo "[CAH Test Bootstrap] Unknown argument: $arg"
      echo "[CAH Test Bootstrap] Usage: $0 [--reindex]"
      exit 1
      ;;
  esac
done

DB_RUNTIME_STATE_FILE=".cah-launch-state"
DB_RUNTIME_LOG_PREFIX="CAH Test Bootstrap"
source "$PROJECT_ROOT/scripts/lib/db_runtime.sh"

log() {
  echo "[CAH Test Bootstrap] $*"
}

die() {
  echo "[CAH Test Bootstrap] ERROR: $*" >&2
  exit 1
}

sync_app_env_file() {
  cp ".env" "$PROJECT_ROOT/app/.env.local"
  log "Synced app env file at app/.env.local"
}

imported_published_question_count() {
  node -e '
const { PrismaClient } = require("./app/src/lib/generated/prisma");
const prisma = new PrismaClient();
(async () => {
  try {
    const count = await prisma.question.count({ where: { status: "published", createdBy: "import" } });
    process.stdout.write(String(count));
  } catch (err) {
    process.stderr.write(String(err && err.message ? err.message : err));
    process.exit(2);
  } finally {
    await prisma.$disconnect();
  }
})();
'
}

resolve_content_root() {
  node -e '
const fs = require("node:fs");
const path = require("node:path");

const envRoot = process.env.CONTENT_ROOT ? path.resolve(process.env.CONTENT_ROOT) : null;
const repoDefault = path.resolve("content/CAH_qbank");
const downloadsFallback = path.resolve(process.env.HOME || "", "Downloads", "CAH qbank");

const candidates = [];
if (envRoot) candidates.push({ source: "env", root: envRoot });
candidates.push({ source: "repo-default", root: repoDefault });
candidates.push({ source: "downloads-fallback", root: downloadsFallback });

const hasQuestionDocs = (root) => fs.existsSync(path.join(root, "import_source", "questions")) || fs.existsSync(path.join(root, "CAH Questions and papers"));
const chosen = candidates.find((candidate) => hasQuestionDocs(candidate.root))
  || (envRoot ? { source: "env", root: envRoot } : { source: "repo-default", root: repoDefault });

process.stdout.write(`${chosen.root}\t${chosen.source}`);
'
}

if [[ ! -f ".env" ]]; then
  [[ -f ".env.example" ]] || die "Missing .env and .env.example"
  cp ".env.example" ".env"
  log "Created .env from .env.example"
fi

set +u
set -a
source ".env"
set +a
set -u

DB_RUNTIME_MODE="${DB_RUNTIME_MODE:-auto}"
case "$DB_RUNTIME_MODE" in
  brew|docker|auto)
    ;;
  *)
    die "Invalid DB_RUNTIME_MODE '$DB_RUNTIME_MODE'. Allowed values: brew, docker, auto."
    ;;
esac
export DB_RUNTIME_MODE
log "DB runtime mode: $DB_RUNTIME_MODE"

sync_app_env_file

if [[ ! -d "node_modules" ]]; then
  pnpm install || die "Dependency installation failed."
fi

if [[ ! -d "app/src/lib/generated/prisma" ]]; then
  pnpm db:generate || die "Prisma client generation failed."
fi

start_db_runtime

DB_TARGET="$(detect_db_host_port "${DATABASE_URL:-}")"
DB_HOST="${DB_TARGET%%:*}"
DB_PORT="${DB_TARGET##*:}"
DB_STRATEGY="$(read_db_strategy_state)"
if [[ -z "$DB_STRATEGY" ]]; then
  DB_STRATEGY="external"
fi

log "Waiting for database at $DB_HOST:$DB_PORT (strategy: $DB_STRATEGY)..."
if ! wait_for_db_port "$DB_HOST" "$DB_PORT" "$DB_TIMEOUT_SECONDS"; then
  if [[ "$DB_STRATEGY" == "external" ]]; then
    die "Database unavailable for tests. Local runtime startup failed. ${DB_RUNTIME_NOTES}"
  fi
  die "Database unavailable for tests at $DB_HOST:$DB_PORT using strategy $DB_STRATEGY. ${DB_RUNTIME_NOTES}"
fi

pnpm db:migrate || die "Migration failed."
pnpm db:seed || die "Seed failed."

count="$(imported_published_question_count)" || die "Imported question count check failed."
resolved_root="$(resolve_content_root)" || die "Could not resolve content root."
IFS=$'\t' read -r content_root content_root_source <<<"$resolved_root"
log "Resolved content root: $content_root ($content_root_source)"

question_dir="$content_root/import_source/questions"
legacy_docx_dir="$content_root/CAH Questions and papers"

if [[ "$REINDEX" == "true" || "${count:-0}" -eq 0 ]]; then
  if [[ -d "$question_dir" || -d "$legacy_docx_dir" ]]; then
    CONTENT_ROOT="$content_root" pnpm ingest || die "Ingestion failed."
  else
    log "Question content directory not found under '$content_root'. Skipping ingest for test bootstrap."
  fi
fi

log "Bootstrap complete."
