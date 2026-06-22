# Plan 057: Make broker-fee (交易成本) settings discoverable from investment accounts

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report. When done, update this
> plan's row in `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**:
> `git diff --stat 8f2e90bd..HEAD -- src/routes/SettingsRoute.tsx src/routes/AccountsRoute.tsx src/routes/router.tsx src/routes/settings/TradingFeesSection.tsx`
> If these changed since this plan was written, compare the "Current state"
> excerpts against live code before proceeding; on a mismatch, treat it as a STOP
> condition.

## Status

- **Priority**: P2
- **Effort**: S–M
- **Risk**: LOW (navigation + a deep-link param; no finance logic)
- **Depends on**: plans 026 + 033 (trading-fee config + per-account discount) —
  **merged on main**
- **Category**: feature (discoverability / UX)
- **Planned at**: commit `8f2e90bd`, 2026-06-21

## Why this matters

Operator-reported: 券商的手續費功能我現在找不到地方設定 — they can't find where to
configure broker fees, and suggest it should live on 「帳戶」 of type 券商.

The feature **already exists**: plan 026 added `tradingFees` config and plan 033
added per-account fee discounts, both surfaced in **設定 → 交易成本**
(`SettingsRoute.tsx:48`, `TradingFeesSection.tsx`, which already lists
`type === "investment"` accounts for per-account discounts). The real problem is
**discoverability** — there's no path to it from where the user expects it (the
broker/investment account). This plan adds a discoverable entry point, without
duplicating the settings UI.

Note: there is no `"broker"`/`"券商"` account type — broker accounts are
`AccountType === "investment"` (labeled 投資 / 券商 in `AccountsRoute.tsx:52,61,71`).

## Current state

`src/routes/SettingsRoute.tsx` — tabs are **local state**, NOT deep-linkable:

```tsx
const [tab, setTab] = useState('categories');         // line 41
const tabs = [ …, { id: 'tradingFees', label: '交易成本', icon: <Percent size={14} /> }, … ]; // line 48
// renders: {tab === 'tradingFees' && <SettingsTradingFees form={form} submit={submit} />}    // line 110
```

`src/routes/router.tsx` — the settings route has **no search param**:

```ts
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsRoute,
});
```

(For contrast, `fireCalculatorRoute` shows the `validateSearch` pattern for a
typed search param — `router.tsx` around line 110-118.)

`src/routes/AccountsRoute.tsx` — account rows; investment accounts are
`a.type === "investment"`. Rows already navigate (e.g. credit → reconcile at line
457) and have an 編輯 button (`startEdit(a)`, line 459). This is where an entry
point for investment accounts goes.

`src/routes/settings/TradingFeesSection.tsx` — already filters
`accounts … a.type === "investment"` for the per-account discount editor (plan
033). So landing on this tab already gives per-broker config.

### Conventions to follow

