#!/usr/bin/env bash

set -u

DB_RUNTIME_STATE_FILE="${DB_RUNTIME_STATE_FILE:-.cah-launch-state}"
DB_RUNTIME_POSTGRES_CONTAINER_NAME="${DB_RUNTIME_POSTGRES_CONTAINER_NAME:-cah-qbank-postgres}"
DB_RUNTIME_POSTGRES_VOLUME_NAME="${DB_RUNTIME_POSTGRES_VOLUME_NAME:-cah_qbank_postgres_data}"
DB_RUNTIME_BREW_POSTGRES_FORMULA="${DB_RUNTIME_BREW_POSTGRES_FORMULA:-postgresql@17}"
DB_RUNTIME_BREW_PGVECTOR_FORMULA="${DB_RUNTIME_BREW_PGVECTOR_FORMULA:-pgvector}"
DB_RUNTIME_LOG_PREFIX="${DB_RUNTIME_LOG_PREFIX:-DB Runtime}"
DB_RUNTIME_NOTES="${DB_RUNTIME_NOTES:-}"
DB_RUNTIME_MODE="${DB_RUNTIME_MODE:-brew}"

db_runtime_log() {
  echo "[${DB_RUNTIME_LOG_PREFIX}] $*"
}

db_runtime_command_exists() {
  command -v "$1" >/dev/null 2>&1
}

escape_sql_literal() {
  local value="$1"
  value="${value//\'/\'\'}"
  printf "%s" "$value"
}

write_db_strategy_state() {
  local strategy="$1"
  echo "$strategy" >"$DB_RUNTIME_STATE_FILE"
}

read_db_strategy_state() {
  if [[ -f "$DB_RUNTIME_STATE_FILE" ]]; then
    cat "$DB_RUNTIME_STATE_FILE"
    return
  fi
  echo ""
}

