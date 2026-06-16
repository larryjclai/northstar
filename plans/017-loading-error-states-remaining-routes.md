# Plan 017: Apply the loading skeleton + query error guard to the remaining 10 data routes

> **Executor instructions**: Follow this plan step by step, in order. Run every
> verification command and confirm the expected result before moving to the
> next step. The codebase must stay buildable between steps. If anything in
> "STOP conditions" occurs, stop and report — do not improvise. When done,
> update this plan's status row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 66ca88db..HEAD -- src/data/hooks.ts src/routes/AccountsRoute.tsx src/routes/CategoriesRoute.tsx src/routes/CategoryDetailRoute.tsx src/routes/FIRECalculatorRoute.tsx src/routes/GoalsRoute.tsx src/routes/HoldingDetailRoute.tsx src/routes/MerchantDetailRoute.tsx src/routes/ReconcileRoute.tsx src/routes/SettingsRoute.tsx src/routes/TransactionsRoute.tsx`
> If any in-scope file changed since this plan was written, read it fully and
> compare against this plan's "Current state" excerpts before proceeding; on a
> structural mismatch treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M (10 files, but each change is the same small mechanical pattern)
- **Risk**: LOW (additive guard only; the pattern is already proven in plan 016)
- **Depends on**: 016 (must be DONE — it is, see `plans/README.md`)
- **Category**: bug (state completeness) / tech-debt
- **Planned at**: commit `66ca88db`, 2026-06-16

## Why this matters

Plan 016 added a `Skeleton` primitive, aggregate `isInitialLoading` / `isError` /
`error` / `refetchAll` flags on `useFinanceData()`, and a global router error
boundary, then wired the guard into the 3 highest-traffic routes (Dashboard,
Investments, Cash Flow) as a worked example. Its Maintenance notes explicitly
deferred the remaining routes as a mechanical follow-up:

> Follow-up (explicitly deferred): apply the Step 5 guard to the remaining data
> routes — Accounts, Transactions, Categories/CategoryDetail, Goals/FIRE,
> HoldingDetail, Merchants, Reconcile, settings/*. The primitive and flags now
> exist, so each is a few lines.

This plan executes that follow-up. Confirmed by `grep -L isInitialLoading
src/routes/*.tsx` against current `HEAD`, the routes still missing the guard
and that call `useFinanceData()` directly (i.e. are real top-level routes, not
tabs/modals rendered inside an already-guarded parent — see "Out of scope")
are exactly the 10 files listed below. Without this guard these pages still
render `data ?? []` on first paint — an empty/zeroed screen that pops in, and
a silent failure on query error.

## Current state

`src/data/hooks.ts` (`useFinanceData()`, confirmed unchanged since plan 016)
already aggregates over **every** query, not just the ones a given page
destructures, and returns:

```ts
const all = [
  repository, accounts, ledger, assets, investments, recurring,
  recurringInvestments, quotes, settings, dailyFxRates, dailyPrices,
  financialGoals, manualPriceSnapshots,
];
const isInitialLoading = all.some((q) => q.isLoading);
const isError = all.some((q) => q.isError);
const error = all.find((q) => q.isError)?.error ?? null;
const refetchAll = () => { all.forEach((q) => void q.refetch()); };

return {
  repository, accounts, ledger, assets, investments, recurring,
  recurringInvestments, quotes, settings, dailyFxRates, dailyPrices,
  financialGoals, manualPriceSnapshots,
  isInitialLoading, isError, error, refetchAll,
};
```

**Match plan 016's convention exactly**: every guarded page checks the same
four aggregate flags, regardless of which individual queries that page
personally reads. Do not scope the flags down per-page — consistency (one
loading screen, one error screen, defined once) is the point.

`src/components/coss/skeleton.tsx` (the `Skeleton` primitive) and
`src/components/RouteError.tsx` (the global error boundary, already wired into
`src/routes/router.tsx` as `defaultErrorComponent`) both already exist —
**no changes needed to either of those two files or to `router.tsx` in this
plan.**

### The guard pattern (from plan 016, reuse verbatim)

```tsx
if (isInitialLoading) {
  return (
    <div className="grid gap-5 p-1">
      <Skeleton className="h-[320px]" />
      {/* one or two more Skeleton blocks roughly matching the page's shape —
          exact pixel sizes don't matter, see per-file notes below */}
    </div>
  );
}
if (isError) {
  return (
    <div className="grid min-h-[50vh] place-items-center p-6 text-center">
      <div className="max-w-md">
        <h3 className="text-[17px]" style={{ fontFamily: "var(--ns-font-display)", fontWeight: 600 }}>
          無法載入資料
        </h3>
        <p className="muted mt-1 text-sm">{error instanceof Error ? error.message : "請稍後再試。"}</p>
        <Button className="mt-4" onClick={() => refetchAll()}>
          重新整理
        </Button>
      </div>
    </div>
  );
}
```

`Skeleton` imports from `@/components/coss/skeleton`. Every one of the 10
files below already imports `Button` from `../components/coss/button` (check
before adding a duplicate import — most already have it for other UI).

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm run test` | all pass |
| Lint | `npm run lint` | 0 errors (≈706 warnings pre-exist) |
| Build | `npm run build` | exit 0 |
| Visual check | `npm run dev` + browser preview | see Step 11 |

