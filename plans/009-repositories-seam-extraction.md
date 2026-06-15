# Plan 009: Map the `repositories.ts` god module and extract one seam (design + proof)

> **Executor instructions**: This is a DESIGN + FIRST-SEAM plan, NOT a
> big-bang split. Your deliverable is (1) a written structure map and (2) ONE
> extracted module behind the unchanged `FinanceRepository` interface — then
> STOP for review. Do not split the rest of the module in this plan. Run every
> verification command. If anything in "STOP conditions" occurs, stop and
> report. When done, update the status row in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 9115a2b5..HEAD -- src/data`
> If `repositories.ts` or its tests changed since this plan was written,
> re-map (Step 1) against the live file before extracting.

## Status

- **Priority**: P3
- **Effort**: L
- **Risk**: MED
- **Depends on**: none (existing `repositories.*.test.ts` suites are the safety net)
- **Category**: tech-debt / architecture
- **Planned at**: commit `9115a2b5`, 2026-06-15

## Why this matters

`src/data/repositories.ts` is 4772 lines — it defines the `FinanceRepository` interface and
implements every entity's CRUD (accounts, ledger, installments, transfers, recurring
transactions, recurring investments, portfolio assets, investment records, market quotes,
FX rates, daily prices, manual price snapshots, financial goals) plus snapshot import/export,
sync apply/collect/conflict resolution, and derived-data recompute. Every data change means
navigating this one file, and reviewing it is expensive. The goal is to make it tractable —
but a naive split is dangerous because **all methods mutate a single shared `this.data`
object and call a fan-out `this.recompute()`** (see "Current state"). So this plan does the
safe first move: map the real structure, then extract exactly one low-entanglement seam as a
proof-of-pattern, keeping the public interface and behavior byte-identical. The remaining
groups become follow-up plans once the seam pattern is proven.

## Current state

Construction & shape (verified at `9115a2b5`):
- `FinanceRepository` is an interface (`src/data/repositories.ts:204-295`) — the public
  contract consumed across the app (e.g. `src/routes/DashboardRoute.tsx`, `data/hooks.ts`).
- `interface RepositoryData` (`~src/data/repositories.ts:336-352`) is one object holding all
  entity arrays + settings + `syncConflicts`.
- `class BrowserFinanceRepository implements FinanceRepository` (`src/data/repositories.ts:501`)
  holds `private data: RepositoryData` and a `storageKey`; **every method mutates `this.data`
  then calls `this.recompute()` and `this.persist()`**. This shared mutable state is the core
  entanglement — a group of methods cannot simply move to a new class without a shared
  reference to `data` + the recompute/persist hooks.
- Entry points: `getFinanceRepository()` (`:355`, memoized singleton), and test factories
  `createMemoryFinanceRepositoryForTests()` (`:360`) and
  `createSqliteFinanceRepositoryForTests(db)` (`:366`); `createFinanceRepository()` (`:372`)
  loads `sqlite:northstar.db`.
- Existing test safety net (in `src/data/`): `repositories.investments.test.ts`,
  `repositories.installments.test.ts`, `repositories.ledger-fee.test.ts`,
  `repositories.recurring.test.ts`, `repositories.recurring-investments.test.ts`,
  `repositories.refund.test.ts`, `repositories.sqlite-tx.test.ts`, `repositories.sync.test.ts`.
  These exercise the public interface and must keep passing unchanged.

Recommended first seam — **market-data persistence** (the least entangled group): the
methods `listMarketQuotes` / `saveMarketQuotes`, `listDailyFxRates` / `saveDailyFxRates` /
`getDailyFxRate`, `listDailyPrices` / `saveDailyPrices` / `getDailyPrice`, and
`listManualPriceSnapshots` / `createManualPriceSnapshot` / `deleteManualPriceSnapshot`
(interface lines ~265–277). These read/write `data.marketQuotes`, `data.dailyFxRates`,
`data.dailyPrices`, `data.manualPriceSnapshots`. Step 1 must confirm whether any of them
trigger `this.recompute()` — that determines the extraction shape.

Repo conventions: TypeScript strict; pure helpers live in `src/domain/`; the repository is the
SQLite↔memory bridge. Match the existing file's style (private methods, `bump()`/`active()`
helpers, `nowIso()`).

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Repo tests | `npx vitest run src/data` | all pass |
| Full suite | `npx vitest run` | all pass (≥409) |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Line count | `wc -l src/data/repositories.ts` | (track the reduction) |
| Find recompute calls | `grep -n "this.recompute\|recompute(" src/data/repositories.ts` | the fan-out sites |

## Scope

**In scope**:
- `docs/repositories-refactor-plan.md` (create — the structure map + seam roadmap)
- `src/data/repositories.ts` (modify — delegate the one extracted group)
- `src/data/marketDataStore.ts` (create — the extracted seam) *(name may change per Step 2)*
- `src/data/marketDataStore.test.ts` (create — direct unit tests for the extracted module)

**Out of scope** (do NOT touch in this plan):
- Any entity group **other than** the chosen market-data seam — accounts, ledger, recurring,
  investments, portfolio assets, goals, sync, snapshot. Leave them in `repositories.ts`.
- The `FinanceRepository` **interface** — it must remain byte-identical so no caller changes.
- `recompute()` / `persist()` semantics and any behavior change.
- `src/data/hooks.ts`, routes, or any consumer — they must not need edits.

## Git workflow

- Branch: `advisor/009-repositories-seam`.
- Commit: `refactor(data): extract market-data persistence from repositories.ts`.
- Do NOT push or open a PR unless the operator instructs it.

## Steps

### Step 1: Map the module (write `docs/repositories-refactor-plan.md`)

Read `repositories.ts` and document, with line ranges:
- the entity groups and which `RepositoryData` arrays each touches;
- which methods call `this.recompute()` and what `recompute()` fans out to (use the grep);
- shared private helpers the groups depend on (`bump`, `active`, id creation, `persist`,
  any row-mapping helpers);
- a proposed extraction order for ALL groups (market-data first, then the next least
  entangled), noting which groups are tightly bound to `recompute()` and therefore hardest.

This map is a required deliverable even before any code moves.

### Step 2: Confirm the market-data seam is safe to extract

From the map, confirm the market-data methods do **not** participate in cost-basis/balance
`recompute()` (they persist quotes/prices/FX/snapshots; valuation reads them later but the
*writes* shouldn't trigger asset recompute). If any market-data write DOES call
`this.recompute()`, the seam is more entangled than expected — STOP and report; pick the next
candidate from the Step 1 map only with operator agreement.

### Step 3: Extract the seam behind the interface

Create `src/data/marketDataStore.ts` exporting a small object/class that operates on the
relevant slices. Use **delegation, not duplication**: the store receives a reference to the
shared data slices (and `persist`) so behavior is identical. The `BrowserFinanceRepository`
keeps the same public methods but delegates their bodies to the new module. The
`FinanceRepository` interface and all method signatures stay identical.

Target shape (illustrative — match the file's actual data access):

```ts
// src/data/marketDataStore.ts
export function createMarketDataStore(ctx: {
  data: Pick<RepositoryData, "marketQuotes" | "dailyFxRates" | "dailyPrices" | "manualPriceSnapshots">;
  persist: () => Promise<void>;
  // + any shared helpers the moved methods need (e.g. createId, nowIso)
}) {
  return {
    listMarketQuotes() { /* moved body, reads ctx.data.marketQuotes */ },
    async saveMarketQuotes(quotes, source) { /* moved body; await ctx.persist() */ },
    // …FX, daily prices, snapshots…
  };
}
```

In `repositories.ts`, construct the store with the shared `this.data` + `this.persist` and
delegate (e.g. `listMarketQuotes() { return this.marketData.listMarketQuotes(); }`).

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 4: Run the existing repo suites (behavior must be unchanged)

**Verify**: `npx vitest run src/data` → all pass; then `npx vitest run` → all pass (≥409),
with **no test file edited**. If any assertion changes result, the extraction altered
behavior — STOP and report.

### Step 5: Add direct tests for the extracted module

Create `src/data/marketDataStore.test.ts` covering the moved methods directly (save→list
round-trip for quotes/FX/prices, `getDailyPrice`/`getDailyFxRate` lookup, snapshot
create/delete). Model structure on `src/data/repositories.investments.test.ts`.

**Verify**: `npx vitest run src/data/marketDataStore.test.ts` → all pass.

### Step 6: STOP for review

Do not extract any further group. Confirm `wc -l src/data/repositories.ts` dropped, leave the
follow-up extraction order in `docs/repositories-refactor-plan.md`, and hand back.

## Test plan

- Regression gate: the unchanged `src/data/repositories.*.test.ts` suites (must stay green —
  proves the public behavior is identical after delegation).
- New: `src/data/marketDataStore.test.ts` (direct unit tests for the extracted module),
  structured like `repositories.investments.test.ts`.

## Done criteria

ALL must hold:

- [ ] `docs/repositories-refactor-plan.md` exists with the structure map + full extraction order
- [ ] `src/data/marketDataStore.ts` exists; the market-data methods delegate to it
- [ ] `FinanceRepository` interface unchanged; no consumer (`src/routes/**`, `src/data/hooks.ts`) edited
- [ ] `src/data/marketDataStore.test.ts` passes
- [ ] `npx tsc --noEmit` exits 0; `npx vitest run` all pass (≥409 + new), **no existing test edited**
- [ ] `wc -l src/data/repositories.ts` is lower than 4772
- [ ] Only in-scope files modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report (do not improvise) if:

- A market-data write method participates in `recompute()` (Step 2) — the seam is entangled;
  do not force it.
- Any existing `repositories.*.test.ts` changes pass/fail result after the extraction.
- Extraction appears to require changing the `FinanceRepository` interface or any consumer.
- You find yourself tempted to extract a second group — that is explicitly a separate plan.

## Maintenance notes

- This is the proof-of-pattern for an incremental decomposition. Once reviewed, each
  follow-up group (accounts, ledger, recurring, investments, sync) gets its own plan that
  reuses the delegation shape — never a single big-bang rewrite of all 4772 lines.
- The hardest groups are those bound to `recompute()` (assets/ledger/investments); the
  Step 1 map should call them out so they're sequenced last, with extra characterization
  tests added first if their current coverage is thin.
- A reviewer should verify the extraction is pure delegation (no behavior change), the public
  interface is identical, and the shared-state reference (not a copy) is passed into the store
  so persistence and derived data stay consistent.
