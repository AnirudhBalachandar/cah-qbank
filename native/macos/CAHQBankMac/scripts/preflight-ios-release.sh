#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

IOS_SCHEME="${IOS_SCHEME:-CAHQBankiOS}"
IOS_DEVELOPMENT_TEAM="${IOS_DEVELOPMENT_TEAM:-3DELSD6G98}"
PROJECT_PATH="$PROJECT_ROOT/CAHQBankMac.xcodeproj"

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

log() {
  printf '%s\n' "$*"
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

require_command xcodebuild
require_command xcodegen
require_command security

[[ -d "$PROJECT_PATH" ]] || fail "Missing Xcode project: $PROJECT_PATH. Run xcodegen generate from $PROJECT_ROOT."

if ! xcodebuild -list -project "$PROJECT_PATH" 2>/dev/null | grep -q "^[[:space:]]*$IOS_SCHEME$"; then
  fail "Scheme '$IOS_SCHEME' was not found in $PROJECT_PATH."
fi

BUILD_SETTINGS="$(xcodebuild -project "$PROJECT_PATH" -scheme "$IOS_SCHEME" -configuration Release -destination generic/platform=iOS -showBuildSettings 2>/dev/null)"

TEAM_SETTING="$(printf '%s\n' "$BUILD_SETTINGS" | awk -F'= ' '/^[[:space:]]*DEVELOPMENT_TEAM = / {print $2; exit}')"
BUNDLE_ID="$(printf '%s\n' "$BUILD_SETTINGS" | awk -F'= ' '/^[[:space:]]*PRODUCT_BUNDLE_IDENTIFIER = / {print $2; exit}')"
MARKETING_VERSION="$(printf '%s\n' "$BUILD_SETTINGS" | awk -F'= ' '/^[[:space:]]*MARKETING_VERSION = / {print $2; exit}')"
BUILD_NUMBER="$(printf '%s\n' "$BUILD_SETTINGS" | awk -F'= ' '/^[[:space:]]*CURRENT_PROJECT_VERSION = / {print $2; exit}')"

[[ "$TEAM_SETTING" == "$IOS_DEVELOPMENT_TEAM" ]] || fail "Expected DEVELOPMENT_TEAM '$IOS_DEVELOPMENT_TEAM' but project resolved '$TEAM_SETTING'."
[[ "$BUNDLE_ID" == "com.anirudhbalachandar.CAHQBank.iOS" ]] || fail "Unexpected iOS bundle identifier: $BUNDLE_ID"
[[ -n "$MARKETING_VERSION" ]] || fail "Missing MARKETING_VERSION for $IOS_SCHEME."
[[ -n "$BUILD_NUMBER" ]] || fail "Missing CURRENT_PROJECT_VERSION for $IOS_SCHEME."

if ! security find-identity -p codesigning -v | grep -Eq '"Apple (Development|Distribution):'; then
  fail "No Apple Development or Apple Distribution signing identity was found in the keychain."
fi

log "iOS release preflight passed."
log "Project: $PROJECT_ROOT"
log "Scheme: $IOS_SCHEME"
log "Bundle ID: $BUNDLE_ID"
log "Team: $TEAM_SETTING"
log "Version: $MARKETING_VERSION ($BUILD_NUMBER)"