detect_db_host_port() {
  local db_url="$1"
  if [[ -z "$db_url" ]]; then
    echo "127.0.0.1:5432"
    return
  fi

  node -e '
const raw = process.argv[1] || "";
try {
  const normalized = raw.startsWith("postgres://") || raw.startsWith("postgresql://")
    ? raw.replace(/^postgres:\/\//, "postgresql://")
    : raw;
  const u = new URL(normalized);
  const host = u.hostname || "127.0.0.1";
  const port = Number(u.port || 5432);
  process.stdout.write(`${host}:${port}`);
} catch {
  process.stdout.write("127.0.0.1:5432");
}
' "$db_url"
}

parse_database_url_parts() {
  local db_url="$1"
  node -e '
const raw = process.argv[1] || "";
const fallback = { user: "postgres", password: "postgres", host: "127.0.0.1", port: "5432", database: "cah_qbank" };
try {
  const normalized = raw.startsWith("postgres://") || raw.startsWith("postgresql://")
    ? raw.replace(/^postgres:\/\//, "postgresql://")
    : raw;
  const u = new URL(normalized);
  const out = {
    user: decodeURIComponent(u.username || fallback.user),
    password: decodeURIComponent(u.password || fallback.password),
    host: u.hostname || fallback.host,
    port: String(Number(u.port || fallback.port)),
    database: (u.pathname || "").replace(/^\/+/, "") || fallback.database,
  };
  process.stdout.write(`${out.user}\t${out.password}\t${out.host}\t${out.port}\t${out.database}`);
} catch {
  process.stdout.write(`${fallback.user}\t${fallback.password}\t${fallback.host}\t${fallback.port}\t${fallback.database}`);
}
' "$db_url"
}

wait_for_db_port() {
  local host="$1"
  local port="$2"
  local timeout_seconds="$3"
  local elapsed=0

  while (( elapsed < timeout_seconds )); do
    if node -e '
const net = require("net");
const host = process.argv[1];
const port = Number(process.argv[2]);
const socket = net.createConnection({ host, port }, () => {
  socket.end();
  process.exit(0);
});
socket.setTimeout(1200);
socket.on("timeout", () => { socket.destroy(); process.exit(1); });
socket.on("error", () => process.exit(1));
' "$host" "$port" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    elapsed=$(( elapsed + 1 ))
  done

  return 1
}

attempt_start_docker_desktop() {
  if ! db_runtime_command_exists open; then
    return 1
  fi

  open -a Docker >/dev/null 2>&1 || return 1

  local waited=0
  while (( waited < 45 )); do
    if docker info >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
    waited=$(( waited + 1 ))
  done

  return 1
}

try_start_docker_runtime() {
  if ! db_runtime_command_exists docker; then
    DB_RUNTIME_NOTES="Docker CLI not found."
    return 1
  fi

  if ! docker info >/dev/null 2>&1; then
    db_runtime_log "Docker daemon unavailable. Attempting Docker Desktop start..."
    if ! attempt_start_docker_desktop; then
      DB_RUNTIME_NOTES="Docker daemon unavailable."
      return 1
    fi
  fi

  if docker compose version >/dev/null 2>&1; then
    db_runtime_log "Trying docker compose plugin postgres startup..."
    if docker compose up -d postgres >/dev/null 2>&1; then
      write_db_strategy_state "compose-plugin"
      return 0
    fi
    db_runtime_log "docker compose plugin startup failed."
  fi

  if db_runtime_command_exists docker-compose && docker-compose version >/dev/null 2>&1; then
    db_runtime_log "Trying legacy docker-compose postgres startup..."
    if docker-compose up -d postgres >/dev/null 2>&1; then
      write_db_strategy_state "compose-legacy"
      return 0
    fi
    db_runtime_log "docker-compose startup failed."
  fi

  db_runtime_log "Trying direct docker postgres container startup..."
  if docker ps -a --format '{{.Names}}' | grep -Fxq "$DB_RUNTIME_POSTGRES_CONTAINER_NAME"; then
    if [[ "$(docker inspect -f '{{.State.Running}}' "$DB_RUNTIME_POSTGRES_CONTAINER_NAME" 2>/dev/null || echo false)" == "true" ]]; then
      write_db_strategy_state "docker-run"
      return 0
    fi
    if docker start "$DB_RUNTIME_POSTGRES_CONTAINER_NAME" >/dev/null 2>&1; then
      write_db_strategy_state "docker-run"
      return 0
    fi
  else
    docker volume create "$DB_RUNTIME_POSTGRES_VOLUME_NAME" >/dev/null 2>&1 || true
    if docker run -d \
      --name "$DB_RUNTIME_POSTGRES_CONTAINER_NAME" \
      -p 5432:5432 \
      -e POSTGRES_USER=postgres \
      -e POSTGRES_PASSWORD=postgres \
      -e POSTGRES_DB=cah_qbank \
      -v "${DB_RUNTIME_POSTGRES_VOLUME_NAME}:/var/lib/postgresql/data" \
      postgres:16-alpine >/dev/null 2>&1; then
      write_db_strategy_state "docker-run"
      return 0
    fi
  fi

  DB_RUNTIME_NOTES="Docker runtime detected but postgres startup failed."
  return 1
}

try_start_brew_postgres() {
  local brew_formula="$DB_RUNTIME_BREW_POSTGRES_FORMULA"
  if ! db_runtime_command_exists brew; then
    DB_RUNTIME_NOTES="${DB_RUNTIME_NOTES} Homebrew not found."
    return 1
  fi

  if ! brew list --versions "$brew_formula" >/dev/null 2>&1; then
    db_runtime_log "Installing Homebrew formula $brew_formula..."
    if ! brew install "$brew_formula"; then
      DB_RUNTIME_NOTES="${DB_RUNTIME_NOTES} brew install $brew_formula failed."
      return 1
    fi
  fi

  if ! ensure_brew_pgvector_files; then
    DB_RUNTIME_NOTES="${DB_RUNTIME_NOTES} pgvector extension setup failed for $brew_formula."
    return 1
  fi

  stop_other_brew_postgres_services "$brew_formula"

  db_runtime_log "Starting Homebrew service $brew_formula..."
  local brew_start_output=""
  if ! brew_start_output="$(brew services start "$brew_formula" 2>&1)"; then
    # brew may return non-zero when service is already started; treat that as success.
    if ! echo "$brew_start_output" | grep -qi "already started"; then
      local service_state
      service_state="$(brew services list 2>/dev/null | awk -v formula="$brew_formula" '$1 == formula {print $2}')"
      if [[ "$service_state" != "started" ]]; then
        DB_RUNTIME_NOTES="${DB_RUNTIME_NOTES} brew services start $brew_formula failed."
        return 1
      fi
    fi
  fi

  local db_url="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/cah_qbank?schema=public}"
  local host_port host port
  host_port="$(detect_db_host_port "$db_url")"
  host="${host_port%:*}"
  port="${host_port##*:}"

  if ! wait_for_db_port "$host" "$port" 30; then
    DB_RUNTIME_NOTES="${DB_RUNTIME_NOTES} Homebrew postgres did not become reachable at ${host}:${port}."
    return 1
  fi

  if ! ensure_brew_database_ready; then
    DB_RUNTIME_NOTES="${DB_RUNTIME_NOTES} Failed to provision local postgres role/database for configured DATABASE_URL."
    return 1
  fi

  write_db_strategy_state "brew-postgres"
  return 0
}

stop_other_brew_postgres_services() {
  local selected_formula="$1"
  local service_name service_status
  while read -r service_name service_status _; do
    [[ -z "${service_name:-}" ]] && continue
    [[ "$service_name" != postgresql@* ]] && continue
    [[ "$service_name" == "$selected_formula" ]] && continue
    if [[ "$service_status" == "started" ]]; then
      db_runtime_log "Stopping conflicting Homebrew service $service_name..."
      brew services stop "$service_name" >/dev/null 2>&1 || true
    fi
  done < <(brew services list 2>/dev/null)
}

ensure_brew_pgvector_files() {
  local brew_formula="$DB_RUNTIME_BREW_POSTGRES_FORMULA"
  local pgvector_formula="$DB_RUNTIME_BREW_PGVECTOR_FORMULA"

  if ! brew list --versions "$pgvector_formula" >/dev/null 2>&1; then
    db_runtime_log "Installing Homebrew formula $pgvector_formula..."
    if ! brew install "$pgvector_formula"; then
      DB_RUNTIME_NOTES="${DB_RUNTIME_NOTES} brew install $pgvector_formula failed."
      return 1
    fi
  fi

  local postgres_prefix pgvector_prefix
  postgres_prefix="$(brew --prefix "$brew_formula" 2>/dev/null || true)"
  pgvector_prefix="$(brew --prefix "$pgvector_formula" 2>/dev/null || true)"
  if [[ -z "$postgres_prefix" || -z "$pgvector_prefix" ]]; then
    DB_RUNTIME_NOTES="${DB_RUNTIME_NOTES} Unable to resolve brew prefixes for $brew_formula/$pgvector_formula."
    return 1
  fi

  local postgres_control vector_control
  postgres_control="$(find "$postgres_prefix/share" -type f -name "plpgsql.control" | head -n 1)"
  vector_control="$(find "$pgvector_prefix/share" -type f -name "vector.control" | head -n 1)"
  if [[ -z "$postgres_control" || -z "$vector_control" ]]; then
    DB_RUNTIME_NOTES="${DB_RUNTIME_NOTES} Missing extension files for postgres or pgvector."
    return 1
  fi

  local postgres_extension_dir vector_extension_dir
  postgres_extension_dir="$(dirname "$postgres_control")"
  vector_extension_dir="$(dirname "$vector_control")"

  ln -sf "$vector_control" "$postgres_extension_dir/vector.control" >/dev/null 2>&1 || {
    DB_RUNTIME_NOTES="${DB_RUNTIME_NOTES} Failed to link vector.control into $postgres_extension_dir."
    return 1
  }

  local sql_file
  while IFS= read -r sql_file; do
    [[ -z "$sql_file" ]] && continue
    ln -sf "$sql_file" "$postgres_extension_dir/$(basename "$sql_file")" >/dev/null 2>&1 || {
      DB_RUNTIME_NOTES="${DB_RUNTIME_NOTES} Failed to link $(basename "$sql_file") into $postgres_extension_dir."
      return 1
    }
  done < <(find "$vector_extension_dir" -maxdepth 1 -type f -name "vector--*.sql" | sort)

  return 0
}

ensure_brew_database_ready() {
  local db_url="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:5432/cah_qbank?schema=public}"
  local parts
  parts="$(parse_database_url_parts "$db_url")"

  local target_user target_password target_host target_port target_db
  IFS=$'\t' read -r target_user target_password target_host target_port target_db <<<"$parts"

  case "$target_host" in
    localhost|127.0.0.1|::1)
      ;;
    *)
      # If DATABASE_URL is explicitly remote, do not mutate local brew postgres.
      return 0
      ;;
  esac

  local brew_prefix psql_bin
  brew_prefix="$(brew --prefix "$DB_RUNTIME_BREW_POSTGRES_FORMULA" 2>/dev/null || true)"
  if [[ -z "$brew_prefix" ]]; then
    DB_RUNTIME_NOTES="${DB_RUNTIME_NOTES} Unable to resolve brew prefix for $DB_RUNTIME_BREW_POSTGRES_FORMULA."
    return 1
  fi

  psql_bin="$brew_prefix/bin/psql"
  if [[ ! -x "$psql_bin" ]]; then
    DB_RUNTIME_NOTES="${DB_RUNTIME_NOTES} psql binary missing at $psql_bin."
    return 1
  fi

  if ! "$psql_bin" -h "$target_host" -p "$target_port" -d postgres -tAc "SELECT 1" >/dev/null 2>&1; then
    DB_RUNTIME_NOTES="${DB_RUNTIME_NOTES} Unable to connect to local brew postgres as current user."
    return 1
  fi

  local escaped_user escaped_password escaped_db
  escaped_user="$(escape_sql_literal "$target_user")"
  escaped_password="$(escape_sql_literal "$target_password")"
  escaped_db="$(escape_sql_literal "$target_db")"

  if ! "$psql_bin" -h "$target_host" -p "$target_port" -d postgres -v ON_ERROR_STOP=1 -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '$escaped_user') THEN EXECUTE 'CREATE ROLE \"$target_user\" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD ''$escaped_password'''; ELSE EXECUTE 'ALTER ROLE \"$target_user\" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD ''$escaped_password'''; END IF; END \$\$;" >/dev/null 2>&1; then
    DB_RUNTIME_NOTES="${DB_RUNTIME_NOTES} Unable to create or update role \"$target_user\"."
    return 1
  fi

  local db_exists
  db_exists="$("$psql_bin" -h "$target_host" -p "$target_port" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$escaped_db'" 2>/dev/null | tr -d '[:space:]')"
  if [[ "$db_exists" != "1" ]]; then
    if ! "$psql_bin" -h "$target_host" -p "$target_port" -d postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE \"$target_db\" OWNER \"$target_user\";" >/dev/null 2>&1; then
      DB_RUNTIME_NOTES="${DB_RUNTIME_NOTES} Unable to create database \"$target_db\"."
      return 1
    fi
  fi

  if ! "$psql_bin" -h "$target_host" -p "$target_port" -d "$target_db" -v ON_ERROR_STOP=1 -c "CREATE EXTENSION IF NOT EXISTS vector;" >/dev/null 2>&1; then
    DB_RUNTIME_NOTES="${DB_RUNTIME_NOTES} Unable to enable vector extension in \"$target_db\"."
    return 1
  fi

  return 0
}

