# Plan 229: Restore the DCA reminder on the dashboard — as a 待辦 source, books-scoped

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. On
> any STOP condition, stop and report — do not improvise. Do NOT update
> `plans/README.md` — the reviewer maintains the index.
>
> **Drift check (run first)**: `git diff --stat fd4af91f..HEAD -- src/domain/todoRows.ts src/domain/todoRows.test.ts src/routes/DashboardRoute.tsx`
> Mismatch with the excerpts below = STOP.

## Status

- **Priority**: P3 (polish on top of the re-enable; the tab itself is plan 228)
- **Effort**: S
- **Risk**: LOW (adds one source to a pure, tested merge helper)
- **Depends on**: **plan 228** (the DCA tab must be re-enabled + books-scoped
  first; this reuses the same scoping and links into the tab)
- **Category**: direction (feature re-enable, dashboard surface)
- **Planned at**: commit `fd4af91f`, 2026-07-18

## Why this matters

Commit `6b479416` removed a dashboard-level DCA reminder alongside the tab.
`docs/dca-decision.md` §3(7) calls for restoring it as part of finishing the
workflow. Rather than resurrect a separate card, this plan adds DCA due rules
as a **new source in the unified 待辦 list** — which plan 223's maintenance note
explicitly anticipated: *"If 待辦 later gains new item types (e.g. re-enabled
DCA reminders — plan 142 Option A), add them in `buildTodoRows` and they inherit
the 查看全部 path for free."* One source, correctly scoped, and it shows up in
both the compact card and the 查看全部 modal automatically.

## Current state

- `src/domain/todoRows.ts` — the pure merge (plan 223). Current `TodoRow.type`
  union and `TodoRowSources`:

  ```ts
  export type TodoRow = {
    key: string;
    type: "bill" | "card" | "recv" | "pay" | "income";
    name: string; sub: string; date: string; iso: string; amt: number;
    linkAccountId?: string; // "card" rows → reconcile route
    linkTxId?: string;      // "recv"/"pay" rows → cash-flow ledger
  };
  export interface TodoRowSources {
    bills: Array<{ id: string; entryType: string; merchant: string; category: string; accountId: string; nextRunDate: string; amount: number }>;
    cards: Array<{ accountId: string; name: string; dueDate: string; daysUntilDue: number; outstanding: number }>;
    settleItems: Array<{ id: string; kind: string; counterparty: string; name: string; date: string; amount: number; currency: string }>;
  }
  export function buildTodoRows(sources, accountName, toPrimary): TodoRow[] { ... sorts by iso ... }
  ```

- `src/routes/DashboardRoute.tsx`:
  - `:105` — the hidden-reminder comment inside `DASHBOARD_CARDS`:
    `// 定期定額提醒 hidden until the DCA workflow is finalised (see InvestmentsRoute).`
  - `:136` — `useFinanceData()` destructure; **note it destructures `recurring`
    (cash rules) but NOT `recurringInvestments`** — this plan adds it.
  - `:219` — `switcherAccountIds = bookAccountIdSet(accountRows, activeBookId)`
    (the exact scoping to reuse).
  - `:816-826` — the `upcoming` (cash bills) memo, books-scoped via
    `switcherAccountIds.has(r.accountId)`; the DCA source must mirror this
    30-day-horizon + active + book filter.
  - `todoRowsAll` memo (plan 223) builds `buildTodoRows({ bills: upcoming, cards: creditReminders, settleItems: settlements.items }, ...)` — grep `buildTodoRows(` to find it; the new source plugs in here.
  - The card's per-row link handling lives in `TodoRowItem` (grep it) — a `dca`
    row links to the DCA tab.

- Route target for a DCA row: `/investments?tab=recurring` (the tab plan 228
  re-enables; `InvestmentsRoute` reads `search.tab`).

- `RecurringInvestment` shape (`types.ts:353-374`): `accountId`, `ticker`,
  `name`, `mode`, `amount`, `quantity`, `price`, `fee`, `nextRunDate`,
  `isActive`. Per-period cash = `perPeriodCash` logic in
  `RecurringInvestmentsTab.tsx:24-26`: fixedShares → `quantity*price+fee`,
  else `amount+fee`.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0              |
| Lint      | `npm run lint`     | 0 errors / 761 warnings |
| One suite | `npx vitest run src/domain/todoRows.test.ts` | pass |
| Tests     | `npm test`         | prior + new pass    |

## Scope

**In scope**: `src/domain/todoRows.ts` (+ its test), `src/routes/DashboardRoute.tsx`.
**Out of scope**: `RecurringInvestmentsTab.tsx`, the repository, the post flow,
`ROADMAP.md`. Do NOT change the existing bill/card/settle source shapes or the
sort. Do NOT add a separate dashboard card (the whole point is reusing 待辦).

## Git workflow

- Branch: `feat/ai-dca-dashboard-reminder` off `main` (after 228 merges).
  Conventional commit. No push/merge.

## Steps

### Step 1: Add the `dca` source to the pure helper

