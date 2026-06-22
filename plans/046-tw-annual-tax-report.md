# Plan 046: Taiwan annual tax / year-end report — realized gains + dividends by year

> **Executor instructions**: This is a **design-first plan with a decision
> gate**. Phase 0 produces a short design note and requires operator sign-off on
> the scope/口徑 before any UI is written. Do NOT skip to Phase 1 until the gate
> is resolved. Follow the plan step by step; run every verification command and
> confirm the expected result before moving on. If anything in "STOP conditions"
> occurs, stop and report — do not improvise. When done, update this plan's row
> in `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 8f2e90bd..HEAD -- src/domain/portfolioMetrics.ts src/domain/dividendAnalysis.ts src/routes/router.tsx`
> If any in-scope file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch, treat
> it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M (a by-year aggregation domain layer + one report route; PDF export is a deferred follow-up)
- **Risk**: MED (touches realized-gain accounting — finance correctness; must not change existing totals)
- **Depends on**: none
- **Category**: direction (feature)
- **Planned at**: commit `8f2e90bd`, 2026-06-21

## Why this matters

`ROADMAP.md` 規劃中 lists **「台灣稅務」** and **「報表匯出 — 月度/年度財務摘要 PDF
（…投資績效），供報稅與家庭會議用」**. Taiwanese users need a year-end view of
**realized capital gains** (證券交易所得 — needed even though TW currently taxes
securities transactions via 證交稅 rather than gains, household 記帳/報稅 still
wants the number) and **dividend income** (股利所得, a real income-tax item).

The inputs already exist but there is **no year-bucketed surface**:
- `dividendAnalysis.byYear` already aggregates cash dividends per calendar year.
- `portfolioMetrics`/`buildPositionMetrics` computes `realizedGain` but only as a
  **single lifetime scalar per position** — never bucketed by the year the gain
  was realized.
- There is **no `/reports`, `/tax`, or annual route at all**
  (`ls src/routes | grep -iE 'tax|report|annual'` → nothing).

This is the classic "data exists, presentation missing" win and the most
TW-specific user value left after Phase 6 shipped. Phase 1 of this plan stops at
**a correct, tested by-year aggregation + a read-only report route**; PDF export
is explicitly deferred so the risky finance-math part lands independently.

## Current state

Files and roles:

- `src/domain/portfolioMetrics.ts` — `buildPositionMetrics(records)` walks one
  asset's `InvestmentRecord[]` in date order with moving-average accounting and
  returns `PositionMetrics` including `realizedGain: number` (lifetime scalar).
  The realized-gain math lives in the `sell` and `capitalReduction` branches.
- `src/domain/dividendAnalysis.ts` — `buildDividendAnalysis(...)` already returns
  `byYear: Array<{ year: string; total: number }>` (ascending, only years with
  dividends). **Reuse this directly for the dividend half — do not recompute.**
- `src/routes/router.tsx` — all routes are declared with `createRoute({...})`,
  components are loaded via `lazyRouteComponent`, and every route is added to
  `rootRoute.addChildren([...])`.

The realized-gain producing branches today (`portfolioMetrics.ts`, inside
`buildPositionMetrics`):

```ts
} else if (r.action === "sell") {
  const avg = quantity === 0 ? 0 : cost / quantity;
  const soldQty = Math.min(r.quantity, quantity);
  const proceeds = r.price * r.quantity - r.fee;
  realizedGain += proceeds - avg * soldQty;   // ← the per-sell realized gain
  quantity -= r.quantity;
  cost -= avg * soldQty;
  cashflows.push({ date: day(r.date), amount: proceeds });
  settle();
} else if (r.action === "capitalReduction") {
  // ...
  if (cashReturned > basisReduced) realizedGain += cashReturned - basisReduced;
  // ...
}
```

`dividendAnalysis.byYear` shape (`dividendAnalysis.ts:22-24`):

```ts
export interface DividendAnalysis {
  /** Per calendar year, ascending. Only years with dividends appear. */
  byYear: Array<{ year: string; total: number }>;
  // ...
}
```

The router pattern (`router.tsx`):

```ts
const fireCalculatorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/goals/fire",
  component: FIRECalculatorRoute,
  // ...
});
const routeTree = rootRoute.addChildren([ /* ...all routes... */ ]);
```

### Conventions to follow

