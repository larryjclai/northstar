# Plan 077: Apple-native polish for Northstar (macOS + iOS) — RWD, sync, native feel, extensions, on-device AI

> **Executor instructions**: This is a **design & architecture plan**, not a
> single-step code change. It spans multiple phases, each independently
> shippable. Execute phases in order; each has its own verification. If
> anything in the "STOP conditions" section occurs, stop and report — do not
> improvise. When done with a phase, update the status row in
> `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 2bfb7636..HEAD -- src/components/AppShell.tsx src/styles/globals.css src/routes/ src-tauri/tauri.conf.json`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding.

## Status

- **Priority**: P1
- **Effort**: L (7 phases, each S–M; Phases 1–5 first, 6–7 follow-on)
- **Risk**: MED — touches layout across all routes, sync edge cases, adds a CSS layer,
  a notification plugin, and new on-device-AI bridge code
- **Depends on**: none (but benefits from plans 041/052/053 sidebar polish landing first)
- **Category**: direction
- **Planned at**: commit `2bfb7636`, 2026-06-26

## Why this matters

The end goal: Northstar should feel like a **native Apple app on both macOS and iOS**,
lean on **free on-device Apple capabilities** (Apple Intelligence / Foundation Models)
rather than the cloud, and stay **fast and low-power**. The desktop macOS app already
has native vibrancy and on-device Foundation Models; iOS lags behind.

Northstar already compiles and runs on iOS (free provisioning, 7-day re-sign) with
a bottom-tab-bar shell in place. But most route content overflows on mobile viewports
(tables, charts, multi-column grids), the sync flow has never been tested under iOS
backgrounding/foreground-resume, and the UI doesn't feel native — it's a desktop app
squeezed into a phone. This plan turns the iOS build from "it runs" into "a polished
Apple-native companion" across seven phases:

1. **Responsive layout** — every route readable on 390px (iPhone 15/16)
2. **Cross-device sync** — reliable under iOS lifecycle constraints
3. **Sync hardening** — durable cursor, lifecycle-aware scheduling
4. **Native feel** — Liquid Glass material, iOS UX patterns (haptics deferred)
5. **Dependency & license audit** — keep the dependency tree App-Store-clean
6. **Apple platform extensions** — local notifications (ship) + Widget (deferred SwiftUI)
7. **Apple Intelligence + power/performance** — extend on-device Foundation Models;
   hold an energy budget

All new dependencies must be MIT/Apache-2.0/ISC/BSD — no GPL/LGPL/SSPL.

> **Stack note**: this plan keeps the Tauri WebView stack. The only native Swift it
> adds is the (deferred) Widget extension and new Foundation Models `@Generable`
> structs. The macOS↔iOS reuse story is the whole point — see plan 078 for why
> React Native was evaluated and rejected for this project.

---

## Current state

### Shell (already mobile-aware)
- `src/components/AppShell.tsx` — `lg:` breakpoint splits desktop sidebar vs mobile
  bottom dock; safe-area-inset already applied to top padding and dock bottom.
- `src/styles/globals.css` — `.ns-glass` class provides CSS backdrop-blur material;
  `html[data-native-glass]` attribute enables macOS Tauri vibrancy (transparent BG +
  NSVisualEffectView). iOS currently falls back to CSS glass.
- Mobile dock: 5-col grid fixed at bottom, FAB for quick-add, "more" sheet for
  secondary nav items.

### Routes with layout issues on small screens

| Route | LOC | Problem on 390px |
|---|---|---|
| `CashFlowRoute.tsx` | 2727 | Multi-column summary cards, grouped bar chart, activity table with 5+ cols |
| `InvestmentsRoute.tsx` | 1955 | Holdings table (ticker, qty, cost, value, gain, %) overflows; already has `ns-invest-mobile-list` but only at `<900px` |
| `InvestmentsAnalyticsTab.tsx` | 1787 | Inline grids with `minmax(420px,1fr)` — won't fit |
| `DashboardRoute.tsx` | 1549 | `auto-fit minmax(280px,1fr)` cards mostly work but some cards have dense inner tables |
| `AccountsRoute.tsx` | 880 | Account cards OK but reconcile/detail sub-routes have desktop-width tables |
| `HoldingDetailRoute.tsx` | 658 | Chart + detail grid side-by-side → stack on mobile |
| `ReconcileRoute.tsx` | 537 | Checkbox table with many columns |
| `FIRECalculatorRoute.tsx` | 566 | Input form OK; output grid needs stacking |