- TanStack Router: routes can declare `validateSearch`; navigation uses
  `navigate({ to: "/settings", search: { tab: "tradingFees" } })` and `<Link>`
  (see `AccountsRoute`'s existing `navigate({ to: … })` calls). Match that.
- Don't duplicate the trading-fee form — link to the existing tab. zh-TW copy.
- An icon-button with a `title` is the row-action convention in `AccountsRoute`
  (see the 對帳 / 編輯 buttons).

## Decision (recommended — implement unless operator overrides)

Add a discoverable **entry point** from investment accounts to the existing
交易成本 settings tab (rather than rebuilding the fee UI inside the account
drawer):

1. Make the settings tab **deep-linkable**: add an optional `tab` search param to
   the settings route; `SettingsRoute` seeds its `tab` state from it.
2. On **investment**-type account rows in `AccountsRoute` (and/or in the account
   edit drawer), add a 「交易成本設定」action that navigates to
   `/settings?tab=tradingFees`.

(Alternative, if the operator prefers it inline later: embed a compact per-account
fee/discount editor in the account edit drawer reusing `tradingFees.ts` helpers.
Heavier and duplicative — note as a follow-up, don't build both.)

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | all pass |
| Lint | `npm run lint` | exit 0 (0 errors) |
| Build | `npm run build` | exit 0 |
| Dev server (visual) | `npm run dev` | serves on 127.0.0.1 |

## Scope

**In scope:**
- `src/routes/router.tsx` — add an optional typed `tab` search param to
  `settingsRoute` (mirror `fireCalculatorRoute`'s `validateSearch`).
- `src/routes/SettingsRoute.tsx` — initialize the `tab` state from the search
  param (fall back to `'categories'`); keep clicking tabs working as today.
- `src/routes/AccountsRoute.tsx` — for investment accounts, add a 「交易成本設定」
  entry point (row action and/or in the edit drawer) navigating to
  `/settings?tab=tradingFees`.

**Out of scope (do NOT touch):**
- `TradingFeesSection.tsx` and `tradingFees.ts` — the config + per-account
  discount UI already exist; just link to them. No fee-math change.
- Other settings tabs' behavior — adding the param must not change them.
- The `AccountType` enum — do NOT add a `"broker"` type; investment IS the broker
  type here.

## Git workflow

- Branch from current main: `git checkout -B advisor/057-broker-fee-discoverability main`.
- Match the repo's short imperative commit style. Do NOT push/PR unless told.

## Steps

### Step 1: deep-linkable settings tab
In `router.tsx`, add `validateSearch` to `settingsRoute` accepting an optional
`tab?: string`. In `SettingsRoute.tsx`, seed `useState` for `tab` from the search
param (e.g. `useState(search.tab && tabs.some(t => t.id === search.tab) ? search.tab : 'categories')`),
guarding against an unknown id. Manual tab clicks still call `setTab`.

**Verify**: `npx tsc --noEmit` → 0; navigating to `/settings?tab=tradingFees`
opens directly on the 交易成本 tab.

### Step 2: entry point on investment accounts
In `AccountsRoute.tsx`, for `a.type === "investment"`, add a 「交易成本設定」
action (an icon-button with a `title`, matching the existing row-action style,
and/or a button in the edit drawer) that calls
`navigate({ to: "/settings", search: { tab: "tradingFees" } })`.

**Verify**: `npx tsc --noEmit` → 0; `npm run lint` → 0 errors.

### Step 3: visual check
Run dev server (demo mode has an investment account). On 帳戶, find the investment
/ 券商 account, click the new 交易成本設定 action → lands on 設定 → 交易成本 with
the per-account discount editor visible. Screenshot.

### Step 4: full verification
**Verify**: `npx tsc --noEmit` exit 0; `npm test` all pass; `npm run lint` 0
errors; `npm run build` exit 0.

## Test plan

- Mostly navigation; verify visually per Step 3.
- If practical, a small test that `SettingsRoute` opens the tradingFees tab when
  given `tab="tradingFees"` and falls back to categories for an unknown value.
- Existing suite stays green (no logic/data change).

## Done criteria

ALL must hold:

- [ ] `/settings?tab=tradingFees` opens directly on the 交易成本 tab; an unknown
      `tab` falls back to categories; manual tab clicks still work
- [ ] Investment / 券商 accounts have a visible 交易成本設定 entry point that
      navigates there
- [ ] No fee-math / `TradingFeesSection` changes (`git status`)
- [ ] `npx tsc --noEmit` exits 0; `npm test` all pass; `npm run lint` 0 errors;
      `npm run build` exits 0
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the cited lines doesn't match the excerpts (drift since `8f2e90bd`),
  e.g. the 交易成本 tab id differs or `TradingFeesSection` no longer lists
  investment accounts (then plans 026/033 may not be merged — this plan depends on
  them).
- Adding the search param interferes with other settings tabs or existing
  `/settings` links — report.
- The operator wants the fee editor **inline** in the account drawer instead of a
  link — that's the heavier alternative; stop and confirm scope before building it.

## Maintenance notes

- For the reviewer: confirm this is a **link, not a duplicated form** — the diff
  should be a search param + a nav action, with `TradingFeesSection` untouched.
- Deferred alternative: a compact inline per-account fee/discount editor in the
  account drawer (reusing `tradingFees.ts`); only if discoverability-via-link
  proves insufficient.
- If settings tabs gain more deep-links later, the `tab` search param added here
  is the mechanism to reuse.
