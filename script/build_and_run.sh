#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="$ROOT_DIR/northstar.xcodeproj"
SCHEME="Northstar macOS"
DERIVED_DATA="${DERIVED_DATA:-/tmp/northstar-derived-run}"
APP_PATH="$DERIVED_DATA/Build/Products/Debug/Northstar macOS.app"

if [[ "${1:-}" == "--build-only" ]]; then
  BUILD_ONLY=1
else
  BUILD_ONLY=0
fi

export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"

/usr/bin/pkill -x "Northstar macOS" 2>/dev/null || true

xcodebuild \
  -project "$PROJECT" \
  -scheme "$SCHEME" \
  -destination "platform=macOS" \
  -derivedDataPath "$DERIVED_DATA" \
  build

if [[ "$BUILD_ONLY" == "0" ]]; then
  /usr/bin/open -n "$APP_PATH"
fi
