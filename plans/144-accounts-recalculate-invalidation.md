# Plan 144: Fix the missing `assets` invalidation after 帳戶重新計算 (AccountsRoute.recalculate)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 65fe04c1..HEAD -- src/routes/AccountsRoute.tsx src/data/repositories.ts src/routes/settings/GeneralSection.tsx`
> On a content mismatch with the excerpts below, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `65fe04c1`, 2026-07-09
- **Provenance**: surfaced by the plan-124 executor's mandatory invalidation
  audit (2026-07-09) and confirmed by the reviewer against the code. Plan 124
  now depends on this.

## Why this matters

`recalculateDerivedData()` recomputes AND persists BOTH account balances and
`portfolioAssets`, then returns a report that even counts
`report.changedAssets`. But `AccountsRoute.recalculate()` only refetches the
`accounts` query — it never invalidates `assets`. So after a user runs 帳戶
重新計算 from the Accounts page, corrected holding values are persisted to the
DB but the Dashboard/Investments `assets` query keeps serving stale data until
some unrelated invalidation fires. Today this is partly masked by React
Query's default `refetchOnWindowFocus: true`; plan 124 turns that off
(correctly, for a local-first app), which would make the staleness stick for
the whole session. The sibling call site already does this right, so the fix
is to match it.

## Current state

`src/routes/AccountsRoute.tsx` — `recalculate()` (~lines 228–241):

```tsx
  async function recalculate() {
    setRecalculating(true);
    setMessage("");
    try {
      const repository = await getFinanceRepository();
      const report = await repository.recalculateDerivedData();
      await accounts.refetch();
      setMessage(`重新計算完成：修正 ${report.changedAccounts} 個帳戶、${report.changedAssets} 個持倉。...`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "重新計算失敗。");
    } finally {
      setRecalculating(false);
    }
  }
```

`recalculateDerivedData()` (`src/data/repositories.ts` ~line 1344) recomputes
and persists both entities:

```ts
  async recalculateDerivedData(): Promise<RecalculationReport> {
    const beforeAccounts = this.data.accounts;
    const beforeAssets = this.data.portfolioAssets;
    this.recompute();
    const report = buildRecalculationReport(/* accounts + assets before/after */);
    await this.persist();
    return report;
  }
```

The correct sibling pattern — `src/routes/settings/GeneralSection.tsx:257-258`
runs the identical call and follows it with a global invalidation:

```tsx
      const report = await repository.recalculateDerivedData();
      await queryClient.invalidateQueries();
```

Note how `GeneralSection` obtains `queryClient` (it imports and calls
`useQueryClient()` from `@tanstack/react-query` — grep the top of that file to
confirm the exact import + hook call, and replicate it in `AccountsRoute`).

## Commands you will need

| Purpose   | Command        | Expected on success |
|-----------|----------------|---------------------|
| Typecheck | `npx tsc`      | exit 0              |
| Tests     | `npm test`     | all pass (~831)     |
| Lint      | `npm run lint` | exit 0              |

## Scope

**In scope**:
- `src/routes/AccountsRoute.tsx` — only the `recalculate()` function.

**Out of scope**:
- `recalculateDerivedData()` / `repositories.ts` — the recompute is correct;
  only the UI refresh is wrong.
- `GeneralSection.tsx` — already correct; do not touch.
- Every other mutation/invalidation in the app — the plan-124 audit confirmed
  the rest of the contract holds. Do NOT "harden" other call sites here.
- `InvestmentsRoute.createSnapshot/deleteSnapshot` — investigated and found
  CORRECT (custom-asset valuation re-derives from the invalidated
  `manualPriceSnapshots` query); do not change it.

## Git workflow

- Branch: `fix/ai-accounts-recalc-invalidation`
- Commit: `fix(accounts): invalidate assets after 重新計算 so holdings refresh`
- Do NOT push or merge to `main`.

## Steps

### Step 1: Replace the narrow refetch with a global invalidation

In `AccountsRoute.recalculate()`, obtain a `queryClient` via `useQueryClient()`
at the component top level (mirror `GeneralSection`), and replace
`await accounts.refetch();` with `await queryClient.invalidateQueries();`.

Rationale for global (not just adding `["assets"]`): `recalculateDerivedData`
can touch accounts, assets, and — transitively through `recompute()` — any
derived list; the sibling call site already chose global invalidation, so
matching it keeps the two 重新計算 entry points consistent. If you prefer the
minimal change, invalidating exactly `["accounts"]` and `["assets"]` is
acceptable ONLY if you verify `recompute()` changes nothing else a query
serves — the global call is the safer match and is what GeneralSection does.

**Verify**: `npx tsc` → exit 0.

### Step 2: Full gates

**Verify**: `npm test` → all pass; `npm run lint` → exit 0.

## Test plan

No new unit test is required for a one-line invalidation wiring change (there
is no existing test harness that renders AccountsRoute with a live
QueryClient, and adding one exceeds this fix's value). The safety argument:
the change makes AccountsRoute match the already-correct GeneralSection call
site verbatim. If you can add a cheap assertion without new scaffolding, do;
otherwise state in your report that no test was added and why.

## Done criteria

- [ ] `AccountsRoute.recalculate` invalidates `assets` (via global
      `invalidateQueries()` or an explicit key list including `assets`)
- [ ] `grep -n "accounts.refetch()" src/routes/AccountsRoute.tsx` no longer
      appears inside `recalculate` (replaced)
- [ ] `npx tsc`, `npm test`, `npm run lint` all green
- [ ] No files outside `src/routes/AccountsRoute.tsx` modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- `recalculate()` no longer matches the excerpt.
- `useQueryClient` turns out not to be usable here (e.g. the component isn't
  under the QueryClientProvider — extremely unlikely, it renders inside the
  app shell) — report instead of improvising.

## Maintenance notes

- After this lands, plan 124 (QueryClient `staleTime: Infinity` +
  `refetchOnWindowFocus: false`) is safe to execute — this was its one
  blocking prerequisite.
- Reviewer: confirm the toast message still renders (it uses `report`, which
  is unaffected).
