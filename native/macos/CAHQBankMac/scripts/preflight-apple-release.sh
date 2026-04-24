#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
NOTARYTOOL_PROFILE="${NOTARYTOOL_PROFILE:-CAH_QBANK_NOTARY}"
PRINT_IDENTITY=0
QUIET=0

usage() {
  cat <<USAGE
Usage: scripts/preflight-apple-release.sh [--print-identity] [--quiet]

Checks the local machine for CAH QBank Apple release prerequisites.

Environment:
  DEVELOPER_ID_APPLICATION  Optional exact Developer ID Application identity.
  NOTARYTOOL_PROFILE        Keychain profile for notarytool. Default: CAH_QBANK_NOTARY.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --print-identity)
      PRINT_IDENTITY=1
      shift
      ;;
    --quiet)
      QUIET=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "ERROR: Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

log() {
  if [[ "$QUIET" -eq 0 && "$PRINT_IDENTITY" -eq 0 ]]; then
    printf '%s\n' "$*"
  fi
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required tool: $1"
}

resolve_developer_id_identity() {
  local configured="${DEVELOPER_ID_APPLICATION:-}"
  local identities
  identities="$(security find-identity -p codesigning -v 2>/dev/null | awk -F '"' '/Developer ID Application:/ { print $2 }')"

  if [[ -n "$configured" ]]; then
    if printf '%s\n' "$identities" | grep -Fxq "$configured"; then
      printf '%s\n' "$configured"
      return 0
    fi
    fail "DEVELOPER_ID_APPLICATION is set but was not found in the login keychain: $configured"
  fi

  local count
  count="$(printf '%s\n' "$identities" | sed '/^$/d' | wc -l | tr -d ' ')"
  case "$count" in
    0)
      fail "No Developer ID Application certificate found. Install one or set DEVELOPER_ID_APPLICATION to the exact identity."
      ;;
    1)
      printf '%s\n' "$identities" | sed '/^$/d'
      ;;
    *)
      printf '%s\n' "$identities" >&2
      fail "Multiple Developer ID Application certificates found. Set DEVELOPER_ID_APPLICATION to the exact identity to use."
      ;;
  esac
}

check_notary_profile() {
  local profile="$1"
  local output
  if output="$(xcrun notarytool history --keychain-profile "$profile" --output-format json 2>&1 >/dev/null)"; then
    return 0
  fi

  fail "Notary profile '$profile' is missing or invalid. Create it with: xcrun notarytool store-credentials '$profile'"
}

require_command xcode-select
require_command xcodebuild
require_command xcodegen
require_command xcrun
require_command security
require_command codesign
require_command hdiutil
require_command ditto

xcode-select -p >/dev/null 2>&1 || fail "Xcode command line tools are not selected."
xcrun notarytool --help >/dev/null 2>&1 || fail "xcrun notarytool is unavailable."

IDENTITY="$(resolve_developer_id_identity)"

if [[ "$PRINT_IDENTITY" -eq 1 ]]; then
  printf '%s\n' "$IDENTITY"
  exit 0
fi

check_notary_profile "$NOTARYTOOL_PROFILE"

log "Apple release preflight passed."
log "Project: $PROJECT_ROOT"
log "Developer ID identity: $IDENTITY"
log "Notary profile: $NOTARYTOOL_PROFILE"
