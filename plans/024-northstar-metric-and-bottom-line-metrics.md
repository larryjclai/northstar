# Plan 024: Northstar Metric framework + 底氣 metric set (Coverage Ratio & Runway)

> **Executor instructions**: This is a **design-forward feature plan** (ROADMAP
> Phase 6.1–6.3). It has product-design surface — follow the "Design decisions
> (already made)" section as settled, and honor every STOP condition where a
> further choice would change finance semantics. Build the domain metrics first
> (Step 2, fully testable), then the preference + framework, then the Dashboard
> hero. Run every verification command before moving on. When done, update this
> plan's row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 4cc86eab..HEAD -- src/state/uiPreferences.ts src/domain/dashboardSummary.ts src/domain/dividendAnalysis.ts src/routes/DashboardRoute.tsx`
> If any in-scope file changed since this plan was written, read it and re-confirm
> the "Current state" excerpts before proceeding.

## Status

- **Priority**: P2 (signature direction — high leverage, data already exists)
- **Effort**: M–L (split-able: domain metrics M, framework + hero M)
- **Risk**: MED (new finance-display metrics — must be correct & explainable)
- **Depends on**: none
- **Category**: direction (feature)
- **Planned at**: commit `4cc86eab`, 2026-06-18

## Why this matters

The app is named **Northstar** but has no "north-star metric": the Dashboard hero
is hardcoded to net worth, and there is no single, user-chosen, long-term number
that the product orients around (`ROADMAP.md` 6.1). The 初衷 is **「選擇的底氣 /
拒絕的權利」** — and the two metrics that make that tangible (被動收入覆蓋率,
底氣 runway) don't exist yet. The data is *already computed* (TTM dividends,
monthly expense, liquid assets, net worth), so this is mostly **aggregation +
presentation** — unusually high leverage for a signature feature. This plan
delivers: (B) Coverage Ratio + (C) Runway as correct, tested domain metrics, then
(A) a framework letting the user pin any one metric as the Dashboard hero with a
trend.

## Current state (verified at 4cc86eab)

**Preference store** — `src/state/uiPreferences.ts`: a zustand store persisted to
`localStorage` under `STORAGE_KEY = "northstar.uiPreferences.v1"` (line 71). New
prefs follow the existing pattern of `benchmarkTicker` / `dashboardHiddenCards`:
add a field to the `UiPreferences` interface (~lines 19–56), a setter, include it
in the persisted `snapshot()`/`PersistedShape`, and load it in the initializer
(~line 117). `persist(snapshot(get()))` is called from each setter.

**Metric inputs already available** (all in `src/domain/`):
- **Net worth**: `buildNetWorthBreakdown(...)` → `.netWorth` (`dashboardSummary.ts:77,104`).
- **Liquid assets**: `calculateAvailableCash(accounts, toPrimary)` (`dashboardSummary.ts:22-31`)
  — sums positive balances of all accounts **except** `loan`/`credit`/`alternative`
  (i.e. depository + cash + investment + other). This IS a sensible liquid-asset
  definition (property/loans excluded).
- **Passive income (TTM dividends)**: `buildDividendAnalysis({...}).ttmTotal`
  (`dividendAnalysis.ts:35,83`) — trailing-12-month dividend total.
- **Monthly expense**: computed in `DashboardRoute.tsx:219` as
  `monthExpense = monthRows.filter(expense).reduce(... toPrimary(-amount) ...)`
  for the *current month*. (For these metrics you will compute a **trailing
  average** instead — see Design decisions.)
- **Savings rate**: `DashboardRoute.tsx:224` (`monthNet / monthIncome`).
- **FIRE progress**: `src/domain/fireGoal.ts` (`resolveTargetAmount`,
  `calculateFireProjection`) and `retirementProjection.ts`.

**Dashboard hero** — `src/routes/DashboardRoute.tsx`: the net-worth hero card is
around lines 592–616 (eyebrow `Net worth · {ccy}`, the big `formatMoney(netWorth)`,
a MoM badge + 「較上月」). There is a card-visibility preference system
(`dashboardHiddenCards` + `cardVisible()` + the 「編輯版面」Popover ~575). A
net-worth `trend` array exists (used for `momChange`).