start_db_runtime() {
  DB_RUNTIME_NOTES=""
  local mode="${DB_RUNTIME_MODE:-brew}"

  case "$mode" in
    brew)
      if try_start_brew_postgres; then
        return 0
      fi
      db_runtime_log "Homebrew strategy unavailable/failed. Falling back to external DB."
      ;;
    docker)
      if try_start_docker_runtime; then
        return 0
      fi
      db_runtime_log "Docker strategy unavailable/failed. Trying Homebrew PostgreSQL fallback..."
      if try_start_brew_postgres; then
        return 0
      fi
      ;;
    auto)
      if try_start_docker_runtime; then
        return 0
      fi
      db_runtime_log "Docker strategy unavailable/failed. Trying Homebrew PostgreSQL fallback..."
      if try_start_brew_postgres; then
        return 0
      fi
      ;;
    *)
      db_runtime_log "Unknown DB_RUNTIME_MODE '$mode'. Defaulting to brew."
      if try_start_brew_postgres; then
        return 0
      fi
      db_runtime_log "Homebrew strategy unavailable/failed. Falling back to external DB."
      ;;
  esac

  write_db_strategy_state "external"
  return 0
}

stop_db_runtime_by_state() {
  local strategy="$1"

  case "$strategy" in
    compose-plugin)
      if db_runtime_command_exists docker && docker compose version >/dev/null 2>&1; then
        docker compose stop postgres >/dev/null 2>&1 || true
      fi
      ;;
    compose-legacy)
      if db_runtime_command_exists docker-compose; then
        docker-compose stop postgres >/dev/null 2>&1 || true
      fi
      ;;
    docker-run)
      if db_runtime_command_exists docker; then
        docker stop "$DB_RUNTIME_POSTGRES_CONTAINER_NAME" >/dev/null 2>&1 || true
      fi
      ;;
    brew-postgres)
      if db_runtime_command_exists brew; then
        brew services stop "$DB_RUNTIME_BREW_POSTGRES_FORMULA" >/dev/null 2>&1 || true
      fi
      ;;
    external)
      ;;
    *)
      ;;
  esac
}

stop_db_runtime_fallback_all() {
  if db_runtime_command_exists docker; then
    if docker compose version >/dev/null 2>&1; then
      docker compose stop postgres >/dev/null 2>&1 || true
    fi
    docker stop "$DB_RUNTIME_POSTGRES_CONTAINER_NAME" >/dev/null 2>&1 || true
  fi
  if db_runtime_command_exists docker-compose; then
    docker-compose stop postgres >/dev/null 2>&1 || true
  fi
  if db_runtime_command_exists brew; then
    brew services stop "$DB_RUNTIME_BREW_POSTGRES_FORMULA" >/dev/null 2>&1 || true
    brew services stop postgresql@16 >/dev/null 2>&1 || true
    brew services stop postgresql@17 >/dev/null 2>&1 || true
  fi
}
