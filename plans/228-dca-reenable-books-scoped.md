# Plan 228: Re-enable the DCA (定期定額/定股) tab, books-scoped

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. On
> any STOP condition, stop and report — do not improvise. Do NOT update
> `plans/README.md` — the reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat fd4af91f..HEAD -- src/routes/InvestmentsRoute.tsx src/routes/RecurringInvestmentsTab.tsx ROADMAP.md src/data/demoData.ts`
> Mismatch with the excerpts below = STOP.

## Status

- **Priority**: P2 (operator chose Option A — finish & re-enable; see `docs/dca-decision.md`)
- **Effort**: M
- **Risk**: MED (unhides a synced feature; the books-scoping filter is the load-bearing correctness piece)
- **Depends on**: none
- **Category**: direction (feature re-enable)
- **Planned at**: commit `fd4af91f`, 2026-07-18

## Why this matters

DCA was built, tested, then hidden (commit `6b479416`) pending a "finalize the
workflow" decision. `docs/dca-decision.md` (plan 142 spike, operator-approved)
made the call: **Option A — rework & re-enable**. The posting mechanism is
fully implemented and tested (8/8 on both storage backends); two of the three
"open questions" (reminder-vs-auto-post, amount-vs-shares) turned out already
resolved in shipped code. This plan does the mechanical re-enable **plus the
one correctness requirement**: the tab's rule list must be **books-scoped** —
operator decision 2026-07-17, "公司帳 view never shows 個人帳 rules and vice
versa (反之亦然)". Without the filter, re-enabling would leak every book's DCA
rules into every book view. (Stale-price handling and the dashboard reminder
are separate plans 230 and 229; fractional-share rounding is an open operator
decision — see the index.)

## Current state

- `src/routes/InvestmentsRoute.tsx:478-496` — tabs array WITHOUT 定期定額 and
  the hide comment:

  ```tsx
  {/* Page-level tabs: 持倉 | 交易紀錄 | 分析.
      定期定額 (recurring DCA) is hidden until the workflow is finalised; the
      tab + dashboard reminder are removed while the underlying data and
      RecurringInvestmentsTab component stay intact for re-enabling later. */}
  <div className="ns-page-tabs" style={{ ... }}>
    {[
      { id: 'portfolio', label: '持倉', active: tab === 'portfolio' },
      { id: 'transactions', label: '交易紀錄', active: tab === 'transactions' },
      { id: 'analytics', label: '分析', active: tab === 'analytics' },
    ].map(t => ( ... ))}
  </div>
  ```

  The `tab` union already includes `"recurring"` (`:64,68,74`), the render
  branch already exists (`:552` `{tab === "recurring" ? <RecurringInvestmentsTab /> : null}`),
  the import is live (`:54`). Only the array entry + comment need changing.

- `src/routes/RecurringInvestmentsTab.tsx:47` — data:
  `const { recurringInvestments, accounts } = useFinanceData();`
  `:76` `const rules = recurringInvestments.data ?? [];` — the list is UNSCOPED;
  every rule renders regardless of active book. Consumers: `:132` monthlyTotal,
  `:146` active-count header, `:156` empty check, `:164` `rules.map`.

- Books-scoping precedent to copy exactly — `src/routes/DashboardRoute.tsx`:
  - `:62` `import { bookAccountIdSet, ... } from "../domain/bookScope";`
  - `:151` `const activeBookId = useUiPreferences((state) => state.activeBookId);`
  - `:219` `const switcherAccountIds = useMemo(() => bookAccountIdSet(accountRows, activeBookId), [accountRows, activeBookId]);`
  - `:798-806` the cash-recurring filter: `.filter((r) => r.isActive && ... && switcherAccountIds.has(r.accountId))`
  `bookAccountIdSet(accounts, "all")` returns EVERY account id (總帳 shows all —
  see `src/domain/bookScope.ts:38`), so the filter is correct in 總帳 too.

- `RecurringInvestment.accountId` is the settlement account (`types.ts:356`),
  and accounts carry `bookId` — so `switcherAccountIds.has(rule.accountId)` is
  the right scoping key (identical to the cash-rule precedent).

- `ROADMAP.md:131`:
  `- **定期定額 / 定股（DCA）重做** — 功能已先**隱藏**（commit `6b479416`），程式碼仍在。重新啟用前需釐清排程語意與 UI；待方向定案後重做再開。`
  and `:27` lists `DCA 重做（已暫時隱藏）` in a pending-features line.

- `src/data/demoData.ts:539` — `recurringInvestments: [],` (empty; the
  re-enabled tab would show the empty state in demo mode).

- Fee field: `RecurringInvestmentsTab.tsx:289` is a plain manual number input
  with NO auto-fill logic (verified — plan 118's overwrite bug cannot reproduce
  here). `postRecurringInvestment` (`repositories.ts:1915`) calls the mutation
  directly, NOT through `InvestmentsAddSheet` — so the fee is never touched by
  that sheet's auto-fill effect. This plan adds a regression test locking that in.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0              |
| Lint      | `npm run lint`     | 0 errors / 761 warnings |
| Tests     | `npm test`         | 1373 + new pass     |
| One suite | `npm test -- recurring-investments` | pass |

## Scope

**In scope**:
- `src/routes/InvestmentsRoute.tsx` (tabs array + comment)
- `src/routes/RecurringInvestmentsTab.tsx` (books-scope the rules list)
- `src/data/repositories.recurring-investments.test.ts` (fee-preservation regression test)
- `ROADMAP.md` (flip the DCA line)
- `src/data/demoData.ts` (one seed rule)

**Out of scope** (do NOT touch):
- The dashboard DCA reminder — that's plan 229 (adds DCA to `buildTodoRows`).
- Stale reference-price handling at post time — plan 230.
- Fractional-share rounding — needs an operator decision (index); don't touch
  `recurringInvestmentToDraft`'s `amount / price` math.
- The post/create/update/delete repository methods — unchanged, already tested.
- `README.md` — has no DCA mention to restore (plan 139 territory).

## Git workflow

- Branch: `feat/ai-dca-reenable` off `main`. Conventional commit, e.g.
  `feat: re-enable DCA tab, books-scoped (plan 228)`. No push/merge.

## Steps

### Step 1: Books-scope the rules list

In `RecurringInvestmentsTab.tsx`, mirror the Dashboard precedent:
1. Add imports: `bookAccountIdSet` from `../domain/bookScope`,
   `useUiPreferences` from `../state/uiPreferences` (check existing imports
   first — `useFinanceData` is already imported at `:11`).
2. `useFinanceData()` at `:47` — also destructure `books` if the scope set
   needs it (it does NOT — `bookAccountIdSet` takes `(accounts, activeBookId)`;
   confirm signature at `bookScope.ts:38`). Read `activeBookId`:
   `const activeBookId = useUiPreferences((state) => state.activeBookId);`
3. Build the set and filter:
   ```tsx
   const switcherAccountIds = useMemo(
     () => bookAccountIdSet(accounts.data ?? [], activeBookId),
     [accounts.data, activeBookId],
   );
   const rules = useMemo(
     () => (recurringInvestments.data ?? []).filter((r) => switcherAccountIds.has(r.accountId)),
     [recurringInvestments.data, switcherAccountIds],
   );
   ```
   (Replaces the plain `:76` `const rules = recurringInvestments.data ?? [];`.
   `useMemo` may already be imported; add it if not.)
4. `openCreate` (`:79`) defaults the new rule's account to
   `investmentAccounts[0]` — leave as-is, but note that a rule created while a
   book is active will belong to that book via its account. No extra change.

**Verify**: `npx tsc --noEmit` → 0.

### Step 2: Re-add the tab

`InvestmentsRoute.tsx:483-486` — add the 定期定額 entry between 交易紀錄 and 分析
(chronological/logical order matching the old layout):

```tsx
{ id: 'portfolio', label: '持倉', active: tab === 'portfolio' },
{ id: 'transactions', label: '交易紀錄', active: tab === 'transactions' },
{ id: 'recurring', label: '定期定額', active: tab === 'recurring' },
{ id: 'analytics', label: '分析', active: tab === 'analytics' },
```

Replace the hide comment (`:478-481`) with a plain description:
`{/* Page-level tabs: 持倉 | 交易紀錄 | 定期定額 | 分析. */}`

**Verify**: `npx tsc --noEmit` → 0.

### Step 3: Fee-preservation regression test

In `src/data/repositories.recurring-investments.test.ts`, add a test asserting
`postRecurringInvestment` preserves the rule's stored `fee` into the created
`InvestmentRecord` — locking down that the post path never routes through
`InvestmentsAddSheet`'s auto-fill (plan 118's bug class). Model after the
file's existing `describeEachRepo`/post tests. Assert: create a rule with
`fee: 15`, post it, find the resulting investment record, expect its `fee === 15`.

**Verify**: `npm test -- recurring-investments` → all pass (existing 8 + new).

### Step 4: ROADMAP + demo seed

- `ROADMAP.md:131` → change to a shipped note, e.g.
  `- **定期定額 / 定股（DCA）** — 已重新啟用（plan 228，books-scoped）。參考價過期提醒見 plan 230。`
  and `:27` — remove `DCA 重做（已暫時隱藏）、` from the pending line.
- `src/data/demoData.ts:539` — seed ONE plausible rule so the demo tab isn't
  empty. Match the `RecurringInvestment` shape (see `types.ts:353-374`): a
  fixedAmount monthly 0050.TW buy from a demo investment account. Use an
  existing demo investment account id from the same file (grep the file for an
  `type: "investment"` account's id) and a `nextRunDate` a few days ahead of
  the demo's base date. If no demo investment account exists, STOP and report
  (seeding against a nonexistent account would break the scope filter).

**Verify**: `npx tsc --noEmit` → 0.

### Step 5: Gates

**Verify**: `npm run lint` → 0 errors / 761 warnings; `npm test` → 1373 + new pass.

## Test plan

Step 3's fee-preservation test. Reviewer feel-check (dev server, demo data):
定期定額 tab appears between 交易紀錄 and 分析; the seeded demo rule shows; switch
the book switcher to a different book → the rule disappears (books-scoping);
switch to 總帳 → it reappears; create/edit/post/delete still work.

## Done criteria

- [ ] `npx tsc --noEmit` 0 · `npm run lint` 0 errors / 761 warnings · `npm test` all pass + new fee test
- [ ] `grep -n "定期定額" src/routes/InvestmentsRoute.tsx` shows the tab entry
- [ ] `grep -n "switcherAccountIds" src/routes/RecurringInvestmentsTab.tsx` shows the filter
- [ ] `grep -n "已暫時隱藏" ROADMAP.md` → no match on line 27 (removed)
- [ ] Demo tab non-empty (one seeded rule)
- [ ] No files outside scope modified

## STOP conditions

- `bookAccountIdSet`'s signature differs from `(accounts, activeBookId)` — read
  `bookScope.ts` and report.
- The `tab` union at InvestmentsRoute.tsx doesn't already contain `"recurring"`
  (would mean the render branch was also removed — bigger re-wire than this plan).
- `demoData.ts` has no `type: "investment"` account to attach a seed rule to.

## Maintenance notes

- Reviewer: confirm the books filter uses `rule.accountId` (the settlement
  account), not some other id — the scoping key must be an account that carries
  a `bookId`.
- Plan 229 adds DCA due rules to the dashboard 待辦 (`buildTodoRows`), reusing
  the SAME `switcherAccountIds` scoping — keep the two filters semantically
  identical.
- Plan 230 (stale-price) and the fractional-share operator decision both touch
  the post flow; this plan deliberately leaves that math untouched.
