# Plan 072: Open-source Northstar under the MIT License

> **Executor instructions**: This is a **process / release-engineering** plan, NOT a feature.
> Several steps are IRREVERSIBLE or outward-facing (flipping repo visibility, rewriting git
> history) — those are **operator-gated**: do the analysis + prep, then STOP and hand the
> irreversible action to the operator with exact commands. NEVER flip the repo to public
> yourself. Treat the secrets audit as a hard gate. Reply with EXACTLY the report format.

## Status
- **Priority**: P2 (operator-requested direction)
- **Effort**: M (most effort is the audit + hygiene; the flip itself is one click)
- **Risk**: **HIGH if rushed** — making a PRIVATE repo public exposes ALL git history
  forever; a single secret ever committed (even later "deleted") is exposed. The risk is
  process, not code.
- **Depends on**: none (independent of 070/071)
- **Planned at**: commit `06fb3a97`, 2026-06-26

## Why this matters
Operator wants to open-source the project under **MIT**. The code side is straightforward;
the load-bearing work is **making sure nothing private leaks** when a currently-PRIVATE repo
(`larryjclai/northstar`) becomes world-readable — git history, secrets, and trademark/licensed
assets. Recon facts (current `HEAD` 06fb3a97):
- **No `LICENSE` file**; `gh repo view` → `visibility: PRIVATE`, `licenseInfo: null`.
- `package.json` has `"private": true` (npm-publish guard) + a prebuild
  `node scripts/inject-private-assets.mjs`.
- `scripts/inject-private-assets.mjs` copies **bank logos** from a gitignored
  `private-assets/bank/` (or `$NORTHSTAR_PRIVATE_ASSETS_DIR`) into `public/bank`, and **builds
  fine WITHOUT them** (removes `public/bank`, logs, exits 0). So private assets are already
  cleanly decoupled — the public build just ships without bundled bank logos.
- Current tree: **no tracked secrets** (`git grep` for key/token patterns = clean); `.env` and
  `*.key` are gitignored and **never tracked** (`git ls-files` confirms). Promising — but the
  current tree is NOT the whole history.

## HARD GATE — Step 1: full git-history secrets audit (do FIRST; blocks everything)
The reassuring current-tree scan is not enough — a secret committed in an old commit and later
removed is still in history and would be exposed on going public.
1. Run a real history scanner over ALL commits, e.g.:
   - `gitleaks detect --source . --redact -v` (scans full history by default), AND/OR
   - `trufflehog git file://. --only-verified`
   (If neither is installed, install locally — these are read-only scanners.)
2. Manually history-scan the known-sensitive names even if gitignored now:
   `git log --all --full-history -- .env .env.* '*.key' '*.pem' private-assets/` — confirm they
   were **never committed**. Also scan for the specific credential types this repo uses (from
   docs/memory): the **minisign signing key**, `TAURI_SIGNING_PRIVATE_KEY*`, `RELEASES_TOKEN`,
   any GitHub PAT, the `.env` password.
3. **GATE:** if history is clean → proceed. If ANY secret is found in history → STOP and report
   to the operator: going public is blocked until history is rewritten
   (`git filter-repo`/BFG to purge the blob) **and every exposed credential is rotated**
   (treat as already-compromised). Do NOT rewrite shared history without operator direction +
   a backup branch (per `.agentrules`). **Never print a found secret value — reference commit +
   path + credential type only.**

## Step 2: choose the MIT scope + add the license
- Add a top-level **`LICENSE`** = the standard MIT text, `Copyright (c) 2026 <operator/legal
  name>` (ask the operator for the exact copyright holder string).
