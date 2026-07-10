# Plan 137: Design-token compliance batch (chart palette, accent-fg, formatPercent, field labels, QuickAdd chips)

> **Executor instructions**: Five independent items — commit each separately;
> per-item STOP allowed. Run every verification command. Update this plan's
> status row in `plans/README.md` when done — unless a reviewer told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 65fe04c1..HEAD -- src/routes src/components src/styles/globals.css`
> Re-derive each item's sites by grep; STOP per-item on shape mismatch.

## Status

- **Priority**: P3
- **Effort**: M (five S items)
- **Risk**: LOW
- **Depends on**: none (item C touches files plan 134 also edits — if both
  run, sequence after 134)
- **Category**: tech-debt (design-system compliance)
- **Planned at**: commit `65fe04c1`, 2026-07-09

## Why this matters

DESIGN.md mandates ns tokens for ALL colors (§7:「顏色一律用 ns token，不寫死
色碼」), exactly 5 chart series tokens with light/dark variants (§2.5),
`--ns-accent-fg` for text on accent (§2.3), `formatPercent` as the canonical
percent formatter (§9), and `.ns-field-label` for the muted-label pattern
(§12.8). Each item below is a verified drift from one of those rules —
individually small, together the difference between a themed system and hex
soup.

Styling priority reminder (AGENTS.md / DESIGN.md §12.8): (1) COSS component;
(2) existing `ns-*` class or Tailwind utility; (3) inline style ONLY for
dynamic values.

## Items

### A — Chart palettes beyond the 5 tokens

- `src/routes/DashboardRoute.tsx` ~:119 and
  `src/routes/InvestmentsAnalyticsTab.tsx` ~:66 — `CHART_COLORS` arrays end
  with raw hex `"#2dd4bf", "#fb923c"` after `--ns-chart-1..5`.
- `src/routes/MerchantsTab.tsx:65` — pie palette entirely hardcoded:
  `["#f87171","#fb923c","#facc15","#4ade80","#2dd4bf","#60a5fa","#a78bfa","#f472b6"]`.

Fix: add `--ns-chart-6` and `--ns-chart-7` to globals.css — in ALL THREE
theme blocks (light / prefers-dark / data-theme=dark; prior plan 107
established there are three) — choosing OKLCH-adjacent values to the existing
ramp (dark: teal `#2dd4bf`→ keep as chart-6 dark value, orange `#fb923c` as
chart-7 dark; derive light-mode counterparts by matching the existing tokens'
dark→light lightness/chroma shift, e.g. chart-2 `#6fb3ff`→`#2c6df0` shows the
pattern — darker + more saturated for light bg). Update DESIGN.md §2.5 table.
Replace the raw hex with the new tokens; MerchantsTab's 8-color pie cycles
`--ns-chart-1..7` (8th slice wraps to chart-1 with the existing cycling —
check how it indexes; `% length` already handles it).

**Verify**: `grep -n '#2dd4bf\|#fb923c\|#f87171' src/routes` → 0 hits;
`npx tsc` green.

### B — `#000`/`#fff` on accent/colored fills

Sites (re-derive: `grep -rn '"#fff"\|"#000"' src/routes src/components --include="*.tsx"`):
`InvestmentImportWizard.tsx:211`, `ManualPriceImportWizard.tsx:120` (step
dots: `color: done ? "#000" : ...` on accent fill), `RecurringRulesTab.tsx:388`
(active segment `#fff`), `CashFlowRoute.tsx:1946,2192,2462`,
`QuickAdd.tsx:308,400` (active chips `#fff`), toggle knobs
`RecurringRulesTab.tsx:500`, `settings/TradingFeesSection.tsx:80`
(`background: "#fff"`).

Fix: text on `--ns-accent` → `var(--ns-accent-fg)`. Text on a colored
CATEGORY fill (chips with data-driven colors) → judge per site: if the fill
is accent, accent-fg; if the fill is arbitrary category color, keep a
computed/contrast value but via token (`--ns-fg` on soft fills) — record each
call. Toggle knobs → `var(--ns-bg-elev)` or `--ns-fg` per visual role (knob
on colored track = bg-elev).

**Verify**: the grep above → 0 hits in the listed files (report any
legitimately-remaining with reasons); visual spot-check both themes.

### C — `.toFixed(n) + "%"` → `formatPercent`

