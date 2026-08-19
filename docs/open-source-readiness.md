# Open-Source Readiness Report — Plan 072 (GPL-3.0-or-later + CLA, superseded)

> **Historical record:** This report captures the repository's original GPLv3 licensing
> decision. As of 2026-08-19, Northstar is licensed under the **MIT License**; see the root
> [`LICENSE`](../LICENSE) file for the current terms.

> **License decision (operator):** the project is released under **GPL-3.0-or-later** (NOT AGPL),
> with a **Contributor License Agreement (CLA)** required for external PRs and enforced by a
> cla-assistant bot. This report reflects that decision; the history audit (§1) is
> license-agnostic and remains CLEAN.

**Decision: GO** (pending operator inputs noted below — none block the audit).

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

## 2. LICENSE → added (GPL-3.0-or-later) + CLA ⚠️ copyright holder is a placeholder

- Added top-level [`LICENSE`](../LICENSE) = a short customary copyright/notice header **plus the
  full verbatim GNU GPL v3.0 text** (674-line official text from gnu.org).
- The notice line is `Copyright (c) 2026 <COPYRIGHT_HOLDER>` — a **PLACEHOLDER**.
  **OPERATOR MUST fill in the exact legal copyright-holder string** (the executor did not guess).
- Set `package.json` `"license": "GPL-3.0-or-later"` (SPDX). Kept `"private": true`
  (npm-publish guard) — recommend KEEP unless an npm package is intended.
- Added [`CLA.md`](../CLA.md) — a Contributor License Agreement (template, see §5.1) covering
  individual + entity contributors, granting the Project Owner a broad copyright + patent license
  **and the right to relicense** (preserving a future dual-license / App-Store option).
- Added [`.github/workflows/cla.yml`](../.github/workflows/cla.yml) — cla-assistant bot that
  blocks PR merge until the contributor signs. Operator setup is in §5.1 (no live secrets wired).

This also resolves the license tooling's `UNLICENSED -> northstar@…` entry (that was the project
itself lacking a `license` field, not a third-party dependency).

**GPLv3 ↔ Apple App Store caveat:** GPLv3's terms are widely considered incompatible with the
Apple App Store's usage terms (DRM / additional restrictions). This does **not** affect today's
distribution model — direct **DMG download + the in-app updater** are fine under GPLv3. It only
matters if the operator later wants an **App Store** build: then they must either (a) be the
**sole copyright holder** and dual-license / relicense their own code for that channel, or
(b) have every contributor's permission. **The CLA's relicensing grant (§4 of `CLA.md`) is what
preserves option (a)** — it lets the Project Owner ship contributions under non-GPL terms for the
App Store while keeping the public source GPLv3.

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
  **separate** license from the GPLv3 code grant.
- **Production deps** (`npx license-checker --production --summary`): MIT ×127, ISC ×13,
  `MIT OR Apache-2.0` ×5, OFL-1.1 ×4, Apache-2.0 ×4, BSD-3-Clause ×2, **MPL-2.0 ×2**,
  `Apache-2.0 OR MIT` ×1, Unlicense ×1, 0BSD ×1, `MIT AND ISC` ×1, plus the project itself.
  - **No AGPL** anywhere. The permissive deps (MIT/BSD/Apache/ISC/0BSD/Unlicense/OFL) and the
    two MPL-2.0 entries are all **compatible with distributing the combined work under GPLv3**
    (Apache-2.0 and MPL-2.0 are both explicitly GPLv3-compatible per the FSF). No copyleft
    conflict.
  - **MPL-2.0 ×2 = `lightningcss` + its platform binary** — weak (file-level) copyleft, used as
    an unmodified **build-time** CSS tool; GPLv3-compatible, imposes no extra obligation.
    Flagged for operator awareness only — **not a STOP**.
  - `Unlicense` = `isbot` (public-domain dedication; permissive — distinct from "UNLICENSED").
- **Rust/Tauri:** not deeply audited (heavy `cargo-deny`/`cargo-about` tooling not installed).
  The tree is overwhelmingly MIT/Apache-2.0 (both GPLv3-compatible); vendored `tauri-plugin-sql`
  ships dual MIT/Apache. Recommend a `cargo-deny` pass before GA.

---

## 5. Public-readiness docs ✅

- **README:** added an **English** project summary + a **build-from-source** section that notes
  the optional/missing private bank logos; updated the 授權 section to **GPLv3 (or later)**, with
  the OFL-font + excluded-logo boundary, a **CLA-required-for-PRs** note, and a not-financial-
  advice note.
- **CONTRIBUTING.md:** license stated as **GPLv3 (or later)**; added that **all PRs require a
  one-time CLA signature** (via the bot comment). Reads sensibly for external contributors.
- **CLA.md (new):** Contributor License Agreement template (see §5.1).
- **SECURITY.md:** exists and reads well for an external audience. ⚠️ **OPERATOR: confirm the
  disclosure flow you want public.** It currently relies on **GitHub private vulnerability
  reporting** (enable it in repo Settings → Security before/at flip) with a minimal-public-issue
  fallback — no email address is exposed. Decide whether to add a contact email or keep the
  GitHub-private-reporting flow.
- **CODE_OF_CONDUCT.md:** **does not exist.** Optional; the operator may add one
  (e.g. Contributor Covenant) if desired. Not a blocker.
