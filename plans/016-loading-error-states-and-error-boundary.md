# Plan 016: Add loading skeletons, query error states, and a global router error boundary

> **Executor instructions**: Follow this plan step by step, in order. Run every
> verification command and confirm the expected result before moving on. The
> codebase must stay buildable between steps. If anything in "STOP conditions"
> occurs, stop and report — do not improvise. When done, update this plan's
> status row in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 8b2302d1..HEAD -- src/data/hooks.ts src/routes/router.tsx src/routes/DashboardRoute.tsx src/routes/InvestmentsRoute.tsx src/routes/CashFlowRoute.tsx src/components/coss`
> If any in-scope file changed since this plan was written, read it and compare
> against the "Current state" excerpts before proceeding; on a structural
> mismatch treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: bug (state completeness) / tech-debt
- **Planned at**: commit `8b2302d1`, 2026-06-16

## Why this matters

No data route in the app handles the loading or error states of its
react-query data. Every page renders `data ?? []`, so on cold start / slow sync
the user sees an **empty or zeroed financial screen** that then pops in with real
numbers — and if a query **fails**, the failure is completely silent (no
`isError` is ever checked, and `src/routes/router.tsx` has no error boundary, so
a render-time crash white-screens the app). For a local-first finance product
whose first principle is earning trust (`PRODUCT.md`, `.impeccable.md` #4), this
is the highest-leverage UX gap. This plan adds the missing primitives once
(`Skeleton` + aggregate loading/error flags + a global error boundary) and wires
them into the three primary data pages as the worked pattern; the remaining
pages become a mechanical follow-up.

## Current state

**Data layer** — `src/data/hooks.ts`: `useFinanceData()` bundles many
`useQuery` results, all gated by `enabled = Boolean(repository.data)`, and
returns them as an object (lines ~93–107):
```ts
return {
  repository, accounts, ledger, assets, investments, recurring,
  recurringInvestments, quotes, settings, dailyFxRates, dailyPrices,
  financialGoals, manualPriceSnapshots,
};
```
Each value is a TanStack Query v5 result; in v5 a query that is `enabled:false`
reports `isPending:true` with `fetchStatus:'idle'`, so the correct "actually
loading now" flag is **`isLoading`** (`isPending && isFetching`), not `isPending`.

**Consumers** — e.g. `src/routes/DashboardRoute.tsx`:
```ts
const { accounts, ledger, assets, quotes, settings, dailyFxRates, dailyPrices,
        manualPriceSnapshots, recurring, financialGoals, investments } = useFinanceData();
...
const accountRows = accounts.data ?? [];   // renders empty on first paint
```
The only loading affordance anywhere is a mutation flag
(`backfillAssetProfiles.isPending` in `InvestmentsRoute.tsx`).

**Router** — `src/routes/router.tsx` ends with:
```ts
export const router = createRouter({ routeTree });
```
No `defaultErrorComponent`, no `defaultPendingComponent`, no `errorComponent` on
any route. Confirmed: `grep -n "errorComponent\|ErrorBoundary" src/routes/router.tsx` → no matches.

**Component library** — `src/components/coss/` has `spinner.tsx` (a `Spinner`
wrapping Phosphor `CircleNotch` with `animate-spin`) but **no skeleton**.
`src/components/EmptyState.tsx` is the centered icon+title+desc+CTA convention.
`src/lib/utils.ts` exports `cn(...)`. Tailwind v4 is configured (`animate-pulse`
is available).

**Design constraints** (`DESIGN.md`): surfaces use `var(--ns-bg-card)` /
`var(--ns-bg-hover)` / `var(--ns-border)`; radius `var(--ns-r-md)`; this work is
COSS-migration-aligned — a `Skeleton` is a missing COSS primitive, so it belongs
in `src/components/coss/`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm run test` | all pass |
| Lint | `npm run lint` | 0 errors (≈706 warnings pre-exist) |
| Build | `npm run build` | exit 0 |
| Visual check | `npm run dev` + browser preview | see below |

## Scope

