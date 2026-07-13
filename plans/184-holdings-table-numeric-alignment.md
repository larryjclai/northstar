# Plan 184: 投資持倉表數字欄對齊 — 損益 % 移至副行、貨幣字尾定寬

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat bb051f59..HEAD -- src/routes/InvestmentsRoute.tsx`
> If the file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug (UI polish — operator-reported)
- **Planned at**: commit `bb051f59`, 2026-07-13

## Why this matters

Operator report (with screenshot): the 持倉 table columns "看起來很亂沒有
對齊". Two concrete raggedness sources in the desktop grid (plan 165's slim
5-column table):

1. **未實現損益** renders amount + percent inline —
   `+196.56萬 (+232.69%)` vs `+2,716 (+24.61%)` — and because the cell is
   right-aligned as one string, the *amount* right edges land wherever the
   variable-width percent suffix pushes them. Neither amounts nor percents
   line up vertically.
2. **市值 / 成本基礎** append the currency code after the number
   (`281.03萬 TWD`, `8,288 USD`). TWD/USD glyph widths differ slightly in the
   UI font, so numeral right edges drift a few px between mixed-currency rows.

Fix: move the percent to its own sub-line under the amount (mirrors the
two-line pattern already used by the 代號/名稱 cell and by the cash-flow
rows' `≈` second line), and give the currency suffix a fixed-width box so
numerals align exactly. No column semantics or math change — this is
presentation only, consistent with the "correctness first" invariant
(numbers themselves untouched).

## Current state

- `src/routes/InvestmentsRoute.tsx` — the desktop holdings grid lives at
  ~line 1507–1633 inside the holdings table component. Grid columns are
  defined at line 1342–1350 (`2.2fr 1fr 1fr 1.2fr 1.3fr` + optional `auto`
  columns + `40px` chevron). Numeric cells use the `tabular` class
  (`src/styles/globals.css:625` → `font-variant-numeric: tabular-nums`).

- **未實現損益 cell** (line 1591–1600) as it exists today:

  ```tsx
  <div
    className="py-3 text-right tabular whitespace-nowrap"
    style={{ color: pnlColor }}
    title={`${position.unrealizedGain >= 0 ? "+" : ""}${formatNumber(position.unrealizedGain)} ${position.currency}`}
  >
    {position.unrealizedGain >= 0 ? "+" : ""}{formatCompactNumber(position.unrealizedGain)}
    <span className="ml-1 text-xs opacity-80">
      ({position.unrealizedGainPercent >= 0 ? "+" : ""}{position.unrealizedGainPercent.toFixed(2)}%)
    </span>
  </div>
  ```

- **市值 cell** (line 1588–1590):

  ```tsx
  <div className="py-3 text-right tabular whitespace-nowrap" title={`${formatNumber(position.marketValue)} ${position.currency}`}>
    {formatCompactNumber(position.marketValue)} <span style={{ color: "var(--ns-muted)" }}>{position.currency}</span>
  </div>
  ```

- **成本基礎 cell** (optional column, line 1621–1625) — same shape as 市值.

- The 代號/名稱 cell is already two-line (ticker + muted name, line
  1565–1578), so a second line in 未實現損益 does not change row height.

- There is a separate **mobile card layout** (the grid is inside
  `<div className="hidden overflow-x-auto sm:block">`, line 1512) — mobile is
  out of scope.

## Commands you will need

| Purpose   | Command              | Expected on success |
|-----------|----------------------|---------------------|
| Typecheck | `npx tsc --noEmit`   | exit 0              |
| Tests     | `npm test`           | all pass (~1146)    |
| Lint      | `npm run lint`       | exit 0              |

## Scope

**In scope** (the only file you should modify):
- `src/routes/InvestmentsRoute.tsx` — only the three cells quoted above
  (未實現損益, 市值, 成本基礎) inside the desktop grid.

**Out of scope** (do NOT touch, even though they look related):
- Column order, `gridTemplateColumns`, sorting, or the 欄位 column toggles.
- `formatCompactNumber` / `formatNumber` / any `domain/` formatting helper —
  shared by many surfaces; changing them would ripple.
- The mobile layout, the expansion panel (`HoldingExpansion`), the summary
  strip, and the broker aggregate cards.
- `DashboardRoute.tsx` holdings-like lists.

## Git workflow

- Branch: `fix/ai-holdings-numeric-alignment`
- Conventional commits, e.g. `fix(investments): align holdings numerals — pct sub-line + fixed ccy suffix`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: 未實現損益 — percent to a sub-line

In the cell quoted above, change the percent `<span>` from inline to a block
second line, dropping the parentheses (they were an inline separator; a
sub-line doesn't need them):

```tsx
{position.unrealizedGain >= 0 ? "+" : ""}{formatCompactNumber(position.unrealizedGain)}
<span className="block text-xs opacity-80">
  {position.unrealizedGainPercent >= 0 ? "+" : ""}{position.unrealizedGainPercent.toFixed(2)}%
</span>
```

Keep the wrapper div's classes/style/title exactly as they are (`text-right`
makes both lines right-aligned; color inherits).

**Verify**: `grep -n 'block text-xs opacity-80' src/routes/InvestmentsRoute.tsx`
→ 1 match; `npx tsc --noEmit` → exit 0.

### Step 2: 市值 and 成本基礎 — fixed-width currency suffix

In both cells, wrap the currency span so it occupies a constant box
(left-aligned inside it), which pins the numeral right edges to one column
across TWD/USD rows:

```tsx
{formatCompactNumber(position.marketValue)}
<span className="inline-block w-9 text-left ml-1" style={{ color: "var(--ns-muted)" }}>{position.currency}</span>
```

(Same edit in the 成本基礎 cell with `position.costBasis`.) `w-9` (36px)
fits any 3-letter ISO code at `text-sm`; if a 4-letter code ever appears it
truncates nothing — it just widens, which degrades gracefully.

**Verify**: `grep -c 'inline-block w-9 text-left ml-1' src/routes/InvestmentsRoute.tsx`
→ `2`.

### Step 3: Full gate

**Verify**: `npx tsc --noEmit` → exit 0; `npm run lint` → exit 0;
`npm test` → all pass.

## Test plan

Presentation-only change; the repo has no visual-regression harness, and the
holdings math is covered by existing domain tests which must stay green
(`npm test`). No new tests. Operator visual pass: in 投資 → 持倉, the
未實現損益 amounts share one right edge with the percent beneath; mixed
TWD/USD rows' 市值 numerals align.

## Done criteria

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0
- [ ] 未實現損益 percent renders as a `block` sub-line (grep from Step 1)
- [ ] 市值 + 成本基礎 currency suffixes use the fixed-width span (grep from Step 2)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The cell excerpts in "Current state" no longer match the live code
  (the table was restyled since planning).
- The change appears to require touching `gridTemplateColumns` or any
  formatting helper in `domain/` to look right.
- You find the same amount+percent inline pattern in >3 other surfaces and
  are tempted to fix them all — report instead (batch belongs in its own plan).

## Maintenance notes

- If a future column shows amount+percent, follow this sub-line pattern.
- Reviewer should scrutinize: rows where `unrealizedGainPercent` is extreme
  (>1000%) still fit the 1.3fr track without wrapping (`whitespace-nowrap`
  is on the wrapper).
- Deferred: the mobile card list and the expansion panel were not audited
  for the same raggedness; if the operator reports it there, plan separately.