### Sync architecture
- `src/features/connect/sync/sync-manager.ts` — module-level mutex (`_syncRunning`),
  called on app focus (AppShell `useEffect`) and manual button press.
- Push → backup → pull → apply (last-write-wins by revision).
- Cursor stored in `localStorage` — **problem on iOS**: WebKit may evict
  localStorage under memory pressure. Already has `forceFullResync` recovery.
- No visibility/background-aware scheduling — sync fires on focus but doesn't
  handle iOS-specific `webkitvisibilitychange` or Tauri's `app::RunEvent::Resumed`.

### Dependencies & licensing
All current deps are MIT/Apache-2.0 compatible. Key additions this plan may require:

| Package | Purpose | License |
|---|---|---|
| `@anthropic-ai/sdk` | (not needed) | — |
| iOS haptics | Tauri 2 `haptics` plugin or Web Vibration API | MIT (Tauri plugins) |
| Motion library | Already have `tw-animate-css`; may add `motion` (Framer Motion successor) | MIT |

---

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Dev server | `npm run dev` | Vite starts on localhost |
| Build | `npm run build` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | all pass |
| Lint | `npm run lint` | exit 0 |
| iOS sim | `npm run tauri ios dev 'iPhone 17'` | App launches in sim |
| iOS build | `npm run tauri ios build -- --export-method debugging` | IPA produced |

## Scope

**In scope** (files you will modify):
- `src/styles/globals.css` — responsive breakpoints, glass tokens, iOS overrides
- `src/components/AppShell.tsx` — lifecycle handling, iOS platform detection
- All `src/routes/*.tsx` — responsive layout adjustments
- `src/features/connect/sync/sync-manager.ts` — iOS lifecycle sync
- `src/state/deviceIdentity.ts` — cursor storage hardening
- `src/features/notifications/` — new local-notification scheduler (Phase 6.1)
- `src-tauri/tauri.conf.json` — iOS capabilities if needed
- `src-tauri/capabilities/default.json` — notification permission (Phase 6.1)
- `src-tauri/Cargo.toml` — iOS-specific plugin deps (notification)
- `src-tauri/src/lib.rs` — register notification plugin; new Foundation Models commands (Phase 7.2)
- `src-tauri/gen/apple/Sources/northstar/FoundationModels.swift` — new `@Generable` structs (Phase 7.2)
- `src/lib/foundationModels.ts` — TS wrappers for new on-device features (Phase 7.2)

**Out of scope**:
- Paid Apple Developer provisioning / App Store submission (separate effort)
- Any changes to financial calculation logic (`src/domain/` math) — Phase 7.2 may
  READ aggregates but must not change how they're computed
- Sync protocol changes (push/pull/encrypt) — only lifecycle scheduling changes
- SwiftUI screens for the main app — it stays a WebView app; the ONLY new Swift is
  the Widget extension (Phase 6.2) and Foundation Models `@Generable` structs (7.2)
- The Widget extension itself (Phase 6.2) and App Intents (Phase 7.3) are **deferred
  design notes** — do not build them in this plan unless explicitly told
- Cloud LLM / opt-in cloud NLP tier — separate roadmap item; this plan is on-device only
- `copy.csv` / i18n strings (only layout, not copy changes)

## Git workflow

- Branch: `feat/ai-ios-production-readiness`
- Commit style: conventional commits (e.g. `feat(ios): add responsive breakpoints for mobile routes`)
- One commit per step or logical unit. Do NOT push or open a PR unless instructed.

---

## Phase 1: Responsive foundations (CSS + AppShell)

### Step 1.1: Define mobile breakpoint tokens

