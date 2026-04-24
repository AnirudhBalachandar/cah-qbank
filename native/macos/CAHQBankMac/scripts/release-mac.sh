#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_PATH="$PROJECT_ROOT/CAHQBankMac.xcodeproj"
SCHEME="CAHQBankMac"
APP_DISPLAY_NAME="CAH QBank"
NOTARYTOOL_PROFILE="${NOTARYTOOL_PROFILE:-CAH_QBANK_NOTARY}"
RELEASE_ROOT="$PROJECT_ROOT/build/release"
ARCHIVE_PATH="$RELEASE_ROOT/archive/CAHQBankMac.xcarchive"
STAGING_ROOT="$RELEASE_ROOT/staging"
APP_PATH="$RELEASE_ROOT/$APP_DISPLAY_NAME.app"
APP_ZIP="$RELEASE_ROOT/CAH-QBank-app.zip"
NOTARY_ARGS=()

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

info() {
  printf '%s\n' "$*"
}

version_from_app() {
  /usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP_PATH/Contents/Info.plist"
}

build_from_app() {
  /usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$APP_PATH/Contents/Info.plist"
}

write_release_manifest() {
  local manifest_path="$RELEASE_ROOT/release-manifest.txt"
  local bundled_db="$APP_PATH/Contents/Resources/bundled-cah.db"
  local question_counts
  local app_zip_sha
  local dmg_sha

  [[ -f "$bundled_db" ]] || fail "Bundled database missing from staged app: $bundled_db"

  question_counts="$(sqlite3 "$bundled_db" "
    SELECT
      COUNT(*) || ' total, ' ||
      SUM(status = 'published') || ' published, ' ||
      SUM(status = 'published' AND isAnswerable = 1) || ' practice-ready, ' ||
      SUM(status = 'published' AND isAnswerable = 0) || ' browse-only'
    FROM Question;
  ")"
  app_zip_sha="$(shasum -a 256 "$APP_ZIP" | awk '{print $1}')"
  dmg_sha="$(shasum -a 256 "$DMG_PATH" | awk '{print $1}')"

  cat >"$manifest_path" <<EOF
CAH QBank macOS Release
Version: $(version_from_app)
Build: $(build_from_app)
Created: $(date -u +"%Y-%m-%dT%H:%M:%SZ")

App: $APP_PATH
App ZIP: $APP_ZIP
App ZIP SHA-256: $app_zip_sha
DMG: $DMG_PATH
DMG SHA-256: $dmg_sha

Bundled database: $bundled_db
Bundled question counts: $question_counts
EOF

  info "  Manifest: $manifest_path"
}

configure_notary_args() {
  local key_path="${APP_STORE_CONNECT_API_KEY_PATH:-}"
  local key_id="${APP_STORE_CONNECT_KEY_ID:-}"
  local issuer_id="${APP_STORE_CONNECT_ISSUER_ID:-}"

  if [[ -n "$key_path$key_id$issuer_id" ]]; then
    [[ -n "$key_path" ]] || fail "APP_STORE_CONNECT_API_KEY_PATH is required when using App Store Connect API-key notarization."
    [[ -n "$key_id" ]] || fail "APP_STORE_CONNECT_KEY_ID is required when using App Store Connect API-key notarization."
    [[ -n "$issuer_id" ]] || fail "APP_STORE_CONNECT_ISSUER_ID is required when using App Store Connect API-key notarization."
    [[ -f "$key_path" ]] || fail "App Store Connect API key file not found: $key_path"
    NOTARY_ARGS=(--key "$key_path" --key-id "$key_id" --issuer "$issuer_id")
    return 0
  fi

  NOTARY_ARGS=(--keychain-profile "$NOTARYTOOL_PROFILE")
}

"$SCRIPT_DIR/preflight-apple-release.sh" --quiet
DEVELOPER_ID_APPLICATION="$("$SCRIPT_DIR/preflight-apple-release.sh" --print-identity --quiet)"
configure_notary_args

info "Generating Xcode project..."
cd "$PROJECT_ROOT"
xcodegen generate

rm -rf "$RELEASE_ROOT"
mkdir -p "$RELEASE_ROOT/archive" "$STAGING_ROOT"

info "Archiving Release build..."
xcodebuild \
  -project "$PROJECT_PATH" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination 'generic/platform=macOS' \
  -archivePath "$ARCHIVE_PATH" \
  CODE_SIGN_STYLE=Manual \
  CODE_SIGN_IDENTITY="$DEVELOPER_ID_APPLICATION" \
  ENABLE_HARDENED_RUNTIME=YES \
  OTHER_CODE_SIGN_FLAGS=--timestamp \
  archive

ARCHIVED_APP="$ARCHIVE_PATH/Products/Applications/CAHQBankMac.app"
if [[ ! -d "$ARCHIVED_APP" ]]; then
  ARCHIVED_APP="$(find "$ARCHIVE_PATH/Products/Applications" -maxdepth 1 -name '*.app' -print -quit)"
fi
[[ -n "${ARCHIVED_APP:-}" && -d "$ARCHIVED_APP" ]] || fail "Archive did not contain a macOS app bundle."

info "Staging app as $APP_DISPLAY_NAME.app..."
ditto "$ARCHIVED_APP" "$APP_PATH"

info "Signing staged app with Developer ID..."
codesign \
  --force \
  --options runtime \
  --timestamp \
  --sign "$DEVELOPER_ID_APPLICATION" \
  "$APP_PATH"

codesign --verify --strict --verbose=2 "$APP_PATH"
codesign -dvvv --entitlements :- "$APP_PATH" >/dev/null

info "Submitting app for notarization..."
rm -f "$APP_ZIP"
ditto -c -k --keepParent "$APP_PATH" "$APP_ZIP"
xcrun notarytool submit "$APP_ZIP" "${NOTARY_ARGS[@]}" --wait
xcrun stapler staple "$APP_PATH"
xcrun stapler validate "$APP_PATH"
spctl -a -vv "$APP_PATH"

APP_VERSION="$(version_from_app)"
DMG_ROOT="$RELEASE_ROOT/dmg-root"
DMG_PATH="$RELEASE_ROOT/CAH-QBank-$APP_VERSION.dmg"
UNSIGNED_DMG="$RELEASE_ROOT/CAH-QBank-$APP_VERSION.unsigned.dmg"

info "Building DMG..."
rm -rf "$DMG_ROOT" "$DMG_PATH" "$UNSIGNED_DMG"
mkdir -p "$DMG_ROOT"
ditto "$APP_PATH" "$DMG_ROOT/$APP_DISPLAY_NAME.app"
ln -s /Applications "$DMG_ROOT/Applications"
hdiutil create \
  -volname "$APP_DISPLAY_NAME" \
  -srcfolder "$DMG_ROOT" \
  -fs HFS+ \
  -format UDBZ \
  "$UNSIGNED_DMG"
mv "$UNSIGNED_DMG" "$DMG_PATH"

info "Signing and notarizing DMG..."
codesign --force --timestamp --sign "$DEVELOPER_ID_APPLICATION" "$DMG_PATH"
codesign --verify --strict --verbose=2 "$DMG_PATH"
xcrun notarytool submit "$DMG_PATH" "${NOTARY_ARGS[@]}" --wait
xcrun stapler staple "$DMG_PATH"
xcrun stapler validate "$DMG_PATH"
hdiutil verify "$DMG_PATH"
spctl -a -vv -t install "$DMG_PATH"
write_release_manifest

info "Release complete:"
info "  App: $APP_PATH"
info "  DMG: $DMG_PATH"
