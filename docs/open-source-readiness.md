# Open-Source Readiness Report — Plan 072 (MIT)

**Decision: GO** (pending two operator inputs noted below — neither blocks the audit).

Audit performed on branch `advisor/072-open-source-mit`, base commit `28cfccf9`
(worktree of `main` @ `06fb3a97`), 2026-06-26. This report records the audit result and the
**exact, un-executed** operator steps for the visibility flip. Per plan 072, the executor does
**not** flip visibility, rewrite history, rotate credentials, push, or open a PR.

---

## 1. HARD GATE — full git-history secrets audit → CLEAN ✅

The going-public risk is that **all** git history becomes world-readable; a secret committed
once (even later deleted) stays in history. Scans run over full history:

| Check | Tool / command | Result |
|---|---|---|
| Full-history secret scan | `gitleaks detect --source . --redact -v` (499 commits, ~322 MB) | 2 findings — both **confirmed false positives** (see below) |
| Sensitive-path history | `git log --all --full-history -- .env .env.* '*.key' '*.pem' private-assets/` | Only `.env.example` (placeholders) ever committed — no real secret files |
| Real secret blobs in any tree | `git rev-list --all --objects \| grep` for `.env`/`*.key`/`*.pem`/`private-assets/` (excluding `.env.example`) | NONE |
| PEM / minisign private-key bodies | history `git grep` for `BEGIN ... PRIVATE KEY` / `minisign secret key` | Only dependency docs + Rust build artifacts in an **isolated git stash** (not in HEAD/any ref) |
| GitHub PAT patterns | history `git grep` `ghp_`/`github_pat_`/`gho_` | NONE |
| Assigned real secret values | history `git grep` `TAURI_SIGNING_PRIVATE_KEY=`/`RELEASES_TOKEN=`/`GH_TOKEN=` with non-placeholder values | NONE |

**Gitleaks findings — both false positives (NOT credentials):**

1. `src/features/connect/crypto/vault.ts:6` — `const STORAGE_KEY = "northstar.vault.key.v1"`.
   This is a **localStorage key name** (an identifier string). The actual AES-GCM vault key is
   generated at runtime via `crypto.subtle.generateKey` and is never hardcoded. Gitleaks'
   `generic-api-key` rule fired on the variable name containing "KEY".
2. `Sources/NorthstarApp/UI/AppState/FXRateStore.swift:6` —
   `private static let storageKey = "northstar.fxRates.v1"`. Same pattern — a storage key name,
   in the **stale Apple-native Swift tree** (pre-Tauri archive).

**On the git stash (`acb43776`):** a `refs/stash` on the local `archive/swift-native-before-tauri`
branch once captured `node_modules/` and `src-tauri/target/` build artifacts (including the
`minisign-verify` *crate's* compiled `.rlib`/`.rmeta` — a signature-**verification** dependency,
not the project's signing key). It is **not reachable from any branch, tag, or remote ref**, so
it is local-only and will **not** be exposed by the visibility flip. No action required; the
operator may optionally `git stash clear` it for tidiness.

**`.gitignore` coverage confirmed:** `.env`, `.env.*` (with `!.env.example`), `*.key`, `*.pem`,
`private-assets/`, `node_modules/`, `target/`, `src-tauri/target/` are all ignored.

**Gate verdict: CLEAN — history poses no secret-exposure blocker to going public.**

---

## 2. LICENSE → added (MIT) ⚠️ copyright holder is a placeholder

- Added top-level [`LICENSE`](../LICENSE) = standard MIT text.
- Copyright line is `Copyright (c) 2026 <COPYRIGHT_HOLDER>` — a **PLACEHOLDER**.
  **OPERATOR MUST fill in the exact legal copyright-holder string** (the executor did not guess).
- Set `package.json` `"license": "MIT"`. Kept `"private": true` (npm-publish guard) per plan —
  recommend KEEP unless an npm package is intended.

This also resolves the license tooling's `UNLICENSED -> northstar@…` entry (that was the project
itself lacking a `license` field, not a third-party dependency).

---

## 3. Private bank logos → never committed, build decoupled ✅

- `private-assets/` was **never committed** to history (confirmed in §1) and is gitignored.
- The worktree has **no** `private-assets/` dir and `NORTHSTAR_PRIVATE_ASSETS_DIR` is unset, so
  this audit's build is a true "without private assets" build.
- `npm run build` → **exit 0**. `scripts/inject-private-assets.mjs` logs
  `no private bank assets found; … building without bundled bank logos.` and exits 0.

---

## 4. Fonts (OFL) + dependency licenses ✅

- **Fonts:** the design system uses Space Grotesk, IBM Plex Sans, IBM Plex Mono, and IBM Plex
  Sans TC (繁體中文), all via `@fontsource`/`@ibm` npm packages — all **OFL-1.1**. Font binaries
  ship inside those packages (not vendored in git); each bundles its own OFL `LICENSE`. Added
  [`THIRD-PARTY-LICENSES.md`](../THIRD-PARTY-LICENSES.md) documenting them and noting OFL is a
  **separate** license from the MIT code grant.
