# Plan 150: Clear the GitHub security alerts — CSPRNG device-ID fallback, CI workflow permissions, worker dependency bumps

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat da946482..HEAD -- src/state/deviceIdentity.ts .github/workflows/ci.yml worker/package.json worker/package-lock.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `da946482`, 2026-07-11

## Why this matters

GitHub's security tab currently shows 7 open CodeQL alerts and 9 open Dependabot
alerts on `main`. None is an exploitable hole today, but they bury real future
findings in noise. Three independent small fixes clear 15 of the 16:

1. **CodeQL `js/insecure-randomness` ×2 (High)** — `getOrCreateDeviceIdentity()`
   has a `Math.random()` fallback for the device ID. That ID is concatenated into
   the sync Bearer token (`<deviceId>.<deviceSecret>` in
   `src/features/connect/sync/account.ts:106`), so CodeQL taints the whole token
   as insecure randomness at `sync/client.ts:78` and `:90`. Practical risk is low
   (the secret half is CSPRNG; the fallback only fires when `crypto.randomUUID`
   is missing), but the fallback should be CSPRNG anyway, and the fix is one line.
2. **CodeQL `Workflow does not contain permissions` ×5 (Medium)** — `ci.yml`
   never sets `permissions:`, so every job runs with the default (write-capable)
   `GITHUB_TOKEN`. All five jobs only check out and test; least privilege is
   `contents: read`.
3. **Dependabot ×8 npm (all in `worker/package-lock.json`, all dev-scope)** —
   `ws` 8.20.1 (< 8.21.0 fixed), `undici` 7.24.8 (< 7.28.0 fixed), `esbuild`
   0.27.3 (< 0.28.1 fixed). All three are transitive deps of the top-level
   `wrangler` (via `miniflare`); the copies nested under
   `@cloudflare/vitest-pool-workers` are already at fixed versions. A lockfile
   refresh within the existing semver ranges resolves all eight alerts.

The 16th alert (Rust `glib` 0.18.5, Moderate unsoundness, needs ≥ 0.20.0) is
**deliberately not addressed**: `src-tauri/Cargo.lock` pins glib via the
`gtk 0.18` bindings that Tauri 2's Linux stack (tao/wry) controls. It cannot be
bumped locally without breaking the Tauri dependency tree. The operator should
dismiss it on GitHub as "no fix available" or leave it until a Tauri upgrade
carries gtk forward. Do NOT attempt `cargo update -p glib`.

## Current state

