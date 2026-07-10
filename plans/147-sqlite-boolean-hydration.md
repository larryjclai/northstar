# Plan 147: Hydrate SQLite boolean columns to real booleans in list* mappers (divergence found by plan 126)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. SKIP updating `plans/README.md` — your reviewer
> maintains the index.
>
> **Drift check (run first)**: `git diff --stat af2e94a0..HEAD -- src/data/repositories.ts src/data/repositories.investments.test.ts`
> Written against main `af2e94a0`. If your worktree base is older, advance it
> (see dispatch preamble). Re-locate by grep on mismatch.

## Status

- **Priority**: P1
- **Effort**: S–M
- **Risk**: MED (touches SQLite read mappers used app-wide; the dual-repo
  harness from plan 126 is the safety net)
- **Depends on**: 126 (MERGED — the harness that proves memory↔SQLite parity)
- **Category**: bug
- **Planned at**: commit `af2e94a0`, 2026-07-09

## Why this matters

Plan 126's dual-repo harness surfaced a real, SQLite-only production bug: the
SQLite repository's `list*` methods `select` boolean columns raw, so SQLite
returns integer `0`/`1` while the memory repo (and the TypeScript types, e.g.
`InvestmentRecord.cashless?: boolean`) returns real JS booleans. Any code doing
a strict comparison — `record.cashless === true`, `row.isReviewed === false` —
silently misbehaves on the desktop/iOS build only (where SQLite runs), while
tests (memory twin) and the web dev shell look fine. Confirmed at
`repositories.ts` `listInvestmentRecords` (`cashless` selected raw); the same
raw-select pattern applies to every boolean column across the SQLite list
methods. This is the exact bug class the harness was built to catch.

## Current state

- `src/data/repositories.ts` — the SQLite `TauriSqlFinanceRepository` list
  methods build result objects from `select<...>()` rows with column aliases
  (e.g. `is_reviewed as isReviewed`, `cashless`, `is_shared_to_household as
  isSharedToHousehold`). Boolean columns come back as `0`/`1` (SQLite has no
  boolean type). Grep the boolean columns to enumerate them — start from the
  schema in `src/data/migrations.ts` (`CREATE TABLE` — look for columns
  semantically boolean: `is_reviewed`, `cashless`, `is_shared_to_household`,
  `is_active`, and any others named `is_*`/`has_*` or documented boolean) and
  cross-reference the domain types in `src/domain/types.ts` (fields typed
  `boolean` / `boolean | undefined`).
- The divergence is pinned (not hidden) in
  `src/data/repositories.investments.test.ts` (~line 46-50):
  ```ts
  // DIVERGENCE (see executor report): SQLite's list* methods return integer 0/1 ...
  const expectedCashless = repoLabel === "sqlite" ? 1 : true;
  ```
  After this fix, both repos return `true`, so these pins must become plain
  `true`.
- Parity harness: `src/data/repositories.testHarness.ts` (`describeEachRepo`).
- Insert side: the SQLite `insert*`/`create*` methods write booleans — check
  whether they store `1/0`, `true/false`, or rely on SQLite coercion; the read
  fix must round-trip whatever is stored. (SQLite stores JS `true` as `1`
  typically via the driver; verify against an actual inserted-then-read value.)

## Commands you will need

| Purpose   | Command        | Expected on success |
|-----------|----------------|---------------------|
| Typecheck | `npx tsc`      | exit 0              |
| Tests     | `npm test`     | all pass (915)      |
| Targeted  | `npm test -- repositories.investments` | pass |
| Lint      | `npm run lint` | exit 0              |

## Scope

**In scope**:
- `src/data/repositories.ts` — the SQLite list/read mappers, hydrating each
  boolean column to a real boolean (`col === 1` / `Boolean(col)` / a small
  `toBool()` helper local to the SQLite class)
- `src/data/repositories.investments.test.ts` — replace the divergence pins
  with `true` for both repos (the fix makes them agree)
- Any other converted suite that pins the SAME boolean divergence (grep
  `DIVERGENCE` across `src/data/*.test.ts` — plan 126's report said only
  `cashless` in investments, but confirm)

**Out of scope**:
- The memory repo (already correct).
- Insert/write paths — only change them if the round-trip proves a stored
  value the read fix can't interpret (then note it); do not refactor writes.
- Non-boolean columns; number/string parsing.
- The harness itself.

## Git workflow

- Branch: `fix/ai-sqlite-boolean-hydration`
- Commit: `fix(repo): hydrate SQLite boolean columns to real booleans in list mappers`
- Do NOT push or merge to `main`.

## Steps

### Step 1: Enumerate the boolean columns and their list methods

Produce the list (schema ∩ boolean-typed domain fields) and, for each, the
SQLite `list*`/read method(s) that return it. Put this inventory in your
report. Cross-check each against the memory repo's shape to confirm the target
is `boolean`.

### Step 2: Hydrate on read

In each SQLite read mapper, convert the raw column to a boolean. Prefer a
single private helper on the SQLite class, e.g. `private toBool(v: unknown):
boolean { return v === 1 || v === true; }`, applied per boolean field when
constructing the returned object. Preserve `undefined`/nullable semantics
where the type is `boolean | undefined` (a NULL column → `undefined`, not
`false`, IF the memory repo does that — match the memory repo exactly; verify
by reading how the memory twin represents the same field).

**Verify**: `npm test -- repositories.investments` → the `cashless` assertions
now expect `true` for BOTH repos.

### Step 3: Remove the now-obsolete divergence pins

Change the pinned sites to assert `true` for both repos and delete the
`// DIVERGENCE` comments (grep to be sure none remain for booleans).

**Verify**: `grep -rn "DIVERGENCE" src/data/*.test.ts` → 0 (or only non-boolean
divergences, if any remain — report them).

### Step 4: Full gates

**Verify**: `npx tsc` → exit 0; `npm test` → 915 pass; `npm run lint` → exit 0.

## Test plan

The plan-126 harness already exercises these list methods against both repos;
removing the pins turns them into true parity assertions. If a boolean column
is NOT covered by any converted suite, add one assertion to the nearest
relevant suite (e.g. assert `isReviewed` on a listed ledger row after
`setReviewed`) so the parity is locked. Confirm the count stays 915 (or rises
by the assertions you add).

## Done criteria

- [ ] Every SQLite-returned boolean column is a real JS boolean (inventory in
      report, each hydrated)
- [ ] No `DIVERGENCE` comment for a boolean remains in `src/data/*.test.ts`
- [ ] `npx tsc`, `npm test` (≥915), `npm run lint` all green
- [ ] Only `repositories.ts` + the affected test files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

- A boolean column's memory-repo representation is itself inconsistent
  (sometimes boolean, sometimes not) — report; the target is "match the
  memory repo", and if the memory repo is ambiguous that's a separate finding.
- The insert path stores a boolean in a form the read helper can't interpret
  (e.g. a string) — report the stored value; do not silently broaden the
  helper to accept everything.
- Hydrating a column changes an existing (non-parity) test's expectation —
  STOP and report which; it may reveal code that depended on the `0/1`.

## Maintenance notes

- New SQLite boolean columns must be hydrated in their read mapper — the
  harness will now fail the parity assertion if they aren't (that's the point).
- Reviewer: confirm nullable booleans (`boolean | undefined`) round-trip to
  the SAME value the memory repo yields, not a coerced `false`.