**Conventions**: every domain calc change ships with a unit test (see
`src/domain/*.test.ts`, e.g. `dashboardSummary.test.ts`, `dividendAnalysis.test.ts`);
finance figures must be explainable (`docs/product-spec.md`, ROADMAP 執行原則 #1).
zh-TW first. Use DS tokens (`var(--ns-*)`), `formatMoney`/`formatNumber`.

## Design decisions (already made — implement as written)

1. **Metric registry**: a typed registry of selectable north-star metrics, each
   `{ key, label (zh-TW), compute(ctx) → { value, display, sub? }, kind }`.
   v1 metrics: `netWorth`, `savingsRate`, `coverageRatio`, `runway`, `fireProgress`.
   Default selection: `netWorth` (preserves today's hero).
2. **Coverage Ratio (B)** = passive income ÷ expense, as a percent toward 100%.
   - Numerator: `buildDividendAnalysis(...).ttmTotal` (annual passive income). v1 =
     dividends only; interest income is a documented follow-on.
   - Denominator: **annual expense** = trailing-N-month average monthly expense × 12.
     Use **trailing 3 months** for responsiveness (a TTM option may be added later).
   - `coverageRatioPct = ttmTotal / annualExpense * 100`; null when annualExpense ≤ 0.
3. **Runway (C)** = `calculateAvailableCash(...)` ÷ average monthly expense → **months**.
   Use the same trailing-3-month average monthly expense. null when expense ≤ 0.
   The liquid-asset definition = `calculateAvailableCash` as-is for v1 (making it
   user-configurable is a follow-on, not this plan).
4. **Trend/history**: net worth already has a trend series — show it for `netWorth`.
   For coverage/runway, **v1 shows the current value + a short explanatory caption
   only** (no historical backfill — computing historical coverage/runway needs a
   snapshot series that doesn't exist yet; that is a documented follow-on). Do NOT
   fabricate a history series.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Lint | `npm run lint` | 0 errors (~700 warnings pre-exist) |
| Build | `npm run build` | exit 0 |
| Tests | `npm run test` | all pass incl. new tests |

## Scope

**In scope**:
- `src/domain/northstarMetrics.ts` (create — coverage + runway + trailing-expense helpers)
- `src/domain/northstarMetrics.test.ts` (create)
- `src/state/uiPreferences.ts` (add `northstarMetric` pref — additive)
- `src/routes/DashboardRoute.tsx` (hero renders the selected metric; a small picker)
- `src/routes/settings/*` (optional: a settings control to pick the metric — or reuse the Dashboard 「編輯版面」popover; pick one and note it)

**Out of scope**:
- Historical backfill of coverage/runway (follow-on).
- User-configurable liquid-asset definition (follow-on — `calculateAvailableCash` is the v1 definition).
- Interest income in coverage (follow-on — dividends only for v1).
- Any change to `buildNetWorthBreakdown` / `buildDividendAnalysis` / `calculateAvailableCash` internals — consume them, don't alter them.

## Steps

### Step 1: Confirm the inputs
Read `dashboardSummary.ts` (`calculateAvailableCash`, `buildNetWorthBreakdown`),
`dividendAnalysis.ts` (`buildDividendAnalysis`/`ttmTotal`), and `DashboardRoute.tsx`
lines ~210–230 (monthIncome/monthExpense/savingsRate) to confirm the excerpts above.
**Verify**: the four input functions exist with the cited shapes; if any differ, STOP.

### Step 2: Build the domain metrics (test-first)
Create `src/domain/northstarMetrics.ts` with pure functions:
```ts
/** Average monthly expense over the trailing `months` whole months up to asOf. */
export function trailingMonthlyExpense(rows: LedgerTransaction[], toPrimary, asOf: string, months = 3): number
/** Passive-income coverage of expenses, as a percent (0–∞). null if expense ≤ 0. */
export function coverageRatioPct(ttmPassiveIncome: number, annualExpense: number): number | null
/** Months of liquid runway. null if monthlyExpense ≤ 0. */
export function runwayMonths(liquidAssets: number, monthlyExpense: number): number | null
```
Keep them dependency-light and deterministic (pass `toPrimary` + `asOf` in, like the
other domain helpers). Match the expense sign/settlement convention used by the
canonical aggregation (`expense` rows, settled, exclude neutral — mirror
`categoryPeriodSpend` / `DashboardRoute`'s `monthExpense`; reuse `isNeutralLedgerRow`).
Write `src/domain/northstarMetrics.test.ts` (model after `dashboardSummary.test.ts`)
covering: trailing average over 3 months; coverage = ttm/annualExpense; runway =
liquid/monthly; null guards when expense is 0; settled-only / neutral-row exclusion.
**Verify**: `npm run test -- northstarMetrics` → all pass; `npx tsc --noEmit` → 0.

### Step 3: Add the `northstarMetric` preference
In `src/state/uiPreferences.ts`, add `northstarMetric: string` (default
`"netWorth"`) + `setNorthstarMetric(value: string)`, mirroring `benchmarkTicker`:
interface field, setter calling `persist(snapshot(get()))`, include in
`PersistedShape`/`snapshot`, and load from the parsed `STORAGE_KEY` blob in the
initializer with a safe fallback to `"netWorth"`.
**Verify**: `npx tsc --noEmit` → 0; `grep -n northstarMetric src/state/uiPreferences.ts` → ≥4 matches.

### Step 4: Metric registry + Dashboard hero
In `DashboardRoute.tsx`, define a registry mapping each metric key to
`{ label, value, display, sub }` computed from already-available values
(`netWorth`, `savingsRate`, `coverageRatioPct(...)`, `runwayMonths(...)`, FIRE %).
Render the hero from `useUiPreferences(s => s.northstarMetric)` instead of the
hardcoded net-worth value; when the metric is `netWorth`, preserve the exact
current hero (number + MoM badge + 「較上月」). For coverage/runway/savings, show the
metric value + a one-line explanatory caption (e.g. runway:「流動資產可支撐約 N 個
月」; coverage:「被動收入已覆蓋 X% 的開支」). Add a small inline picker (a Popover or
select) so the user can switch the hero metric; persist via `setNorthstarMetric`.
**Verify**: `npx tsc --noEmit` → 0; `npm run build` → 0.

### Step 5: Full verification + visual
`npm run test` (all pass), `npm run lint` (0 errors), `npm run build` (0).
Run `npm run dev`: the Dashboard hero shows net worth by default; switching the
metric to 覆蓋率 / runway / 儲蓄率 updates the hero and survives reload (persisted).
Numbers are sane on demo data. Light + dark legible.

## Test plan
- `src/domain/northstarMetrics.test.ts` — the cases in Step 2 (this is the
  correctness-critical part; be thorough on the expense convention + null guards).
- No UI unit test required; existing suite must stay green.

## Done criteria (ALL)
- [ ] `src/domain/northstarMetrics.ts` + `.test.ts` exist; new tests pass
- [ ] `grep -n "northstarMetric" src/state/uiPreferences.ts` → ≥4 matches
- [ ] Dashboard hero renders the selected metric and the choice persists across reload
- [ ] `npx tsc --noEmit` 0; `npm run build` 0; `npm run lint` 0 errors; `npm run test` all pass
- [ ] No change to `buildNetWorthBreakdown`/`buildDividendAnalysis`/`calculateAvailableCash` internals (`git diff`)
- [ ] `plans/README.md` row updated

## STOP conditions
- Any cited input function's shape differs from "Current state" (drift) — report.
- You find yourself needing to alter a finance computation (not just consume it) to
  make a metric "look right" — STOP; that's a semantics decision, report it.
- Implementing history/trend for coverage/runway would require a new snapshot store
  — do NOT build it; keep v1 to point-in-time per Design decision #4.
- The trailing-expense convention can't be made to match the canonical settled/neutral
  rules without touching shared code — report.

## Maintenance notes
- Follow-ons (deliberately deferred): historical coverage/runway via a metric
  snapshot series (enables real trend); user-configurable liquid-asset definition;
  interest income in coverage; milestones on the hero metric (ROADMAP 6.1).
- Reviewer: scrutinize the expense denominator (sign, settled-only, trailing window)
  and the null guards — a wrong "runway" number is a trust failure.
- This is the registry that ROADMAP 6.4 (projection) and 6.6 (index nudge) may later
  plug additional metrics into; keep the registry shape extensible.
