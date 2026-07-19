# Plan 232: DRIP partial-sync-arrival guard — `incompleteDripGroupIds` in the data-health report

> **Executor instructions**: Follow this plan step by step. Run every
> verification command. On any STOP condition, stop and report. Do NOT update
> `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 4f9356fa..HEAD -- src/domain/ledgerTrust.ts src/domain/types.ts`
> Mismatch with the excerpts below = STOP.

## Status

- **Priority**: P3 (transient display wrongness, self-heals on next pull — not corruption)
- **Effort**: S
- **Risk**: LOW (additive report field, pure function + tests)
- **Depends on**: none
- **Category**: correctness (sync partial-arrival)
- **Planned at**: commit `4f9356fa`, 2026-07-19

## Why this matters

Sync applies records one-by-one (LWW, no group-atomic apply). A DRIP posting is
a PAIR of `InvestmentRecord` rows sharing one `dripGroupId` (cash dividend +
reinvestment buy — `src/data/repositories.ts:1639-1643`). A device that pulls
one leg before its sibling transiently shows wrong cost-basis/XIRR until the
other arrives. Transfers and splits already have guards
(`incompleteTransferGroupIds`, `incompleteSplitGroupIds` — both in
`src/domain/ledgerTrust.ts`); DRIP has none. This adds the mirror guard so the
data-health report (dashboard banner + 設定/帳戶 surfaces) discloses the
half-arrived state instead of silently showing bad numbers.

## Current state

- `src/domain/ledgerTrust.ts:163-166` — the two existing guards feeding the
  report object:

  ```ts
  incompleteTransferGroupIds: [...transferGroups.entries()]
    .filter(([, rows]) => rows.filter((row) => row.entryType === "transfer").length !== 2)
    .map(([groupId]) => groupId),
  incompleteSplitGroupIds: incompleteSplitGroupIds(ledger),
  ```

  (These sit inside the report-building function — read the whole function to
  see how `investments` rows already flow in: `orphanInvestmentIds` at
  `:160-162` filters `investments`, so the array is already a parameter.)
- `src/domain/types.ts:309` — `dripGroupId?: string | null` on
  `InvestmentRecord`.
- `incompleteSplitGroupIds` (`ledgerTrust.ts:180-186`) is the structural
  exemplar: Map-count then filter — copy its shape.
- Report consumers that render issue messages: grep
  `incompleteTransferGroupIds` in `src/routes/AccountsRoute.tsx` and
  `src/routes/settings/GeneralSection.tsx` — mirror however each maps the
  transfer/split guards to zh-TW message rows (and check
  `DashboardRoute.tsx`'s data-health banner issue list the same way).
- Tests: `src/domain/ledgerTrust.test.ts` (the split-guard tests at `:93-113`
  are the pattern).

## Commands

| Purpose   | Command            | Expected |
|-----------|--------------------|----------|
| Typecheck | `npx tsc --noEmit` | 0        |
| Lint      | `npm run lint`     | 0 errors / 761 warnings |
| One suite | `npx vitest run src/domain/ledgerTrust.test.ts` | pass |
| Tests     | `npm test`         | 1392 + new pass |

## Scope

**In scope**: `src/domain/ledgerTrust.ts` (+ test), `src/domain/types.ts`
(report-type field if the report interface lives there — follow the type),
the 2–3 consumer files ONLY for the new message row.
**Out of scope**: sync apply logic (no group-atomic apply — that's the
accepted architecture); fee-leg/installment guards (spike judged them benign);
repositories.

## Steps

1. Add to `ledgerTrust.ts`, modeled on `incompleteSplitGroupIds`:
   ```ts
   /** DRIP partial-group guard: a DRIP posting is exactly 2 InvestmentRecords
    *  sharing a dripGroupId; a lone active leg = half-arrived sync. */
   export function incompleteDripGroupIds(investments: InvestmentRecord[]): string[]
   ```
   Count active (`deletedAt === null`) rows per `dripGroupId` (skip null);
   flag counts `!== 2` — NOTE the difference from splits: a DRIP group with 3+
   legs is also malformed, so use `!== 2` (the transfer guard's rule), not `=== 1`.
2. Wire `incompleteDripGroupIds: incompleteDripGroupIds(investments)` into the
   report next to the other two; extend the report's TypeScript interface.
3. Message rows in each consumer, mirroring the transfer wording style, e.g.
   「N 筆股利再投入紀錄不完整（同步中，稍後會自動補齊）」 — copy the exact
   phrasing pattern of the existing transfer/split messages in each file.
4. Tests (ledgerTrust.test.ts): complete pair → not flagged; lone leg →
   flagged; 3 legs sharing an id → flagged; `dripGroupId: null` rows ignored;
   tombstoned sibling → flagged (deleted leg doesn't count).

**Verify** after each: tsc 0; suite pass; full gates at the end.

## Done criteria

- [ ] Gates green, ≥4 new guard tests
- [ ] `grep -n "incompleteDripGroupIds" src` shows guard + report + consumers
- [ ] No files outside scope modified

## STOP conditions

- The report-building function doesn't already receive `investments` (would
  need signature plumbing beyond the listed scope — report the callers).
- Consumers render issues via a shared component where one message row
  addition would duplicate — describe instead of guessing.

## Maintenance notes

- If installments/fee legs ever need the same guard, generalize into one
  `incompleteGroupIds(rows, keyFn, expectedCount)` — deliberately not done now
  (three call sites is the threshold).
