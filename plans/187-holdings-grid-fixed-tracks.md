# Plan 187: 持倉表跨列欄位對齊 — 選用欄位 `auto` 軌道改固定寬，消除逐列 grid 解算差異

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. Do NOT update `plans/README.md` — the reviewer
> maintains the index.
>
> **Drift check (run first)**:
> `git diff --stat f892a1d6..HEAD -- src/routes/InvestmentsRoute.tsx`
> If the file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch,
> treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plan 184 (MERGED — this fixes the remaining, deeper misalignment it didn't cover)
- **Category**: bug (UI — operator-reported with screenshot, root cause measured in live browser)
- **Planned at**: commit `2377da34` (main, post-183/184/185/186 merges), 2026-07-13

## Why this matters

After plan 184 merged, the operator re-tested and the 持倉 table is still
misaligned **between rows** whenever any 「欄位」optional column is enabled.
Advisor measured the live DOM (demo data, `getBoundingClientRect` on every
cell): with 券商+均價 enabled, most rows resolve column right-edges at
643 / 760 / 897 / 1045 (今日/現價/市值/損益) — but the 台積電 row resolves
638 / 752 / 887 / 1033, i.e. **the whole row's tracks shift left ~4–12px**,
and the header row lands on yet another set (650 / 769 / 909 / 1060).

Root cause: each header/data row is its **own independent `display: grid`**
(`.ns-holdings-row`, `src/styles/globals.css:1324`) sharing only the same
`gridTemplateColumns` *string* — and the optional columns use `auto` tracks,
which size to **that row's own content**. 台積電's 均價 `1,019.46` is wider
than other rows' 均價, so its `auto` track widens and its `fr` tracks
shrink — per-row, independently. Any row whose optional-column content is
wider/narrower than its siblings' gets every column boundary shifted.

Fix: replace the `auto` optional tracks with **fixed pixel tracks per column
key**. Identical template + identical container width ⇒ every row (and the
header) resolves identical tracks ⇒ all columns share edges across rows.
(With zero optional columns enabled the template is all-fr and already
aligns — this bug only manifests with 欄位 toggles on, which is exactly the
operator's configuration.)

## Current state

- `src/routes/InvestmentsRoute.tsx` — the grid template builder at
  ~line 1335–1350:

  ```tsx
  // Default 5-column grid (代號/名稱, 今日, 現價, 市值, 未實現損益) + a 40px chevron
  // column; optional 「欄位」 columns append between 未實現損益 and the chevron.
  const optionalColumnsVisible = HOLDINGS_COLUMN_OPTIONS.filter((opt) => visibleCol(opt.key));
  // Optional columns are sized to their content (`auto`) rather than an equal
  // `1fr` share: a left-aligned 券商 next to a right-aligned 均價 in wide `1fr`
  // tracks left a large empty gap between them. The five base columns keep the
  // fr units and absorb the remaining width.
  const gridTemplateColumns = [
    "2.2fr",
    "1fr",
    "1fr",
    "1.2fr",
    "1.3fr",
    ...optionalColumnsVisible.map(() => "auto"),
    "40px",
  ].join(" ");
  ```

- `HOLDINGS_COLUMN_OPTIONS` is defined at ~line 1036–1041 with keys
  `dayPnl` (當日損益), `account` (券商), `averageCost` (均價),
  `assetType` (類型), `costBasis` (成本基礎). (代號/今日/現價/市值/未實現損益
  are the 5 always-on fr columns; 現價 is not optional.)

- `.ns-holdings-row` (`src/styles/globals.css:1324-1328`):

  ```css
  .ns-holdings-row {
    display: grid;
    align-items: center;
    column-gap: 12px;
  }
  ```

  Both the header row and every data row apply the SAME
  `style={{ gridTemplateColumns }}` (header ~line 1514, data rows ~line
  1556) — the string is shared but each element solves its own grid.

- The optional-column cells already `whitespace-nowrap` (dayPnl,
  averageCost, assetType, costBasis) and 券商 has `max-w-[11rem]` +
  `truncate` (~line 1611–1613), so fixed tracks degrade gracefully.

- Plan 184's fixes (pct sub-line in 未實現損益, `w-9` currency suffix) are
  merged and working — measured: 市值 numeral right edges align at 857
  within same-track rows. Do not touch those cells.

## Commands you will need

| Purpose   | Command              | Expected on success |
|-----------|----------------------|---------------------|
| Install   | `npm install`        | exit 0 (fresh worktree) |
| Typecheck | `npx tsc --noEmit`   | exit 0              |
| Tests     | `npm test`           | all pass (~1155)    |
| Lint      | `npm run lint`       | exit 0              |

## Scope

**In scope** (the only file you should modify):
- `src/routes/InvestmentsRoute.tsx` — only the `gridTemplateColumns` builder
  (and, if needed, `HOLDINGS_COLUMN_OPTIONS` to carry a per-key width).

**Out of scope** (do NOT touch):
- The five base fr tracks (`2.2fr 1fr 1fr 1.2fr 1.3fr`) and the `40px`
  chevron track — unchanged.
- `src/styles/globals.css` `.ns-holdings-row` — the per-row-grid structure
  stays (a subgrid refactor was considered and deferred; see Maintenance).
- Plan 184's cell markup (pct sub-line, `w-9` suffix).
- The mobile card layout, expansion panel, sorting, column toggles.

## Git workflow

- Branch: `fix/ai-holdings-grid-fixed-tracks` (branch off `main`)
- Conventional commit, e.g. `fix(investments): fixed-width optional column tracks — align holdings grid across rows`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Carry a width per optional column key

Extend each entry of `HOLDINGS_COLUMN_OPTIONS` with a `width` (string,
CSS track size). Recommended values (sized to the widest realistic content
at `text-sm` tabular numerals + the 12px column-gap):

| key | label | width |
|---|---|---|
| dayPnl | 當日損益 | `"96px"` |
| account | 券商 | `"128px"` |
| averageCost | 均價 | `"88px"` |
| assetType | 類型 | `"72px"` |
| costBasis | 成本基礎 | `"112px"` |

Then change the builder:

```tsx
const gridTemplateColumns = [
  "2.2fr",
  "1fr",
  "1fr",
  "1.2fr",
  "1.3fr",
  ...optionalColumnsVisible.map((opt) => opt.width),
  "40px",
].join(" ");
```

Update the comment above it to say fixed tracks (identical per-row grid
resolution) replaced `auto` (per-row content sizing) — cite "plan 187" the
way neighboring comments cite their plans.

**Verify**: `grep -n '"96px"' src/routes/InvestmentsRoute.tsx` → 1 match;
`grep -n 'map(() => "auto")' src/routes/InvestmentsRoute.tsx` → 0 matches;
`npx tsc --noEmit` → exit 0.

### Step 2: Guard long content

Confirm (read, don't restructure) that each optional cell either truncates
or nowraps: 券商 has `truncate` + `max-w-[11rem]`; dayPnl / averageCost /
costBasis / assetType have `whitespace-nowrap`. If any nowrap cell can
overflow its new fixed track, widen that track (stay within the table's
`overflow-x-auto` container) rather than restructuring the cell.

**Verify**: `npm run lint` → exit 0.

### Step 3: Full gate

**Verify**: `npx tsc --noEmit` → exit 0; `npm run lint` → exit 0;
`npm test` → all pass.

## Test plan

Layout-only change; no unit-testable surface in vitest/jsdom. Existing
suite must stay green. The reviewer will re-measure the live DOM (the same
`getBoundingClientRect` sweep that diagnosed this) to confirm: with 券商+
均價 (and separately 當日損益) enabled, every data row's cell right edges
are identical across rows and match the header row's.

## Done criteria

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0
- [ ] No `"auto"` track remains in the holdings `gridTemplateColumns` builder
- [ ] Each `HOLDINGS_COLUMN_OPTIONS` entry carries a fixed `width`
- [ ] No files outside the in-scope list are modified (`git status`)

## STOP conditions

Stop and report back (do not improvise) if:

- The builder excerpt no longer matches the live code.
- Fixing alignment appears to require changing `.ns-holdings-row` CSS or
  restructuring rows into one shared grid/subgrid — that is the deferred
  bigger refactor, not this plan.
- A fixed track visibly cannot fit its column's content even after widening
  (report the column and the content that overflows).

## Maintenance notes

- **Deferred alternative**: CSS `subgrid` (parent `.ns-holdings-table`
  owns the template; rows `grid-template-columns: subgrid`) is the
  structurally-correct fix and also removes the header/data duplication of
  the template string. Deferred because fixed tracks are a 10-line change
  with zero browser-support risk; revisit if a 6th optional column makes
  fixed widths unwieldy.
- If a new optional column is added to `HOLDINGS_COLUMN_OPTIONS`, it MUST
  carry a `width` — an `auto` track reintroduces this bug.
- Reviewer should scrutinize: 欄位 all-on (5 optional columns) at a 1280px
  viewport — the table should scroll horizontally inside `overflow-x-auto`
  rather than crush the fr columns.