- **Finance correctness invariant** (`AGENTS.md` #1, `ROADMAP.md` 執行原則 #1):
  calculations must be explainable and testable; every domain change ships unit
  tests;口徑變更需在 UI 標示說明. A by-year realized-gain breakdown must, when
  summed across all years for a position, **equal the existing lifetime
  `realizedGain`** — that equality is the regression guard.
- **i18n**: zh-TW first; header convention is an English eyebrow + Chinese h1
  (`DESIGN.md` §3.5). Model the new route's header on an existing route
  (e.g. `GoalsRoute.tsx`). The eyebrow may stay English (e.g. `ANNUAL REPORT`).
- New domain modules live in `src/domain/` with a co-located `*.test.ts`
  (vitest). Pure functions, no I/O. Model after `dividendAnalysis.ts` +
  `dividendAnalysis.test.ts`.
- Display precision: amounts via the existing currency formatter used elsewhere
  (grep `formatCurrency`/`toPrimary` in routes); tabular nums + 漲跌色 for
  gains/losses follow the existing tables (see `InvestmentsAnalyticsTab.tsx`).

## Decision gate (Phase 0 — REQUIRED before any UI)

Write a short design note at `docs/annual-report-plan.md` and get operator
sign-off on these decisions. Recommend the first option of each.

**Decision A — which year is a realized gain attributed to?**
- **(Recommended)** The **sell/`capitalReduction` record's own year** (`r.date`
  sliced to `YYYY`). This matches how a tax authority sees a disposal: the gain
  is realized on the disposal date. Each disposal contributes its
  `proceeds − avg×soldQty` (using the moving-average cost *at the moment of that
  sell*, exactly as `buildPositionMetrics` already computes it) to that year.
- (Alternative) Lot-matched FIFO years — irrelevant here because Northstar's
  locked cost model is **moving-average, not FIFO** (`AGENTS.md` invariant #1;
  `fifoCalculator.ts` exists but is not the canonical cost basis). Do not switch
  models. (If the operator wants FIFO-year reporting, that is a separate,
  model-changing decision — STOP.)

**Decision B — report scope for v1.**
- **(Recommended)** Two sections per year: **已實現損益 (realized gains/losses)**
  and **股利所得 (dividends, from `dividendAnalysis.byYear`)**, plus a per-year
  total. Currency: report in primary currency using the same conversion the rest
  of the app uses; note FX-at-disposal vs FX-today as a caveat (see Decision C).
- (Alternative) Add 證交稅/手續費 cost summaries (plan 026's `tradingFees`
  already records these) — nice but expands scope; defer to a follow-up.

**Decision C — FX口徑 caveat.** State explicitly in the note and surface in the
UI: are foreign-currency gains converted at the disposal-date rate or today's
rate? Recommended v1: **disposal-date rate** if `dailyFxRates` has it, else
today's, with a UI 註記 (mirror plan 015's caveat pattern). Whichever is chosen,
the UI must say which (口徑 disclosure invariant).

**Gate**: STOP after writing the note and present Decisions A/B/C to the
operator. Record the chosen options at the top of the note before Phase 1.

## Commands you will need

| Purpose   | Command                                            | Expected on success |
|-----------|----------------------------------------------------|---------------------|
| Typecheck | `npx tsc --noEmit`                                 | exit 0              |
| Tests     | `npm test`                                          | all pass            |
| Test one  | `npx vitest run src/domain/annualReport.test.ts`   | all pass            |
| Lint      | `npm run lint`                                      | exit 0 (0 errors)   |
| Build     | `npm run build`                                     | exit 0              |

## Scope

**Phase 1 (after the gate) — In scope:**
- `src/domain/annualReport.ts` (create) — pure aggregation: given all assets +
  records (+ the dividend analysis), produce per-year realized gain and pull
  per-year dividends. Reuse `buildPositionMetrics`' exact realized-gain formula;
  do NOT fork the accounting.
- `src/domain/annualReport.test.ts` (create) — see Test plan.
- `src/routes/AnnualReportRoute.tsx` (create) — read-only report surface.
- `src/routes/router.tsx` — register the new route (declare + add to tree).
- One nav entry to reach it (model on how `/goals/fire` is linked from
  `GoalsRoute.tsx`; grep for the existing link). Add it where reports logically
  belong (Investments or Settings) — keep the diff to the single nav file.

**Out of scope (do NOT touch / defer to a follow-up plan):**
- **PDF export** — explicitly deferred. v1 is an on-screen report only. Note the
  follow-up in the design doc.
- `buildPositionMetrics` lifetime `realizedGain` semantics — must stay
  byte-for-byte. The new module *re-derives* per-year buckets using the same
  formula; it does not edit the existing function. (If you find you must edit
  `buildPositionMetrics` to expose per-disposal data, prefer adding an *optional*
  returned array rather than changing existing fields — and re-run all
  `portfolioMetrics.test.ts` to prove no existing expectation changed.)
- Cost-basis model change (FIFO) — locked finance semantics; STOP if requested.
- Any change to `dividendAnalysis.ts` (just consume `byYear`).

## Git workflow

- Branch from current main: `git checkout -B advisor/046-tw-annual-report main`.
- Commit the design note separately from Phase 1 code.
- Match the repo's short imperative commit style. Do NOT push/PR unless told.

## Steps

