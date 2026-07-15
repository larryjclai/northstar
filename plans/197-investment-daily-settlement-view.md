# Plan 197: 日結 (daily-settlement) grouping mode in 交易紀錄 for broker reconciliation

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat db007657..HEAD -- src/routes/TransactionsRoute.tsx src/styles/globals.css`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/196-investment-total-includes-fee.md (MUST land first)
- **Category**: direction (feature)
- **Planned at**: commit `db007657`, 2026-07-14

## Why this matters

The user reconciles their investment account against the broker's daily 成交回報
(a per-day, per-broker email listing each trade's 成交金額 / 手續費 / 交易稅 and a
小計 應收付金額). The app's 交易紀錄 list only groups by month, so there is no way
to line the app up against one day's broker statement and confirm the totals
match. Adding a 日結 grouping mode — the same rows, grouped by day, each day
ending in a 小計 subtotal (成交金額 / 手續費 / 應收付) — gives the user a direct,
tickable view against the email. Combined with the existing 券商 filter (to
narrow to one brokerage), it reproduces the email's layout closely enough to
reconcile, using data the app already stores. No schema change is needed.

**Decisions already made by the operator (do not re-litigate):**
1. **Placement**: a grouping-mode toggle inside the existing 交易紀錄 page
   (月分組 ↔ 日結), not a separate route.
2. **Subtotal columns**: 成交金額 / 手續費 / 應收付 + a per-day 小計. Do **not**
   split 手續費 into brokerage vs. 交易稅 — the app stores a single combined `fee`,
   and the operator chose to keep it combined.

## Current state

The 交易紀錄 page is `src/routes/TransactionsRoute.tsx`. Key facts:

- Rows are unified `UnifiedTx` objects (investment records + brokerage cash
  transfers), interface at lines 71-92. Each has:
  `date` (ISO string), `currency`, `signed` (net cash flow: + inflow / − outflow),
  `price`, `quantity`, `fee`, `actionKey`, `isOpeningLot`, `kind`
  (`"investment" | "cash"`). **After plan 196, `signed` equals the ledger's net
  cash `calculateInvestmentCashDelta` (fee/tax included)** — this plan's subtotals
  depend on that, which is why 196 is a hard dependency.
- Filtering + sorting produces `filteredTx` (newest-first), lines 190-203.
- Pagination + month grouping today (lines 244-247):

```ts
const { groups: paginatedGroups, totalPages } = useMemo(
  () => paginateAndGroupByMonth(filteredTx, page, pageSize),
  [filteredTx, page],
);
```

- `paginateAndGroupByMonth` (lines 50-69) slices the flat list to the current
  page, then groups the page's rows by `date.slice(0, 7)`:

```ts
function paginateAndGroupByMonth<T extends { date: string }>(
  rows: T[], page: number, pageSize: number,
): { groups: Array<{ date: string; rows: T[] }>; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);
  const groups: Array<{ date: string; rows: T[] }> = [];
  let currentMonth = "";
  for (const row of pageRows) {
    const monthKey = row.date.slice(0, 7);
    if (monthKey !== currentMonth) { groups.push({ date: monthKey, rows: [row] }); currentMonth = monthKey; }
    else { groups[groups.length - 1].rows.push(row); }
  }
  return { groups, totalPages };
}
```

- Month groups render via `InvestmentMonthGroup` (lines 462-509), which draws a
  header (`.ns-invest-month-head`, `formatMonthLabel`) and a `<table
  className="ns-invest-table">` whose rows are `InvestmentTransactionRow` (lines
  512-568) plus a parallel mobile list of `InvestmentTransactionMobile` (lines
  571-619). The table columns, in order, are (lines 483-493):
  `日期 · 標的 · 類型 · 股數 · 價格 · 手續費 · 總額 · 帳戶 · 操作` (9 columns).
- A `SegmentedControl` component already exists and is imported at line 13
  (`import { SegmentedControl } from "../components/SegmentedControl";`). Its API:
  `<SegmentedControl value={v} options={[{value,label,icon?}]} onChange={fn} />`
  (generic over the string value type). Use it for the mode toggle.
- Toolbar (filters row) is at lines 327-380; the mode toggle should sit in this
  toolbar (e.g. right after the `DateScopeControl`, before the Clear button).
- Table styles live in `src/styles/globals.css` starting at
  `.ns-invest-month-head` (line 1472) and `.ns-invest-table` (line 1495). New
  static styles must be added there as `ns-*` classes — per `AGENTS.md` the CSS
  priority is COSS component → `ns-*`/Tailwind utility → inline only for dynamic
  values. Do not write static styling inline.

**Exemplar for the pure grouping+subtotal helper**: `src/routes/cashFlowGrouping.ts`
(pure day/month grouping with per-group `net`) and its test-style sibling. Match
its shape: a small pure module with an adjacent `*.test.ts`. See
`src/routes/transactionsSummary.test.ts` for the vitest + `toPrimary`-stub test
pattern to copy.

## Commands you will need

| Purpose   | Command                                              | Expected on success       |
|-----------|------------------------------------------------------|---------------------------|
| Typecheck | `npx tsc --noEmit`                                   | exit 0, no errors         |
| Unit test | `npm test -- src/routes/investmentDailySettlement`  | all pass                  |
| Full test | `npm test`                                           | all pass (baseline green) |
| Lint      | `npm run lint`                                        | exit 0                    |
| Dev (eyes)| `npm run dev`                                         | serves Vite; open 交易紀錄 |

## Scope

**In scope** (the only files you should modify/create):
- `src/routes/investmentDailySettlement.ts` (create — pure helper)
- `src/routes/investmentDailySettlement.test.ts` (create — unit tests)
- `src/routes/TransactionsRoute.tsx` (edit — add mode toggle + day-group render)
- `src/styles/globals.css` (edit — add `.ns-invest-subtotal*` styles only)

**Out of scope** (do NOT touch):
- `src/routes/transactionsSummary.ts` and the top summary cards — unrelated
  metric; leave them.
- `src/domain/investmentCash.ts` — reuse `signed`; do not reimplement cash math.
- The month-grouping path (`paginateAndGroupByMonth`, `InvestmentMonthGroup`) —
  keep it working exactly as-is; the toggle selects between it and the new path.
- Any change to `InvestmentTransactionRow` / `InvestmentTransactionMobile`
  markup — reuse them unchanged inside the day group.
- Per-broker sub-grouping within a day — the operator chose day-only grouping;
  the 券商 filter covers "one broker's statement". Do not add broker sub-groups.

## Git workflow

- Branch: `feat/ai-daily-settlement` (repo convention `feat/ai-<name>`, per `.agentrules`).
- Commit style: conventional commits (see `git log --oneline -5`), e.g.
  `feat(investments): 日結 grouping mode with per-day 小計`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the pure grouping + subtotal helper

Create `src/routes/investmentDailySettlement.ts`. It groups an already-sorted
(newest-first) list of rows by calendar day and computes per-currency subtotals.
Rules for the subtotal, kept consistent with plan 196:
- **成交金額 (gross)**: sum of `price × quantity` over `buy` and `sell` rows only.
- **手續費 (fee)**: sum of `fee` over all trade rows.
- **應收付 (net)**: sum of `signed` over all rows (trades + cash transfers).
- **Opening lots are excluded from all three** (cashless import baselines) but
  still appear as rows — mirror how the list renders them as 「—」.
- Subtotals are grouped **by currency** (a day may mix TWD/USD; never sum across
  currencies). Emit one subtotal per distinct currency present in that day's
  non-opening-lot rows, ordered by first appearance.

```ts
// Pure day-grouping + 小計 subtotal for the 交易紀錄 「日結」 mode. Groups rows
// (assumed newest-first) by calendar day; each day carries per-currency
// subtotals that reconcile against a broker's daily 成交回報 (應收付金額 小計).
// Net (應收付) uses each row's `signed` — the same value the ledger posts — so
// the subtotal ties out to the account movement. Opening lots are cashless
// import baselines: shown as rows but excluded from every subtotal.

