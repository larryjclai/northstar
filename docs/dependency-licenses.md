# Dependency License Audit

Last audited: 2026-06-27

## Result

**Clean** -- no copyleft (GPL/LGPL/AGPL/SSPL) licenses found in the production
**third-party** dependency tree.

This audit and gate cover **third-party production dependencies only**. The project's own MIT
License is declared separately in the root `package.json` and `LICENSE` files.

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

- The project itself (`northstar`) is licensed **MIT** (see the root `LICENSE` file).
- The gate excludes the project's own package because this report evaluates third-party
  production dependencies. The exclusion is anchored on `--excludePrivatePackages` (the root
  `package.json` sets `"private": true`). `--excludePackagesStartingWith "northstar"` is also
  passed for clarity of intent, but on its own it only filters listing output and does **not**
  scope the `--failOn` gate.
- `MPL-2.0` packages are `lightningcss` / `lightningcss-darwin-arm64` (CSS toolchain).
  MPL-2.0 is file-level copyleft, generally App Store compatible when used as a
  dependency without modification. It is not included in the fail-gate.

## Re-run command

```bash
npm run license:check
```

This runs `license-checker --production --excludePrivatePackages --excludePackagesStartingWith "northstar" --failOn "GPL-2.0;GPL-3.0;LGPL-2.0;LGPL-2.1;LGPL-3.0;AGPL-3.0;SSPL-1.0"` and exits non-zero if any disallowed third-party copyleft license is found. The project's own package (`northstar`, MIT, `private: true`) is outside this third-party gate.

For a human-readable summary:

```bash
npx license-checker --production --summary
```

## Cargo / Rust licenses

Rust-side dependencies (`src-tauri/`) are a separate follow-up. The recommended tool is
[`cargo-deny`](https://github.com/EmbarkStudios/cargo-deny) with a `deny.toml`
configuration for license checks.