**In scope**:
- `src/components/coss/skeleton.tsx` (create)
- `src/data/hooks.ts` (add aggregate flags — additive only)
- `src/components/RouteError.tsx` (create — global error boundary UI)
- `src/routes/router.tsx` (wire `defaultErrorComponent`)
- `src/routes/DashboardRoute.tsx` (full worked example: skeleton + error guard)
- `src/routes/InvestmentsRoute.tsx`, `src/routes/CashFlowRoute.tsx` (apply same guard)

**Out of scope** (do NOT touch in this plan):
- The remaining routes (Accounts, Transactions, Categories*, Goals, FIRE,
  HoldingDetail, Merchants*, Reconcile, settings/*) — they follow the same
  pattern and are a deliberate follow-up (see Maintenance notes). Keeping this
  plan to 3 pages keeps it verifiable.
- Any query logic, query keys, or repository code — flags are additive.
- Mutation error handling (already uses `toast`).

## Git workflow

- Branch: `advisor/016-loading-error-states`
- Commit per logical unit (primitive → flags → boundary → per-page); conventional
  commits, e.g. `feat(ux): add Skeleton + query loading/error states`.
- Do NOT push or open a PR unless the operator asks.

## Steps

### Step 1: Create the `Skeleton` primitive
Create `src/components/coss/skeleton.tsx`:
```tsx
import type React from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-[var(--ns-r-md)]", className)}
      style={{ background: "var(--ns-bg-hover)" }}
      {...props}
    />
  );
}
```
**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Add aggregate loading/error flags to `useFinanceData`
In `src/data/hooks.ts`, before the `return {…}` in `useFinanceData()`, add:
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
```
Then extend the returned object with these four fields **in addition to** the
existing keys (do not remove any existing key):
```ts
return { repository, accounts, /* …all existing… */ manualPriceSnapshots,
         isInitialLoading, isError, error, refetchAll };
```
**Verify**: `npx tsc --noEmit` → exit 0 (existing consumers unaffected — purely additive).

### Step 3: Create the global error boundary UI
Create `src/components/RouteError.tsx` using the EmptyState convention's tone
(centered, calm, a retry action). It must work as a TanStack Router
`defaultErrorComponent`, which is called with `{ error, reset }`:
```tsx
import type { ErrorComponentProps } from "@tanstack/react-router";
import { Button } from "@/components/coss/button";
import { Warning } from "@phosphor-icons/react";

