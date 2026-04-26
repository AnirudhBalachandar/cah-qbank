#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

MAC_SCHEME="${MAC_SCHEME:-CAHQBankMac}"
MAC_DEVELOPMENT_TEAM="${MAC_DEVELOPMENT_TEAM:-3DELSD6G98}"
PROJECT_PATH="$PROJECT_ROOT/CAHQBankMac.xcodeproj"
ENTITLEMENTS_PATH="$PROJECT_ROOT/Sources/Mac/CAHQBankMac.entitlements"

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
require_command /usr/libexec/PlistBuddy

[[ -d "$PROJECT_PATH" ]] || fail "Missing Xcode project: $PROJECT_PATH. Run xcodegen generate from $PROJECT_ROOT."
[[ -f "$ENTITLEMENTS_PATH" ]] || fail "Missing Mac App Store entitlements: $ENTITLEMENTS_PATH"

if ! xcodebuild -list -project "$PROJECT_PATH" 2>/dev/null | grep -q "^[[:space:]]*$MAC_SCHEME$"; then
  fail "Scheme '$MAC_SCHEME' was not found in $PROJECT_PATH."
fi

BUILD_SETTINGS="$(xcodebuild -project "$PROJECT_PATH" -scheme "$MAC_SCHEME" -configuration Release -destination generic/platform=macOS -showBuildSettings 2>/dev/null)"

TEAM_SETTING="$(printf '%s\n' "$BUILD_SETTINGS" | awk -F'= ' '/^[[:space:]]*DEVELOPMENT_TEAM = / {print $2; exit}')"
BUNDLE_ID="$(printf '%s\n' "$BUILD_SETTINGS" | awk -F'= ' '/^[[:space:]]*PRODUCT_BUNDLE_IDENTIFIER = / {print $2; exit}')"
MARKETING_VERSION="$(printf '%s\n' "$BUILD_SETTINGS" | awk -F'= ' '/^[[:space:]]*MARKETING_VERSION = / {print $2; exit}')"
BUILD_NUMBER="$(printf '%s\n' "$BUILD_SETTINGS" | awk -F'= ' '/^[[:space:]]*CURRENT_PROJECT_VERSION = / {print $2; exit}')"
SIGNING_STYLE="$(printf '%s\n' "$BUILD_SETTINGS" | awk -F'= ' '/^[[:space:]]*CODE_SIGN_STYLE = / {print $2; exit}')"
RESOLVED_ENTITLEMENTS="$(printf '%s\n' "$BUILD_SETTINGS" | awk -F'= ' '/^[[:space:]]*CODE_SIGN_ENTITLEMENTS = / {print $2; exit}')"

[[ "$TEAM_SETTING" == "$MAC_DEVELOPMENT_TEAM" ]] || fail "Expected DEVELOPMENT_TEAM '$MAC_DEVELOPMENT_TEAM' but project resolved '$TEAM_SETTING'."
[[ "$BUNDLE_ID" == "com.anirudhbalachandar.CAHQBank" ]] || fail "Unexpected Mac bundle identifier: $BUNDLE_ID"
[[ -n "$MARKETING_VERSION" ]] || fail "Missing MARKETING_VERSION for $MAC_SCHEME."
[[ -n "$BUILD_NUMBER" ]] || fail "Missing CURRENT_PROJECT_VERSION for $MAC_SCHEME."
[[ "$SIGNING_STYLE" == "Automatic" ]] || fail "Expected automatic signing for $MAC_SCHEME Release, got '$SIGNING_STYLE'."
[[ "$RESOLVED_ENTITLEMENTS" == "Sources/Mac/CAHQBankMac.entitlements" ]] || fail "Unexpected entitlements path: $RESOLVED_ENTITLEMENTS"

SANDBOX_VALUE="$(/usr/libexec/PlistBuddy -c 'Print :com.apple.security.app-sandbox' "$ENTITLEMENTS_PATH" 2>/dev/null || true)"
[[ "$SANDBOX_VALUE" == "true" ]] || fail "Mac App Sandbox entitlement is required for App Store Connect/TestFlight."

if ! security find-identity -p codesigning -v | grep -Eq '"Apple (Development|Distribution):'; then
  fail "No Apple Development or Apple Distribution signing identity was found in the keychain."
fi

log "Mac App Store/TestFlight preflight passed."
log "Project: $PROJECT_ROOT"
log "Scheme: $MAC_SCHEME"
log "Bundle ID: $BUNDLE_ID"
log "Team: $TEAM_SETTING"
log "Version: $MARKETING_VERSION ($BUILD_NUMBER)"
