#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
RELEASE_ROOT="$PROJECT_ROOT/build/ios-release"
ARCHIVE_PATH="$RELEASE_ROOT/archive/CAHQBankiOS.xcarchive"
EXPORT_PATH="$RELEASE_ROOT/export"
EXPORT_OPTIONS="$RELEASE_ROOT/exportOptions.plist"

IOS_SCHEME="${IOS_SCHEME:-CAHQBankiOS}"
IOS_DEVELOPMENT_TEAM="${IOS_DEVELOPMENT_TEAM:-3DELSD6G98}"
EXPORT=0
UPLOAD=0
SKIP_ARCHIVE=0

usage() {
  cat <<USAGE
Usage: release-ios.sh [--export] [--upload] [--skip-archive]

Builds a signed iOS archive for CAH QBank. With --export, creates a local
App Store Connect IPA export without uploading. With --upload, exports the
archive to App Store Connect for internal TestFlight processing.

Environment:
  IOS_SCHEME             Default: CAHQBankiOS
  IOS_DEVELOPMENT_TEAM   Default: 3DELSD6G98
  CONFIRM_IOS_UPLOAD     Must be YES when using --upload
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

if [[ "$UPLOAD" -eq 1 && "${CONFIRM_IOS_UPLOAD:-}" != "YES" ]]; then
  fail "Refusing upload without CONFIRM_IOS_UPLOAD=YES."
fi

"$SCRIPT_DIR/preflight-ios-release.sh"

info "Generating Xcode project..."
cd "$PROJECT_ROOT"
xcodegen generate

mkdir -p "$RELEASE_ROOT"

if [[ "$SKIP_ARCHIVE" -eq 0 ]]; then
  rm -rf "$ARCHIVE_PATH"
  info "Archiving iOS Release build..."
  xcodebuild \
    -project "$PROJECT_ROOT/CAHQBankMac.xcodeproj" \
    -scheme "$IOS_SCHEME" \
    -configuration Release \
    -destination generic/platform=iOS \
    -archivePath "$ARCHIVE_PATH" \
    DEVELOPMENT_TEAM="$IOS_DEVELOPMENT_TEAM" \
    CODE_SIGN_STYLE=Automatic \
    -allowProvisioningUpdates \
    archive
fi

[[ -d "$ARCHIVE_PATH" ]] || fail "Archive not found: $ARCHIVE_PATH"
[[ -d "$ARCHIVE_PATH/Products/Applications/CAHQBankiOS.app" ]] || fail "Archive did not contain CAHQBankiOS.app."

info "Archive ready:"
info "  $ARCHIVE_PATH"

if [[ "$EXPORT" -eq 0 && "$UPLOAD" -eq 0 ]]; then
  info "Export/upload skipped. Re-run with --export for a local IPA or --upload after confirming App Store Connect/TestFlight upload."
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
  <string>$IOS_DEVELOPMENT_TEAM</string>
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
  info "Uploading archive to App Store Connect for internal TestFlight..."
else
  info "Exporting App Store Connect IPA locally..."
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
