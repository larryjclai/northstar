# Plan 210: 帳戶 summary adopts the 投資 visual language — one stat strip + one 幣別配置 allocation card

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise.
> When done, update this plan's status row in `plans/README.md` — unless a
> reviewer dispatched you and told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 087a9b2e..HEAD -- src/routes/AccountsRoute.tsx src/styles/globals.css`
> ⚠ **Plan 206 (deleteBook) also edits `AccountsRoute.tsx`** (BookManager region
> ~552+, mutations ~117). **Execute this plan only after 206's branch is merged
> or rejected** — its regions (~305–344) don't overlap, but stacking two live
> executors on one file invites conflicts for no benefit. If the drift check
> shows 206's changes, that is expected; find excerpts by content.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW (presentation-only; every number and conditional stays)
- **Depends on**: **order after 206** (same file, soft). No 201 conflict — this plan does NOT touch `InvestmentsRoute.tsx`.
- **Category**: tech-debt (visual consistency)
- **Planned at**: commit `087a9b2e`, 2026-07-15
- **Source**: operator, 2026-07-15 — "帳戶的卡片和下方的幣值，改成跟投資的卡片和持倉配置的樣式一樣，不然現在同一個 app 中有不同設計好怪。"

## Why this matters

帳戶 and 投資 are sibling top-level pages, and they present the same *kind* of
information — a KPI row and a composition breakdown — in two unrelated visual
languages. 投資 uses a single joined stat strip (four columns divided by
hairlines, plan 165: "saves vertical space") and a single stacked allocation
bar with a legend (持倉配置). 帳戶 uses three separate cards with 4px colored
side-bars, and a *grid of per-currency cards* each carrying its own mini
progress bar. The operator is right that it reads as two apps.

The 投資 pattern is also simply better here: three cards → one strip saves a
row of chrome, and N per-currency progress bars (each showing its share of the
same 100%) are literally a stacked bar drawn as separate fragments — the
allocation bar is the honest form of that data.

**This is presentation-only.** Every number, every conditional
(`rows.length > 0`, `currencyBreakdown.length > 1`), and the balance-sheet
semantics stay identical.

## Current state

### What 帳戶 renders today — `src/routes/AccountsRoute.tsx:308-344`

```tsx
      {/* Balance-sheet summary — always a full 3-up so a single-currency user
          doesn't see one lonely card in a 4-wide grid. */}
      {rows.length > 0 ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(150px,100%),1fr))] gap-3.5 mb-3.5">
          {([
            { label: "總資產", value: totals.assets, color: "var(--ns-chart-2)", tone: undefined },
            { label: "總負債", value: totals.liabilities, color: "var(--ns-chart-5)", tone: "neg" as const },
            { label: "淨值", value: totals.net, color: "var(--ns-chart-1)", tone: totals.net < 0 ? "neg" as const : undefined },
          ]).map((c) => (
            <Card key={c.label} className="p-4 flex flex-row items-center gap-3">
              <div style={{ width: 4, height: 38, borderRadius: 99, background: c.color }} className="shrink-0" />
              ...
```

and the currency grid at `:331-343` — one `Card` per currency with a 6px
progress bar and `{c.pct.toFixed(1)}% of total`. `currencyBreakdown` items
already carry `ccy`, `base`, `pct`, `color`.

### The target visual language — read, then imitate (do NOT modify)

**Stat strip** — `src/routes/InvestmentsRoute.tsx:505-522` (plan 165):
`<CossCard className="ns-holdings-summary mb-5">`, each cell =
`.ns-holdings-summary-col` with a muted `text-xs` label, a `.num` value at
`clamp(14px, 1.7vw, 22px)`, and an optional colored sub-line.

**Allocation card** — `InvestmentsRoute.tsx:~1040-1063` (`HoldingsAllocation`):
`<CossCard className="ns-holdings-allocation p-5 mb-5">` with a muted title,
`.ns-holdings-alloc-bar` (flex, 2px gaps, 10px tall, rounded, segment widths =
`${pct}%`, per-segment `title` tooltips), and `.ns-holdings-allocation-list`
legend rows (9×9 color chip, truncating name, `mono dim` percentage).

### The CSS classes are app-global and almost reusable as-is

`src/styles/globals.css`:

```css
1269  .ns-holdings-summary {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));   /* ← hardcoded 4 */
        padding: 16px 24px;
      }
1291  .ns-holdings-alloc-bar { display: flex; gap: 2px; height: 10px; border-radius: 99px; overflow: hidden; }
 700  @media …: .ns-holdings-summary { display: flex !important; overflow-x: auto; … }   /* mobile: count-agnostic */
```

The **only** blocker to reuse is the hardcoded 4-column grid; 帳戶 needs 3.
The mobile overflow variant is already count-agnostic. Read the full
`:1269-1300` block (including `.ns-holdings-summary-col`'s divider rule) before
writing markup.

### Conventions

- `AGENTS.md` 樣式撰寫優先序: (1) COSS components; (2) **`ns-*` classes** /
  Tailwind; (3) inline style only for dynamic values. This plan is a rule-(2)
  exercise: extend the existing `ns-*` classes, do not fork them, do not
  hand-roll new inline layouts.
- `DESIGN.md` §2.4: 總負債 is an **amount sign**, not a market number — it stays
  on the fixed axis (`.neg` / `--ns-neg`), NOT gain/loss. Do not "match 投資" by
  putting balance-sheet lines on the market palette.
- **Finance invariant** (`AGENTS.md` #1): the reconciliation identity
  `assets − liabilities = net worth` must stay visually verifiable — therefore
  **keep full `formatNumber` digits**, do NOT adopt 投資's `formatCompactNumber`
  (NT$1,501.7萬-style rounding would make the three figures no longer visibly
  sum). This is the one deliberate divergence from the 投資 strip; note it in a
  code comment.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `npm install` | exit 0 (revert `package-lock.json` churn; do not commit it) |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | 121 files / 1252+ tests pass (206 may have added tests — record YOUR baseline first) |
| Lint | `npm run lint` | 0 errors |
| Dev | `npm run dev` | Vite dev server |

## Scope

**In scope**:
- `src/routes/AccountsRoute.tsx` — the summary block (~308-344) only
- `src/styles/globals.css` — parameterize `.ns-holdings-summary`'s column count (one additive rule)

**Out of scope** (do NOT touch):
- **`src/routes/InvestmentsRoute.tsx`** — the pattern source is read-only.
  (Plan 201 is rewriting another region of it; extracting a shared component
  would collide. Reuse the CSS classes instead — that IS the sharing.)
- `HoldingsAllocation`, `ALLOCATION_COLORS` — 帳戶's `currencyBreakdown` already
  assigns its own per-currency colors; keep them.
- Everything else in `AccountsRoute.tsx` — the account list, filters,
  BookManager (206's fresh work), totals math, `currencyBreakdown` computation.
- The `rows.length > 0` / `currencyBreakdown.length > 1` conditionals — keep
  both behaviors (including the `<div className="mb-1.5" />` else-branch).

## Git workflow

- Branch: `refactor/ai-accounts-summary-parity` off `main` (after 206 lands).
- `git status` first; uncommitted work you did not create → **STOP**, never
  stash. `plans/` files are expected and not yours.
- Commit: `refactor(accounts): 帳戶總覽改用投資頁的 stat strip + 配置條視覺語言`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Parameterize the strip's column count (additive CSS)

In `globals.css`, next to `.ns-holdings-summary` (`:1269`), add:

```css
.ns-holdings-summary[data-cols="3"] { grid-template-columns: repeat(3, minmax(0, 1fr)); }
```

Attribute + rule, not an inline style (static value → AGENTS.md rule 2). The
mobile `!important` flex override already wins regardless of count — verify by
reading the `@media` block at `:700`.

**Verify**: `npx tsc --noEmit` → 0 (no TS yet, sanity); grep the new rule.

### Step 2: Replace the three summary cards with one strip

Rewrite `:310-328` as a `<CossCard className="ns-holdings-summary mb-3.5" data-cols="3">`
with three `.ns-holdings-summary-col` cells (總資產 / 總負債 / 淨值), imitating
`InvestmentsRoute.tsx:512-521`'s cell structure: muted `text-xs` label,
`.num` value with the same `clamp(14px, 1.7vw, 22px)` sizing and `title`
tooltip. 總負債 and a negative 淨值 keep the `−` sign and `.neg` class exactly
as today. Import `CossCard` the same way `InvestmentsRoute.tsx` does (check its
import line). Keep the `rows.length > 0` gate and the 3-up comment (reworded
for the strip). Drop the 4px side-bars and per-card `c.color` — the strip's
hairline dividers replace them (this is the point of the restyle).

**Verify**: `npx tsc --noEmit` → 0.

### Step 3: Replace the currency card grid with a 幣別配置 card

Rewrite `:331-343` as one `<CossCard className="p-5 mb-5">`, imitating
`HoldingsAllocation`'s internals:

- muted `text-xs` title: `幣別配置`
- `.ns-holdings-alloc-bar` — one segment per `currencyBreakdown` entry:
  `width: ${c.pct}%`, `background: c.color` (both dynamic → inline style is
  correct here), `title={`${c.ccy} · ${formatNumber(c.base)} (${c.pct.toFixed(1)}%)`}`
- `.ns-holdings-allocation-list` legend rows: 9×9 chip in `c.color`, the
  currency code, the base amount, `mono dim` `{c.pct.toFixed(1)}%`

Keep the `currencyBreakdown.length > 1` gate and its else-branch spacer.

**Verify**: `npx tsc --noEmit` → 0; `npm run lint` → 0 errors.

### Step 4: Gates + visual

- `npm test` → your recorded baseline, unchanged (this plan adds no tests and
  must break none).
- `npm run dev` → 帳戶: strip shows 3 columns with dividers; 總負債 red with
  −; the three figures still visibly satisfy assets − liabilities = net;
  幣別配置 bar segments sum to full width; legend matches the old percentages.
- Narrow the window to mobile width: the strip scroll-snaps horizontally
  (the `:700` flex override), the alloc card wraps sanely.
- Compare side-by-side with 投資 → the two pages now share one visual language.

Report which checks you ran.

## Test plan

**No new automated tests.** Pure presentation swap — jsdom computes no layout,
and the numbers' correctness is already covered by the totals'/breakdown's
existing coverage. Gate: suite stays at your recorded baseline.

## Done criteria

- [ ] `grep -n 'data-cols="3"' src/routes/AccountsRoute.tsx src/styles/globals.css` → 1 match each
- [ ] `grep -c "ns-holdings-summary-col" src/routes/AccountsRoute.tsx` → 3 (one per cell) — wait: cells map over an array; accept ≥1 in JSX with the array intact
- [ ] `grep -n "ns-holdings-alloc-bar" src/routes/AccountsRoute.tsx` → present
- [ ] `grep -n "of total" src/routes/AccountsRoute.tsx` → no matches (old per-card bars gone)
- [ ] `git diff 087a9b2e..HEAD -- src/routes/InvestmentsRoute.tsx` → **empty**
- [ ] `formatCompactNumber` does NOT appear in the new 帳戶 strip (full digits kept)
- [ ] `rows.length > 0` and `currencyBreakdown.length > 1` gates still present
- [ ] `npx tsc --noEmit` 0; `npm run lint` 0 errors; `npm test` at baseline
- [ ] Only the 2 in-scope files modified
- [ ] `plans/README.md` status row updated

## STOP conditions

- 206 has not landed and `AccountsRoute.tsx` has an active executor — do not
  stack; report.
- `.ns-holdings-summary` / `.ns-holdings-alloc-bar` have been renamed/moved, or
  `.ns-holdings-summary-col` turns out to carry investments-specific styling
  (e.g. a fixed min-width that breaks 3-up) that a `data-cols` rule can't
  cleanly override — report rather than forking the class.
- You're tempted to extract a shared `<StatStrip>` component from
  `InvestmentsRoute` — right instinct, wrong moment (201 is rewriting that
  file). Note it as the follow-up; reuse classes for now.
- The mobile flex override misbehaves with 3 columns.

## Maintenance notes

- After this lands, `.ns-holdings-summary` / `.ns-holdings-alloc-bar` are
  officially **shared vocabulary**, not investments-local. The natural follow-up
  once plan 201 is merged: extract `<StatStrip cells={...}>` and
  `<AllocationCard segments={...}>` into `src/components/` and repoint both
  routes — that removes the copy-imitation this plan accepts.
- The full-digits divergence from 投資's compact format is deliberate
  (reconciliation identity must stay visibly checkable). If someone later wants
  compact here too, that is a product decision about balance-sheet legibility,
  not a style nit.
- Reviewer: check no math moved, the two conditionals survived, and
  `InvestmentsRoute.tsx` is untouched.
