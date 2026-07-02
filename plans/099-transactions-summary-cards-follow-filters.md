# Plan 099: Make the 交易紀錄 summary cards follow the active filters (and stop counting imported baselines as purchases)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b33bf55e..HEAD -- src/routes/TransactionsRoute.tsx src/routes/transactionsTxLabel.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition. Plan 096 intentionally touches
> `TransactionsRoute.tsx` (hides the 複製 button) — that specific diff is
> expected and is NOT drift.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/096-imported-holding-cash-neutrality.md (soft — same
  file; execute 096 first to avoid merge conflicts)
- **Category**: bug (UX / correctness of displayed aggregates)
- **Planned at**: commit `b33bf55e`, 2026-07-02

## Why this matters

The investment 交易紀錄 page shows four summary cards (交易筆數 / 總買入 /
總賣出 / 總股利) above a filterable list. The user reported the cards should
"隨著篩選條件連動" — and they're right, twice over:

1. The cards only respect the **date** filter. Filtering by broker, transaction
   type, asset type, or search leaves the cards unchanged, so the numbers
   contradict the visible list.
2. 總買入 **counts cashless opening lots** (匯入持倉 baselines) as real
   purchases, inflating the "bought this period" figure by positions that were
   imported, not bought. This is the aggregate cousin of the cash-leak bug
   fixed in plan 096.

## Current state

### File

`src/routes/TransactionsRoute.tsx` — the investment transactions tab. Key
pieces:

- **Unified rows** (lines 126-184): investment records + broker cash transfers
  are mapped into `UnifiedTx` rows. Each row carries `kind`
  (`"investment" | "cash"`), `actionKey`, `quantity`, `price`, `fee`, `signed`,
  `currency`, `date`, `brokerId`, `isOpeningLot` (from
  `isImportOpeningLot(record)`), etc. Note line 131's gross convention:

  ```ts
  const gross = record.action === "cashDividend" ? record.price : record.price * record.quantity;
  ```

- **Filtering** (lines 186-199): `filteredTx` applies typeFilter, dateRange,
  assetTypeFilter, brokerFilter, and the search query.

- **The stale aggregate** (lines 201, 232-247): `totals` is computed from
  `periodRecordRows`, which applies ONLY the date scope, directly over raw
  records (so opening lots — `action === "buy"` — are included):

  ```ts
  const periodRecordRows = useMemo(() => recordRows.filter((record) => isWithinDateScope(record.date, dateRange)), [recordRows, dateRange]);
  ...
  const totals = useMemo(() => {
    let bought = 0; let sold = 0; let dividends = 0;
    for (const record of periodRecordRows) {
      const currency = assetFor(record.assetId)?.currency ?? "TWD";
      if (record.action === "buy") {
        bought += toPrimary(record.price * record.quantity, currency, record.date);
      } else if (record.action === "sell") {
        sold += toPrimary(record.price * record.quantity, currency, record.date);
      } else if (record.action === "cashDividend") {
        dividends += toPrimary(record.price, currency, record.date);
      }
    }
    return { bought, sold, dividends };
  }, [periodRecordRows, assetRows, toPrimary]);
  ```

- **The cards** (lines 330-333):

  ```tsx
  <SummaryCard label="交易筆數" value={`${periodRecordRows.length} 筆`} sublabel={dateRange.label} />
  <SummaryCard label="總買入" value={formatMoney(totals.bought, primaryCurrency)} sublabel="期間買入金額" />
  <SummaryCard label="總賣出" value={formatMoney(totals.sold, primaryCurrency)} sublabel="期間賣出金額" />
  <SummaryCard label="總股利" value={formatMoney(totals.dividends, primaryCurrency)} sublabel="現金股利" />
  ```

- `hasActiveFilters` already exists (line 260).

### The colocated-pure-module convention (pattern to follow)

`src/routes/transactionsTxLabel.ts` + `transactionsTxLabel.test.ts`: pure
helpers for this route live in a sibling module with no React imports, "so they
can be unit-tested without pulling in the heavy TransactionsRoute component
graph" (its own header comment). Model the new summary helper on it.

### Currency note

`toPrimary(amount, currency, date)` converts to the primary currency at the
row's trade date. `UnifiedTx` rows carry `currency` and `date`, so totals can
be computed from filtered rows with identical conversion semantics to today.

## Commands you will need

| Purpose   | Command                                                | Expected on success |
|-----------|--------------------------------------------------------|---------------------|
| Tests     | `npm test`                                             | exit 0              |
| One file  | `npx vitest run src/routes/transactionsSummary.test.ts` | all pass           |
| Typecheck + build | `npm run build`                                | exit 0              |
| Lint      | `npm run lint`                                         | exit 0              |

## Scope

**In scope**:
- `src/routes/TransactionsRoute.tsx`
- `src/routes/transactionsSummary.ts` (create)
- `src/routes/transactionsSummary.test.ts` (create)