- **Workflows:** `.github/workflows/release.yml` + new `.github/workflows/cla.yml`. Release
  secrets are referenced **only** as `${{ secrets.* }}` env injections (`GITHUB_TOKEN`,
  `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, `RELEASES_TOKEN`) —
  **none echoed into logs** (scanned). Release trigger is `workflow_dispatch` **only**, so
  forked-PR runs can never access those secrets.
  - ⚠️ The CLA workflow uses `pull_request_target` (required by cla-assistant so the bot can
    comment on fork PRs). `pull_request_target` runs in the **base-repo** context with access to
    secrets, so it must **never** check out or execute untrusted PR code. The cla-assistant
    action does not run PR code (it only reads PR metadata + posts comments), so this is the
    standard, safe pattern — but the operator should keep that workflow minimal and not add steps
    that build/run the PR branch.

### 5.1 CLA bot — operator setup (NO live secrets wired here)

The new `.github/workflows/cla.yml` uses the cla-assistant pattern
(`contributor-assistant/github-action`). To activate it the operator must:

1. **Create a signatures store.** Either a dedicated branch in this repo or a **separate private
   repo**. Recommended: a private repo (keeps signer PII out of the public repo). Set the
   workflow's `remote-organization-name` / `remote-repository-name` / `branch` accordingly.
2. **Create a PAT secret.** A fine-grained Personal Access Token with **`contents: write`** on the
   signatures store, saved as the repo Actions secret **`CLA_SIGNATURES_TOKEN`** (referenced as
   `PERSONAL_ACCESS_TOKEN` in the workflow). _Not wired by the executor — placeholder only._
3. **Fill the placeholders** in `cla.yml`: `<OWNER>/<REPO>` in `path-to-document`,
   `<SIGNATURES_ORG_OR_OWNER>`, `<SIGNATURES_REPO>`.
4. **Fill the `<COPYRIGHT_HOLDER>` / `<PROJECT_REPO_URL>` placeholders** in `CLA.md`.
5. **Have `CLA.md` reviewed by a lawyer** before relying on it (it is a binding contract and the
   relicensing grant is the load-bearing clause for the App-Store option).
6. _(Optional)_ Pin the action to a commit SHA instead of the `@v2.6.1` tag for supply-chain
   safety.

---

## 6. Verification (no behavior change)

| Check | Result |
|---|---|
| `npm run build` (private-assets absent) | **exit 0** |
| `npm test` | **672 passed / 74 files, 0 failures** |
| Source / feature behavior | **unchanged** (only LICENSE, CLA.md, CLA workflow, docs, `package.json` license field) |

---

## OPERATOR ACTIONS NEEDED (un-executed — operator only)

### Inputs to provide first
1. **Copyright holder** — replace `<COPYRIGHT_HOLDER>` in `LICENSE` **and** in `CLA.md` with the
   exact legal name (person or entity). _Required before flip._
2. **CLA legal review + setup** — **[COMPLETED 2026-06-26]** CLA bot has been successfully configured to use the `northstar-cla-signatures` private repository. The `CLA_SIGNATURES_TOKEN` secret is active and the CLA check is passing for pull requests. *(Original instruction: have `CLA.md` reviewed by a lawyer...)*
3. **SECURITY disclosure contact** — confirm GitHub private vulnerability reporting is the
   intended channel (and enable it), or add a contact email to `SECURITY.md`.
4. _(Optional)_ Add `CODE_OF_CONDUCT.md` if you want one.

### The visibility flip (IRREVERSIBLE — do AFTER inputs above)
5. Merge `advisor/072-open-source-mit` into `main` (LICENSE + CLA + workflow + docs) the normal way.
6. **Enable GitHub private vulnerability reporting:** repo → Settings → Code security →
   "Private vulnerability reporting" → Enable.
7. **Turn on "require status checks before merging"** for the CLA check on the default branch
   (Settings → Branches → branch protection) so a PR truly cannot merge until the CLA is signed.
8. **Flip visibility:** GitHub → repo Settings → General → Danger Zone →
   "Change repository visibility" → **Make public**. (One-way for the history that exists at
   flip time — this audit certifies that history is CLEAN.)
9. **Post-flip secret/trigger re-confirm:** verify the **release** workflow stays
   `workflow_dispatch`-only and that its secrets (`RELEASES_TOKEN`, `TAURI_SIGNING_PRIVATE_KEY`,
   `…_PASSWORD`) are still repo-scoped. The **CLA** workflow's `pull_request_target` is expected
   and safe **as long as it never checks out / runs PR code** (cla-assistant doesn't) — keep that
   workflow minimal.

### Recommended hardening (post-open-source)
10. Add a **`gitleaks` pre-commit hook and/or CI check** so no future commit can leak a secret
    into the now-public history (the whole point of the gate was history is permanent once public).
11. _(Optional)_ Pin the cla-assistant action to a commit SHA; `git stash clear` the isolated
    local stash `acb43776`; run a `cargo-deny`/`cargo-about` license pass on the Rust tree before GA.

### Not done by the executor (operator-only, per plan)
- No repo-visibility change, no git-history rewrite, no credential rotation, no push/PR.
- No credential rotation is **required** — the history audit found no exposed secret.