export interface DailySettlementRow {
  date: string;       // ISO datetime or date; day key is date.slice(0, 10)
  currency: string;
  actionKey: string;  // InvestmentAction | "deposit" | "withdraw"
  price: number;
  quantity: number;
  fee: number;
  signed: number;     // net cash flow: + inflow, − outflow
  isOpeningLot: boolean;
}

export interface DailySubtotal {
  currency: string;
  gross: number; // Σ price×quantity over buy/sell (成交金額)
  fee: number;   // Σ fee over trades (手續費)
  net: number;   // Σ signed over all rows (應收付)
}

export interface DailySettlementGroup<T extends DailySettlementRow> {
  date: string;               // YYYY-MM-DD
  rows: T[];
  subtotals: DailySubtotal[]; // one per currency present (excl. opening lots)
}

export function groupByDayWithSubtotals<T extends DailySettlementRow>(
  rows: T[],
): DailySettlementGroup<T>[] {
  const groups: DailySettlementGroup<T>[] = [];
  let current: DailySettlementGroup<T> | null = null;

  for (const row of rows) {
    const day = row.date.slice(0, 10);
    if (!current || current.date !== day) {
      current = { date: day, rows: [], subtotals: [] };
      groups.push(current);
    }
    current.rows.push(row);
  }

  for (const group of groups) {
    const byCurrency = new Map<string, DailySubtotal>();
    for (const row of group.rows) {
      if (row.isOpeningLot) continue;
      let sub = byCurrency.get(row.currency);
      if (!sub) {
        sub = { currency: row.currency, gross: 0, fee: 0, net: 0 };
        byCurrency.set(row.currency, sub);
      }
      if (row.actionKey === "buy" || row.actionKey === "sell") {
        sub.gross += row.price * row.quantity;
        sub.fee += row.fee;
      }
      sub.net += row.signed;
    }
    group.subtotals = [...byCurrency.values()];
  }

  return groups;
}
```

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Unit-test the helper

Create `src/routes/investmentDailySettlement.test.ts`, modeled structurally on
`src/routes/transactionsSummary.test.ts` (vitest `describe/it`, a small `row()`
factory with overrides). Cover:
- **Grouping**: rows across two days produce two groups, in input order
  (newest-first preserved).
- **Subtotal math (the user's case)**: a day with a buy `price 5065, qty 2,
  fee 8` yields `gross 10130`, `fee 8`, and `net` equal to that row's `signed`
  (pass `signed: -10138`) → subtotal `net === -10138`.
- **Buy + sell same day**: `gross` sums both, `net` sums both `signed`.
- **Opening lot excluded**: a group containing one opening-lot row and one buy
  → subtotal reflects only the buy; the opening-lot row is still present in
  `group.rows`.
- **Mixed currency**: a day with a TWD buy and a USD buy → two subtotals, one
  per currency, no cross-currency summing.
- **Cash transfer**: a `deposit`/`withdraw` row contributes to `net` only, not
  to `gross`/`fee`.

**Verify**: `npm test -- src/routes/investmentDailySettlement` → all pass.

### Step 3: Add the view-mode toggle state to `TransactionsRoute`

In the `TransactionsRoute` component add state:

```ts
const [viewMode, setViewMode] = useState<"month" | "day">("month");
```

Import the helper at the top of the file (near the other `./` route imports):

```ts
import { groupByDayWithSubtotals } from "./investmentDailySettlement";
```

Add a `SegmentedControl` in the toolbar (the flex row at lines 327-380), placed
after the `DateScopeControl` block and before the `hasActiveFilters` Clear
button:

```tsx
<SegmentedControl
  value={viewMode}
  onChange={setViewMode}
  options={[
    { value: "month", label: "月分組" },
    { value: "day", label: "日結" },
  ]}
