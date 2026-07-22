#!/usr/bin/env bash
# Re-encrypt private-assets/ into private-assets.tar.gz.enc (plan 249).
# Run after changing any bank logo / etf feed. Requires PRIVATE_ASSETS_KEY env.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${PRIVATE_ASSETS_KEY:?set PRIVATE_ASSETS_KEY}"
# COPYFILE_DISABLE stops macOS bsdtar from packing AppleDouble (._*) metadata —
# they materialize as junk ._*.svg files when the Windows CI runner extracts.
COPYFILE_DISABLE=1 tar --exclude '.DS_Store' -czf private-assets.tar.gz private-assets
openssl enc -aes-256-cbc -pbkdf2 -salt -in private-assets.tar.gz \
  -out private-assets.tar.gz.enc -pass env:PRIVATE_ASSETS_KEY
rm private-assets.tar.gz
echo "wrote private-assets.tar.gz.enc ($(du -h private-assets.tar.gz.enc | cut -f1))"