- **Production deps** (`npx license-checker --production --summary`): MIT ×127, ISC ×13,
  `MIT OR Apache-2.0` ×5, OFL-1.1 ×4, Apache-2.0 ×4, BSD-3-Clause ×2, **MPL-2.0 ×2**,
  `Apache-2.0 OR MIT` ×1, Unlicense ×1, 0BSD ×1, `MIT AND ISC` ×1, plus the project itself.
  - **No GPL/AGPL** (strong copyleft) anywhere.
  - **MPL-2.0 ×2 = `lightningcss` + its platform binary** — weak (file-level) copyleft, used as
    an unmodified **build-time** CSS tool; imposes no obligation on Northstar's MIT source.
    Flagged for operator awareness only — **not a STOP**.
  - `Unlicense` = `isbot` (public-domain dedication; permissive — distinct from "UNLICENSED").
- **Rust/Tauri:** not deeply audited (heavy `cargo-deny`/`cargo-about` tooling not installed).
  The tree is overwhelmingly MIT/Apache-2.0; vendored `tauri-plugin-sql` ships dual MIT/Apache.
  Recommend a `cargo-deny` pass before GA.

---

## 5. Public-readiness docs ✅

- **README:** added an **English** project summary + a **build-from-source** section that notes
  the optional/missing private bank logos; updated the 授權 section from "license not finalized /
  source-available" to **MIT**, with the OFL-font + excluded-logo boundary and a not-financial-
  advice note.
- **CONTRIBUTING.md:** updated the "license not finalized" line to MIT + contribution-under-MIT
  note. Reads sensibly for external contributors.
- **SECURITY.md:** exists and reads well for an external audience. ⚠️ **OPERATOR: confirm the
  disclosure flow you want public.** It currently relies on **GitHub private vulnerability
  reporting** (enable it in repo Settings → Security before/at flip) with a minimal-public-issue
  fallback — no email address is exposed. Decide whether to add a contact email or keep the
  GitHub-private-reporting flow.
- **CODE_OF_CONDUCT.md:** **does not exist.** Optional for MIT release; the operator may add one
  (e.g. Contributor Covenant) if desired. Not a blocker.
- **Workflows:** only `.github/workflows/release.yml`. Secrets are referenced **only** as
  `${{ secrets.* }}` env injections (`GITHUB_TOKEN`, `TAURI_SIGNING_PRIVATE_KEY`,
  `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, `RELEASES_TOKEN`) — **none echoed into logs** (scanned).
  Trigger is `workflow_dispatch` **only** (no `pull_request` trigger), so forked-PR runs can
  never access secrets — the safest model for a public repo.

---

## 6. Verification (no behavior change)

| Check | Result |
|---|---|
| `npm run build` (private-assets absent) | **exit 0** |
| `npm test` | **672 passed / 74 files, 0 failures** |
| Source / feature behavior | **unchanged** (only LICENSE, docs, `package.json` license field) |

---

## OPERATOR ACTIONS NEEDED (un-executed — operator only)

### Inputs to provide first
1. **Copyright holder** — replace `<COPYRIGHT_HOLDER>` in `LICENSE` with the exact legal name
   (person or entity). _Required before flip._
2. **SECURITY disclosure contact** — confirm GitHub private vulnerability reporting is the
   intended channel (and enable it), or add a contact email to `SECURITY.md`.
3. _(Optional)_ Add `CODE_OF_CONDUCT.md` if you want one.

### The visibility flip (IRREVERSIBLE — do AFTER inputs above)
4. Merge `advisor/072-open-source-mit` into `main` (LICENSE + docs) the normal way.
5. **Enable GitHub private vulnerability reporting:** repo → Settings → Code security →
   "Private vulnerability reporting" → Enable.
6. **Flip visibility:** GitHub → repo Settings → General → Danger Zone →
   "Change repository visibility" → **Make public**. (One-way for the history that exists at
   flip time — this audit certifies that history is CLEAN.)
7. **Post-flip secret/trigger re-confirm:** verify Actions secrets (`RELEASES_TOKEN`,
   `TAURI_SIGNING_PRIVATE_KEY`, `…_PASSWORD`) are still scoped at the repo and that the release
   workflow stays `workflow_dispatch`-only (no `pull_request`/`pull_request_target` trigger is
   later added that would expose secrets to fork PRs).

### Recommended hardening (post-open-source)
8. Add a **`gitleaks` pre-commit hook and/or CI check** so no future commit can leak a secret
   into the now-public history (the whole point of the gate was history is permanent once public).
9. _(Optional)_ `git stash clear` to drop the isolated local stash `acb43776`, and run a
   `cargo-deny`/`cargo-about` license pass on the Rust tree before GA.

### Not done by the executor (operator-only, per plan)
- No repo-visibility change, no git-history rewrite, no credential rotation, no push/PR.
- No credential rotation is **required** — the history audit found no exposed secret.