In `src/styles/globals.css`, add a `/* ── Mobile-first breakpoints ── */` section
near the existing responsive blocks. The app already uses Tailwind's `lg:` (1024px)
as the desktop/mobile split. Add these explicit media queries for route-level
responsive overrides:

```css
/* ── Compact viewport (iPhone 15/16 class: 390px logical) ── */
@media (max-width: 640px) { /* already exists partially — consolidate here */ }
@media (max-width: 480px) { /* ultra-narrow: hide non-essential columns */ }
```

Convention: use Tailwind responsive prefixes (`sm:`, `md:`, `lg:`) in JSX, but
route-specific table/grid overrides use the CSS media queries (matching the existing
pattern in `globals.css` lines 527, 1293, 1404).

**Verify**: `npx tsc --noEmit` exits 0; `npm run dev` shows no regressions on desktop.

### Step 1.2: Harden safe-area-inset coverage

Audit all routes for content that sits behind the notch/Dynamic Island or home
indicator. AppShell already handles top padding and dock bottom. Check for:
- Fixed/sticky elements within routes (e.g. sticky headers in tables)
- Bottom sheets / drawers that need `padding-bottom: env(safe-area-inset-bottom)`
- Horizontal safe areas on landscape (not priority but add `env(safe-area-inset-left/right)` to the main content area)

**Verify**: In iOS Simulator (iPhone 17), all content is visible and not clipped by
notch or home indicator.

### Step 1.3: Touch target audit

Grep for interactive elements smaller than 44×44px. Key areas:
- Table row action buttons (edit/delete icons in holdings, transactions)
- Date scope chips in CashFlowRoute
- Tab bar items in route-level tabs (Investments sub-tabs)
- Chart tooltip dismiss areas

Add a utility class `.ns-touch-target { min-height: 44px; min-width: 44px; }` and
apply to undersized targets.

**Verify**: In iOS Simulator, tap every interactive element without mis-taps.

---

## Phase 2: Route-by-route responsive layout

Work through routes in this priority order (most-used first, biggest overflow issues):

### Step 2.1: DashboardRoute

The dashboard uses `auto-fit minmax(280px, 1fr)` grids — these mostly work. Fix:
- Net worth summary strip: stack vertically on `<640px`
- Inner card tables (account balances, movers): hide secondary columns on mobile, or
  switch to a stacked key-value layout
- Charts: `ResponsiveContainer` already handles width; ensure height isn't too tall
  on mobile (cap at `min(300px, 50vh)`)

**Verify**: `npm run dev` → browser DevTools → toggle device toolbar iPhone 15 Pro
(390×844). All cards readable, no horizontal scroll.

### Step 2.2: CashFlowRoute

This is the largest route (2727 LOC). Key changes:
- Summary cards row: switch from horizontal flex to vertical stack on `<640px`
- Grouped bar chart: reduce bar padding, hide x-axis labels to every-other on mobile
- Activity table: on `<640px`, switch to the existing `ns-mobile-transaction-list`
  pattern (card-style rows instead of table). This pattern already exists in
  globals.css lines 984–1000.
- Category breakdown: single-column pie + list instead of side-by-side

**Verify**: Same DevTools mobile check. Scroll the entire page; no horizontal overflow.

### Step 2.3: InvestmentsRoute + InvestmentsAnalyticsTab

- Holdings list: the `ns-invest-mobile-list` already exists for `<900px`. Extend it
  to work at `<640px` by hiding the "cost basis" and "quantity" columns, showing only
  ticker/name, current value, and gain/loss %.
- Analytics tab: the `minmax(420px, 1fr)` grids must drop to `minmax(min(100%,420px), 1fr)` — note the `min()` is already used in some places but not all.
  Specifically fix lines around 785 in `InvestmentsAnalyticsTab.tsx`.
- Benchmark comparison chart: full width on mobile, legend below chart instead of
  beside it.

**Verify**: DevTools mobile check on both tabs.

### Step 2.4: Remaining routes

Apply the same patterns to:
- `AccountsRoute` — account cards already stack; fix reconcile sub-route table
- `HoldingDetailRoute` — stack chart above detail grid instead of side-by-side
- `ReconcileRoute` — on mobile, show only date + payee + amount + checkbox; hide
  category and account columns
