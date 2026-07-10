# Plan 121: Make missing FX rates visible instead of silently valuing money at 0

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 65fe04c1..HEAD -- src/domain/currency.ts src/domain/dividendAnalysis.ts src/domain/annualReport.ts src/domain/valuation.ts`
> Re-locate excerpts by grep on mismatch; STOP if shapes differ.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (touches the converter every aggregate uses)
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `65fe04c1`, 2026-07-09

## Why this matters

`createFxConverter(...).toPrimary` coerces "no rate available" (`null`) to
`0`. Downstream, a USD dividend with no USD→TWD rate contributes **0** to net
worth, TTM yield, dividend totals, and the annual tax report — silently
understating headline numbers. This violates the project's first invariant
("calculations must be explainable"). Some surfaces already track missing FX
(`CashFlowRoute` computes a `missingFx` list by checking `toPrimary(row) ===
null` — note: that code works because a different row-level overload returns
null; the scalar `toPrimary` here does not). The fix: expose the miss at the
converter boundary and surface it in the three aggregates that eat it today.

## Current state

`src/domain/currency.ts` (~line 48):

```ts
export function createFxConverter(
  settings: AppSettings | undefined,
  dailyRates: DailyFxRate[] | undefined,
) {
  const primary = settings?.primaryCurrency ?? "TWD";
  const rates = dailyRates ?? [];
  function toPrimary(amount: number, currency: string, asOfDate?: string) {
    return convertCurrency(amount, currency, primary, settings, {
      dailyRates: rates,
      asOfDate,
    }) ?? 0;
  }
  return { toPrimary, primaryCurrency: primary };
```

`convertCurrency` returns `number | null` (null when neither settings rates
nor daily rates cover the pair, `currency.ts:~35`).

Silent-zero consumers (verified):

- `src/domain/dividendAnalysis.ts:62-66` — `if (amount === 0) continue;` a
  null→0 conversion is indistinguishable from a zero dividend.
- `src/domain/annualReport.ts:201-205` — same pattern for the tax report.
- `src/domain/valuation.ts:194-197` — `sum += toPrimary(...)` adds 0 for an
  unpriced leg of net worth.

Existing signal surfaces to reuse: `src/domain/dataHealth.ts` (~line 216)
already flags missing rates as a data-health issue; `CashFlowRoute` shows a
`missingFx` chip list. Follow those patterns for presentation vocabulary
(zh-TW copy, e.g. 「缺少匯率」).

## Commands you will need

| Purpose   | Command        | Expected on success |
|-----------|----------------|---------------------|
| Typecheck | `npx tsc`      | exit 0              |
| Tests     | `npm test`     | all pass (~831)     |
| Lint      | `npm run lint` | exit 0              |

## Scope

**In scope**:
- `src/domain/currency.ts` — add a null-aware converter variant (do NOT change
  the existing `toPrimary` contract; see Step 1)
- `src/domain/dividendAnalysis.ts`, `src/domain/annualReport.ts`,
  `src/domain/valuation.ts` — count/report misses
- Their test files (`dividendAnalysis.test.ts`, `annualReport.test.ts`,
  `valuation.test.ts`)
- ONE presentation touchpoint: the annual report route already renders
  domain output — add the miss count to its output type and render a warning
  line in `src/routes/AnnualReportRoute.tsx` following the existing warn
  styling there (`--ns-warn` token).

**Out of scope**:
- Changing `toPrimary`'s `?? 0` for ALL existing callers (dozens of call
  sites assume `number`) — the migration is additive.
- Fallback-to-last-known-rate behavior (a semantics change; not decided).
- Dashboard/Investments hero surfaces (follow-up once the pattern proves out).

## Git workflow

- Branch: `fix/ai-fx-missing-rate-visibility`
- Commit style: `fix(fx): surface missing-rate conversions instead of silent 0`
- Do NOT push or merge to `main`.

## Steps

### Step 1: Add `toPrimaryOrNull` to the converter

In `createFxConverter`, add alongside `toPrimary`:

```ts
  function toPrimaryOrNull(amount: number, currency: string, asOfDate?: string): number | null {
    return convertCurrency(amount, currency, primary, settings, { dailyRates: rates, asOfDate });
  }
```

Return it from the factory. Existing `toPrimary` stays byte-identical.

**Verify**: `npx tsc` → exit 0; `npm test` → all pass (nothing consumed yet).

### Step 2: Dividend analysis + annual report count misses

In both files, switch the conversion call to the null-aware variant. On
`null`: skip the record as today, but increment a new counter and record the
currency pair. Extend the return types, e.g. `fxMisses: { count: number;
currencies: string[] }` (exact naming: match each file's existing style).
`amount === 0` for a genuinely zero dividend keeps its current behavior.
Note the functions receive `toPrimary` from callers — extend the accepted
converter parameter type to carry both functions, and update the call sites
that construct it (grep `buildDividendAnalysis(` and the annualReport builder's
callers; they all pass the object from `createFxConverter`, so Step 1 already
provides the field).

Add tests: a dividend in a currency with no rate → excluded from totals AND
`fxMisses.count === 1` with the pair listed; with a rate → unchanged totals,
`count === 0`. Model on existing cases in each test file.

**Verify**: `npm test -- dividendAnalysis annualReport` → all pass incl. new.

### Step 3: Valuation counts misses

Same treatment in `valuation.ts` for the summing site: null → skip + count.
Check the function's return shape and extend minimally (if it returns a bare
number, return `{ total, fxMissCount }` ONLY if its callers are few — count
them first with grep; if >5 callers, add a parallel function
`...WithDiagnostics` and leave the original delegating to it). Add a test.

**Verify**: `npm test -- valuation` → all pass.

### Step 4: Render the annual-report warning

In `src/routes/AnnualReportRoute.tsx`, when `fxMisses.count > 0`, render one
warning line near the year totals: 「有 N 筆配息因缺少匯率未計入（CUR→TWD）」
using `var(--ns-warn)` color and existing layout classes (match the file's
current warn/annotation pattern; do not invent new styles — see DESIGN.md
§12.8 styling priority: existing class > Tailwind utility > inline only for
dynamic values).

**Verify**: `npx tsc` → exit 0; `npm run lint` → exit 0 (note: routes ban raw
`toLocaleString`; use `formatNumber` from `src/domain/currency.ts` if you
print the count formatted).

### Step 5: Full gates

**Verify**: `npm test` → all pass.

## Done criteria

- [ ] `createFxConverter` exposes `toPrimaryOrNull`; `toPrimary` unchanged
- [ ] dividendAnalysis / annualReport / valuation report miss counts; ≥4 new
      tests pass
- [ ] AnnualReportRoute shows the warning when misses exist
- [ ] `npm test`, `npx tsc`, `npm run lint` all green
- [ ] `plans/README.md` updated

## STOP conditions

- The converter object is passed through more than ~2 intermediate types to
  reach dividendAnalysis (type surgery bigger than planned) — report the chain.
- valuation.ts's summing function has >5 direct callers AND the parallel
  `...WithDiagnostics` split also fans out — report instead of refactoring.
- Any existing test asserts the silent-zero behavior on purpose.

## Maintenance notes

- Follow-up (deferred): dashboard net-worth hero and Investments KPIs should
  eventually show the same miss signal; do it after this pattern settles.
- Reviewer: check no call site started treating `0` (real zero) as a miss.
- Related settled decision: fallback-to-stale-rate was NOT chosen; misses are
  excluded and counted.
