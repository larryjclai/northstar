# Plan 031: Render the missing pagination control in CashFlow 近期動態

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report. When done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 721f216f..HEAD -- src/routes/CashFlowRoute.tsx`
> Compare the "Current state" excerpts against the live code before proceeding;
> on a mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `721f216f`, 2026-06-19

## Why this matters

The operator reported: "交易紀錄沒有下一頁可以按，這樣如果當月比較多筆交易紀錄
的時候沒辦法看到完整的資訊."

In `CashFlowRoute.tsx`, the 近期動態 list already computes pagination state —
`page`, `pageSize = 50`, `totalPages`, and `paginatedRows` — but the JSX that
renders the list **never renders any page controls**. So only the first 50 rows
(`dayGroups`, built from `paginatedRows`) are ever reachable; rows 51+ are
silently invisible. The fix is to render the next/prev control that already
exists one route over (the investment Transactions page), wired to the
already-computed state.

## Current state

`src/routes/CashFlowRoute.tsx`:
- Pagination state already exists (lines 799–815):
  ```tsx
  const [page, setPage] = useState(1);
  const pageSize = 50;
  useEffect(() => { setPage(1); }, [dateRange, selectedAccount, selectedCategory, searchQuery]);
  // ...
  const displayRows = useMemo(() => mergeTransferRows(activityRows, ledgerRows), [activityRows, ledgerRows]);
  const totalPages = Math.ceil(displayRows.length / pageSize);
  const paginatedRows = useMemo(() => displayRows.slice((page - 1) * pageSize, page * pageSize), [displayRows, page]);
  const dayGroups = useMemo(() => groupByDay(paginatedRows, toPrimary), [paginatedRows, toPrimary]);
  ```
  (Note: `sortedRows` at line 806–810 is computed but unused — leave it alone;
  removing it is out of scope.)
- The list renders `dayGroups` inside a `<Card>` (lines 1134–1194). The relevant
  closing structure is:
  ```tsx
           ) : (
            dayGroups.map((g, gi) => (
              <div key={g.date}>
                ...
              </div>
            ))
           )}
        </Card>
  ```
  There is **no** pagination control between the `dayGroups.map(...)` and
  `</Card>`.
- **Exemplar to copy** — the investment Transactions page already renders the
  exact control this needs (`src/routes/TransactionsRoute.tsx:423–429`):
  ```tsx
  {totalPages > 1 && (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 12, marginTop: 24, marginBottom: 24 }}>
      <Button variant="outline" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>上一頁</Button>
      <span className="text-body" style={{ alignSelf: 'center', color: 'var(--ns-fg-muted)' }}>{page} / {totalPages}</span>
      <Button variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>下一頁</Button>
    </div>
  )}
  ```

**Conventions to match:** `Button` from `../components/coss/button` is already
imported in CashFlowRoute (`grep -n "components/coss/button" src/routes/CashFlowRoute.tsx`).
zh-TW labels 上一頁/下一頁. Reuse the exemplar's exact styling for visual
consistency between the two transaction lists.

## Commands you will need

| Purpose   | Command            | Expected         |
|-----------|--------------------|------------------|
| Typecheck | `npx tsc --noEmit` | exit 0           |
| Build     | `npm run build`    | exit 0           |
| Tests     | `npm run test`     | all pass         |
| Lint      | `npm run lint`     | exit 0, 0 errors |

## Scope

**In scope**: `src/routes/CashFlowRoute.tsx` only.

**Out of scope**:
- The unused `sortedRows` memo (line 806) — do not remove (separate cleanup).
- `pageSize` value — keep 50.
- The investment `TransactionsRoute.tsx` — already correct.

## Git workflow

- Branch: `git checkout -B advisor/031-cashflow-pagination main`.
- Single commit: `fix(cash-flow): render pagination control for 近期動態 list`.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Render the page control after the day-group list

Inside the 近期動態 `<Card>` in `CashFlowRoute.tsx`, immediately **after** the
`dayGroups.map(...)` block and **before** the closing `</Card>` (around line
1193), insert the control. To keep the empty-state and list branches clean, wrap
the existing `dayGroups.length === 0 ? (...) : (...)` ternary so the control
renders only on the populated branch. Target shape — replace the populated
branch's trailing structure with:

```tsx
           ) : (
            <>
              {dayGroups.map((g, gi) => (
                <div key={g.date}>
                  {/* ...unchanged... */}
                </div>
              ))}
              {totalPages > 1 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: 12, padding: '16px 20px 20px' }}>
                  <Button variant="outline" disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))}>上一頁</Button>
                  <span className="text-body" style={{ alignSelf: 'center', color: 'var(--ns-fg-muted)' }}>{page} / {totalPages}</span>
                  <Button variant="outline" disabled={page >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>下一頁</Button>
                </div>
              )}
            </>
           )}
```

Do not change anything inside the `dayGroups.map` body. Only wrap it in a
fragment and append the control.

**Verify**:
- `npx tsc --noEmit` → exit 0.
- `npm run build` → exit 0.

### Step 2: Manual verification (if the app can run)

`npm run dev` → 現金流. With the date scope set to a range containing **> 50**
display rows (the header shows `{displayRows.length} 筆` — pick "全部" or a wide
custom range on data with many rows), confirm:
- 上一頁/下一頁 buttons appear under the list.
- 下一頁 advances to page 2 and shows later rows; 上一頁 returns.
- Changing the search box or date scope resets to page 1 (the existing `useEffect`
  already does this).

If you cannot produce > 50 rows, lower `pageSize` to `2` **temporarily** to
confirm the control behaves, then restore it to `50` before committing.

## Test plan

This is a presentational wiring change to already-tested state. No new unit test
is required (the pagination math is trivial slicing). If a component test harness
for routes exists (`grep -rl "render(" src/routes/*.test.* 2>/dev/null`), a test
asserting the control appears when `displayRows.length > pageSize` is welcome but
optional. Primary verification is typecheck + build + manual.

## Done criteria

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run build` exits 0
- [ ] `npm run test` exits 0 (no regressions)
- [ ] `npm run lint` exits 0 with 0 errors
- [ ] The 近期動態 list shows 上一頁/下一頁 when `displayRows.length > 50`
- [ ] `pageSize` is back to `50` if it was changed for testing
- [ ] Only `src/routes/CashFlowRoute.tsx` modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

- The pagination state block (lines 799–815) no longer matches the excerpt
  (someone refactored it).
- `dayGroups`/`paginatedRows` are gone or restructured — re-derive the wiring
  from whatever state exists, but if it's unrecognizable, STOP and report.

## Maintenance notes

- Both transaction lists (this and `TransactionsRoute.tsx`) now use the same
  control shape; if one is restyled, restyle both.
- Pagination is by display-row count (50), and rows are grouped by day after
  slicing — so a single day can straddle a page boundary. That matches the
  investment page's behavior and is acceptable; note it for any reviewer who
  asks why a day appears on two pages.
