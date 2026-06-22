# Plan 054: Paginate the investment 交易紀錄 by 50 transactions/page (match the ledger)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report. When done, update this
> plan's row in `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 8f2e90bd..HEAD -- src/routes/TransactionsRoute.tsx src/routes/CashFlowRoute.tsx`
> If these changed since this plan was written, compare the "Current state"
> excerpts against live code before proceeding; on a mismatch, treat it as a STOP
> condition.

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: LOW–MED (changes a render/grouping path; data untouched)
- **Depends on**: none
- **Category**: bug (UX)
- **Planned at**: commit `8f2e90bd`, 2026-06-21

## Why this matters

Operator-reported: 投資的交易紀錄沒有分頁 — the investment transaction-records list
has no working pagination, and they want it to match the bookkeeping (記帳) list
at **50 records per page**.

Root cause (confirmed in code): the investment 交易紀錄 tab renders
`<TransactionsRoute />` (`InvestmentsRoute.tsx:456`). `TransactionsRoute` groups
transactions by **month** into `groupedTx`, then paginates the **groups** at
`pageSize = 50` (`TransactionsRoute.tsx:240-248`). Since there are almost never
50 month-groups, `totalPages` is 1 and the 上一頁/下一頁 control never appears —
so the whole list renders on one page. The ledger (`CashFlowRoute`) instead
paginates **flat transactions** at 50/page and groups *within* the page. This
plan makes `TransactionsRoute` do the same.

## Current state

`src/routes/TransactionsRoute.tsx` (the investment records list; reused as the
investment 交易紀錄 tab and also at `/transactions`):

```ts
// groupedTx is grouped by month: monthKey = row.date.slice(0, 7)   (~line 181)
const [page, setPage] = useState(1);
const pageSize = 50;                                                  // line 241
// …
const paginatedGroups = useMemo(
  () => groupedTx.slice((page - 1) * pageSize, page * pageSize),      // line 247  ← slices GROUPS
  [groupedTx, page]);
const totalPages = Math.ceil(groupedTx.length / pageSize);           // line 248  ← groups, not rows
// render: paginatedGroups.map(group => …)                            (~line 406)
// 上一頁 / page/totalPages / 下一頁 control gated on totalPages > 1   (~line 423-427)
```

The **ledger pattern to match** (`src/routes/CashFlowRoute.tsx:817-832`):

```ts
const [page, setPage] = useState(1);
const pageSize = 50;
useEffect(() => { setPage(1); }, [dateRange, selectedAccount, selectedCategory, searchQuery]);
const displayRows = useMemo(() => mergeTransferRows(activityRows, ledgerRows), [...]);
const totalPages = Math.ceil(displayRows.length / pageSize);          // ← FLAT ROWS
const paginatedRows = useMemo(() => displayRows.slice((page - 1) * pageSize, page * pageSize), [displayRows, page]);
const dayGroups = useMemo(() => groupByDay(paginatedRows, toPrimary), [paginatedRows, toPrimary]); // group WITHIN page
```

i.e. paginate the flat transaction list first (50/page), then group the *current
page's* rows for display headers.

### Conventions to follow

- Match the ledger exactly: **50 flat transactions per page**, then group the
  page's rows by month for the sub-headers (`TransactionsRoute` groups by month;
  keep month headers, just compute them from the current page's slice).
- Reset to page 1 when the filters change (the ledger does this via the `useEffect`
  on its filter deps — `TransactionsRoute` has its own filters, e.g. the
  investment-account filter at line 254; reset on those).
- The 上一頁/下一頁 control already exists (line 423-427) — it just needs
  `totalPages` to be row-based so it shows up. Reuse it as-is.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | all pass |
| Lint | `npm run lint` | exit 0 (0 errors) |
| Build | `npm run build` | exit 0 |
| Dev server (visual) | `npm run dev` | serves on 127.0.0.1 |

## Scope

**In scope:**
- `src/routes/TransactionsRoute.tsx` — change pagination from per-group to
  per-transaction (50 rows/page), regroup the page's rows by month for headers,
  reset page on filter change.

**Out of scope (do NOT touch):**
- `CashFlowRoute.tsx` — it's the reference, already correct.
- The investment data / `UnifiedTx` construction (the merge of investment records
  + brokerage cash transfers at lines 104-160) — unchanged; you only change how
  the already-built unified list is paginated/grouped for display.
- `InvestmentsRoute.tsx` — it just embeds `<TransactionsRoute />`; no change there.

## Git workflow

- Branch from current main: `git checkout -B advisor/054-invest-records-pagination main`.
- Match the repo's short imperative commit style. Do NOT push/PR unless told.

## Steps

### Step 1: paginate flat transactions, group within the page
In `TransactionsRoute.tsx`, mirror the ledger: build the flat sorted unified-tx
list, compute `totalPages = Math.ceil(flatRows.length / 50)`, slice the page,
then build the month groups from the **paginated slice** (not the full list).
Render those page-local month groups where `paginatedGroups.map(...)` is today.
Add a `useEffect` resetting `page` to 1 when the filter(s) change.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: visual check
Run the dev server with demo data (which has 200+ records). Open 投資 → 交易紀錄
(and `/transactions`). Confirm: 50 transactions show per page, month sub-headers
are correct within the page, and 上一頁/下一頁 appears and pages correctly.

**Verify**: screenshot showing the pagination control + ~50 rows; changing pages
works; `preview_console_logs` clean.

### Step 3: full verification
**Verify**: `npx tsc --noEmit` exit 0; `npm test` all pass; `npm run lint` 0
errors; `npm run build` exit 0.

## Test plan

- This is render-grouping logic; if you extract the "paginate flat then group by
  month" into a small pure helper, add a unit test for it (51 rows across 2
  months → page 1 has 50 rows in the right month buckets, page 2 has 1;
  `totalPages === 2`). Otherwise verify visually per Step 2.
- The existing test suite must stay green (the data/import paths are untouched).

## Done criteria

ALL must hold:

- [ ] 投資 → 交易紀錄 shows 50 transactions per page with working 上一頁/下一頁
- [ ] Month sub-headers are computed from the current page's rows (correct within
      each page)
- [ ] Page resets to 1 when filters change
- [ ] `npx tsc --noEmit` exits 0; `npm test` all pass; `npm run lint` 0 errors;
      `npm run build` exits 0
- [ ] Only `src/routes/TransactionsRoute.tsx` modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the cited lines doesn't match the excerpts (drift since `8f2e90bd`).
- `TransactionsRoute` turns out NOT to be what the investment 交易紀錄 tab renders
  (verify `InvestmentsRoute.tsx:456` still does `<TransactionsRoute />`) — if a
  dedicated records component was introduced, re-point this plan at it and report.
- Regrouping within the page produces a month header split across two pages in a
  confusing way that the operator should weigh in on (it's acceptable for a month
  to span pages, exactly like the ledger's days do — but flag if it looks wrong).

## Maintenance notes

- For the reviewer: confirm the unit changed from *groups* to *transactions*
  (totalPages now row-based) and the data construction is untouched.
- If the ledger's `pageSize` ever changes, consider sharing a constant so both
  lists stay aligned (the operator explicitly wants them to match).
