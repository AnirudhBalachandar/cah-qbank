#!/usr/bin/env bash

set -u

BOOTSTRAP_VERSION="2026.03.06.1"

bootstrap_log() {
  local prefix="${BOOTSTRAP_LOG_PREFIX:-CAH Bootstrap}"
  echo "[${prefix}] $*"
}

bootstrap_warn() {
  local prefix="${BOOTSTRAP_LOG_PREFIX:-CAH Bootstrap}"
  echo "[${prefix}] WARN: $*" >&2
}

bootstrap_command_exists() {
  command -v "$1" >/dev/null 2>&1
}

bootstrap_eval_brew_shellenv() {
  if [[ -x "/opt/homebrew/bin/brew" ]]; then
    eval "$(/opt/homebrew/bin/brew shellenv)"
  elif [[ -x "/usr/local/bin/brew" ]]; then
    eval "$(/usr/local/bin/brew shellenv)"
  fi
}

bootstrap_ensure_xcode_clt() {
  if xcode-select -p >/dev/null 2>&1; then
    return 0
  fi

  bootstrap_log "Installing Xcode Command Line Tools (required for fresh setup)..."
  xcode-select --install >/dev/null 2>&1 || true
  bootstrap_log "Finish the Xcode CLT popup install. Waiting for completion..."

  local waited=0
  local timeout=1800
  while (( waited < timeout )); do
    if xcode-select -p >/dev/null 2>&1; then
      bootstrap_log "Xcode Command Line Tools installed."
      return 0
    fi
    sleep 5
    waited=$(( waited + 5 ))
  done

  bootstrap_warn "Timed out waiting for Xcode Command Line Tools."
  return 1
}

bootstrap_ensure_homebrew() {
  if bootstrap_command_exists brew; then
    bootstrap_eval_brew_shellenv
    return 0
  fi

  bootstrap_log "Installing Homebrew..."
  NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  bootstrap_eval_brew_shellenv

  if ! bootstrap_command_exists brew; then
    bootstrap_warn "Homebrew installation did not complete successfully."
    return 1
  fi

  return 0
}

bootstrap_ensure_node_and_pnpm() {
  if ! bootstrap_command_exists node; then
    bootstrap_log "Installing Node.js LTS (node@22)..."
    brew install node@22 || brew install node
  fi

  if [[ -d "$(brew --prefix node@22 2>/dev/null || true)" ]]; then
    export PATH="$(brew --prefix node@22)/bin:$PATH"
  fi

  if ! bootstrap_command_exists node; then
    bootstrap_warn "Node.js is still unavailable after installation."
    return 1
  fi

  if ! bootstrap_command_exists pnpm; then
    bootstrap_log "Installing pnpm..."
    if bootstrap_command_exists corepack; then
      corepack enable
      corepack prepare pnpm@10.28.2 --activate
    elif bootstrap_command_exists npm; then
      npm install -g pnpm@10.28.2
    else
      bootstrap_warn "Neither corepack nor npm is available to install pnpm."
      return 1
    fi
  fi

  if ! bootstrap_command_exists pnpm; then
    bootstrap_warn "pnpm is still unavailable after installation."
    return 1
  fi

  return 0
}

bootstrap_ensure_db_prereqs() {
  local mode="${1:-auto}"

  if [[ "$mode" == "docker" ]]; then
    if bootstrap_command_exists docker; then
      return 0
    fi
    bootstrap_warn "DB mode is docker but docker is not installed."
    return 1
  fi

  local brew_ok=true
  for formula in postgresql@17 pgvector; do
    if ! brew list --versions "$formula" >/dev/null 2>&1; then
      bootstrap_log "Installing DB prerequisite: $formula"
      if ! brew install "$formula"; then
        brew_ok=false
      fi
    fi
  done

  if [[ "$brew_ok" == "true" ]]; then
    return 0
  fi

  if [[ "$mode" == "auto" ]] && bootstrap_command_exists docker; then
    bootstrap_warn "Brew DB prerequisite install failed; docker fallback is available."
    return 0
  fi

  bootstrap_warn "Could not ensure DB prerequisites for mode '$mode'."
  return 1
}

bootstrap_state_file() {
  local project_root="$1"
  echo "${project_root}/.cah-bootstrap-state"
}

bootstrap_is_current() {
  local project_root="$1"
  local state_file
  state_file="$(bootstrap_state_file "$project_root")"

  if [[ ! -f "$state_file" ]]; then
    return 1
  fi

  if ! grep -q "^version=${BOOTSTRAP_VERSION}$" "$state_file"; then
    return 1
  fi

  if ! xcode-select -p >/dev/null 2>&1; then
    return 1
  fi
  if ! bootstrap_command_exists brew; then
    return 1
  fi
  if ! bootstrap_command_exists node; then
    return 1
  fi
  if ! bootstrap_command_exists pnpm; then
    return 1
  fi

  return 0
}

bootstrap_write_state() {
  local project_root="$1"
  local state_file
  state_file="$(bootstrap_state_file "$project_root")"

  cat >"$state_file" <<EOF
version=${BOOTSTRAP_VERSION}
completed_at_utc=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF
}

bootstrap_run_first_time_setup() {
  local project_root="$1"
  local mode="${2:-auto}"

  if [[ "$(uname -s)" != "Darwin" ]]; then
    bootstrap_warn "Fresh-mac bootstrap is designed for macOS only; skipping auto-install."
    return 0
  fi

  if bootstrap_is_current "$project_root"; then
    return 0
  fi

  bootstrap_log "Running first-time bootstrap for this machine..."

  bootstrap_ensure_xcode_clt || return 1
  bootstrap_ensure_homebrew || return 1
  bootstrap_ensure_node_and_pnpm || return 1
  bootstrap_ensure_db_prereqs "$mode" || return 1

  bootstrap_write_state "$project_root"
  bootstrap_log "First-time bootstrap complete."
  return 0
}