- `GoalsRoute` — cards already stack; verify FIRE calculator inputs aren't clipped
- `SettingsRoute` — form inputs already full-width; verify sync pairing QR is visible

**Verify**: Full pass through all routes in mobile DevTools.

---

## Phase 3: Cross-device sync hardening for iOS

### Step 3.1: Cursor storage migration

The sync pull cursor lives in `localStorage`. On iOS, WebKit can evict localStorage
under memory pressure (rare but documented). Migrate to a more durable store:

**Option A (recommended)**: Store the cursor in the SQLite database itself (a
`_sync_meta` table). This is already the most durable local store and survives
any WebKit eviction.

**Option B**: Use Tauri's `plugin-fs` to write cursor to app's data directory.

Implementation (Option A):
- In the app's migration/init code, create table:
  `CREATE TABLE IF NOT EXISTS _sync_meta (key TEXT PRIMARY KEY, value TEXT)`
- Replace `setRemotePullCursor` / `getRemotePullCursor` in
  `src/state/deviceIdentity.ts` to read/write from this table.
- Keep `forceFullResync` as the recovery path if the table is somehow lost.

**Verify**: `npm test` — existing sync tests pass. Add a test for cursor round-trip.

### Step 3.2: iOS lifecycle-aware sync scheduling

In `AppShell.tsx`, the sync currently fires on window `focus` event. On iOS:
- The WebView doesn't always fire `focus` on app resume — use
  `document.addEventListener('visibilitychange')` as the primary trigger.
- Tauri 2 on iOS supports `tauri://resumed` event (maps to UIKit's
  `applicationDidBecomeActive`). Wire this up alongside the visibility change.
- Add a minimum interval between syncs (e.g. 30 seconds) to avoid rapid-fire
  sync on repeated foreground/background cycling.

In `sync-manager.ts`:
```typescript
let _lastSyncAt = 0;
const MIN_SYNC_INTERVAL_MS = 30_000;

export function shouldAutoSync(): boolean {
  return !_syncRunning && Date.now() - _lastSyncAt > MIN_SYNC_INTERVAL_MS;
}
```

**Verify**: In iOS Simulator, background the app (Cmd+Shift+H), wait 5s, resume.
Sync should fire once (check console log). Rapid resume shouldn't double-sync.

### Step 3.3: Handle iOS background termination gracefully

iOS can terminate backgrounded apps without warning. Ensure:
- `runSync` saves the push cursor atomically (not at the end of a multi-step
  operation that could be interrupted).
- If sync is interrupted mid-pull, the next `runSync` recovers via
  `forceFullResync`. Test this by force-killing the iOS app mid-sync.

**Verify**: Manual test: start sync, force-quit app from app switcher, reopen →
app should recover without data loss.

---

## Phase 4: iOS native feel — Liquid Glass & haptics

### Step 4.1: iOS Liquid Glass material

Apple's Liquid Glass (iOS 26 / WWDC 2025) is a system-level material that apps
opt into via UIKit/SwiftUI. Since Northstar uses a Tauri WKWebView, we **cannot**
use the native Liquid Glass API directly. Instead, approximate it with CSS:

**Strategy**: Enhance the existing `.ns-glass` material on iOS to closer match the
Liquid Glass aesthetic:
- Increase blur radius: `--ns-glass-blur: 32px` (from 20px) on iOS
- Add a subtle color-tinted overlay that shifts with scroll (parallax-like)
- Use `backdrop-filter: blur() saturate() brightness()` combination
- Add a thin inner border (`box-shadow: inset 0 0 0 0.5px rgba(255,255,255,0.15)`)

Platform detection (already exists in AppShell):
```typescript
const isIOSTauri = '__TAURI_INTERNALS__' in window && /iPad|iPhone/.test(navigator.userAgent);
if (isIOSTauri) document.documentElement.setAttribute('data-ios-glass', '');
```

