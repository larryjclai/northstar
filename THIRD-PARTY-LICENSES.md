# Third-Party Licenses & Attribution

Northstar's own source code is licensed under the **GNU General Public License v3.0 (or later)**
(see [`LICENSE`](LICENSE)). That GPLv3 grant covers the code in this repository only. Bundled
fonts, third-party dependencies, and excluded private assets are licensed separately, as
documented below.

## Bundled fonts (SIL Open Font License 1.1)

The design system uses the following fonts, pulled in at build time via the
[`@fontsource`](https://fontsource.org/) packages (the font binaries ship inside those npm
packages, not in this git tree). Each is licensed under the **SIL Open Font License,
Version 1.1 (OFL-1.1)** — a permissive license that is compatible with, but **separate
from**, the GPLv3 license that covers the code:

| Font | npm package | License | Bundled license text |
|---|---|---|---|
| Space Grotesk | `@fontsource/space-grotesk` | OFL-1.1 | `node_modules/@fontsource/space-grotesk/LICENSE` |
| IBM Plex Sans | `@fontsource/ibm-plex-sans` | OFL-1.1 | `node_modules/@fontsource/ibm-plex-sans/LICENSE` |
| IBM Plex Mono | `@fontsource/ibm-plex-mono` | OFL-1.1 | `node_modules/@fontsource/ibm-plex-mono/LICENSE` |
| IBM Plex Sans TC (繁體中文) | `@ibm/plex-sans-tc` | OFL-1.1 | `node_modules/@ibm/plex-sans-tc/LICENSE.txt` |

The OFL requires that the license text and any Reserved Font Name notices travel with the
font files. Because the fonts are consumed as unmodified npm dependencies, the full OFL text
and reserved-font-name notices are bundled inside each package above and are reproduced in any
distributed build. Do not rename the font files using their reserved names.

- "Space Grotesk" is a trademark / project of Florian Karsten.
- "IBM Plex" is a trademark of IBM Corp., released under the OFL.

## Dependency licenses (production)

All production npm dependencies resolve to permissive licenses
(MIT / ISC / BSD / Apache-2.0 / OFL-1.1 / Unlicense / 0BSD). Notable non-MIT entries:

- **`lightningcss`** (and its platform binary) — **MPL-2.0**. Mozilla Public License 2.0 is a
  weak (file-level) copyleft license. It is used here only as an unmodified **build-time** CSS
  toolchain dependency and imposes no obligation conflicting with Northstar's own GPLv3
  source. (If MPL-licensed source files were ever modified and redistributed, those specific
  files would need to remain under MPL — not the case here. MPL-2.0 is also explicitly
  GPLv3-compatible.)
- **`isbot`** — **Unlicense** (public domain dedication; permissive).
- The `northstar` entry reported by license tooling refers to this project itself and is
  now declared **GPL-3.0-or-later** via `package.json`.

No AGPL dependencies are present in the production tree. All dependency licenses (permissive +
MPL-2.0) are compatible with distributing the combined work under GPLv3.

The Rust / Tauri dependency tree (`src-tauri/`) is overwhelmingly MIT / Apache-2.0; the
vendored `tauri-plugin-sql` ships dual MIT / Apache-2.0 license files under
`src-tauri/vendor/tauri-plugin-sql/`. A full `cargo-deny` / `cargo-about` pass is recommended
before GA (heavy Rust license tooling was not installed for this audit).

## Excluded private assets (NOT in this repository)

Bank / brand logos live in a gitignored `private-assets/bank/` directory and are **not
included** in this open-source repository. They are third-party trademarks and are not covered
by the GPLv3 license. `scripts/inject-private-assets.mjs` copies them into `public/bank/` only
when present; the build runs cleanly without them (it simply ships without bundled bank logos).
