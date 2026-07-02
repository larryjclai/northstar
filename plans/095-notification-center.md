# Plan 095: In-app notification center + acknowledge (makes the Dock badge clearable)

> **Executor instructions**: Follow step by step. Run every verification command. Touch only the
> in-scope files. NEVER push, NEVER touch `main`. Branch off `main`. The panel UI is visual (verify
> via tsc/build/lint + the logic unit tests; the actual look/interaction is manual-verify-pending).

## Status
- **Priority**: P2  •  **Effort**: M  •  **Risk**: LOW-MED (new store + UI; badge logic change)
- **Depends on**: 079 (the Dock badge / `set_dock_badge` command are on main)  •  **Category**: direction (UX)
- **Planned at**: commit `e1975b78`, 2026-06-29

## Why this matters
The macOS Dock shows a red badge (from plan 079's `useDockBadge`) counting credit-card payments due
within 45 days. There is **no in-app way to see what it represents or clear it**, so it's a permanent
mystery red dot. This plan adds a small **notification center**: a bell button + panel listing the due
reminders, each with an **acknowledge** action; the Dock badge then counts only **un-acknowledged**
reminders, so the user can actually clear it.

## Current state (verified on `main`)
- `src/components/AppShell.tsx` — `useDockBadge()` (~line 594) computes the count and sets the Dock badge:
  ```ts
  const dueCount = (() => {
    const rows = accounts.data ?? [];
    if (rows.length === 0) return 0;
    return buildCreditCardReminders(rows, todayInTimezone(timezone), (amount) => amount)
      .filter((r) => r.daysUntilDue <= 45).length;
  })();
  useEffect(() => { /* invoke("set_dock_badge", { count: dueCount > 0 ? dueCount : null }) under Tauri */ }, [dueCount]);
  ```
  The shell also renders the sidebar (`<aside class="ns-sidebar">`) with a wordmark header and nav.
- `src/domain/dashboardSummary.ts` — `buildCreditCardReminders(accounts, today, toPrimary)` returns
  `CreditCardReminder[]` with `{ accountId: string; name: string; dueDate: string /* YYYY-MM-DD */; daysUntilDue: number; ... }`.
- `src/state/uiPreferences.ts` — persisted string-array preferences follow the `dashboardHiddenCards`
  pattern: a field in `interface UiPreferences` (`dashboardHiddenCards: string[]`), a setter
  (`setDashboardHiddenCards`), inclusion in `PersistedShape`, and a filtered load in `loadPersisted`
  (`Array.isArray(parsed.dashboardHiddenCards) ? parsed.dashboardHiddenCards.filter((k) => typeof k === "string") : []`).
- Components use the design system: `Card`, `Button` from `./coss/*`, Phosphor icons (`@phosphor-icons/react`).

### Conventions
- A reminder's stable id is `cc:<accountId>:<dueDate>` — same occurrence → same id across renders/days,
  so acknowledging one occurrence doesn't hide next month's (new dueDate → new id).
- Keep pure logic (builder + count) in `src/domain/` and unit-test it. The panel/bell is presentational.
- Copy is zh-TW.

## Commands
| Install | `npm install` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Targeted test | `npx vitest run src/domain/reminderNotifications.test.ts` | pass |
| Tests | `npm test` | all pass |
| Lint | `npm run lint` | exit 0 (0 errors) |
| Build | `npm run build` | exit 0 |

## Scope
**In scope**:
- `src/domain/reminderNotifications.ts` — new: `buildReminderNotifications` + `unacknowledgedReminders`
- `src/domain/reminderNotifications.test.ts` — new: tests for both
- `src/state/uiPreferences.ts` — add `acknowledgedReminders: string[]` + `acknowledgeReminder` + `clearAcknowledgedReminders`
- `src/components/NotificationCenter.tsx` — new: the bell button + panel
- `src/components/AppShell.tsx` — mount `<NotificationCenter/>` in the sidebar; make `useDockBadge` count only un-acknowledged
**Out of scope**: the Rust `set_dock_badge` command (unchanged); OS notifications (082); the dashboard's
own reminder card; `buildCreditCardReminders` math.

## Git workflow
- Branch: `feat/ai-notification-center` (off `main`)
- Commit: `feat(notifications): in-app notification center with acknowledge`
- Do NOT push.

## Steps

### Step 1: Pure builder + count
Create `src/domain/reminderNotifications.ts`:
```ts
import { buildCreditCardReminders } from "./dashboardSummary";
import type { Account } from "./types";

export interface ReminderNotification {
  id: string;        // stable per occurrence: `cc:<accountId>:<dueDate>`
  title: string;     // e.g. "信用卡繳款提醒"
  body: string;      // e.g. "<name> 將於 <dueDate> 到期"
  dueDate: string;
  daysUntilDue: number;
}

/** Due credit-card reminders (within `withinDays`, default 45) as notification items. */
export function buildReminderNotifications(accounts: Account[], today: string, withinDays = 45): ReminderNotification[] {
  return buildCreditCardReminders(accounts, today, (a) => a)
    .filter((r) => r.daysUntilDue <= withinDays)
    .map((r) => ({
      id: `cc:${r.accountId}:${r.dueDate}`,
      title: "信用卡繳款提醒",
      body: `${r.name} 將於 ${r.dueDate} 到期`,
      dueDate: r.dueDate,
      daysUntilDue: r.daysUntilDue,
    }));
}

/** Notifications the user hasn't acknowledged yet. */
export function unacknowledgedReminders(all: ReminderNotification[], acknowledgedIds: string[]): ReminderNotification[] {
  const ack = new Set(acknowledgedIds);
  return all.filter((n) => !ack.has(n.id));
}
```
**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Acknowledged store in uiPreferences
In `src/state/uiPreferences.ts`, mirror `dashboardHiddenCards` exactly:
- `interface UiPreferences`: add `acknowledgedReminders: string[];`
- actions: `acknowledgeReminder: (id: string) => void;` and `clearAcknowledgedReminders: () => void;`
- `PersistedShape`: add `acknowledgedReminders: string[];`
- `loadPersisted`: default `[]` + the same `Array.isArray(...).filter(typeof === "string")` guard
- store impl: `acknowledgeReminder(id)` appends id if absent (`[...new Set([...state.acknowledgedReminders, id])]`) and persists; `clearAcknowledgedReminders()` sets `[]` and persists — match how `setDashboardHiddenCards` persists.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: `useDockBadge` counts only un-acknowledged
In `AppShell.tsx` `useDockBadge`, read `acknowledgedReminders` from `useUiPreferences`, build the
notifications via `buildReminderNotifications`, and count only un-acknowledged:
```ts
const acknowledged = useUiPreferences((s) => s.acknowledgedReminders);
const dueCount = (() => {
  const rows = accounts.data ?? [];
  if (rows.length === 0) return 0;
  const all = buildReminderNotifications(rows, todayInTimezone(timezone));
  return unacknowledgedReminders(all, acknowledged).length;
})();
```
Keep the existing effect that invokes `set_dock_badge` with `dueCount > 0 ? dueCount : null` (so it
clears at 0). The effect dep array must include `acknowledged` so acknowledging updates the badge.

**Verify**: `npx tsc --noEmit` → exit 0; `npm run lint` → exit 0.

### Step 4: NotificationCenter component (bell + panel)
Create `src/components/NotificationCenter.tsx`: a bell button (Phosphor `Bell`) that shows a small
un-acknowledged-count indicator and toggles a panel (a `Card` popover) listing the un-acknowledged
reminders (from `buildReminderNotifications` + `unacknowledgedReminders`, using `accounts`/`timezone`
via `useFinanceData`/`useUiPreferences` like `useDockBadge` does). Each row shows the body + a
"標為已讀" button → `acknowledgeReminder(id)`. A "全部標為已讀" button → acknowledge all currently-shown
ids. Empty state: "沒有新的提醒". Match existing `Card`/`Button` styling; keep copy zh-TW.

Mount `<NotificationCenter />` in `AppShell.tsx` in the sidebar (e.g. in the wordmark header row next to
the collapse toggle, or the sidebar footer) — pick a spot consistent with the existing sidebar layout and
matching its button sizing.

**Verify**: `npx tsc --noEmit` → exit 0; `npm run lint` → exit 0; `npm run build` → exit 0.

### Step 5: Tests
Create `src/domain/reminderNotifications.test.ts` (model on existing `src/domain/*.test.ts`):
- `buildReminderNotifications`: given accounts producing a reminder, the item id is `cc:<accountId>:<dueDate>`,
  and reminders beyond `withinDays` are excluded. (Construct minimal `Account[]` with a credit card + due
  date, mirroring `src/domain/dashboardSummary.test.ts`'s reminder cases — if that test exists, reuse its
  account fixture shape.)
- `unacknowledgedReminders`: given 3 notifications and 1 acknowledged id, returns exactly the other 2.

**Verify**: `npx vitest run src/domain/reminderNotifications.test.ts` → all pass.

## Done criteria (ALL)
- [ ] `npx tsc --noEmit` exits 0; `npm run lint` exits 0 (0 errors); `npm run build` exits 0
- [ ] `npx vitest run src/domain/reminderNotifications.test.ts` passes
- [ ] `npm test` exits 0 (no new failures)
- [ ] `grep -n "acknowledgedReminders" src/state/uiPreferences.ts src/components/AppShell.tsx` shows the store + badge use
- [ ] `grep -n "unacknowledgedReminders" src/components/AppShell.tsx` shows the badge counts un-acknowledged
- [ ] No files outside the in-scope list modified
- [ ] Bell/panel visuals + "badge clears when all acknowledged" — **manual-verify-pending** (needs the app)

## STOP conditions
- `useDockBadge` / `uiPreferences` don't match the "Current state" excerpts (drift) — report.
- `buildCreditCardReminders`'s return shape differs from `{ accountId, name, dueDate, daysUntilDue }` — report.
- Wiring the panel appears to require the Rust `set_dock_badge` command or OS notifications (082) — report.

## Maintenance notes
- **Unbounded growth**: `acknowledgedReminders` accumulates past-occurrence ids. It's small (one per
  card per month), but a future cleanup could prune ids whose `dueDate` is far in the past. Deferred.
- **Scope of the badge**: it still uses the 45-day window; the acknowledge feature is what makes it
  clearable. If the user later wants it tighter, change `withinDays` in one place (`buildReminderNotifications`).
- Reviewer: confirm the badge effect re-runs on acknowledge (dep array includes `acknowledgedReminders`),
  the id scheme is stable per occurrence, and the store persists like `dashboardHiddenCards`.