/>
```

`SegmentedControl` is already imported (line 13). Do not add pagination reset for
the mode toggle — page state is shared and both modes paginate the same flat list
identically.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 4: Derive day groups from the same page slice

Refactor the pagination memo (lines 244-247) so both modes share one page slice
and `totalPages`, then group per mode. Replace it with:

```ts
const pageSlice = useMemo(() => {
  const totalPages = Math.max(1, Math.ceil(filteredTx.length / pageSize));
  const pageRows = filteredTx.slice((page - 1) * pageSize, page * pageSize);
  return { pageRows, totalPages };
}, [filteredTx, page]);
const { pageRows, totalPages } = pageSlice;

const monthGroups = useMemo(
  () => (viewMode === "month" ? groupRowsByMonth(pageRows) : []),
  [viewMode, pageRows],
);
const dayGroups = useMemo(
  () => (viewMode === "day" ? groupByDayWithSubtotals(pageRows) : []),
  [viewMode, pageRows],
);
const hasGroups = viewMode === "month" ? monthGroups.length > 0 : dayGroups.length > 0;
```

Extract the month-grouping loop out of `paginateAndGroupByMonth` into a tiny pure
`groupRowsByMonth(pageRows)` (same loop body, no slicing) placed next to it — OR,
if you prefer minimal churn, keep `paginateAndGroupByMonth` and derive
`monthGroups` from it using the existing call; either is acceptable as long as
`pageRows`/`totalPages` are computed once and reused. Whichever you choose,
`totalPages` must remain `Math.ceil(filteredTx.length / pageSize)` (unchanged
behavior) and the `paginatedGroups.length === 0` empty-state check (line 389)
must become `!hasGroups`.

Update the render: keep the existing empty-state branch (now gated by
`!hasGroups`). In the results branch (lines 407-434), render month groups when
`viewMode === "month"` (existing `InvestmentMonthGroup` map over `monthGroups`),
and day groups when `viewMode === "day"` (new `InvestmentDayGroup` map over
`dayGroups`). The pagination controls (lines 426-432) are unchanged and shared.

**Verify**: `npx tsc --noEmit` → exit 0. `npm run dev`, open 交易紀錄, toggle to
日結: rows regroup by day (no console errors).

### Step 5: Build the `InvestmentDayGroup` component

Add `InvestmentDayGroup` next to `InvestmentMonthGroup`. It reuses the exact same
table markup and the existing `InvestmentTransactionRow` / `InvestmentTransactionMobile`
components, and appends a 小計 footer per currency. Signature and shape:

```tsx
function InvestmentDayGroup({
  group, onEdit, onDuplicate, onDelete,
}: {
  group: DailySettlementGroup<UnifiedTx>;
  onEdit: (recordId: string) => void;
  onDuplicate: (recordId: string) => void;
  onDelete: (recordId: string) => Promise<void>;
}) {
  return (
    <section className="ns-invest-month">
      <div className="ns-invest-month-head">
        <h3>{group.date}</h3>
        <span>{group.rows.length} 筆</span>
      </div>

      <div className="ns-invest-table-wrap">
        <table className="ns-invest-table">
          <thead>{/* same 9-column header as InvestmentMonthGroup */}</thead>
          <tbody>
            {group.rows.map((tx) => (
              <InvestmentTransactionRow key={tx.id} tx={tx} onEdit={onEdit} onDuplicate={onDuplicate} onDelete={onDelete} />
            ))}
          </tbody>
          <tfoot>
            {group.subtotals.map((s) => (
              <tr key={s.currency} className="ns-invest-subtotal">
                <td colSpan={5} className="text-right muted">
                  小計 · 成交金額 {formatMoney(s.gross, s.currency)}
                </td>
                <td className="num text-right muted">{formatNumber(s.fee)}</td>
                <td className={`num text-right ${s.net >= 0 ? "pos" : "neg"}`}>
                  {s.net >= 0 ? "+" : "−"}{formatMoney(Math.abs(s.net), s.currency)}
                </td>
                <td colSpan={2} />
              </tr>
            ))}
          </tfoot>
        </table>
      </div>

      <div className="ns-invest-mobile-list">
        {group.rows.map((tx) => (
          <InvestmentTransactionMobile key={tx.id} tx={tx} onEdit={onEdit} onDuplicate={onDuplicate} onDelete={onDelete} />
        ))}
        {group.subtotals.map((s) => (
          <div key={s.currency} className="ns-invest-mobile-subtotal">
            <span className="muted">小計 · 成交 {formatMoney(s.gross, s.currency)} · 費 {formatNumber(s.fee)}</span>
            <strong className={s.net >= 0 ? "pos" : "neg"}>
              {s.net >= 0 ? "+" : "−"}{formatMoney(Math.abs(s.net), s.currency)}
            </strong>
          </div>
        ))}
      </div>
    </section>
  );
}
```

Notes:
- The `<thead>` must be the same 9-column header used by `InvestmentMonthGroup`
  (copy it: `日期 · 標的 · 類型 · 股數(text-right) · 價格(text-right) ·
  手續費(text-right) · 總額(text-right) · 帳戶 · 操作(text-right)`). The tfoot
  cells sum to 9 columns (`colSpan 5` + `1` + `1` + `colSpan 2`).
- `formatMoney` and `formatNumber` are already imported in this file (line 19).
- `pos` / `neg` / `muted` / `text-right` / `num` are existing utility classes
  already used by `InvestmentTransactionRow`.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 6: Style the subtotal rows

Add to `src/styles/globals.css`, immediately after the `.ns-invest-table` block
(around line 1510+), static styles only (no new colors invented — reuse tokens):

```css
.ns-invest-subtotal td {
  border-top: 1px solid var(--ns-border);
  background: color-mix(in srgb, var(--ns-bg-hover) 40%, transparent);
  font-size: 12px;
  padding: 10px 18px;
}
.ns-invest-mobile-subtotal {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  padding: 10px 4px 2px;
  border-top: 1px solid var(--ns-border);
  font-size: 12px;
}
```

**Verify**: `npm run dev`, open 交易紀錄 → 日結. Confirm each day ends with a
small 小計 row showing 成交金額 / 手續費 / 應收付, and (with the 券商 filter set to
one broker) the 應收付 小計 matches that broker's daily email 小計 to the dollar.
Resize to a narrow viewport (or the `.ns-invest-mobile-list` breakpoint) and
confirm the mobile 小計 line renders.

### Step 7: Full gate

**Verify**:
- `npx tsc --noEmit` → exit 0
- `npm run lint` → exit 0
- `npm test` → all pass (incl. the new `investmentDailySettlement` tests)

## Test plan

- **New unit tests**: `src/routes/investmentDailySettlement.test.ts` — the six
  cases enumerated in Step 2. Structural pattern: `src/routes/transactionsSummary.test.ts`.
- **No component-render tests** for `TransactionsRoute` — the repo has no render
  harness for it; the pure helper carries the logic and is fully tested. The
  toggle/render wiring is verified by hand via `npm run dev` (Steps 4 & 6).
- Verification: `npm test` → all pass, including the new day-settlement suite.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0; `src/routes/investmentDailySettlement.test.ts` exists and passes
- [ ] `grep -n "日結" src/routes/TransactionsRoute.tsx` matches (toggle option present)
- [ ] `grep -n "groupByDayWithSubtotals" src/routes/TransactionsRoute.tsx` matches (day path wired)
- [ ] `grep -n "ns-invest-subtotal" src/styles/globals.css` matches (styles added)
- [ ] Month mode still renders unchanged (manual check in `npm run dev`)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row for 197 updated to DONE

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 196 has **not** landed — `UnifiedTx.signed` still equals `price × quantity`
  without fee (check `src/routes/TransactionsRoute.tsx` around line 135). Without
  196 the 應收付 小計 will be wrong; do not proceed.
- The code at the locations in "Current state" doesn't match the excerpts
  (drift since `db007657`).
- `SegmentedControl`'s props differ from `{ value, options, onChange }` as
  described (open `src/components/SegmentedControl.tsx` and confirm).
- Reusing `InvestmentTransactionRow` inside the day group forces changes to that
  component — it should slot in unchanged.
- A verification fails twice after a reasonable fix attempt.

## Maintenance notes

- The 應收付 小計 is only correct because each row's `signed` mirrors the ledger
  cash leg (plan 196). If anyone changes how `signed` is computed, revisit the
  subtotal semantics here.
- Subtotals intentionally group by currency and exclude opening lots. If a
  per-broker breakdown within a day is later requested, extend
  `groupByDayWithSubtotals` to a `(day, broker)` key rather than adding broker
  logic in the component.
- The current 手續費 subtotal is the combined broker-fee + securities-transaction
  tax (single stored `fee`). If the data model later splits them, this view can
  surface a separate 交易稅 column — deferred out of this plan per the operator's
  decision.
- Reviewer should scrutinize: the tfoot cell counts summing to 9 columns, and
  that month mode is untouched (regression-prone refactor in Step 4).