`formatPercent(value, fractionDigits = 2)` exists (`src/domain/currency.ts:144`
— read it first: confirm input scale (0.274 vs 27.4) and sign handling; the
call sites hold PERCENT-scale numbers like `27.4`, so if `formatPercent`
expects a RATIO, this item is a mis-fit → STOP item and report).
Sites (~20): `InvestmentsAnalyticsTab.tsx` :654,:691,:712,:738-739,:768,
:845,:854,:970,:997; `CategoriesTab.tsx` :114,:165,:174,:200,:243,:267;
`MerchantsTab.tsx:134`; `MerchantDetailRoute.tsx:192`;
`HoldingDetailRoute.tsx:398,:492`. Preserve each site's current digit count
(pass `fractionDigits` explicitly); where a site hand-writes the +/− sign,
check formatPercent's own sign behavior and keep output identical modulo the
U+2212 minus (which the helpers standardize — an intended improvement).

**Verify**: `npm test` green; grep `toFixed(1) + "%"` / `toFixed(2)}%` in the
listed files → 0 (allow non-percent toFixed like ratios `fmtRatio`).

### D — `.ns-field-label` stragglers

The class exists (`globals.css:553`:
`margin-bottom: 6px; color: var(--ns-fg-muted); font-weight: 500;`). Sites
still inlining that exact object (± marginBottom):
`MerchantDetailRoute.tsx:116,289,299`; `CategoryDetailRoute.tsx:161,335,394,404`;
`InvestmentImportWizard.tsx:542`; `TransactionsRoute.tsx:630`;
`RecurringRulesTab.tsx:195`. Rule from the completed 115 campaign: apply the
class ONLY where the inline object matches exactly (marginBottom 6 + muted +
500); variants with different margins → keep color/weight via class +
Tailwind margin utility (`mb-2` etc.) matching the ORIGINAL pixel value —
pixel-identity is the bar, as in the 115 merges.

**Verify**: the listed lines no longer inline the trio; `npm run lint` green.

### E — QuickAdd chip colors + masked display

`src/components/QuickAdd.tsx` ~:476-500 (excerpt verified):
- 分類 chip `"#a855f7"`, 日期/價格 chips `"#f59e0b"`; investment-branch 帳戶
  chip `"#a855f7"` while the ledger branch uses `var(--ns-accent)` — same
  concept, different color.
- Display chips render `parsed.amount.toLocaleString("zh-TW")` (:476) and
  `parsed.price.toLocaleString("zh-TW")` (:496) — these are DISPLAY (parse
  preview), so route them through `formatNumber`/`formatPrice` from
  `src/domain` (privacy mask + U+2212). Do NOT touch the editable input's
  own formatting (~:261) — inputs are exempt by convention.

Fix mapping (both branches identical): 金額/股數 → `var(--ns-pos)` (kept —
cash-sign semantics), 帳戶 → `var(--ns-accent)`, 分類 → `var(--ns-info)`,
日期/價格 → `var(--ns-warn)`, 標的 → `var(--ns-accent)`, names/merchant →
`var(--ns-fg-muted)` (unchanged).

**Verify**: `grep -n '#a855f7\|#f59e0b' src/components/QuickAdd.tsx` → 0;
`npm test` green (QuickAdd has parser tests — display change shouldn't touch
them; if a snapshot-ish test asserts chip output, update it consciously).

## Commands

`npx tsc` (exit 0), `npm test` (all pass), `npm run lint` (exit 0).

## Scope

**In scope**: files listed per item + `globals.css` (item A tokens only) +
DESIGN.md §2.5 table row. **Out of scope**: gain/loss semantics (plan 134),
scrims (136), any layout change, `NumberField`/`FIRECalculatorRoute` input
formatting.

## Git workflow

Branch `refactor/ai-token-compliance`; one conventional commit per item.
No push/merge.

## Done criteria

- [ ] Per-item greps clean (or STOP-reported)
- [ ] `--ns-chart-6/7` in all three theme blocks + DESIGN.md updated
- [ ] QuickAdd display chips use domain formatters (privacy-mask test:
      if a mask test pattern exists, add one for the chip path)
- [ ] Gates green; `plans/README.md` updated with per-item outcomes

## STOP conditions

- Item C's formatPercent scale mismatch (see above).
- Any item's "pixel-identical" bar can't be met without new CSS beyond the
  two chart tokens.

## Maintenance notes

- Item A: if an 8th series ever appears regularly, extend the ramp
  deliberately, don't inline hex.
- Reviewer: item C is the riskiest diff-noise item — scan for accidental
  digit-count changes.