### Step 0 (gate): design note + operator decision
Write `docs/annual-report-plan.md` covering Decisions A/B/C with recommended
options. **STOP and get sign-off.** Record chosen options at the top.

### Step 1: per-year realized-gain aggregation (domain)
Create `src/domain/annualReport.ts` exporting a pure function, e.g.:

```ts
export interface AnnualReportYear {
  year: string;            // "2025"
  realizedGain: number;    // primary currency, net of fees, moving-average
  dividends: number;       // from dividendAnalysis.byYear
  total: number;           // realizedGain + dividends
}
export function buildAnnualReport(input: {
  assets: PortfolioAsset[];
  recordsByAsset: (assetId: string) => InvestmentRecord[]; // or pass records grouped
  dividendByYear: Array<{ year: string; total: number }>;
  // + FX conversion seam per Decision C
}): AnnualReportYear[]; // ascending by year
```

Walk each asset's records exactly like `buildPositionMetrics` (moving-average;
accumulate `proceeds − avg×soldQty` on `sell`, and the `capitalReduction`
excess), but **attribute each realized amount to `r.date.slice(0,4)`** (Decision
A). Merge dividends from `dividendByYear`. Convert foreign-currency amounts per
Decision C. Sum into per-year buckets, ascending.

**Verify**: `npx vitest run src/domain/annualReport.test.ts` → all pass.

### Step 2: the report route
Create `src/routes/AnnualReportRoute.tsx`: pull data via `useFinanceData()`
(same hook the other routes use), build `dividendAnalysis` the same way existing
routes do, call `buildAnnualReport`, and render a per-year table (已實現損益 /
股利所得 / 合計) with the FX口徑 caveat (Decision C). Include the loading +
query-error guard pattern that plans 016/017 added to every data route (copy a
guarded route as the exemplar). Header = English eyebrow + Chinese h1.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: register the route + nav
Declare the route in `router.tsx` with `createRoute` + `lazyRouteComponent` and
add it to `rootRoute.addChildren([...])`. Add one nav link.

**Verify**: `npm run build` → exit 0.

### Step 4: full verification
**Verify**: `npx tsc --noEmit` exit 0; `npm test` all pass; `npm run lint` 0
errors; `npm run build` exit 0.

## Test plan

Add `src/domain/annualReport.test.ts` (model after `dividendAnalysis.test.ts`):

- **Equality guard (load-bearing)**: for a position with sells across two years,
  the sum of per-year `realizedGain` **equals** `buildPositionMetrics(records).realizedGain`
  for the same records. (Assert exact equality within EPS.)
- A buy then sell in the same year → that year's realized gain = proceeds − cost.
- Sells in two different years → each year gets its own disposal's gain.
- A `capitalReduction` with cash above basis → excess attributed to its year.
- Dividends-only year (no disposals) still appears with realizedGain 0.
- A year with neither → does not appear (mirror `byYear`'s "only years with
  activity").
- Foreign-currency disposal converts per the Decision-C seam (inject a stub FX
  function and assert conversion).

Verification: `npx vitest run src/domain/annualReport.test.ts` → all pass.

## Done criteria

ALL must hold:

- [ ] `docs/annual-report-plan.md` exists and records the operator's A/B/C choices
- [ ] `src/domain/annualReport.ts` exists; per-year realized gains sum to the
      existing lifetime `realizedGain` (proven by a test)
- [ ] `buildPositionMetrics` and `dividendAnalysis.ts` are unchanged in behavior
      (no existing test's expected value edited)
- [ ] A reachable `/reports` (or chosen path) route renders per-year 已實現損益 +
      股利 + 合計 with the FX口徑 caveat
- [ ] `npx tsc --noEmit` exits 0; `npm test` exits 0; `npm run lint` 0 errors;
      `npm run build` exits 0
- [ ] No files outside the Phase-1 in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The operator has not signed off on Decisions A/B/C.
- The code at the cited lines doesn't match the excerpts (drift since `8f2e90bd`).
- Producing per-year buckets forces editing `buildPositionMetrics`' existing
  return fields (rather than adding an optional one) — that risks the lifetime
  totals; stop and report.
- Any existing `portfolioMetrics.test.ts` or `dividendAnalysis.test.ts`
  expectation would change — that's a regression, not allowed.
- The operator asks for FIFO-year attribution — that changes the locked cost
  model; stop and escalate.

## Maintenance notes

- For the reviewer: the load-bearing property is **sum-of-years === lifetime
  realizedGain**. Scrutinize the test that proves it and that no existing finance
  test was edited.
- Deferred follow-ups (write as later plans): **PDF export** of this report
  (and a parallel monthly/annual cash-flow summary PDF — the roadmap pairs them);
  adding 證交稅/手續費 cost rows from plan 026's `tradingFees`; per-holding
  drill-down within a year.
- If a future plan adds FX-at-disposal storage, the Decision-C seam is where it
  plugs in — keep FX conversion behind that injected function.