In `globals.css`:
```css
html[data-ios-glass] {
  --ns-glass-blur: 32px;
  --ns-glass-saturate: 1.8;
}
html[data-ios-glass] .ns-glass,
html[data-ios-glass] .ns-sidebar,
html[data-ios-glass] .ns-mobile-dock {
  box-shadow: inset 0 0.5px 0 0 rgba(255,255,255,0.18);
}
```

**Verify**: iOS Simulator — sidebar and bottom dock should have a more prominent
glass effect compared to desktop. Take screenshots for comparison.

### Step 4.2: Haptic feedback

Tauri 2 does not yet have a first-party haptics plugin. Two options:

**Option A (recommended — zero deps)**: Use the Web Vibration API for basic
feedback. Safari on iOS supports `navigator.vibrate()` for simple patterns.
Actually — **correction**: Safari does NOT support the Vibration API. Use the
experimental `navigator.clipboard` haptics or accept no haptics until Tauri adds
a plugin.

**Option B**: Create a minimal Tauri plugin that calls UIKit's
`UIImpactFeedbackGenerator`. This is ~20 lines of Swift in a Tauri plugin, MIT
licensed (you own it).

For now, **skip haptics** and add a `TODO(ios-haptics)` marker. The UX gain is
marginal compared to the layout and sync work. Revisit when Tauri ships a
first-party haptics plugin or when the app is closer to App Store submission.

**Verify**: N/A — deferred.

### Step 4.3: iOS-specific UX polish

- **Pull-to-refresh**: On iOS, users expect pull-to-refresh. Add a simple CSS
  `overscroll-behavior: contain` on the main scroll container and wire up a
  manual refresh trigger on overscroll. Or use the native rubber-band overscroll
  that WKWebView already provides — just wire the `scroll` event threshold to
  trigger `runSync()`.
- **Scroll momentum**: WKWebView already has `-webkit-overflow-scrolling: touch`
  by default. Verify it's not overridden.
- **Status bar style**: In `tauri.conf.json`, set the iOS status bar style to
  match the theme (light content on dark theme, dark content on light theme).
  Tauri 2 supports this via `app.ios.statusBarStyle`.
- **Keyboard avoidance**: When input fields are focused, ensure the viewport
  scrolls to keep them visible. WKWebView handles this natively, but verify
  with the InvestmentsAddSheet form (the most complex input form).

**Verify**: iOS Simulator — test each item manually.

---

## Phase 5: Dependency & license audit

### Step 5.1: Audit all dependencies for iOS compatibility

Some npm packages use Node.js APIs that won't work in a mobile WebView. Audit:

```bash
# Check for Node.js built-in usage in production deps
grep -rn "require('fs')\|require('path')\|require('crypto')\|require('os')" node_modules/ --include="*.js" -l 2>/dev/null | grep -v devDependencies | head -20
```

Known safe: all current deps are browser-compatible (React, Recharts, date-fns,
Zustand, etc.). The Tauri plugins handle native functionality.

### Step 5.2: License compliance check

```bash
npx license-checker --summary
# Or:
npx license-checker --failOn "GPL-2.0;GPL-3.0;LGPL-2.0;LGPL-2.1;LGPL-3.0;AGPL-3.0;SSPL-1.0"
```

If any GPL/LGPL/SSPL dependency is found, it must be replaced before App Store
submission. Current deps are all MIT/Apache-2.0/ISC — verify this still holds after
any new additions in this plan.

**Verify**: `npx license-checker --failOn "GPL-2.0;GPL-3.0;LGPL-2.0;LGPL-2.1;LGPL-3.0;AGPL-3.0;SSPL-1.0"` exits 0.

---

## Phase 6: Apple platform extensions — Notifications & Widget

These are the two most-requested "native app" features. They have **very different
costs**: notifications are a plugin install; the widget requires hand-written SwiftUI.
Treat them as independent sub-efforts.

### Step 6.1: Local notifications (do this — low cost, high value)

Use the official `@tauri-apps/plugin-notification` (MIT). Works on iOS, macOS, and
Android with **free provisioning** (local notifications need no paid account or APNs).

Northstar already computes everything a reminder needs in-app — `buildCreditCardReminders`
(`src/domain/`) and the recurring-transaction engine. This step turns those in-app
prompts into scheduled system notifications.

