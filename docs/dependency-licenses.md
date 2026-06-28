# Dependency License Audit

Last audited: 2026-06-27

## Result

**Clean** -- no copyleft (GPL/LGPL/AGPL/SSPL) licenses found in the production
**third-party** dependency tree.

This audit and gate cover **third-party production dependencies only**. The project's own
copyleft license (GPL-3.0-or-later) is by design and is excluded from the gate.

## Production license summary

| License | Count |
|---|---|
| MIT | 127 |
| ISC | 13 |
| MIT OR Apache-2.0 | 6 |
| OFL-1.1 | 4 |
| Apache-2.0 | 4 |
| BSD-3-Clause | 2 |
| MPL-2.0 | 2 |
| Apache-2.0 OR MIT | 1 |
| Unlicense | 1 |
| UNLICENSED | 1 |
| 0BSD | 1 |
| MIT AND ISC | 1 |

**Notes:**

- The project itself (`northstar`) is intentionally licensed **GPL-3.0-or-later** -- the
  repo is open-sourced under GPLv3 + CLA (see the root `LICENSE` file). `license-checker`
  may report the root package as `UNLICENSED` depending on how it parses the `LICENSE`
  file; that label is cosmetic.
- The gate excludes the project's own package so its intentional copyleft license never
  trips the third-party check. The exclusion is anchored on `--excludePrivatePackages`
  (the root `package.json` sets `"private": true`, and `license-checker` drops private
  packages from `--failOn` evaluation). This survives the root being relabeled to an exact
  `GPL-3.0` SPDX token -- verified: with a private GPL-3.0 root the gate still exits 0,
  while a *third-party* GPL-3.0 dependency still makes it exit 1.
  `--excludePackagesStartingWith "northstar"` is also passed for clarity of intent, but on
  its own it only filters listing output and does **not** scope the `--failOn` gate.
- `MPL-2.0` packages are `lightningcss` / `lightningcss-darwin-arm64` (CSS toolchain).
  MPL-2.0 is file-level copyleft, generally App Store compatible when used as a
  dependency without modification. It is not included in the fail-gate.

## Re-run command

```bash
npm run license:check
```

This runs `license-checker --production --excludePrivatePackages --excludePackagesStartingWith "northstar" --failOn "GPL-2.0;GPL-3.0;LGPL-2.0;LGPL-2.1;LGPL-3.0;AGPL-3.0;SSPL-1.0"` and exits non-zero if any third-party copyleft license is found. The project's own package (`northstar`, GPL-3.0-or-later, `private: true`) is excluded so its intentional copyleft license does not trip the gate.

For a human-readable summary:

```bash
npx license-checker --production --summary
```

## Cargo / Rust licenses

Rust-side dependencies (`src-tauri/`) are a separate follow-up. The recommended tool is
[`cargo-deny`](https://github.com/EmbarkStudios/cargo-deny) with a `deny.toml`
configuration for license checks.
