# Plan 237: Retire 137-C — delete the dead `formatPercent`, record the won't-do

> **Executor instructions**: Follow steps exactly. Do NOT update `plans/README.md`.
>
> **Drift check**: `git diff --stat 82839b85..HEAD -- src/domain/currency.ts`
> Non-empty = compare first.

## Status

- **Priority**: P3 · **Effort**: XS · **Risk**: LOW
- **Depends on**: none · **Category**: tech-debt (dead code)
- **Planned at**: commit `82839b85`, 2026-07-19

## Why this matters

137-C proposed migrating percent formatting to `formatPercent`
(`src/domain/currency.ts:230-233`) and was recorded WON'T-DO-as-specced (it
multiplies by 100, expecting ratios; call sites hold percent-scale values).
The 2026-07-19 re-audit found the stronger fact: **`formatPercent` has ZERO
call sites** (grep) while the app has ~91 bespoke `` `${x.toFixed(n)}%` ``
sites with per-site sign conventions. Migrating 91 display sites is L-effort
churn for marginal value (amounts are already privacy-masked; percents alone
reveal little). Verdict: retire the migration idea, delete the dead function
so nobody "discovers" and adopts a ratio-scale formatter against
percent-scale data — that latent unit bug is the real risk.

## Steps

1. Delete `formatPercent` from `src/domain/currency.ts` (:230-233). Check
   `MASKED_PERCENT` usage (grep repo-wide): if `formatPercent` was its only
   consumer, delete the constant too; if tests reference either, delete those
   assertions/cases (they test dead code).
2. Grep `formatPercent` repo-wide → 0 hits (incl. tests).

**Verify**: `npx tsc --noEmit` → 0 · `npm run lint` → 0 errors and AT MOST 761
warnings (deleting code may reduce the count — record the new number) ·
`npm test` → all pass.

Commit: `chore: delete dead formatPercent — 137-C retired as won't-do (plan 237)`
with the standard Co-Authored-By trailer.

## Scope

In: `src/domain/currency.ts` + its test file. Out: every `%` display site (the
whole point is NOT touching 91 files).

## STOP conditions

- `formatPercent` turns out to have a live call site the recon grep missed.

## Maintenance notes

- If percent privacy-masking is ever demanded, the right shape is a
  percent-scale `formatPct(valueInPercent, digits)` with mask + typographic
  minus, adopted opportunistically at HIGH-sensitivity sites only (investment
  returns), never a 91-site sweep. Recorded here so the next audit doesn't
  re-derive this.
