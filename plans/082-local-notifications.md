# Plan 082: Local notifications for due reminders (077 Phase 6.1)

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. If anything in the
> "STOP conditions" section occurs, stop and report — do not improvise. Touch only
> the files listed as in scope. Commit per the Git workflow section.
>
> **Drift check (run first)**: This plan is written to land **after** plans 079, 080,
> 081 are merged into `main`. Run
> `git log --oneline -6` and confirm the merges for 079 (macOS native polish), 080
> (FM category), 081 (sync durability) are present. Then
> `git diff --stat <this plan's base SHA>..HEAD -- src-tauri/src/lib.rs src-tauri/Cargo.toml src-tauri/capabilities/default.json src/components/AppShell.tsx src/state/uiPreferences.ts`.
> The "Current state" excerpts below describe **post-079 `lib.rs`** (it already has a
> native menu, a Dock-badge command, and a `#[cfg(desktop)]` window-state plugin). If
> `lib.rs` does NOT contain those, plan 079 is not merged yet → STOP and report.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED — adds a native plugin + permission and schedules OS notifications;
  a mistake could spam the user or fail to compile
- **Depends on**: **079 must be merged** (shares `lib.rs`/`Cargo.toml`/`capabilities/default.json`)
- **Category**: direction (feature)
- **Planned at**: commit `46febcab` + the 079/080/081 merges, 2026-06-27
- **Supersedes**: 077 Phase 6.1 (this is its standalone, executor-ready form)

## Why this matters

Northstar already computes everything a reminder needs — `buildCreditCardReminders`
(`src/domain/dashboardSummary.ts`) surfaces upcoming credit-card payment due dates, and
the recurring-transaction engine knows upcoming postings. Today those only appear as
in-app prompts; if the app isn't open, the user misses them. Local notifications (no
paid Apple account, no APNs, no server — works with free provisioning on macOS/iOS)
turn those into OS-level reminders. This is the "ship" half of 077 Phase 6 (the Widget
half stays deferred — it needs SwiftUI). It must be **opt-in** (a Settings toggle):
a local-first app should not silently start posting OS notifications.

## Current state

- **No notification plugin yet**: `grep -rn "notification" src-tauri/Cargo.toml package.json` returns nothing.
- **`src-tauri/src/lib.rs`** (post-079) registers plugins in `run()` and has a
  `#[cfg(desktop)]` builder rebind block (added by 079 for window-state + menu events).
  Plugins are added with `.plugin(tauri_plugin_xxx::init())`; `invoke_handler` lists
  commands including `set_dock_badge` (from 079). **You add the notification plugin
  alongside these — do not remove or reorder 079's additions.**
- **`src-tauri/capabilities/default.json`** lists permissions (`core:default`,
  `sql:default`, `stronghold:default`, `process:default`, `fs:allow-applocaldata-*`).
  Notifications work on desktop AND mobile, so the permission goes in **`default.json`**
  (NOT the desktop-only `desktop.json`).
- **`src/state/uiPreferences.ts`** — a zustand store with persisted boolean toggles.
  The pattern to copy: `assetLogosEnabled: boolean` in `interface UiPreferences` +
  `setAssetLogosEnabled: (value: boolean) => void`, persisted via the store's
  `PersistedShape`. Toggles are surfaced in `src/routes/settings/GeneralSection.tsx`
  (e.g. `privacyMode`/`togglePrivacyMode`, `theme`/`setTheme`).
- **`buildCreditCardReminders(accounts, today, toPrimary)`** in
  `src/domain/dashboardSummary.ts` returns `{ accountId, name, dueDate, daysUntilDue,
  outstanding, currency }[]`. `dueDate` is `YYYY-MM-DD`. (079's `useDockBadge` already
  consumes this — mirror that usage.)

### Conventions to follow

- Lazy-import Tauri plugins on the JS side and gate on Tauri:
  `typeof window !== "undefined" && "__TAURI_INTERNALS__" in window` (as in
  `AppShell.tsx:applyNativeGlassAttribute` and the new `deviceIdentity.ts` from 081).
- Best-effort: notification scheduling must never throw to the UI (try/catch, log+swallow).
- Rust: gate nothing new behind `#[cfg(desktop)]` here — the notification plugin is
  cross-platform (desktop + mobile). Register it unconditionally like `sql`/`fs`.
- `cargo fmt --check` must pass (`npm run check:tauri`).
- Tests: vitest; pure logic only (see `src/domain/nlParser.test.ts` for structure).
- UI copy is zh-TW; the toggle label is a UI string — add it the way GeneralSection
  adds other labels (follow the existing `t(...)`/literal pattern in that file; if it
  uses `copy.csv` keys, add a literal zh-TW string with a `// TODO(copy)` note rather
  than hand-editing the catalog).

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Install | `npm install` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Targeted test | `npx vitest run src/features/notifications/scheduler.test.ts` | pass |
| Full tests | `npm test` | all pass |
| Lint | `npm run lint` | exit 0 (0 errors) |
| Rust fmt+check | `npm run check:tauri` | exit 0 (compiles the plugin) |

