# Plan 134: Use market gain/loss tokens (not fixed pos/neg) on investment P&L surfaces

> **Executor instructions**: Follow this plan step by step. Run every
> verification command. If anything in the "STOP conditions" section occurs,
> stop and report. When done, update this plan's status row in
> `plans/README.md` — unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 65fe04c1..HEAD -- src/routes/HoldingDetailRoute.tsx src/routes/InvestmentsAnalyticsTab.tsx src/components/coss/badge.tsx src/styles/globals.css`
> Re-locate by grep; STOP on mismatch.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW–MED (must not flip genuinely-fixed semantics)
- **Depends on**: none
- **Category**: bug (design-system semantics)
- **Planned at**: commit `65fe04c1`, 2026-07-09

## Why this matters

DESIGN.md §2.4 defines two DISJOINT semantic color sets: `--ns-pos/--ns-neg`
(fixed green/red: success/error, cash-flow signs) and `--ns-gain/--ns-loss`
(market up/down — flips to red-up/green-down under `[data-gainloss="tw"]`, a
user setting). Litmus: 「台股使用者會不會預期這個數字紅漲綠跌？」會 →
gain/loss. The holdings LIST obeys this; the holding DETAIL hero and the
entire Analytics tab do not — a 紅漲綠跌 user sees the same P&L number green
on one screen and red-refused on another.

## Current state (all verified)

**Wrong (fix to gain/loss):**

1. `src/routes/HoldingDetailRoute.tsx:393` and `:397` — hero badges:
   ```tsx
   <Badge variant={pos ? "success" : "error"} ...>
   ```
   `success`→`--ns-pos`, `error`→`--ns-neg` via the COSS bridge
   (`globals.css:74-77`). Same page's stat table (~:491) already uses
   gain/loss tone — internal inconsistency. Also `:398` renders
   `unrealizedGainPercent.toFixed(2)% (Total)` — while here, replace the
   English `(Total)` with zh-TW copy (總計) or drop it, and note the toFixed
   for plan 137's formatPercent sweep (do NOT fix formatting here).
2. `src/routes/InvestmentsAnalyticsTab.tsx:1387` — momentum heat base:
   ```ts
   const base = t >= 0 ? "var(--ns-pos)" : "var(--ns-neg)";
   ```
3. `InvestmentsAnalyticsTab.tsx:1619` — per-position 1Y return color ternary.
4. `InvestmentsAnalyticsTab.tsx:1781` — calendar month return color ternary.
5. `InvestmentsAnalyticsTab.tsx:1046-1047` — a `--ns-pos-soft`/`--ns-pos`
   badge: read its surrounding component; if it renders a RETURN/알pha value
   → gain/loss-soft; if it's a status/quality cue → leave and record.

**Intentionally fixed (do NOT change — record as checked):**
- KpiCard accents `InvestmentsAnalyticsTab.tsx:843` (Sortino, `--ns-pos`) and
  `:861` (Max Drawdown, `--ns-neg`) — these color the METRIC CARD as a
  quality/risk cue, not a price direction; a TW user does not expect Sortino
  red-when-good. Leave them.
- All cash-flow/income/expense signs, toasts, budget warnings.

**Mechanics available:** text classes `.gain`/`.loss` exist (DESIGN.md §2.4);
tokens `--ns-gain/--ns-loss/(-soft)`. The COSS `Badge`
(`src/components/coss/badge.tsx`) has `success`/`error` variants only — add
`gain`/`loss` variants mirroring them but on `--ns-gain`/`--ns-loss` (wire
through the bridge vars the same way `--success` maps; check
`globals.css:1497-1520` for how `--color-success` is exposed to Tailwind and
add `--gain`/`--loss` equivalents in the SAME blocks — note globals.css has
THREE theme blocks: light, prefers-dark, data-theme=dark; a prior plan (107)
confirmed all three must be updated).

## Commands

`npx tsc` (exit 0), `npm test` (all pass), `npm run lint` (exit 0).

## Scope

**In scope**: the two route files above; `coss/badge.tsx` (+ its Tailwind
bridge vars in `globals.css`); a grep-driven check of the OTHER investment
surfaces for the same mistake (`grep -n "ns-pos\|ns-neg" src/routes/HoldingDetailRoute.tsx src/routes/InvestmentsAnalyticsTab.tsx src/routes/InvestmentsRoute.tsx`) —
fix only sites that pass the litmus test, list every judgment in the report.

**Out of scope**: DashboardRoute movers (verify: grep `gain`/`loss` there —
the audit believed they're correct; if wrong, report, don't expand scope);
cash-flow surfaces; chart series colors; formatting (plan 137).

## Git workflow

Branch `fix/ai-gainloss-semantics`; commit
`fix(design): market P&L surfaces use gain/loss tokens (data-gainloss aware)`.
No push/merge.

## Steps

1. Add `gain`/`loss` Badge variants + bridge vars (all three theme blocks).
   **Verify**: `npx tsc`; a quick unit/DOM test is optional — variants are
   class strings.
2. Fix HoldingDetail hero badges → `variant={pos ? "gain" : "loss"}`; fix the
   `(Total)` string.
3. Fix the three Analytics ternaries (+ site 5 judgment call) →
   `--ns-gain`/`--ns-loss` (and `-soft` where `-soft` was used).
4. Grep sweep + judgment list in report.
   **Verify**: `npm test`, `npm run lint` green;
   `grep -n '"success" : "error"' src/routes/HoldingDetailRoute.tsx` → 0 hits.
5. Visual check: if a preview server is available, load
   `/holdings/<any>` and Analytics with `data-gainloss="tw"` set (Settings →
   盈虧配色 → 紅漲綠跌) and confirm gains render red. Otherwise note
   "operator visual check: TW palette on HoldingDetail hero + Analytics".

## Done criteria

- [ ] Badge has gain/loss variants wired in all three theme blocks
- [ ] The five listed sites use gain/loss (or a recorded leave-decision for #5)
- [ ] Judgment list for the grep sweep in the report
- [ ] Gates green; `plans/README.md` updated

## STOP conditions

- The Badge/Tailwind bridge doesn't propagate a new variant without touching
  the Tailwind config beyond globals.css.
- Sortino/drawdown cards turn out to RENDER return values (not just accents)
  — the leave-decision then needs operator input.

## Maintenance notes

- New investment UI must pass the §2.4 litmus; this plan's report becomes the
  reference list.
- Reviewer: toggle all three gainloss modes; confirm `.gain`-on-neutral reads
  correctly in light mode.