- `src/state/deviceIdentity.ts` — device-local identity (localStorage + Tauri
  file mirror). Lines 31–34 today:

  ```ts
  function uuid(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
    return `dev_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }
  ```

- `src/features/connect/sync/account.ts:28-32` — the repo's existing CSPRNG hex
  helper (the convention to match):

  ```ts
  function randomHex(bytes: number): string {
    return Array.from(crypto.getRandomValues(new Uint8Array(bytes)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  ```

- `.github/workflows/ci.yml` — starts with:

  ```yaml
  name: CI

  on:
    push:
      branches: [main]
    pull_request:
  ```

  There is **no `permissions:` key anywhere in the file** (verify:
  `grep -c permissions .github/workflows/ci.yml` → `0`). Five jobs: `checks`,
  `build`, `tauri`, `worker`, `e2e` — all only run checkout/setup/test steps;
  none pushes, comments, or releases.

- `worker/package.json` — devDependencies only:
  `@cloudflare/vitest-pool-workers ^0.18.4`, `@cloudflare/workers-types
  ^4.20250525.0`, `typescript ^5.7.3`, `vitest ^4.1.9`, `wrangler ^4.95.0`.
  Vulnerable versions currently in `worker/package-lock.json`:
  `node_modules/ws` 8.20.1, `node_modules/undici` 7.24.8,
  `node_modules/esbuild` 0.27.3 (all pulled by the top-level
  `wrangler`/`miniflare`; the `@cloudflare/vitest-pool-workers`-nested copies are
  already 8.21.0 / 7.28.0 / 0.28.1).

- `src/state/deviceIdentity.test.ts` exists; it asserts persistence behavior
  with hand-written IDs (`dev_persisted`, `dev_existing`) and does NOT assert
  any generated-ID format — the fallback format may change shape safely.

- Repo conventions: conventional-commit messages (`fix(scope): …` — see
  `git log --oneline -5`); zh-TW comments are fine but code identifiers English.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install (root) | `npm ci` | exit 0 |
| Typecheck (root) | `npx tsc` | exit 0, no output |
| Tests (root) | `npm test` | all pass (≥ 960 tests) |
| Lint (root) | `npm run lint` | exit 0 |
| Install (worker) | `cd worker && npm ci` | exit 0 |
| Worker deps refresh | `cd worker && npm update` | exit 0, lockfile modified |
| Worker typecheck | `cd worker && npx tsc --noEmit` | exit 0 |
| Worker tests | `cd worker && npm test` | all pass (≥ 25 tests) |
| Workflow syntax | `node -e "require('js-yaml')"` unavailable — just rely on the YAML being additive; CI validates on push | — |

## Scope

**In scope** (the only files you should modify):
- `src/state/deviceIdentity.ts`
- `.github/workflows/ci.yml`
- `worker/package-lock.json` (via `npm update`; `worker/package.json` only if
  `npm update` alone cannot reach the fixed versions — see Step 3)
- `plans/README.md` (status row)

**Out of scope** (do NOT touch, even though they look related):
- `src/state/importTemplates.ts:48` — also uses `Math.random()`, but for a
  template ID in a non-security context; CodeQL did not flag it. Leave it.
- `.github/workflows/release.yml`, `cla.yml`, `etf-feed.yml` — not flagged by
  CodeQL, and release/cla need write permissions; adding a blanket
  `contents: read` there would break them.
- `src-tauri/Cargo.lock` / anything Rust — the glib alert is unfixable locally
  (see "Why this matters").
- `src/features/connect/sync/*` — the flagged lines in `client.ts` are a taint
  SINK, not the source; nothing there needs to change.
- Root `package.json` / root `package-lock.json`.

## Git workflow

- Branch: `fix/ai-security-alerts` (repo convention per `.agentrules`: AI work
  on `fix/ai-<name>`, never on `main`).
- One commit per step or a single commit for all three — conventional style,
  e.g. `fix(security): CSPRNG device-id fallback, CI permissions, worker dep bumps`.
- Do NOT push or merge; the reviewer handles hand-off.

## Steps

### Step 1: Make the device-ID fallback CSPRNG

In `src/state/deviceIdentity.ts`, replace the `uuid()` function (lines 31–34)
with:

```ts
function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Fallback for webviews without randomUUID (non-secure contexts):
  // getRandomValues is available everywhere we run (browsers, Tauri WebView, jsdom, Node).
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return `dev_${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
```

Notes:
- Keep the `crypto.randomUUID` fast path unchanged.
- The `dev_` prefix stays (existing persisted IDs are never regenerated; no
  format compatibility concern — the test file uses hand-written IDs only).
- Do not import anything; `crypto` is the global Web Crypto object.

**Verify**: `grep -n "Math.random" src/state/deviceIdentity.ts` → no matches.
**Verify**: `npx tsc` → exit 0. `npm test -- deviceIdentity` → all pass.

### Step 2: Add least-privilege permissions to ci.yml

In `.github/workflows/ci.yml`, insert a top-level `permissions` block between
`name: CI` and `on:`:

```yaml
name: CI

permissions:
  contents: read

on:
  push:
    branches: [main]
  pull_request:
```

Nothing else in the file changes. All five jobs inherit the read-only token
(they only ever check out code and run tests — verified during planning).

**Verify**: `grep -A2 "^permissions:" .github/workflows/ci.yml` → shows
`contents: read`. `git diff --stat .github/workflows/ci.yml` → exactly one file,
~2 insertions.

### Step 3: Refresh worker lockfile to pull patched transitive deps

```bash
cd worker
npm ci            # clean baseline install first
npm update        # refresh within existing semver ranges
```

Then check the resulting versions:

```bash
node -e "
const l=require('./package-lock.json');
const min={ws:'8.21.0',undici:'7.28.0',esbuild:'0.28.1'};
let bad=0;
for (const [k,v] of Object.entries(l.packages)) {
  for (const p of Object.keys(min)) {
    if (k.endsWith('node_modules/'+p)) {
      const ok = v.version.localeCompare(min[p], undefined, {numeric:true}) >= 0;
      console.log(ok?'OK ':'BAD', p, v.version, '('+k+')');
      if (!ok) bad++;
    }
  }
}
process.exit(bad);
"
```

**Expected**: every line `OK`, exit 0. Every `ws` ≥ 8.21.0, `undici` ≥ 7.28.0,
`esbuild` ≥ 0.28.1.

If any line is `BAD` after `npm update` (e.g. the top-level `wrangler` release
still pins an older `esbuild`), escalate ONE level: bump the direct dep that
owns the bad copy in `worker/package.json` within its major
(`npm install -D wrangler@^4` → latest 4.x, and/or
`npm install -D @cloudflare/vitest-pool-workers@^0.18`), re-run the check. If
it STILL fails, that alert has no upstream fix yet — STOP and report which
package/version is stuck; commit the partial bump only if the worker gates
below still pass.

**Verify (gates)**:
- `cd worker && npx tsc --noEmit` → exit 0
- `cd worker && npm test` → all pass (≥ 25 tests)

### Step 4: Full root gates

```bash
npx tsc && npm run lint && npm test
```

**Verify**: all exit 0; test count ≥ 960, no new failures. (Known flake: a
date-sensitive recurring test documented in `plans/README.md` — if the ONLY
failure is `repositories.recurring.test.ts` "does not duplicate the seed
transaction…", note it and continue; it fails on `main` too on certain dates.)

## Test plan

No new tests required:
- Step 1 is behavior-preserving in every environment that has `randomUUID`
  (all supported ones); the fallback branch has no existing test and the
  existing `deviceIdentity.test.ts` (persistence, hydration) must stay green.
- Step 2 is CI config; GitHub validates it on push.
- Step 3 is a lockfile refresh gated by the worker's own 25-test suite.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `grep -rn "Math.random" src/state/deviceIdentity.ts` → 0 matches
- [ ] `grep -A2 "^permissions:" .github/workflows/ci.yml` → `contents: read`
- [ ] Step 3's version-check script exits 0 (all three packages at/above fixed versions everywhere in `worker/package-lock.json`)
- [ ] `npx tsc` exit 0; `npm run lint` exit 0; `npm test` green (modulo the documented date flake)
- [ ] `cd worker && npx tsc --noEmit && npm test` green
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The `uuid()` excerpt in "Current state" doesn't match the live file.
- `ci.yml` already contains a `permissions:` key anywhere (someone fixed it
  concurrently).
- Step 3's escalation (direct-dep bump within major) still leaves a `BAD` line.
- Worker tests fail after `npm update` — do NOT chase upstream breakage;
  report the failing test and the version delta instead.
- Any fix appears to require touching `release.yml`, root lockfile, or
  anything under `src-tauri/`.

## Maintenance notes

- After merge, the GitHub alerts don't close instantly: CodeQL alerts close on
  the next successful scan of `main`; Dependabot alerts close when the lockfile
  lands on the default branch. The **glib** alert stays open by design —
  operator should dismiss it ("no fix available; pinned by Tauri 2's gtk 0.18
  Linux stack") or leave it as a reminder for the next Tauri upgrade.
- The Security tab also shows a red **"CodeQL is reporting errors"** banner —
  that is a scanning-infrastructure problem this plan does not (cannot) fix
  from the repo; the operator should open the banner's status link once and
  see which language/job errors. If default-setup is trying to analyze Rust or
  Swift, disabling that language in the CodeQL config clears it.
- If a future workflow job needs to write (comment on PRs, upload SARIF),
  grant it per-job `permissions:` rather than widening the top-level block.
- Dependabot PR #13 (esbuild bump) becomes redundant once Step 3 lands — close
  it after merge.
