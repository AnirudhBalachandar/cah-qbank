#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RELEASE_ROOT="$PROJECT_ROOT/build/mac-appstore-release"
ARCHIVE_PATH="$RELEASE_ROOT/archive/CAHQBankMac.xcarchive"
EXPORT_PATH="$RELEASE_ROOT/export"
EXPORT_OPTIONS="$RELEASE_ROOT/exportOptions.plist"

MAC_SCHEME="${MAC_SCHEME:-CAHQBankMac}"
MAC_DEVELOPMENT_TEAM="${MAC_DEVELOPMENT_TEAM:-3DELSD6G98}"
EXPORT=0
UPLOAD=0
SKIP_ARCHIVE=0

usage() {
  cat <<USAGE
Usage: release-mac-appstore.sh [--export] [--upload] [--skip-archive]

Builds a signed macOS archive for CAH QBank using the App Store Connect/TestFlight
distribution path. With --export, creates a local App Store Connect export without
uploading. With --upload, exports the archive to App Store Connect for internal
TestFlight processing.

Environment:
  MAC_SCHEME             Default: CAHQBankMac
  MAC_DEVELOPMENT_TEAM   Default: 3DELSD6G98
  CONFIRM_MAC_UPLOAD     Must be YES when using --upload
USAGE
}

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

info() {
  printf '%s\n' "$*"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --export)
      EXPORT=1
      shift
      ;;
    --upload)
      UPLOAD=1
      shift
      ;;
    --skip-archive)
      SKIP_ARCHIVE=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      fail "Unknown argument: $1"
      ;;
  esac
done

if [[ "$EXPORT" -eq 1 && "$UPLOAD" -eq 1 ]]; then
  fail "Use either --export or --upload, not both."
fi

if [[ "$UPLOAD" -eq 1 && "${CONFIRM_MAC_UPLOAD:-}" != "YES" ]]; then
  fail "Refusing upload without CONFIRM_MAC_UPLOAD=YES."
fi

info "Generating Xcode project..."
cd "$PROJECT_ROOT"
xcodegen generate

"$SCRIPT_DIR/preflight-mac-appstore-release.sh"

mkdir -p "$RELEASE_ROOT"

if [[ "$SKIP_ARCHIVE" -eq 0 ]]; then
  rm -rf "$ARCHIVE_PATH"
  info "Archiving macOS Release build for App Store Connect..."
  xcodebuild \
    -project "$PROJECT_ROOT/CAHQBankMac.xcodeproj" \
    -scheme "$MAC_SCHEME" \
    -configuration Release \
    -destination generic/platform=macOS \
    -archivePath "$ARCHIVE_PATH" \
    DEVELOPMENT_TEAM="$MAC_DEVELOPMENT_TEAM" \
    CODE_SIGN_STYLE=Automatic \
    -allowProvisioningUpdates \
    archive
fi

[[ -d "$ARCHIVE_PATH" ]] || fail "Archive not found: $ARCHIVE_PATH"
[[ -d "$ARCHIVE_PATH/Products/Applications/CAHQBankMac.app" ]] || fail "Archive did not contain CAHQBankMac.app."

info "Archive ready:"
info "  $ARCHIVE_PATH"

if [[ "$EXPORT" -eq 0 && "$UPLOAD" -eq 0 ]]; then
  info "Export/upload skipped. Re-run with --export for a local package or --upload after confirming App Store Connect/TestFlight upload."
  exit 0
fi

rm -rf "$EXPORT_PATH"
mkdir -p "$EXPORT_PATH"

if [[ "$UPLOAD" -eq 1 ]]; then
  EXPORT_DESTINATION="upload"
else
  EXPORT_DESTINATION="export"
fi

cat > "$EXPORT_OPTIONS" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>destination</key>
  <string>$EXPORT_DESTINATION</string>
  <key>method</key>
  <string>app-store-connect</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>teamID</key>
  <string>$MAC_DEVELOPMENT_TEAM</string>
  <key>manageAppVersionAndBuildNumber</key>
  <false/>
  <key>testFlightInternalTestingOnly</key>
  <true/>
  <key>uploadSymbols</key>
  <true/>
</dict>
</plist>
PLIST

if [[ "$UPLOAD" -eq 1 ]]; then
  info "Uploading macOS archive to App Store Connect for internal TestFlight..."
else
  info "Exporting App Store Connect macOS package locally..."
fi

xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE_PATH" \
  -exportPath "$EXPORT_PATH" \
  -exportOptionsPlist "$EXPORT_OPTIONS" \
  -allowProvisioningUpdates

if [[ "$UPLOAD" -eq 1 ]]; then
  info "Upload command completed."
else
  info "Local export completed:"
  info "  $EXPORT_PATH"
fi