## Scope

**In scope**:
- `src-tauri/Cargo.toml` — add `tauri-plugin-notification = "2"`
- `package.json` — add `@tauri-apps/plugin-notification`
- `src-tauri/src/lib.rs` — register the plugin (alongside 079's additions)
- `src-tauri/capabilities/default.json` — add `notification:default`
- `src/features/notifications/scheduler.ts` — new: pure selector + scheduling glue
- `src/features/notifications/scheduler.test.ts` — new: unit tests for the selector
- `src/state/uiPreferences.ts` — add `remindersEnabled` + setter (persisted)
- `src/routes/settings/GeneralSection.tsx` — the opt-in toggle
- `src/components/AppShell.tsx` — a small `useReminderNotifications()` hook calling the scheduler on foreground

**Out of scope** (do NOT touch):
- The Widget extension / App Intents (077 Phase 6.2 / 7.3) — deferred SwiftUI
- Push notifications / APNs / any server — local notifications only
- `buildCreditCardReminders` math — read it, don't change it
- 079's menu / Dock-badge / window-state code in `lib.rs` — integrate alongside, don't alter

## Git workflow

- Branch: `feat/ai-local-notifications`
- Conventional commits, e.g. `feat(notifications): schedule local reminders for due payments`
- Commit when done. Do NOT push or open a PR.

## Steps

### Step 1: Add the notification plugin (Rust + JS deps + permission)

- `src-tauri/Cargo.toml`: add `tauri-plugin-notification = "2"` to the main
  `[dependencies]` (NOT the desktop-only target block — it's cross-platform).
- `package.json`: add `"@tauri-apps/plugin-notification": "^2"` to `dependencies`.
- `src-tauri/src/lib.rs`: register it in `run()` next to the other unconditional
  plugins: `.plugin(tauri_plugin_notification::init())`. Do not disturb 079's
  `#[cfg(desktop)]` block, menu, or `set_dock_badge`.
- `src-tauri/capabilities/default.json`: add `"notification:default"` to `permissions`.

**Verify**: `npm run check:tauri` → exit 0 (compiles + fmt clean). `npm install` then
`npx tsc --noEmit` → exit 0.

### Step 2: Pure reminder selector + scheduler glue

Create `src/features/notifications/scheduler.ts`.

First, the **pure, unit-testable** core:
```ts
export interface ScheduledReminder {
  id: string;          // stable key, e.g. `cc:<accountId>:<dueDate>`
  title: string;
  body: string;
  fireAt: Date;        // when the OS should show it
}

/**
 * Select the reminders to actually schedule: future-only, soonest-first, deduped by
 * id, capped (iOS allows at most 64 pending local notifications).
 */
export function selectUpcomingReminders(
  reminders: ScheduledReminder[],
  now: Date,
  max = 64,
): ScheduledReminder[] {
  const seen = new Set<string>();
  return reminders
    .filter((r) => r.fireAt.getTime() > now.getTime())
    .filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)))
    .sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime())
    .slice(0, max);
}
```

Then the **best-effort glue** (Tauri-only; never throws):
```ts
function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Build reminders from due credit-card payments. fireAt = 09:00 local on dueDate. */
export function buildPaymentReminders(
  reminders: { accountId: string; name: string; dueDate: string }[],
): ScheduledReminder[] {
  return reminders.map((r) => ({
    id: `cc:${r.accountId}:${r.dueDate}`,
    title: "信用卡繳款提醒",
    body: `${r.name} 將於 ${r.dueDate} 到期`,
    fireAt: new Date(`${r.dueDate}T09:00:00`),
  }));
}

/**
 * Reconcile OS-scheduled notifications with the current reminder set. Requests
 * permission once; cancels all previously-scheduled, then schedules the selected set.
 * No-op when not under Tauri or when disabled by the caller.
 */
export async function syncScheduledReminders(all: ScheduledReminder[], now: Date): Promise<void> {
  if (!isTauri()) return;
  try {
    const n = await import("@tauri-apps/plugin-notification");
    let granted = await n.isPermissionGranted();
    if (!granted) granted = (await n.requestPermission()) === "granted";
    if (!granted) return;
    const pending = await n.pending();
    if (pending.length) await n.cancel(pending.map((p) => p.id));
    const selected = selectUpcomingReminders(all, now);
    for (const r of selected) {
      await n.sendNotification({
        title: r.title,
        body: r.body,
        schedule: { at: r.fireAt },
        // id must be a 32-bit int; derive a stable one from r.id
        id: hashTo32(r.id),
      });
    }
  } catch {
    // best-effort — notifications are non-critical
  }
}

function hashTo32(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
```

> The exact `@tauri-apps/plugin-notification` API (`isPermissionGranted`,
> `requestPermission`, `pending`, `cancel`, `sendNotification` with a `schedule`
> field, and the `Pending`/notification id shape) must match the installed v2. If a
> symbol differs, consult the plugin's TS types in `node_modules/@tauri-apps/plugin-notification`
> and adapt — do NOT invent API. If `schedule` is not supported in the installed
> version, STOP and report.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Persisted opt-in toggle

In `src/state/uiPreferences.ts`, add `remindersEnabled: boolean` (default `false`) to
`interface UiPreferences` and a `setRemindersEnabled: (value: boolean) => void`,
following the exact shape of `assetLogosEnabled`/`setAssetLogosEnabled` (state field,
setter, and inclusion in the persisted shape so it survives reload).

In `src/routes/settings/GeneralSection.tsx`, add a toggle row labeled (zh-TW)
"到期提醒通知" with a short hint "在繳款日與週期入帳前發送系統通知", reading
`remindersEnabled`/`setRemindersEnabled`. Match the existing toggle markup in that file.

**Verify**: `npx tsc --noEmit` → exit 0; `npm run lint` → exit 0.

### Step 4: Trigger scheduling on foreground (gated by the toggle)

In `src/components/AppShell.tsx`, add a hook `useReminderNotifications()` (place it next
to the other `useXxx()` hooks already called in `AppShell()`), and call it. It:
- reads `remindersEnabled` from `useUiPreferences`; if false, returns (and best-effort
  cancels any already-scheduled — call `syncScheduledReminders([], new Date())`).
- otherwise builds reminders from `buildCreditCardReminders(accounts.data ?? [],
  todayInTimezone(timezone), (a) => a)` → `buildPaymentReminders(...)` → and calls
  `syncScheduledReminders(reminders, new Date())`.
- runs in an effect keyed on `[remindersEnabled, accounts.data]`, Tauri-gated.

Mirror the structure of 079's `useDockBadge` hook in the same file (which already reads
`accounts` + `timezone` and calls `buildCreditCardReminders`). Reuse, don't duplicate,
the account-loading.

**Verify**: `npx tsc --noEmit` → exit 0; `npm run lint` → exit 0.

### Step 5: Unit tests for the selector

Create `src/features/notifications/scheduler.test.ts`. Test `selectUpcomingReminders`
and `buildPaymentReminders` (pure functions — no Tauri needed):
- **future-only**: a reminder with `fireAt` in the past is dropped.
- **sorted**: output is ascending by `fireAt`.
- **deduped**: two reminders with the same `id` collapse to one.
- **capped**: given 70 future reminders, exactly 64 are returned (the 64 soonest).
- **buildPaymentReminders**: maps `{accountId,name,dueDate}` to a `cc:<id>:<date>` id
  and a `fireAt` at 09:00 on the due date.

**Verify**: `npx vitest run src/features/notifications/scheduler.test.ts` → all pass.

## Test plan

- New `src/features/notifications/scheduler.test.ts` with the five cases above,
  asserting concrete values (counts, order, the derived id string), not just truthiness.
- The async `syncScheduledReminders` is best-effort glue around the plugin and is NOT
  unit-tested here (it needs the native plugin); the pure selector it depends on IS.
- Verification: `npm test` → all pass including the new tests.

## Done criteria (ALL must hold)

- [ ] `npm run check:tauri` exits 0 (notification plugin compiles)
- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run lint` exits 0 (0 errors)
- [ ] `npx vitest run src/features/notifications/scheduler.test.ts` → all pass
- [ ] `npm test` exits 0 (no new failures)
- [ ] `grep -n "notification:default" src-tauri/capabilities/default.json` matches
- [ ] `grep -n "remindersEnabled" src/state/uiPreferences.ts` matches
- [ ] 079's `set_dock_badge` and menu code in `lib.rs` are intact (`grep -n "set_dock_badge\|build_native_menu" src-tauri/src/lib.rs` still matches)
- [ ] No files outside the in-scope list modified
- [ ] GUI: a scheduled notification actually fires → **manual-verify-pending** (needs a device/sim; headless executor marks this pending)

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 079 is not merged (the `lib.rs` excerpts/menu/badge are absent) — base is wrong.
- The installed `@tauri-apps/plugin-notification` v2 lacks `schedule`/`pending`/`cancel`
  or names them differently and the package's TS types show no clear equivalent.
- Adding `notification:default` to `default.json` fails the capability schema validation
  during `npm run check:tauri` / build.
- Scheduling would require touching `buildCreditCardReminders` math or 079's code.

## Maintenance notes

- **iOS 64-pending cap**: `selectUpcomingReminders` enforces it; re-run on every
  foreground (the hook does) so the soonest 64 are always scheduled as time passes.
- **Recurring postings**: this plan only schedules credit-card payment reminders. Adding
  recurring-transaction posting reminders is a natural follow-up — feed them into the
  same `ScheduledReminder[]` list; the selector already handles merge/cap.
- **Dedup with the Dock badge (079)**: both derive from `buildCreditCardReminders`. If
  the reminder definition changes, update both. Consider the `dueReminderCount()` /
  shared-selector extraction noted in 079's maintenance notes.
- **Reviewer focus**: confirm the toggle defaults OFF (opt-in), the scheduler never
  throws to the UI, and disabling the toggle cancels pending notifications.
