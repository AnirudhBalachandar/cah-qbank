#!/usr/bin/env bash
set -euo pipefail

MODE="${1:-run}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="CAHQBankMac"
BUNDLE_ID="com.anirudhbalachandar.CAHQBank"
if [[ -n "${AGENT_NAME:-}" ]]; then
  AGENT_LABEL="$AGENT_NAME"
else
  AGENT_LABEL="$("$ROOT_DIR/scripts/resolve_agent_name.sh")"
fi
APP_PATH="$ROOT_DIR/build/DerivedData/$AGENT_LABEL/Build/Products/Debug/$APP_NAME.app"

run_build() {
  make -C "$ROOT_DIR" build
}

open_app() {
  "$ROOT_DIR/scripts/run_app_macos.sh" --app-path "$APP_PATH"
}

pkill -x "$APP_NAME" >/dev/null 2>&1 || true

case "$MODE" in
  run)
    run_build
    open_app
    ;;
  --debug|debug)
    run_build
    lldb -- "$APP_PATH/Contents/MacOS/$APP_NAME"
    ;;
  --logs|logs)
    run_build
    open_app
    /usr/bin/log stream --info --style compact --predicate "process == \"$APP_NAME\""
    ;;
  --telemetry|telemetry)
    run_build
    open_app
    /usr/bin/log stream --info --style compact --predicate "subsystem == \"$BUNDLE_ID\""
    ;;
  --verify|verify)
    run_build
    open_app
    sleep 1
    pgrep -x "$APP_NAME" >/dev/null
    ;;
  *)
    echo "usage: $0 [run|--debug|--logs|--telemetry|--verify]" >&2
    exit 2
    ;;
esac