export function RouteError({ error, reset }: ErrorComponentProps) {
  return (
    <div className="grid min-h-[60vh] place-items-center p-6 text-center">
      <div className="max-w-md">
        <div className="mx-auto grid size-12 place-items-center"
             style={{ background: "var(--ns-warn-soft)", color: "var(--ns-warn)", borderRadius: "var(--ns-r-md)" }}>
          <Warning size={24} weight="fill" />
        </div>
        <h3 className="mt-4 text-[17px]" style={{ fontFamily: "var(--ns-font-display)", fontWeight: 600 }}>
          這個畫面發生問題
        </h3>
        <p className="muted mt-1 text-sm">{error?.message ?? "發生未預期的錯誤。"}</p>
        <Button className="mt-4" onClick={() => reset()}>重新載入</Button>
      </div>
    </div>
  );
}
```
Confirm the `Button` import path matches the repo (`src/components/coss/button.tsx`).
**Verify**: `npx tsc --noEmit` → exit 0.

### Step 4: Wire the error boundary into the router
In `src/routes/router.tsx`, import `RouteError` and pass it as the router-wide
default:
```ts
import { RouteError } from "../components/RouteError";
...
export const router = createRouter({ routeTree, defaultErrorComponent: RouteError });
```
**Verify**: `grep -n "defaultErrorComponent" src/routes/router.tsx` → 1 match; `npx tsc --noEmit` → exit 0.

### Step 5: Add the loading + error guard to DashboardRoute (worked example)
In `src/routes/DashboardRoute.tsx`, destructure the new flags from
`useFinanceData()` and, immediately before the component's main `return (`, add:
```tsx
if (isInitialLoading) {
  return (
    <div className="grid gap-5 p-1">
      <Skeleton className="h-[320px]" />
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
      </div>
      <Skeleton className="h-[260px]" />
    </div>
  );
}
if (isError) {
  return (
    <div className="grid min-h-[50vh] place-items-center p-6 text-center">
      <div className="max-w-md">
        <h3 className="text-[17px]" style={{ fontFamily: "var(--ns-font-display)", fontWeight: 600 }}>無法載入資料</h3>
        <p className="muted mt-1 text-sm">{error instanceof Error ? error.message : "請稍後再試。"}</p>
        <Button className="mt-4" onClick={() => refetchAll()}>重新整理</Button>
      </div>
    </div>
  );
}
```
Import `Skeleton` from `@/components/coss/skeleton` and `Button` from the coss
button (check it isn't already imported). Do NOT remove the existing demo-mode or
empty-state logic — this guard sits above the normal return and only triggers
during genuine first-load / error.

**Verify**: `npx tsc --noEmit` → exit 0; `npm run build` → exit 0.

### Step 6: Apply the same guard to InvestmentsRoute and CashFlowRoute
Repeat Step 5's pattern in `src/routes/InvestmentsRoute.tsx` and
`src/routes/CashFlowRoute.tsx`: destructure `isInitialLoading / isError / error /
refetchAll` from `useFinanceData()`, add the skeleton + error guard before the
main return. Match each page's rough layout for the skeleton (a tall block + a
few cards is fine — exact shapes need not be pixel-perfect).

**Verify**: `npx tsc --noEmit` → exit 0; `npm run build` → exit 0.

### Step 7: Full verification
**Verify**:
- `npm run test` → all pass
- `npm run lint` → 0 errors
- `npm run build` → exit 0

### Step 8: Visual confirm
Run `npm run dev`. To see the loading state, throttle or observe first paint
(skeletons flash before data). To see the error state, you may temporarily
confirm via React Query devtools or trust the typecheck — do NOT commit any
test-only failure injection.

**Verify**: on normal load you briefly see skeletons (not a zeroed dashboard),
then real data. Check light + dark theme: skeleton uses `--ns-bg-hover` and must
be visible in both.

## Test plan

- This is primarily UI wiring; no new unit tests are strictly required, and the
  existing suite must stay green (`npm run test`).
- Optional (nice-to-have, only if quick): a render test for `RouteError` and
  `Skeleton` under `src/components/` following any existing component test as a
  pattern (e.g. `src/components/NumberField.test.tsx`). Skip if jsdom setup makes
  it costly — note it as deferred.

## Done criteria

ALL must hold:
- [ ] `src/components/coss/skeleton.tsx` and `src/components/RouteError.tsx` exist
- [ ] `grep -n "defaultErrorComponent" src/routes/router.tsx` → 1 match
- [ ] `grep -n "isInitialLoading" src/data/hooks.ts src/routes/DashboardRoute.tsx src/routes/InvestmentsRoute.tsx src/routes/CashFlowRoute.tsx` → matches in all four
- [ ] `npx tsc --noEmit` exits 0; `npm run build` exits 0; `npm run lint` 0 errors; `npm run test` passes
- [ ] No existing return key removed from `useFinanceData` (`git diff src/data/hooks.ts` shows additions only)
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report (do not improvise) if:
- `useFinanceData`'s return shape differs from "Current state" (file drifted).
- TanStack Router's `ErrorComponentProps` / `defaultErrorComponent` API differs
  from Step 3/4 (version mismatch) — report the installed `@tanstack/react-router`
  version rather than guessing the API.
- Adding the guard to a page requires moving hooks (React hooks must stay above
  any early return) and the page's existing early returns make this unclear —
  report the specific page.
- `npm run build` fails twice after a reasonable fix attempt.

## Maintenance notes

- **Follow-up (explicitly deferred):** apply the Step 5 guard to the remaining
  data routes — Accounts, Transactions, Categories/CategoryDetail,
  Goals/FIRE, HoldingDetail, Merchants, Reconcile, settings/*. The primitive and
  flags now exist, so each is a few lines. Worth a separate plan or an iterative
  pass. Track via `grep -L isInitialLoading src/routes/*.tsx`.
- Reviewer: confirm hooks are not called conditionally (the guards must be after
  all hook calls), and that `useFinanceData` changes are additive.
- If a future refactor splits `useFinanceData` per-page, the aggregate flags must
  move with it.
