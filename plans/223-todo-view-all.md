# Plan 223: 待辦「查看全部」— no todo (信用卡帳單/週期/未結清) is ever silently unreachable

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. Do NOT update `plans/README.md` — the reviewer
> maintains the index.
>
> **Drift check (run first)**: `git diff --stat 3b857c73..HEAD -- src/routes/DashboardRoute.tsx`
> On any change since `3b857c73`, compare the "Current state" excerpts
> against live code; mismatch = STOP.

## Status

- **Priority**: P1 (operator-reported live: a credit-card bill they needed to
  reconcile was invisible)
- **Effort**: M
- **Risk**: LOW-MED (display/aggregation only — no financial math changes; the
  merge logic moves into a tested pure helper)
- **Depends on**: none
- **Category**: bug (discoverability regression from plan 164's merge)
- **Planned at**: commit `3b857c73`, 2026-07-17

## Why this matters

Plan 164 merged three dashboards surfaces (upcoming recurring bills, credit-card
payment reminders, unsettled AR/AP) into one 待辦 card — but the merge stacked
THREE silent truncations with no "view all" escape:

1. recurring bills: 30-day horizon **capped at 5** before the merge,
2. AR/AP: **capped at 5** before the merge,
3. the merged, date-sorted list: **capped at 6 rows total**.

A credit-card reminder whose 繳款日 is later than the 6 nearest-dated items
never renders — and with it goes the card's one-click link to that account's
對帳 page. That is exactly what the operator hit: they went to do 信用卡對帳 and
the bill they needed wasn't anywhere on screen. The only other reconcile entry
is a small per-account icon on 帳戶 (`AccountsRoute.tsx:496`), which they had no
reason to know about. Fix: the card keeps its compact 6-row pulse, but gains a
「查看全部」 entry opening the complete, uncapped list — every todo reachable,
always.

## Current state

All in `src/routes/DashboardRoute.tsx` (the only source file this plan touches
besides the new domain helper + test):

- `:816-826` — upcoming recurring bills, horizon 30 days, `.slice(0, 5)`:

  ```tsx
  const upcoming = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    const horizon = todayInTimezone(timezone, d);
    const today = todayInTimezone(timezone);
    return recurringRows
      .filter((r) => r.isActive && r.nextRunDate >= today && r.nextRunDate <= horizon && switcherAccountIds.has(r.accountId))
      .sort((a, b) => a.nextRunDate.localeCompare(b.nextRunDate))
      .slice(0, 5);
  }, [recurringRows, timezone, switcherAccountIds]);
  ```

- `:828-831` — credit reminders, `buildCreditCardReminders(...).filter((r) => r.daysUntilDue <= 45)` — no count cap (the 45-day filter is a semantic window, keep it).
- `:852-894` — `todoRows` memo: maps `upcoming` → `bill`/`income` rows,
  `creditReminders` → `card` rows (with `linkAccountId`),
  `settlements.items.slice(0, 5)` → `recv`/`pay` rows (with `linkTxId`), then
  `return rows.sort((a, b) => a.iso.localeCompare(b.iso)).slice(0, 6);`
- `:125-146` — the `TodoRow` type + `TODO_META` (dot colors per type).
- `:1745-1800` — `TodoCard({ rows, totalDue })`: header ("To-do" eyebrow +
  「待辦 · 30 天」 + overdue-total Badge), then per-row markup; `card` rows wrap
  in `<Link to="/cash-flow/reconcile/$accountId" params={{ accountId: row.linkAccountId }}>`,
  `recv`/`pay` rows in `<Link to="/cash-flow" search={{ tx: row.linkTxId }}>`.
- `:1322` — the card's mount: `<TodoCard rows={todoRows} totalDue={todoTotalDue} />`.
- `soonestTodo`/pulse strip (`:938`, `:959-961`) reads `todoRows[0]` — the
  6-row capped list must keep feeding it (first row is unaffected by caps).

Repo conventions to follow:
- Overlays use `ModalShell` (`src/components/ModalShell.tsx`, 17 call sites) —
  render-prop `dismiss`, `motion` handled internally (center on desktop,
  bottom-sheet on mobile). Exemplar of a simple list-in-modal: the 帳本管理
  modal in `src/components/BookSwitcher.tsx` region or any small ModalShell
  user; match one.
- Pure list-building logic extracted to `src/domain/` with tests — exemplars:
  `src/domain/cashFlowGrouping.ts` (plan 169), `src/routes/holdingDetailToday.ts`
  (plan 166). Domain files must not import from `data/` or React.
- This file hardcodes zh-TW copy directly in TSX (the copy.csv workflow applies
  to migrated surfaces like onboarding, not here) — write zh-TW strings inline,
  matching neighbors.

## Commands you will need

| Purpose   | Command            | Expected on success |
|-----------|--------------------|---------------------|
| Typecheck | `npx tsc --noEmit` | exit 0              |
| Lint      | `npm run lint`     | 0 errors / 762 warnings |
| Tests     | `npm test`         | 1338 + new pass     |

## Scope

**In scope**:
- `src/domain/todoRows.ts` (create) + `src/domain/todoRows.test.ts` (create)
- `src/routes/DashboardRoute.tsx`

**Out of scope** (do NOT touch):
- `ReconcileRoute.tsx` — the reconcile page itself is fine; the bug is reach.
- `buildCreditCardReminders` / `settlements` derivations and every window
  semantic (30d recurring / 45d credit / all unsettled) — unchanged.
- `AccountsRoute.tsx`'s per-account 對帳 button.
- Financial math of any kind.

## Git workflow

- Branch: `fix/ai-todo-view-all` off `main`. Conventional commits
  (e.g. `fix: 待辦 gains 查看全部 — uncapped todo list modal (plan 223)`).
  No push/merge.

## Steps

### Step 1: Extract the merge into a pure helper

Create `src/domain/todoRows.ts`. Move the `TodoRow` type (from
`DashboardRoute.tsx:129-144`) and the merge logic out of the `todoRows` memo
into:

```ts
export interface TodoRowSources {
  bills: Array<{ id: string; entryType: string; merchant: string; category: string; accountId: string; nextRunDate: string; amount: number }>;
  cards: Array<{ accountId: string; name: string; dueDate: string; daysUntilDue: number; outstanding: number }>;
  settleItems: Array<{ id: string; kind: string; counterparty: string; name: string; date: string; amount: number; currency: string }>;
}

/** Full date-sorted merge — NO caps. Callers slice for the compact card. */
export function buildTodoRows(
  sources: TodoRowSources,
  accountName: (accountId: string) => string,
  toPrimary: (amount: number, currency: string) => number | null,
): TodoRow[]
```

Body = the existing three loops (`DashboardRoute.tsx:853-892`) verbatim, minus
`settlements.items.slice(0, 5)` (use all items) and minus the final
`.slice(0, 6)`. Keep the exact same row shapes, `key` prefixes, sign
conventions (`isIncome ? +| : -`), `sub` strings (`繳款日 … · 還有 … 天`), and
sort. Type the source arrays structurally (as above) so the domain file needs
no imports from `data/`.

**Verify**: `npx tsc --noEmit` → may fail until step 3 rewires; proceed to
step 2 first if it does.

### Step 2: Test the helper

Create `src/domain/todoRows.test.ts` (model after `src/domain/cashFlowGrouping`'s
test style). Cases:
1. Merge + sort: one of each source type interleaves by date ascending.
2. **The regression this plan fixes**: 7 bills nearer-dated than 1 card → the
   card row IS in the output (no cap drops it), positioned last.
3. Income bill gets `+` amount, expense bill negative; card row carries
   `linkAccountId`; recv/pay rows carry `linkTxId`.
4. `toPrimary` returning null falls back to the raw amount (existing
   `?? item.amount` behavior).

**Verify**: `npx vitest run src/domain/todoRows.test.ts` → all pass.

### Step 3: Rewire the dashboard

In `DashboardRoute.tsx`:
1. Remove `.slice(0, 5)` from the `upcoming` memo (`:825`) — the 30-day +
   switcher-scope filters stay.
2. Replace the `todoRows` memo body with:
   ```tsx
   const todoRowsAll = useMemo(
     () => buildTodoRows(
       { bills: upcoming, cards: creditReminders, settleItems: settlements.items },
       (id) => accountMap.get(id)?.name ?? "",
       toPrimary,
     ),
     [upcoming, creditReminders, settlements, accountMap, toPrimary],
   );
   const todoRows = useMemo(() => todoRowsAll.slice(0, 6), [todoRowsAll]);
   ```
   Delete the now-local `TodoRow` type/`TODO_META` only if moved wholesale to
   the domain file and re-imported (keep `TODO_META` where the JSX needs it —
   moving the type is required, the meta map may stay).
3. `todoTotalDue` (`:895`) now sums over `todoRows` as before (the CARD's
   badge stays a summary of what the card shows — unchanged expression).

Behavioral delta (accepted, it is the fix): the card's 6 rows are now the 6
nearest-dated of the FULL pool — previously a 6th-nearest bill could be
excluded by the per-source cap of 5.

**Verify**: `npx tsc --noEmit` → 0.

### Step 4: The 查看全部 entry + modal

1. `TodoCard` signature → `{ rows, totalDue, totalCount, onViewAll }`. After
   the mapped rows, when `totalCount > rows.length`, render a full-width footer
   button (ghost, matching the card's row padding):
   `查看全部 {totalCount} 筆 →`, `onClick={onViewAll}`.
2. In the dashboard body, add `const [todoAllOpen, setTodoAllOpen] = useState(false);`
   and mount (next to the card, `:1322`):
   ```tsx
   <TodoCard rows={todoRows} totalDue={todoTotalDue} totalCount={todoRowsAll.length} onViewAll={() => setTodoAllOpen(true)} />
   ```
3. New modal (a small component in the same file, matching this file's
   component style), mounted after the card grid:
   ```tsx
   {todoAllOpen ? (
     <ModalShell onClose={() => setTodoAllOpen(false)} ...match an existing ModalShell call site's props...>
       {/* title: 全部待辦 · N 筆 — subtitle discloses the windows:
           「未來 30 天週期交易 · 45 天內信用卡繳款 · 全部未結清」 */}
       {/* body: todoRowsAll rendered with the SAME row markup as TodoCard */}
     </ModalShell>
   ) : null}
   ```
   To avoid duplicating the row JSX, extract TodoCard's row renderer into a
   module-level `TodoRowItem({ row })` component (the markup at `:1758-1795`
   verbatim, including the per-type `Link` wrapping) and use it in BOTH the
   card and the modal. Links inside the modal navigate away from the dashboard,
   which unmounts the modal — that is fine; add no extra close handling.
4. Keep the header's overdue Badge as-is.

**Verify**: `npx tsc --noEmit` → 0; `npm run lint` → 0 errors / 762 warnings.

### Step 5: Full gates

**Verify**: `npm test` → 1338 + new todoRows tests pass.

## Test plan

Step 2's four pure-helper tests carry the logic. The modal/card are jsdom-hostile
UI — reviewer feel-check instead: with demo data, (a) the 待辦 card shows ≤6 rows
+ a 查看全部 footer when more exist; (b) the modal lists EVERY item including a
credit-card row whose 繳款日 is beyond the card's 6; (c) clicking that card row
navigates to `/cash-flow/reconcile/<accountId>`; (d) 未結清 rows link into
`/cash-flow?tx=…`; (e) Escape / scrim closes the modal (ModalShell built-ins).

## Done criteria

- [ ] `npx tsc --noEmit` 0 · `npm run lint` 0 errors / 762 warnings · `npm test` all pass with ≥4 new todoRows tests
- [ ] `grep -n "slice(0, 5)" src/routes/DashboardRoute.tsx` → no hits in the upcoming/settlements todo paths (other unrelated slices may exist — check context)
- [ ] `src/domain/todoRows.ts` exists; `DashboardRoute.tsx` imports `buildTodoRows` and `TodoRow` from it
- [ ] The card still renders ≤6 rows; `todoRowsAll` is uncapped
- [ ] No files outside scope modified

## STOP conditions

- The `todoRows` memo at `:852-894` doesn't match the excerpt (drift).
- `ModalShell`'s current props don't accept a simple children-based list modal
  the way its other call sites show (read 2 call sites first; if all 17 are
  radically different from what step 4 sketches, report instead of inventing).
- Moving `TodoRow` to the domain file forces an import from `data/` (it must
  not — the type is plain strings/numbers today).

## Maintenance notes

- The pulse strip's `soonestTodo` reads `todoRows[0]` — after step 3 it reads
  the same nearest-dated row (slice(0,6) preserves order); a future change that
  re-sorts the card must keep index 0 = soonest.
- If 待辦 later gains new item types (e.g. re-enabled DCA reminders — plan 142
  Option A), add them in `buildTodoRows` and they inherit the 查看全部 path
  for free; never add a per-source cap again without a view-all.
- Deferred deliberately: badge/count on the card header for hidden items
  (the footer count covers it), and any redesign of ReconcileRoute itself.
