#!/usr/bin/env bash

set -uo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Launching CAH QBank from: $PROJECT_DIR"
"$PROJECT_DIR/scripts/launch_cah_qbank.sh" "$@"
EXIT_CODE=$?

echo
if [[ $EXIT_CODE -eq 0 ]]; then
  echo "CAH launcher finished successfully."
else
  echo "CAH launcher failed with exit code: $EXIT_CODE"
fi
echo "Press Enter to close this window."
read -r _

exit "$EXIT_CODE"