## Scope

**In scope** (exactly these 10 files):
1. `src/routes/AccountsRoute.tsx`
2. `src/routes/CategoriesRoute.tsx`
3. `src/routes/CategoryDetailRoute.tsx`
4. `src/routes/FIRECalculatorRoute.tsx`
5. `src/routes/GoalsRoute.tsx`
6. `src/routes/HoldingDetailRoute.tsx`
7. `src/routes/MerchantDetailRoute.tsx`
8. `src/routes/ReconcileRoute.tsx`
9. `src/routes/SettingsRoute.tsx`
10. `src/routes/TransactionsRoute.tsx`

**Out of scope** (do NOT touch — confirmed by reading each, not guessed):
- `src/routes/DashboardRoute.tsx`, `InvestmentsRoute.tsx`, `CashFlowRoute.tsx`
  — already guarded by plan 016.
- `src/routes/RecurringRulesTab.tsx`, `RecurringInvestmentsTab.tsx` — rendered
  *inside* `CashFlowRoute` / `InvestmentsRoute` (`<RecurringRulesTab />` at
  `CashFlowRoute.tsx`, `<RecurringInvestmentsTab /> ` at
  `InvestmentsRoute.tsx`), so the parent's existing guard already covers them.
  They do call `useFinanceData()` themselves, but adding a second, nested
  guard would be redundant and is explicitly excluded.
- `src/routes/HoldingEditModal.tsx`, `InvestmentsAddSheet.tsx`,
  `InvestmentImportWizard.tsx` — modals/sheets opened from an already-loaded
  parent page (e.g. `HoldingDetailRoute` renders `<HoldingEditModal>` only
  after its own data has loaded). No standalone loading state needed.
- `src/routes/CategoriesTab.tsx`, `MerchantsTab.tsx` — `grep -c
  "useFinanceData(" ` on these returns 0; they receive data via props, not
  via their own data fetch.
- `src/routes/settings/*.tsx` (CategoriesSection, ConnectSection,
  ExportSection, FxSection, GeneralSection, MerchantsSection) — rendered
  inside `SettingsRoute`'s tab content area; `SettingsRoute` itself (file #9
  above) gets the guard at the shell level, which covers all of them.
- `src/data/hooks.ts`, `src/components/coss/skeleton.tsx`,
  `src/components/RouteError.tsx`, `src/routes/router.tsx` — all already
  correct from plan 016; no changes needed.
- Any query logic, query keys, or repository code — flags are additive only.

## Git workflow

- Branch: `advisor/017-loading-error-remaining-routes`
- One commit per file (or a small logical grouping, e.g. the two routes with a
  pre-existing early return together) — conventional commits, e.g.
  `feat(ux): add loading/error guard to AccountsRoute`.
- Do NOT push or open a PR unless the operator asks.

## Steps

For every file below: (a) add `isInitialLoading, isError, error, refetchAll`
to the existing `useFinanceData()` destructure (do not remove any existing
destructured key), (b) import `Skeleton` from `@/components/coss/skeleton` if
not already imported, (c) insert the guard pattern from "Current state" above
at the stated insertion point, sized to roughly match the page. Run `npx tsc
--noEmit` after each file before moving on.

### Step 1: `AccountsRoute.tsx`
Current destructure (line 78): `const { accounts, settings } = useFinanceData();`
All hooks (several `useState`, `useMemo` ×4) sit above the component's single
`return (` at line 230 — no pre-existing early return in this file. Insert the
guard immediately before that `return (`.
Suggested skeleton: one `h-28` block ×3 (mirroring the 總資產/總負債/淨值 cards)
plus one taller block for the account list.