Add the dependency:
- `src-tauri/Cargo.toml`: `tauri-plugin-notification = "2"`
- `package.json`: `@tauri-apps/plugin-notification`
- Register the plugin in `src-tauri/src/lib.rs` (`.plugin(tauri_plugin_notification::init())`)
- Add the `notification:default` permission to `src-tauri/capabilities/default.json`

Wire a scheduler (new file `src/features/notifications/scheduler.ts`):
- On app launch and after each data mutation that affects due dates, compute the
  next N upcoming reminders (credit-card payment due, recurring transaction posting,
  budget-overspend if enabled).
- Request permission once (`isPermissionGranted` / `requestPermission`), then
  schedule via `sendNotification` with a `schedule` payload.
- **iOS pending-notification cap is 64** — only schedule the soonest 64. Re-seed the
  queue on every app foreground (cheap, and Phase 3 already wires a foreground hook).

Provide a settings toggle (in `SettingsRoute` / `ConnectSection` style) to enable/
disable reminders — local-first users may not want OS-level prompts.

**Verify**: iOS Simulator — schedule a notification 10s out, background the app, the
banner appears. `npm test` — add a unit test for "compute next 64 reminders, sorted,
deduped" in `src/features/notifications/scheduler.test.ts`.

### Step 6.2: Home Screen / Notification Center Widget (defer — needs SwiftUI + App Group)

**Reality check the executor must understand**: a widget CANNOT render the React
WebView. WidgetKit runs in a separate process and only renders **SwiftUI**. Tauri
does not help here — but because Tauri generates a real Xcode project
(`src-tauri/gen/apple/northstar.xcodeproj`), you can add a Widget Extension target
to it. The same is true for React Native, so this is not a reason to switch stacks.

The data bridge is the real work:

1. **App Group**: Enable an App Group (`group.app.northstar.finance`) on both the
   main app target and the new widget target in Xcode Signing & Capabilities. (App
   Groups require a paid Developer account for device distribution, but work in the
   Simulator with free provisioning for development.)
2. **Shared snapshot**: The main app writes a tiny JSON snapshot (net worth, today's
   change, last-updated timestamp — NO holdings, NO transactions; keep it minimal
   and privacy-safe) into the App Group container on each data refresh. Add this
   write to the existing data-refresh path; reuse `plugin-fs` pointed at the shared
   container path, or expose a small Tauri command that writes via Swift.
3. **SwiftUI widget**: ~100-150 LOC of SwiftUI in the widget target that reads the
   shared JSON via `UserDefaults(suiteName:)` or the shared file URL and renders a
   net-worth glance (number + sparkline). Small/medium widget families.
4. **SQLite path note**: if the widget ever needs to read the DB directly, the
   `plugin-sql` database file must live in the App Group container — a path change
   that affects Phase 3. For the JSON-snapshot approach above, this is NOT needed.

**Why defer**: requires writing and maintaining SwiftUI (outside the React/TS
codebase), an App Group entitlement, and ideally a paid Developer account for device
testing. The value is real but it's the highest-effort, lowest-reuse item in this plan.

**Verify (when done)**: Add the widget in the Simulator's widget gallery; it shows
the latest net-worth snapshot and refreshes after the app writes a new snapshot.

---

## Phase 7: Deepen Apple Intelligence & guard power/performance

The goal is a fast, low-power app that leans on **free, on-device** Apple capabilities
rather than cloud calls. The Foundation Models groundwork already exists — extend it,
and put guardrails on the WebView's energy cost.

### Step 7.1: Inventory what already works (don't rebuild it)

Already shipped (confirm before extending):
- `src-tauri/gen/apple/Sources/northstar/FoundationModels.swift` (242 LOC) — on-device
  Apple Foundation Models bridge with `@Generable` guided generation for Quick Add.
- `src-tauri/src/lib.rs` — Rust FFI commands `foundation_models_available`,
  `parse_quick_add_on_device`, `foundation_models_prewarm`.