In `src/domain/todoRows.ts`:
1. Extend the `TodoRow.type` union with `"dca"`.
2. Add to `TodoRowSources`:
   ```ts
   dcaRules: Array<{ id: string; name: string; ticker: string; accountId: string; nextRunDate: string; perPeriodCash: number }>;
   ```
3. In `buildTodoRows`, add a loop (before the final sort) mapping each dca rule:
   ```ts
   for (const d of sources.dcaRules) {
     rows.push({
       key: `dca-${d.id}`,
       type: "dca",
       name: d.name || d.ticker,
       sub: `定期定額 · ${accountName(d.accountId)}`,
       date: d.nextRunDate.slice(5),
       iso: d.nextRunDate,
       amt: -Math.abs(d.perPeriodCash),
       linkAccountId: d.accountId, // reused only for keying; the row links to the DCA tab in the UI
     });
   }
   ```
   Keep the existing three loops and the final
   `.sort((a, b) => a.iso.localeCompare(b.iso))` unchanged.

**Verify**: `npx tsc --noEmit` → 0 (every existing `buildTodoRows` caller now
needs a `dcaRules` field — that's DashboardRoute, updated in step 3; the test,
step 2).

### Step 2: Test the new source

In `src/domain/todoRows.test.ts` add: a dca rule interleaves by date with the
other sources; `amt` is negative `perPeriodCash`; `sub` shows 定期定額 + account
name; `key` is `dca-<id>`. Model after the existing cases. Every existing test
that constructs `TodoRowSources` must gain `dcaRules: []` (the type now requires
it) — update them minimally.

**Verify**: `npx vitest run src/domain/todoRows.test.ts` → all pass.

### Step 3: Wire the dashboard

In `DashboardRoute.tsx`:
1. `:136` — add `recurringInvestments` to the `useFinanceData()` destructure.
2. Build a books-scoped, 30-day-horizon due list mirroring `upcoming`
   (`:816-826`):
   ```tsx
   const upcomingDca = useMemo(() => {
     const d = new Date(); d.setDate(d.getDate() + 30);
     const horizon = todayInTimezone(timezone, d);
     const today = todayInTimezone(timezone);
     return (recurringInvestments.data ?? [])
       .filter((r) => r.isActive && r.nextRunDate >= today && r.nextRunDate <= horizon && switcherAccountIds.has(r.accountId))
       .map((r) => ({
         id: r.id, name: r.name, ticker: r.ticker, accountId: r.accountId, nextRunDate: r.nextRunDate,
         perPeriodCash: (r.mode === "fixedShares" ? (r.quantity || 0) * (r.price || 0) : (r.amount || 0)) + (r.fee || 0),
       }));
   }, [recurringInvestments.data, timezone, switcherAccountIds]);
   ```
   (The `perPeriodCash` expression is inlined from
   `RecurringInvestmentsTab.tsx:24-26` — keep it identical.)
3. Pass `dcaRules: upcomingDca` into the `buildTodoRows({ ... })` call.
4. In `TodoRowItem` (grep it in this file), add a branch for `row.type === "dca"`:
   link to `<Link to="/investments" search={{ tab: "recurring" }}>` wrapping the
   row (mirror how `card`/`recv`/`pay` rows wrap in `<Link>`); pick a dot color
   from `TODO_META` — add a `dca` entry to that map (grep `TODO_META`) using an
   accent/investment color consistent with the app (e.g. `var(--ns-accent)`).
5. Update the `:105` comment — remove "hidden until the DCA workflow is
   finalised", replace with a one-line note that DCA due rules now feed 待辦.

**Verify**: `npx tsc --noEmit` → 0.

### Step 4: Gates

**Verify**: `npm run lint` → 0 errors / 761 warnings; `npm test` → all pass.

## Test plan

Step 2's helper tests. Reviewer feel-check (dev data with a DCA rule due within
30 days — the plan-228 demo seed provides one): the 待辦 card shows a 定期定額
row; clicking it lands on 投資 → 定期定額 tab; switching books hides/shows it
with the same scoping as the tab; 查看全部 modal includes it.

## Done criteria

- [ ] `npx tsc --noEmit` 0 · `npm run lint` 0 errors / 761 warnings · `npm test` all pass with new todoRows dca test
- [ ] `grep -n '"dca"' src/domain/todoRows.ts` shows the union + loop
- [ ] `grep -n "upcomingDca\|recurringInvestments" src/routes/DashboardRoute.tsx` shows the source
- [ ] A dca row links to `/investments?tab=recurring`
- [ ] No files outside scope modified

## STOP conditions

- Plan 228 is NOT merged (no `recurring` tab exists to link to) — STOP; this
  plan depends on it.
- `buildTodoRows`'s signature/shape differs from the excerpt (drift).
- `TodoRowItem` or `TODO_META` can't be found in DashboardRoute (structure
  changed since plan 223) — report.

## Maintenance notes

- The scoping filter here MUST stay identical to plan 228's tab filter
  (`switcherAccountIds.has(rule.accountId)`) — if one changes, change both.
- A DCA row is informational (a reminder to post); it does not auto-post.
  Clicking navigates to the tab where the user taps 記錄本期投入. Keep it that
  way — auto-post is a separate, un-approved feature (docs/dca-decision.md §3.1).