### Step 2: `CategoriesRoute.tsx`
Current destructure (line 18): `const { ledger, settings, dailyFxRates } = useFinanceData();`
Hooks (`useState` ×2, `useMemo`, `useToast`, `useNavigate`,
`useRepositoryMutation`) sit above the single `return (` at line 89. Insert
the guard immediately before it.
Suggested skeleton: one `h-[300px]` block (donut + legend) beside/above one
taller block for the categories list.

### Step 3: `CategoryDetailRoute.tsx`
Current destructure (line 18): `const { ledger, settings, accounts, dailyFxRates } = useFinanceData();`
(`useParams` is called one line earlier — that's fine, it's also a hook, and
it stays above the guard too.) All hooks sit above the single `return (` at
line 122. Insert the guard immediately before it.
Suggested skeleton: one `h-24` metric-strip block, one `h-[220px]` chart
block, one shorter list block.

### Step 4: `FIRECalculatorRoute.tsx`
Current destructure (line 17): `const { accounts, assets, quotes, settings, dailyFxRates, financialGoals } = useFinanceData();`
Hooks (`useNavigate`, `useToast`, `useSearch`, several `useState`, `useMemo`
×4, `useRef`, `useEffect`) all sit above the single `return (` at line 154.
Insert the guard immediately before it.
Suggested skeleton: one `h-[400px]` block (sidebar + chart take up most of the
page; a single tall block is fine here — exact shape doesn't matter).

### Step 5: `GoalsRoute.tsx`
Current destructure (line 14): `const { financialGoals, accounts, assets, quotes, settings, dailyFxRates } = useFinanceData();`
Hooks (`useToast`, `useNavigate`, `useRepositoryMutation`, `useState` ×3,
`useMemo` ×4) all sit above the single `return (` at line 119. Insert the
guard immediately before it.
Suggested skeleton: one `h-[260px]` hero-card block, one `h-40` list block.

### Step 6: `HoldingDetailRoute.tsx` — has a pre-existing early return, read carefully
Current destructure (line 22): `const { assets, quotes, dailyPrices, accounts, investments } = useFinanceData();`
All hooks (`useParams`, `useNavigate`, `useFinanceData`, `useUiPreferences`
×2, `useState` ×3, several `useMemo`) sit **above** this file's existing early
return:
```tsx
if (!asset) {
  return (
    <div style={{ padding: "24px 32px 100px" }}>
      <Button variant="ghost" onClick={() => navigate({ to: "/investments" })}>返回投資</Button>
      <div style={{ marginTop: 20 }}>找不到此持倉。</div>
    </div>
  );
}
```
**On first paint, before `assets.data` arrives, `asset` is `undefined` and
this existing guard would incorrectly show "找不到此持倉" (holding not found)
instead of a loading state.** Insert the new `isInitialLoading` / `isError`
guard **immediately before `if (!asset)`** (i.e. right after the last
`useMemo` and before that line) — this is straightforward because every hook
in this file already sits above `if (!asset)`, so no hook needs to move.
Suggested skeleton: one `h-[280px]` chart block, one `h-[140px]` side-card
block, one list block.

### Step 7: `MerchantDetailRoute.tsx`
Current destructure (line 16): `const { ledger, accounts, settings, dailyFxRates } = useFinanceData();`
All hooks sit above the single `return (` at line 79. Insert the guard
immediately before it.
Suggested skeleton: same shape as Step 3 (CategoryDetailRoute) — metric strip
+ chart + list blocks.

### Step 8: `ReconcileRoute.tsx` — also has a pre-existing early return
Current destructure (line 18): `const { accounts, ledger } = useFinanceData();`
All hooks (`useParams`, `useNavigate`, `useToast`, `useUiPreferences`,
`useFinanceData`, `useState`, `useRepositoryMutation` ×2, `useMemo` ×2) sit
**above** this file's existing early return:
```tsx
if (!account) {
  return <div style={{ padding: "24px 32px" }} className="muted">找不到帳戶。</div>;
}
```
Same reasoning as Step 6: on first paint `accounts.data` is empty, so
`account` is `undefined` and this would incorrectly show "找不到帳戶" instead
of loading. Insert the new guard **immediately before `if (!account)`** — all
hooks already sit above it, so nothing needs to move.
Suggested skeleton: three `h-20` summary-card blocks + one taller list block.

### Step 9: `SettingsRoute.tsx`
Current destructure (line 24): `const { settings, dailyFxRates } = useFinanceData();`
This file is a thin shell (tab sidebar + delegates to `./settings/*Section.tsx`).
Hooks (`useTranslation`, `useFinanceData`, `useState`, `useRef`,
`useRepositoryMutation` ×3, `useEffect`) all sit above the single `return (`
at line 57. Insert the guard immediately before it. Note the existing
`useEffect` that seeds `form` from `settings.data` once — that logic is
unaffected; the new guard sits in front of the whole shell so the seeding
effect only ever runs once real data exists.
Suggested skeleton: one `h-[400px]` block is sufficient — this is a low-traffic
settings shell, exact shape doesn't matter.

### Step 10: `TransactionsRoute.tsx`
Current destructure (line 73): `const { accounts, assets, investments, ledger, settings, dailyFxRates } = useFinanceData();`
Hooks (`useUiPreferences`, several `useState`, several `useMemo`, one
`useEffect`) all sit above the single `return (` at line 287. Insert the
guard immediately before it.
Suggested skeleton: four `h-20` summary-card blocks (mirroring 交易筆數/總買入/
總賣出/總股利) + one taller block for the transaction table.

### Step 11: Full verification
**Verify**:
- `npx tsc --noEmit` → exit 0
- `npm run test` → all pass
- `npm run lint` → 0 errors
- `npm run build` → exit 0

### Step 12: Visual confirm
Run `npm run dev`. Using demo data (onboarding overlay → "先用示範資料逛逛" →
"完成"), visit all 10 routes: `/accounts`, `/categories`, a category detail
page, `/goals/fire`, `/goals`, a holding detail page, a merchant detail page,
a reconcile page (`/cash-flow/reconcile/$accountId`), `/settings`,
`/transactions` (exact paths per `src/routes/router.tsx`).

**Verify**: each route briefly shows skeletons (not a zeroed/empty page) then
real data; no route is stuck on the skeleton; no console error. For
`HoldingDetailRoute` and `ReconcileRoute` specifically, confirm the "not
found" message no longer flashes on a fresh load before data arrives.

## Test plan

This is UI wiring identical in kind to plan 016 — no new unit tests are
strictly required, and the existing suite must stay green (`npm run test`).
Skip new tests for the same reason plan 016 did (jsdom render-test setup cost
outweighs the value here); note as deferred if you considered it.

## Done criteria

ALL must hold:
- [ ] `grep -L isInitialLoading src/routes/AccountsRoute.tsx src/routes/CategoriesRoute.tsx src/routes/CategoryDetailRoute.tsx src/routes/FIRECalculatorRoute.tsx src/routes/GoalsRoute.tsx src/routes/HoldingDetailRoute.tsx src/routes/MerchantDetailRoute.tsx src/routes/ReconcileRoute.tsx src/routes/SettingsRoute.tsx src/routes/TransactionsRoute.tsx` → **no output** (i.e. all 10 now contain the string)
- [ ] No existing destructured key removed from any `useFinanceData()` call in these 10 files (`git diff` shows additions only on those lines)
- [ ] `npx tsc --noEmit` exits 0; `npm run build` exits 0; `npm run lint` 0 errors; `npm run test` passes
- [ ] No files outside the in-scope list of 10 modified (`git status` / `git diff --stat`)
- [ ] `HoldingDetailRoute.tsx` and `ReconcileRoute.tsx`: the new guard sits **before** the file's pre-existing early return (verify by reading, not just grep)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report (do not improvise) if:
- Any file's `useFinanceData()` destructure or surrounding hooks no longer
  match this plan's "Current state" / per-step excerpts (file drifted) —
  re-read the live file before placing the guard.
- Placing the guard would require moving an existing hook call below another
  early return not described above — report the specific file and line
  rather than restructuring hook order yourself.
- `Skeleton` (`src/components/coss/skeleton.tsx`) or the four aggregate flags
  on `useFinanceData()` no longer exist — report; do not recreate them
  (something would have reverted plan 016, which should not happen).
- `npm run build` fails twice after a reasonable fix attempt on any single
  file — stop on that file, leave prior committed files as-is, report.

## Maintenance notes

- After this plan, every top-level data route in `src/routes/router.tsx`
  (confirmed via that file's route table) has the loading/error guard. A
  future new route should add it from the start — copy the pattern from any
  file touched here.
- If `useFinanceData()` is ever split per-page (noted as a future risk in
  plan 016), the aggregate flags must move with it, and every one of these 10
  call sites needs revisiting.
- Reviewer: confirm hooks are not called conditionally (guards must sit after
  all hook calls — pay special attention to `HoldingDetailRoute.tsx` and
  `ReconcileRoute.tsx`, the two files with a pre-existing early return), and
  that `useFinanceData()` itself was not touched (this plan only touches its
  10 call sites).
