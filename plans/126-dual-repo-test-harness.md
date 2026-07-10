# Plan 126: Run the money-path repository suites against BOTH implementations (memory + SQLite)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 65fe04c1..HEAD -- src/data/`
> This plan mostly ADDS test infrastructure; drift in `repositories.ts`
> matters only where factory signatures changed.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: LOW to add; MED that it exposes real SQLite bugs (that is the point)
- **Depends on**: plans/119 (fixes two known divergences the harness would
  otherwise flag on day one — land 119 first or expect those exact failures)
- **Category**: tests
- **Planned at**: commit `65fe04c1`, 2026-07-09

## Why this matters

`TauriSqlFinanceRepository` — the implementation desktop/iOS users actually
run — overrides ~70 methods of `BrowserFinanceRepository` with hand-written
SQL, but every money-path test suite instantiates ONLY the memory twin. A
green suite proves the parallel JS implementation works, not the product.
This repo has already shipped SQLite-only bugs (commit `ca05a6bc`: browser
account-adoption missing a revision bump; commit `b809449d`: SQLite UNIQUE
crash on sync). Parametrizing the existing suites over both factories turns
every future divergence into a test failure instead of a production sync bug.

## Current state

Factories in `src/data/repositories.ts`:

- `createMemoryFinanceRepositoryForTests` (~line 412) → `BrowserFinanceRepository`
- `createSqliteFinanceRepositoryForTests` (~line 418) → SQLite repo. Read its
  implementation FIRST: find what fake/driver it uses (only
  `repositories.sqlite-tx.test.ts` and `repositories.sync.test.ts` use it —
  read both to learn setup/teardown, whether it needs `initialize()`, and any
  per-test DB reset pattern).

Suites currently memory-only (factory-call counts verified):

| Suite | factory calls |
|---|---|
| repositories.installments.test.ts | 6 |
| repositories.investments.test.ts | 9 |
| repositories.ledger-fee.test.ts | 4 |
| repositories.postdate.test.ts | 3 |
| repositories.recurring.test.ts | 7 |
| repositories.recurring-investments.test.ts | 5 |
| repositories.refund.test.ts | 3 |
| repositories.deleteAccount.test.ts | 3 |

## Commands you will need

| Purpose   | Command        | Expected on success |
|-----------|----------------|---------------------|
| Tests     | `npm test`     | all pass            |
| One suite | `npm test -- repositories.refund` | pass |
| Typecheck | `npx tsc`      | exit 0              |
| Lint      | `npm run lint` | exit 0              |

## Scope

**In scope**:
- New helper `src/data/repositories.testHarness.ts` (name it to match repo
  conventions) exporting a `describeEachRepo(...)` / factory-table utility
- The 8 suite files above — converted to run per-factory
- `src/data/repositories.ts` ONLY if a factory needs a signature tweak (e.g.
  async reset) — keep any change additive

**Out of scope**:
- Fixing divergences the harness reveals (report them; each becomes its own
  plan — EXCEPT trivial test-hygiene issues like a test hard-coding an id
  format that differs between repos, which you may adapt in the test).
- `repositories.sqlite-tx.test.ts` / `repositories.sync.test.ts` (already
  SQLite-aware).
- CI config (plan 128).

## Git workflow

- Branch: `feat/ai-dual-repo-test-harness`
- Commit per suite conversion after the harness commit; conventional style:
  `test(repo): run refund suite against memory + sqlite`
- Do NOT push or merge to `main`.

## Steps

### Step 1: Read the SQLite test factory and prove a hello-world

Read `createSqliteFinanceRepositoryForTests` and the two existing SQLite
suites. Write a throwaway test that creates the SQLite repo, adds one account
+ one transaction, lists them back. This establishes: does it run in jsdom,
does it need `initialize()`, how is isolation between tests achieved, how fast
is it (time it — if a single create-and-list exceeds ~2s, note it; the whole
converted matrix must stay under ~2 minutes locally).

**Verify**: the throwaway test passes; record timing in the report; then
delete it or fold it into the harness's own test.

### Step 2: Build the harness

```ts
// repositories.testHarness.ts
export const repoFactories = [
  ["memory", createMemoryFinanceRepositoryForTests],
  ["sqlite", createSqliteFinanceRepositoryForTests],
] as const;

export function describeEachRepo(
  name: string,
  body: (makeRepo: () => Promise<FinanceRepository> /* match real return type */) => void,
) {
  describe.each(repoFactories)(`${name} [%s]`, (_label, factory) => body(/* adapt */));
}
```

Adapt to the factories' REAL signatures (sync vs async, args). If the SQLite
factory needs per-test cleanup, bake it into the harness (`beforeEach`).

**Verify**: `npx tsc` → exit 0.

### Step 3: Convert suites one at a time

Order (least → most likely to hit divergences): refund → ledger-fee →
postdate → installments → deleteAccount → investments → recurring →
recurring-investments. For each: wrap with `describeEachRepo`, run, and
triage failures:

- Test-hygiene mismatch (id formats, ordering assumptions) → adapt the test
  to assert order-independently.
- REAL behavioral divergence → do NOT fix the repo; add
  `it.skip`/`it.fails` for the SQLite variant with a comment
  `// DIVERGENCE: <one line> — see executor report`, and list it in your
  report with the exact assertion diff.

Commit after each green suite.

**Verify per suite**: `npm test -- repositories.<suite>` → pass (with any
divergence rows explicitly marked, not silently green).

### Step 4: Full gates + timing

**Verify**: `npm test` → all pass; total wall time reported. If the matrix
pushed the suite beyond ~2 minutes, note which suites dominate (candidate for
a `TEST_SQLITE=1` env gate — propose, don't implement).

## Test plan

This plan IS the test plan. Success = the 8 suites execute 2× with zero
silent skips.

## Done criteria

- [ ] `describeEachRepo` harness exists with both factories
- [ ] All 8 suites run against both repos; `npm test` green
- [ ] Every SQLite-divergence is either fixed by plan 119's scope, adapted as
      test hygiene, or explicitly marked + reported — none silently skipped
- [ ] Suite wall time recorded in the report
- [ ] `plans/README.md` updated (list any DIVERGENCE items as new findings)

## STOP conditions

- The SQLite test factory can't run under vitest/jsdom at all (Step 1 fails)
  — report what it needs; the fallback design (a wasm/sql.js driver or a
  node-sqlite adapter) is a separate decision.
- More than ~5 real divergences surface — stop converting, report the list;
  the fix batch needs its own planning pass.
- A suite conversion requires changing production repository code.

## Maintenance notes

- New repository tests should use `describeEachRepo` by default; consider a
  one-line note in AGENTS.md gotchas.
- Plan 125 (recompute scoping) and plan 127 (migration tests) both lean on
  this harness existing.
- Reviewer: check no converted test quietly narrowed its assertions to make
  SQLite pass.
