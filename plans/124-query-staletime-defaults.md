# Plan 124: Stop refetching all local-SQLite queries on every window focus

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 65fe04c1..HEAD -- src/main.tsx src/data/hooks.ts`
> On mismatch with the excerpts, STOP.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW–MED (stale-UI risk if any mutation forgets to invalidate)
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `65fe04c1`, 2026-07-09

## Why this matters

The app's data source is **local SQLite** that only changes through the app's
own mutations (which explicitly invalidate React Query keys) and through sync
(which also invalidates). Yet the shared `QueryClient` uses defaults
(`staleTime: 0`, `refetchOnWindowFocus: true`), so every webview focus refires
all 12 data-list queries — including the full ledger, years of daily prices,
and daily FX — as concurrent SELECTs on the serialized `plugin-sql` pool (the
documented `db-locked` contention source). The refetches can never observe
anything the invalidations didn't already deliver.

## Current state

`src/main.tsx:11`:

```ts
const queryClient = new QueryClient();
```

`src/data/hooks.ts` — `useRepository` alone sets `staleTime: Infinity`; the 12
data queries in `useFinanceData` (accounts, ledger, assets, investments,
recurring, recurringInvestments, quotes, settings, dailyFxRates, dailyPrices,
financialGoals, manualPriceSnapshots) set none. `useFinanceData` is mounted
app-wide via `AppShell`, so all stay active for the whole session.

Invalidation exemplar: grep `invalidateQueries` in `src/data/hooks.ts` and
`src/features/connect/sync/` — mutations and the sync-apply path both
invalidate the relevant keys. Verify this before Step 1 (the fix's safety
rests on it): list every mutation hook in `hooks.ts` and confirm each
invalidates the keys of the entities it writes. Also find how the sync pull
triggers refresh (grep `invalidateQueries` under `src/features/connect/`) —
if sync does NOT invalidate, that is a STOP condition.

## Commands you will need

| Purpose   | Command        | Expected on success |
|-----------|----------------|---------------------|
| Typecheck | `npx tsc`      | exit 0              |
| Tests     | `npm test`     | all pass (~831)     |
| Lint      | `npm run lint` | exit 0              |

## Scope

**In scope**: `src/main.tsx` (QueryClient defaults) only. `src/data/hooks.ts`
only if a per-query exception is genuinely needed (see Step 2).

**Out of scope**: adding/removing invalidations in mutation hooks (if you find
a missing one, STOP and report it — it's a bug in its own right); market-data
refresh cadence (`src/features/market-data/` manages quote freshness itself).

## Git workflow

- Branch: `fix/ai-query-staletime`
- Commit: `perf(query): staleTime Infinity + no focus refetch for local-first data`
- Do NOT push or merge to `main`.

## Steps

### Step 1: Verify the invalidation contract

For each mutation hook in `src/data/hooks.ts`, note which query keys it
invalidates. Confirm sync-apply invalidates broadly (many implementations
invalidate all keys). Record the mapping in your report. If any write path
lacks invalidation for a key it changes → STOP.

### Step 2: Set client defaults

```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
```

`retry: 1` keeps the current default-ish resilience without 3× retries on a
local DB. If Step 1 found queries whose data changes outside the invalidation
contract (candidates: `quotes` if market refresh writes without invalidating —
verify), give ONLY those an explicit shorter `staleTime` at their `useQuery`
site rather than weakening the global default.

**Verify**: `npx tsc` → exit 0; `npm test` → all pass.

### Step 3: Manual smoke in the dev shell

Run `npm run dev`, open the app, add a ledger transaction, and confirm the
list + balances update immediately (invalidations doing their job). Blur and
refocus the window; confirm no full reload flash. If a preview tool is
available use it; otherwise note "manual smoke pending operator" in the report.

## Test plan

No new unit tests (configuration change); the safety argument is Step 1's
audit + existing suite green.

## Done criteria

- [ ] QueryClient has `staleTime: Infinity` + `refetchOnWindowFocus: false`
- [ ] Step 1 invalidation audit recorded in the executor report
- [ ] Mutations still refresh their lists (smoke-checked)
- [ ] `npm test`, `npx tsc`, `npm run lint` green
- [ ] `plans/README.md` updated

## STOP conditions

- Any mutation/sync path writes an entity without invalidating its key.
- `quotes`/market data turn out to rely on focus refetch for freshness (then
  scope them out with a per-query override and report).

## Maintenance notes

- New mutations MUST invalidate their keys — with `staleTime: Infinity` a
  forgotten invalidation is now a stale-UI bug instead of being masked by
  focus refetches. Consider noting this rule in AGENTS.md's gotchas (one line)
  as part of the commit.
- Reviewer: check the settings query too — theme/density changes flow through
  it.