**Out of scope**:
- The FILTER logic itself (lines 186-199) — unchanged.
- `src/domain/**` — this is presentation aggregation, not finance semantics.
  In particular do NOT "fix" the cashDividend gross convention (line 131 uses
  `record.price` as the total; legacy per-share rows are a known convention —
  mirror it, don't change it).
- `InvestmentsAnalyticsTab.tsx` and dashboard charts — the broader "are the
  analytics useful" question is deferred (see plans/README.md).

## Git workflow

- Branch: `fix/ai-tx-summary-follows-filters` (`fix/ai-<name>` per `.agentrules`).
- Conventional commits, e.g. `fix(transactions): summary cards follow active filters`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the pure summary helper

Create `src/routes/transactionsSummary.ts` (no React imports), modeled on
`transactionsTxLabel.ts`:

```ts
// Pure aggregation for the 交易紀錄 summary cards. Computed over the SAME
// filtered rows the list renders, so the cards always agree with what the user
// sees. Opening lots (匯入持倉 baselines) are excluded from 買入 — they record
// an already-held position, not a purchase.

export interface SummaryTxRow {
  kind: "investment" | "cash";
  actionKey: string;
  quantity: number;
  price: number;
  currency: string;
  date: string;
  isOpeningLot: boolean;
}

export interface TxSummaryTotals {
  count: number;      // rows shown in the list (investment + cash rows)
  bought: number;     // primary-currency Σ of buy gross, excl. opening lots
  sold: number;       // primary-currency Σ of sell gross
  dividends: number;  // primary-currency Σ of cash dividends
}

export function summarizeTransactions(
  rows: SummaryTxRow[],
  toPrimary: (amount: number, currency: string, date: string) => number,
): TxSummaryTotals {
  let bought = 0, sold = 0, dividends = 0;
  for (const row of rows) {
    if (row.kind !== "investment" || row.isOpeningLot) continue;
    if (row.actionKey === "buy") bought += toPrimary(row.price * row.quantity, row.currency, row.date);
    else if (row.actionKey === "sell") sold += toPrimary(row.price * row.quantity, row.currency, row.date);
    else if (row.actionKey === "cashDividend") dividends += toPrimary(row.price, row.currency, row.date);
  }
  return { count: rows.length, bought, sold, dividends };
}
```

(`UnifiedTx` structurally satisfies `SummaryTxRow`; keep the interface local so
the module stays React-free.)

**Verify**: `npm run build` → exit 0.

### Step 2: Unit tests

Create `src/routes/transactionsSummary.test.ts`, modeled structurally on
`transactionsTxLabel.test.ts`. Use an identity-ish `toPrimary` stub (e.g.
USD → ×30) so conversion is observable. Cases:

1. Buys/sells/dividends aggregate with per-row currency conversion.
2. Opening-lot rows (`isOpeningLot: true`) are excluded from `bought` but
   still included in `count`.
3. Cash rows (`kind: "cash"`) count toward `count` but never toward
   bought/sold/dividends.
4. `cashDividend` uses `price` as the total (mirrors the page's gross
   convention).
5. Empty input → all zeros.

**Verify**: `npx vitest run src/routes/transactionsSummary.test.ts` → all pass.

### Step 3: Switch the route to the helper

In `TransactionsRoute.tsx`:

1. Replace the `totals` memo (lines 232-247) with:

   ```ts
   const totals = useMemo(() => summarizeTransactions(filteredTx, toPrimary), [filteredTx, toPrimary]);
   ```

2. Update the cards (lines 330-333):
   - 交易筆數: `value={`${totals.count} 筆`}`, sublabel becomes
     `hasActiveFilters ? "符合篩選" : dateRange.label` — the existing string
     資源 for `dateRange.label` stays for the unfiltered case. ("符合篩選" is a
     new UI string: add it via the copy workflow if the file's neighboring
     strings are catalogued in `copy.csv`; check how nearby literals in this
     file are handled — if sublabels like "期間買入金額" are plain literals in
     the tsx, match that and use a plain literal.)
   - The other three cards keep their labels/sublabels; only the data source
     changed.
3. Remove `periodRecordRows` if nothing else uses it (grep first — at
   `b33bf55e` its only consumers are the 交易筆數 card and the old `totals`).
4. Delete the now-unused parts of the old totals code and any dangling imports.

**Verify**: `npm run build && npm run lint` → both exit 0.

### Step 4: Behavior check in the browser

`npm run dev` → 投資 → 交易紀錄 (needs seed/demo data with a few trades and at
least one imported holding):

1. No filters: cards ≈ previous values EXCEPT 總買入 no longer includes
   imported baselines, and 交易筆數 now includes cash deposit/withdraw rows
   (both are intended changes).
2. Apply a broker filter → all four cards shrink to match the visible rows.
3. Apply a type filter (e.g. only 賣出) → 總買入 drops to 0, 交易筆數 matches
   the list.

**Verify**: observations hold; screenshot for the operator.

## Test plan

Covered in Step 2 — five cases in `src/routes/transactionsSummary.test.ts`
following the `transactionsTxLabel.test.ts` pattern.
Verification: `npm test` → exit 0 including the new file.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npm test` exits 0; `transactionsSummary.test.ts` exists with the 5 cases
- [ ] `npm run build` exits 0
- [ ] `npm run lint` exits 0
- [ ] `grep -n "periodRecordRows" src/routes/TransactionsRoute.tsx` returns no matches
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The `totals` memo or cards block doesn't match the excerpts (beyond plan
  096's expected 複製-button change).
- `periodRecordRows` has consumers other than the two named above.
- Changing 交易筆數 semantics (now counts displayed rows incl. cash moves)
  breaks a test elsewhere — that would mean something else depends on the old
  definition; report rather than special-casing.

## Maintenance notes

- The cards and the list now share one data source (`filteredTx`); any new
  filter added to the page automatically propagates to the cards. Reviewers of
  future filter work should confirm new predicates land in the `filteredTx`
  memo, not a parallel one.
- 交易筆數 deliberately counts cash deposit/withdraw rows because they are
  rows the user sees in the list. If the product later wants "trade count"
  strictly, split the card rather than re-forking the data sources.
- Deferred: the broader review of whether the 投資分析 charts earn their place
  (user's open question) — see plans/README.md "considered / deferred".
