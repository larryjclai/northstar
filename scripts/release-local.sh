#!/usr/bin/env bash
#
# Local macOS release — build, sign, and publish a Northstar release WITHOUT
# using GitHub Actions minutes. Produces a universal (arm64 + x86_64) macOS
# build, regenerates the updater `latest.json` pointing at the PUBLIC releases
# repo, and creates/updates the GitHub Release there.
#
# Usage:
#   export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/northstar.key)"
#   export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="…"   # omit if the key has none
#   ./scripts/release-local.sh v0.1.0-alpha.22
#
# Requirements: macOS, Rust + Node toolchain, `gh` authenticated with
# contents:write on the public releases repo (gh auth login, or GH_TOKEN set).
#
# NOTE: this ships macOS only. Windows/Linux artifacts still need the CI
# workflow (or those machines). The in-app updater endpoint is
# .../northstar-releases/releases/latest/download/latest.json, so this script
# marks the release `--latest` and attaches latest.json with public-repo URLs.

set -euo pipefail

TAG="${1:-}"
PUBLIC_REPO="${PUBLIC_REPO:-larryjclai/northstar-releases}"
TARGET="universal-apple-darwin"

if [[ -z "$TAG" ]]; then
  echo "usage: $0 <tag>   e.g. $0 v0.1.0-alpha.22" >&2
  exit 1
fi
if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" ]]; then
  echo "error: TAURI_SIGNING_PRIVATE_KEY is not set — updater .sig files won't be generated." >&2
  echo "       export TAURI_SIGNING_PRIVATE_KEY=\"\$(cat ~/.tauri/northstar.key)\" first." >&2
  exit 1
fi
command -v gh >/dev/null || { echo "error: GitHub CLI (gh) not found." >&2; exit 1; }

VERSION="${TAG#v}"   # updater compares against the bare version (no leading v)
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "▶ Building universal macOS bundle for $TAG …"
npm ci
npm run tauri build -- --target "$TARGET"

BUNDLE="src-tauri/target/${TARGET}/release/bundle"
APP_TARBALL="$(find "$BUNDLE/macos" -name '*.app.tar.gz' | head -1)"
APP_SIG="$(find "$BUNDLE/macos" -name '*.app.tar.gz.sig' | head -1)"
DMG="$(find "$BUNDLE/dmg" -name '*.dmg' | head -1)"

if [[ -z "$APP_TARBALL" || -z "$APP_SIG" ]]; then
  echo "error: updater artifact (.app.tar.gz / .sig) not found under $BUNDLE/macos" >&2
  echo "       check that tauri.conf.json has createUpdaterArtifacts: true and the signing key is valid." >&2
  exit 1
fi

TARBALL_NAME="$(basename "$APP_TARBALL")"
SIGNATURE="$(cat "$APP_SIG")"
ASSET_URL="https://github.com/${PUBLIC_REPO}/releases/download/${TAG}/${TARBALL_NAME}"

echo "▶ Generating latest.json (urls → $PUBLIC_REPO) …"
STAGE="$(mktemp -d)"
cp "$APP_TARBALL" "$APP_SIG" "$STAGE/"
[[ -n "$DMG" ]] && cp "$DMG" "$STAGE/"

VERSION="$VERSION" TAG="$TAG" ASSET_URL="$ASSET_URL" SIGNATURE="$SIGNATURE" \
python3 - "$STAGE/latest.json" <<'PY'
import json, os, sys, datetime
# Universal build → both arch keys point at the same universal tarball, matching
# what tauri-action emits for --target universal-apple-darwin.
entry = {"signature": os.environ["SIGNATURE"], "url": os.environ["ASSET_URL"]}
doc = {
    "version": os.environ["VERSION"],
    "notes": f"Northstar {os.environ['TAG']}",
    "pub_date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "platforms": {"darwin-aarch64": entry, "darwin-x86_64": entry},
}
json.dump(doc, open(sys.argv[1], "w"), ensure_ascii=False, indent=2)
print("  wrote", sys.argv[1])
PY

echo "▶ Publishing release $TAG to $PUBLIC_REPO …"
if gh release view "$TAG" --repo "$PUBLIC_REPO" >/dev/null 2>&1; then
  gh release upload "$TAG" "$STAGE"/* --repo "$PUBLIC_REPO" --clobber
  echo "  updated existing release."
else
  gh release create "$TAG" "$STAGE"/* \
    --repo "$PUBLIC_REPO" \
    --title "Northstar $TAG" \
    --latest \
    --notes "Northstar 桌面版（macOS 本機建置）。macOS 首次開啟若出現「無法驗證開發者」，右鍵點 app → 開啟。"
  echo "  created new release."
fi

rm -rf "$STAGE"
echo "✓ Done. Updater feed: https://github.com/${PUBLIC_REPO}/releases/latest/download/latest.json"
