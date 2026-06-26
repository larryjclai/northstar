#!/usr/bin/env bash
#
# Primary release path: local macOS release. Builds, signs, and publishes a
# Northstar release WITHOUT using GitHub Actions minutes. Produces a universal
# (arm64 + x86_64) macOS build, regenerates the updater `latest.json` pointing
# at the PUBLIC releases repo, and creates/updates the GitHub Release there.
#
# Usage:
#   export TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.tauri/northstar.key)"
#   export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="…"   # omit if the key has none
#   export VITE_NORTHSTAR_SYNC_WORKER_URL="https://northstar-sync.example.com"
#   ./scripts/release-local.sh v0.1.0-alpha.22
#
# Requirements: macOS, Rust + Node toolchain, `gh` authenticated with
# contents:write on the public releases repo (gh auth login, or GH_TOKEN set).
#
# NOTE: this ships macOS only. Windows/Linux artifacts still need the manual CI
# workflow (or those machines). The in-app updater endpoint is
# .../northstar-releases/releases/latest/download/latest.json, so this script
# marks the release `--latest` and attaches latest.json with public-repo URLs.
# Private release assets can be placed in private-assets/bank/ (or set
# NORTHSTAR_PRIVATE_ASSETS_DIR) before running this script; npm run build will
# inject them into public/bank/ for packaging.

set -euo pipefail

# Load local secrets (signing key + password, optional GH token) from .env so
# builds never prompt interactively. .env is gitignored — keep secrets there,
# never in tracked files. See .env.example for the expected keys.
ENV_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.env"
if [[ -f "$ENV_FILE" ]]; then
  set -a            # export everything sourced
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  echo "▶ Loaded secrets from .env"
fi

# Resolve the signing key from its file if not provided inline. The secret key
# stays in ~/.tauri/northstar.key (or $TAURI_SIGNING_KEY_PATH); .env only needs
# the PASSWORD, never a copy of the key itself.
KEY_PATH="${TAURI_SIGNING_KEY_PATH:-$HOME/.tauri/northstar.key}"
if [[ -z "${TAURI_SIGNING_PRIVATE_KEY:-}" && -f "$KEY_PATH" ]]; then
  export TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY_PATH")"
  echo "▶ Loaded signing key from $KEY_PATH"
fi

TAG="${1:-}"
# Source repo is public now, so releases live on the main repo itself.
# (Was larryjclai/northstar-releases while the source was private.)
# TRANSITION: for the first release after the move, ALSO mirror to the old feed
# so existing installs (which have the old endpoint baked in) auto-update onto a
# new-endpoint build:  LEGACY_MIRROR_REPO=larryjclai/northstar-releases ./scripts/release-local.sh vX
PUBLIC_REPO="${PUBLIC_REPO:-larryjclai/northstar}"
LEGACY_MIRROR_REPO="${LEGACY_MIRROR_REPO:-}"
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
# Force a clean bundle each release so Info.plist always reflects the current
# version (Tauri's bundler can reuse stale .app artifacts from prior builds).
(cd src-tauri && cargo clean --release 2>/dev/null || true)
npm ci
npm run tauri build -- --target "$TARGET"

BUNDLE="src-tauri/target/${TARGET}/release/bundle"
APP_TARBALL="$(find "$BUNDLE/macos" -name '*.app.tar.gz' | head -1)"
APP_SIG="$(find "$BUNDLE/macos" -name '*.app.tar.gz.sig' | head -1)"
DMG="$(find "$BUNDLE/dmg" -name '*.dmg' | head -1)"

if [[ -z "$APP_TARBALL" || -z "$APP_SIG" ]]; then
  echo "error: updater artifact (.app.tar.gz / .sig) not found under $BUNDLE/macos" >&2
  echo "       check that tauri.conf.json has createUpdaterArtifacts: true and the signing key is valid." >&2
  echo "       bundle directory contents:" >&2
  find "$BUNDLE" -type f 2>/dev/null | sort >&2
  exit 1
fi

if [[ -z "$DMG" ]]; then
  echo "error: DMG not found under $BUNDLE/dmg — installer will be missing from release." >&2
  echo "       check that tauri.conf.json bundle.targets includes 'dmg'." >&2
  echo "       bundle directory contents:" >&2
  find "$BUNDLE" -type f 2>/dev/null | sort >&2
  exit 1
fi

TARBALL_NAME="$(basename "$APP_TARBALL")"
SIGNATURE="$(cat "$APP_SIG")"
ASSET_URL="https://github.com/${PUBLIC_REPO}/releases/download/${TAG}/${TARBALL_NAME}"

echo "▶ Generating latest.json (urls → $PUBLIC_REPO) …"
STAGE="$(mktemp -d)"
cp "$APP_TARBALL" "$APP_SIG" "$DMG" "$STAGE/"

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

# Compose the release body from CHANGELOG.md (matching the CI workflow): the
# version's "what's new" section + an install table. Falls back to just the
# install note when the version has no CHANGELOG entry.
echo "▶ Composing release notes from CHANGELOG.md …"
NOTES_FILE="$(mktemp)"
{
  node scripts/changelog-notes.mjs "$VERSION" || true
  printf '\n## 安裝方式\n\n| 平台 | 檔案 |\n|------|------|\n| macOS (Apple Silicon / Intel) | `%s` |\n\n**macOS 首次開啟**：若出現「無法驗證開發者」，右鍵點擊 app → 選「開啟」。\n' "${DMG:+$(basename "$DMG")}"
} > "$NOTES_FILE"

echo "▶ Publishing release $TAG to $PUBLIC_REPO …"
if gh release view "$TAG" --repo "$PUBLIC_REPO" >/dev/null 2>&1; then
  gh release upload "$TAG" "$STAGE"/* --repo "$PUBLIC_REPO" --clobber
  # Refresh the body too, so re-runs pick up CHANGELOG edits.
  gh release edit "$TAG" --repo "$PUBLIC_REPO" --title "Northstar $TAG" --notes-file "$NOTES_FILE" --draft=false
  echo "  updated existing release."
else
  gh release create "$TAG" "$STAGE"/* \
    --repo "$PUBLIC_REPO" \
    --title "Northstar $TAG" \
    --latest \
    --notes-file "$NOTES_FILE"
  echo "  created new release."
fi

# TRANSITION: mirror the same assets + latest.json to the OLD feed once, so installs
# still polling the old endpoint update onto this (new-endpoint) build. latest.json's
# URLs point at $PUBLIC_REPO (northstar), so they download from the new public home.
if [ -n "$LEGACY_MIRROR_REPO" ]; then
  echo "▶ TRANSITION mirror → $LEGACY_MIRROR_REPO …"
  if gh release view "$TAG" --repo "$LEGACY_MIRROR_REPO" >/dev/null 2>&1; then
    gh release upload "$TAG" "$STAGE"/* --repo "$LEGACY_MIRROR_REPO" --clobber
    gh release edit "$TAG" --repo "$LEGACY_MIRROR_REPO" --title "Northstar $TAG" --notes-file "$NOTES_FILE" --draft=false
  else
    gh release create "$TAG" "$STAGE"/* --repo "$LEGACY_MIRROR_REPO" --title "Northstar $TAG" --latest --notes-file "$NOTES_FILE"
  fi
  echo "  mirrored to legacy feed (existing installs will migrate)."
fi
rm -f "$NOTES_FILE"

rm -rf "$STAGE"
echo "✓ Done. Updater feed: https://github.com/${PUBLIC_REPO}/releases/latest/download/latest.json"