- `src/lib/foundationModels.ts` — TS wrapper; graceful no-op on non-Apple platforms.
- `build.rs` compiles the Swift bridge for the macOS **desktop** build too, so
  on-device parsing already runs on macOS 26+ and iOS 26+ alike.

This means Apple Intelligence is NOT greenfield — it's a working Tier-1 parser. The
work below is incremental.

### Step 7.2: Extend on-device Foundation Models usage (free, offline, no network)

Candidate features that reuse the existing `@Generable` + FFI pattern — each is a new
`@Generable` output struct in the Swift bridge plus a new Rust command + TS wrapper,
mirroring the Quick Add path exactly:

- **Transaction auto-categorization assist**: when the rules engine + UserLexicon are
  low-confidence, ask the on-device model to suggest a category. Pure local.
- **Monthly summary narrative**: generate a short zh-TW natural-language summary of
  the month's spending/saving from already-computed aggregates. On-device, no data
  leaves the device — preserves the local-first invariant.

Keep every new capability behind the same availability gate (returns null on
unsupported OS/hardware) so Windows/Linux/older Apple devices fall back silently.

**Out of scope here**: cloud LLM calls. The opt-in cloud tier is a separate roadmap
item (see `project_quick_add_nlp` memory) and must not be conflated with the free
on-device path.

### Step 7.3: App Intents / Siri / Shortcuts (design only in this plan)

Apple's App Intents let users add an expense via Siri or a Shortcut. Like the widget,
this is **SwiftUI/Swift in the Xcode project**, not React — an `AppIntent` struct that
either deep-links into the app or writes through the App Group. Scope this as a
design note now; implement after the widget App Group plumbing (Step 6.2) exists,
since both share the App Group data path. Do NOT build it in this plan — record the
design and dependency.

### Step 7.4: System Writing Tools (free, near-zero effort)

On iOS 18+/macOS 15+, Apple's Writing Tools appear automatically in standard text
inputs. Verify Northstar's note/description fields (e.g. transaction memo in
`InvestmentsAddSheet`, transaction detail) use native `<input>`/`<textarea>` so the
system Writing Tools menu is available. No code to add — just confirm no custom
contentEditable shim blocks it.

**Verify**: iOS Simulator — long-press a memo field, "Writing Tools" appears in the
context menu.

### Step 7.5: Power & performance budget

The WebView is the dominant energy cost. Establish and hold a budget:

- **No background polling**: sync only on foreground (already enforced in Phase 3 via
  `MIN_SYNC_INTERVAL_MS`). Grep to confirm no `setInterval` does network/DB work:
  `grep -rn "setInterval" src/` → review each hit.
- **Lazy routes stay lazy**: the app already uses `manualChunks` + `lazyRouteComponent`
  (per design notes). Confirm `npm run build` output still code-splits per route —
  a regression here loads all routes (and all Recharts) up front, hurting launch
  energy. `ls dist/assets/*.js | wc -l` should show multiple route chunks.
- **Chart cost on mobile**: Recharts re-renders on every resize/scroll. Ensure charts
  are wrapped so they don't re-render on unrelated state changes (check `useMemo` on
  chart data; React.memo on chart components). Consider capping animation on mobile
  (`isAnimationActive={false}` under `data-ios-glass`).
- **Foundation Models prewarm timing**: `foundation_models_prewarm` loads the model
  into memory — only call it when the user opens Quick Add (⌘N / FAB), never at app
  launch, or you pay the energy/RAM cost unconditionally. Confirm the current call
  site in `QuickAdd.tsx` is lazy.
- **Measure**: run the app from Xcode → Instruments → **Energy Log** + **Time
  Profiler** on a 2-minute scripted session (launch, scroll dashboard, open Quick
  Add, add a transaction). Record a baseline in a comment; flag if launch-to-
  interactive exceeds ~1.5s on a recent device.

**Verify**: `grep -rn "setInterval" src/` reviewed; `npm run build` still emits
per-route chunks; Instruments Energy Log shows the app idles at "Low" impact when
not interacting.

---

## Test plan

This plan is primarily a layout + integration effort. Tests to add:

1. **Sync cursor storage** (Step 3.1): Unit test for cursor read/write via SQLite
   `_sync_meta` table. Model after existing tests in
   `src/features/connect/sync/pull.test.ts`.

2. **Sync throttle** (Step 3.2): Unit test for `shouldAutoSync()` — returns true
   after interval, false before. Place in `src/features/connect/sync/sync-manager.test.ts`.

3. **Visual regression** (manual): Screenshot comparison on iPhone 15 simulator for
   each route, dark and light theme. No automated visual regression infra exists yet —
   this is manual for now.

**Verify**: `npm test` — all existing + new tests pass.

## Done criteria

ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm test` exits 0; new sync tests exist and pass
- [ ] `npm run lint` exits 0
- [ ] Every route renders without horizontal overflow at 390px viewport width
  (verified in browser DevTools mobile view)
- [ ] iOS Simulator builds and launches: `npm run tauri ios dev 'iPhone 17'`
- [ ] Sync fires on app resume from background in iOS Simulator
- [ ] Local notification schedules and fires in iOS Simulator (Phase 6.1); scheduler
  unit test passes
- [ ] On-device Foundation Models features (Phase 7.2) gate cleanly to null on
  non-Apple/older platforms (existing test pattern in `foundationModels` path holds)
- [ ] `grep -rn "setInterval" src/` reviewed — no background network/DB polling (Phase 7.5)
- [ ] `npm run build` still emits per-route JS chunks (Phase 7.5)
- [ ] No GPL/LGPL/AGPL/SSPL dependencies:
  `npx license-checker --failOn "GPL-2.0;GPL-3.0;LGPL-2.0;LGPL-2.1;LGPL-3.0;AGPL-3.0;SSPL-1.0"`
- [ ] No files outside the in-scope list are modified (Widget extension + App Intents
  remain unbuilt design notes)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- Any existing Tauri plugin (`plugin-sql`, `plugin-stronghold`) fails to compile
  on iOS target — this indicates a toolchain issue, not a code issue.
- The sync `_sync_meta` table creation conflicts with existing migration logic.
- Adding `data-ios-glass` attribute causes visual regressions on desktop or macOS
  Tauri (the `html[data-ios-glass]` selector should be iOS-only).
- A production dependency has a GPL/LGPL license — do not proceed with that dep;
  report and find an alternative.
- Any route's responsive refactor changes financial calculation output or data
  flow — this plan is layout-only.

## Maintenance notes

- **Liquid Glass**: The CSS approximation will never match Apple's native material
  exactly. When Tauri gains WKWebView-level Liquid Glass support (iOS 26+), switch
  from CSS `backdrop-filter` to the native API. Track Tauri's iOS roadmap.
- **Haptics**: Deferred (Step 4.2). Revisit when Tauri ships a haptics plugin or
  when preparing for App Store submission.
- **App Store submission**: This plan gets the app to "usable companion" quality.
  App Store requires: paid Developer account ($99/yr), app review guidelines
  compliance, privacy nutrition labels, and an App Store Connect listing. That's
  a separate plan.
- **Responsive layout**: After this plan, any new route or component must be tested
  at 390px. Consider adding a CI check with Playwright mobile viewport.
- **Pull-to-refresh**: The scroll-threshold approach is fragile. A proper solution
  would use Tauri's iOS event system. Monitor for a community plugin.
- **Widget & App Intents (deferred)**: Both live in the Xcode project as SwiftUI/Swift,
  share an App Group data path, and need a paid Developer account for device
  distribution. When picked up, do the App Group plumbing once (Phase 6.2 step 1-2)
  and both features build on it. This is identical work whether the app is Tauri or
  React Native — it is not a stack decision.
- **Apple Intelligence**: on-device Foundation Models already runs on macOS 26+ and
  iOS 26+ (Quick Add). Keep every new use behind the availability gate so non-Apple
  and older platforms fall back silently. Never route user financial data to a cloud
  model — the local-first invariant forbids it.
- **Power budget**: the biggest regression risk is (a) losing per-route code-splitting
  and (b) charts re-rendering on unrelated state. A reviewer should check the build
  output chunk count and chart `useMemo`/`React.memo` on any PR touching routes.
