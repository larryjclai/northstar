#!/usr/bin/env bash
# Decrypt private-assets.tar.gz.enc back into private-assets/ (plan 249).
set -euo pipefail
cd "$(dirname "$0")/.."
: "${PRIVATE_ASSETS_KEY:?set PRIVATE_ASSETS_KEY}"
[ -f private-assets.tar.gz.enc ] || { echo "no encrypted archive; skipping"; exit 0; }
openssl enc -d -aes-256-cbc -pbkdf2 -in private-assets.tar.gz.enc \
  -out private-assets.tar.gz -pass env:PRIVATE_ASSETS_KEY
tar -xzf private-assets.tar.gz && rm private-assets.tar.gz
echo "unpacked private-assets/ ($(find private-assets -type f | wc -l | tr -d ' ') files)"