- MIT covers the **source code**. It does NOT (and must not be claimed to) cover:
  - **Bank logos** (`private-assets/`) — third-party trademarks; they stay gitignored + out of
    the public repo. Note this in the README/CONTRIBUTING ("bank logos are not included; the
    build runs without them").
  - **Bundled fonts** — the design system uses Space Grotesk + JetBrains Mono (per project
    memory). Verify each font's license (both are SIL OFL) and add the required attribution /
    license files (OFL requires the license text + reserved font name notices); OFL is
    compatible with MIT-licensed code but is a SEPARATE license for those assets.
- Set `package.json` `"license": "MIT"`. Decide on `"private": true`: keep it (prevents
  accidental `npm publish`) unless the operator plans to publish an npm package — recommend KEEP.

## Step 3: third-party + compliance hygiene
- `npx license-checker --summary` (or `npm run` equivalent) → confirm all production deps are
  permissive (MIT/BSD/Apache/ISC). Flag any GPL/AGPL/“UNLICENSED” for the operator (copyleft in
  a dependency can force obligations). Tauri/Rust side: `cargo` deps are overwhelmingly
  MIT/Apache-2.0 — spot-check with `cargo about`/`cargo-deny` if available.
- Keep the existing **not-financial-advice** product principle visible (the MIT "no warranty"
  clause covers liability, but a plain-language note in the README is good for a finance app).

## Step 4: public-readiness docs (low risk)
- README: it's zh-TW first (per convention) — add a short **English** project summary + a
  clear build-from-source section that notes the missing private bank logos are optional.
- Confirm `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md` exist + read sensibly for an
  external audience (SECURITY.md already exists — verify the disclosure contact is one the
  operator wants public).
- Note the **two-repo relationship** for contributors: source here, binaries in the public
  `northstar-releases` feed; the release flow uses repo **Actions secrets** (`RELEASES_TOKEN`,
  signing key) which live in GitHub Settings, NOT in code — confirm none are echoed into
  workflow LOGS (scan `.github/workflows/*.yml` for `echo`-ing secrets).

## Step 5 (OPERATOR-GATED, irreversible) — the visibility flip
Do NOT perform. After Steps 1–4 pass, hand the operator the exact actions:
- Flip `larryjclai/northstar` to public (GitHub Settings → Danger Zone), AFTER the history
  audit is green.
- Re-confirm Actions secrets are still scoped correctly post-flip (public repos expose workflow
  files + logs to everyone; forked-PR runs don't get secrets by default — verify the release
  workflow's trigger model is safe for a public repo).

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| History secret scan | `gitleaks detect --source . --redact -v` | no findings |
| Sensitive-path history | `git log --all --full-history -- .env '*.key' private-assets/` | empty |
| Dep licenses | `npx license-checker --summary` | all permissive |
| Build still green | `npm run build` | exit 0 (with + without private-assets) |
| Tests | `npm test` | all pass |

## Scope
**In scope:** `LICENSE` (new), `package.json` (`license`/`private` fields), README/CONTRIBUTING/
SECURITY polish, font-license attribution files, the audit + a written go/no-go report.
**Out of scope (operator-only):** the actual visibility flip; any git-history rewrite; credential
rotation. Code behavior / features — none change.

## Git workflow
- Branch from current main: `git checkout -B advisor/072-open-source-mit main`.
- Commit LICENSE + doc changes. Do NOT push/PR. Do NOT change repo visibility.

## Done criteria
- [ ] Full git-history secret scan run; result recorded (CLEAN, or a STOP report listing
      commit+path+credential-type — never the value — and the rewrite+rotate plan)
- [ ] `LICENSE` (MIT) added with the operator-confirmed copyright holder; `package.json
      "license":"MIT"`
- [ ] Private bank logos confirmed never-committed + decoupled; build green with AND without them
- [ ] Bundled-font (OFL) licenses + attribution added; all deps confirmed permissive
- [ ] README has an English summary + build-from-source note; SECURITY/CONTRIBUTING public-ready
- [ ] A clear **go/no-go report** for the operator with the exact (un-executed) flip steps
- [ ] tsc 0; `npm test` all pass; build 0 — no feature/behavior change

## STOP conditions
- ANY secret found in git history → STOP; report (commit+path+type, never the value) + the
  rewrite-history-and-rotate requirement; do not proceed toward going public.
- A production dependency is copyleft/UNLICENSED → STOP; report for an operator licensing call.
- The operator's copyright-holder string / SECURITY contact isn't provided → ask, don't guess.

## Maintenance notes
- Going public is a one-way door for whatever is in history at flip time — the audit is the
  whole ballgame; everything else is reversible.
- After open-sourcing, secrets must NEVER enter the repo (they already use Actions secrets +
  gitignored `.env`/`~/.tauri/` — keep that discipline; consider adding a `gitleaks` pre-commit
  hook / CI check so a future commit can't leak one into the now-public history).
- MIT covers the code; bank logos + fonts are separately licensed — keep that boundary documented.
