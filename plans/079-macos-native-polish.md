# Plan 079: macOS native-feel polish — title bar, app menu, Dock badge, window state

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. If anything in the
> "STOP conditions" section occurs, stop and report — do not improvise. When done,
> update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 2bfb7636..HEAD -- src-tauri/tauri.conf.json src-tauri/src/lib.rs src-tauri/Cargo.toml src-tauri/capabilities/`
> If any in-scope file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch, treat it
> as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED — touches the Tauri Rust entry point and window config; a mistake
  here can prevent the app from launching on all desktop platforms
- **Depends on**: none. Step 3 (Dock badge) shares the reminder-counting logic with
  plan 077 Phase 6.1 (notifications) — if 077 Phase 6.1 lands first, reuse its
  scheduler; if not, this plan computes the count standalone.
- **Category**: direction (platform polish)
- **Planned at**: commit `2bfb7636`, 2026-06-26

## Why this matters

The macOS desktop build already has the hard parts of native feel — `NSVisualEffectView`
vibrancy (`windowEffects: [mica, sidebar]`) and on-device Apple Foundation Models. What's
left are the small, high-signal details that separate "a web app in a window" from "a Mac
app": content that flows under a transparent title bar, a real localized menu bar (so
`⌘,` opens Settings and `⌘C/⌘V` work natively), a Dock badge for unread reminders, and a
window that reopens at the size and position the user left it. Each is small; together
they're most of the perceived "nativeness" on macOS. This complements plan 077 (which
covers iOS) — same codebase, desktop-specific chrome.

## Current state

- **`src-tauri/tauri.conf.json`** — single window, transparent + vibrancy, **default
  decorated title bar** (no `titleBarStyle`), Tauri **2.11.3**, `macos-private-api`
  enabled:
  ```json
  "windows": [
    {
      "title": "Northstar",
      "width": 1240, "height": 820,
      "minWidth": 1024, "minHeight": 680,
      "transparent": true,
      "windowEffects": { "effects": ["mica", "sidebar"] }
    }
  ]
  ```
- **`src-tauri/src/lib.rs`** — `run()` builds the app with plugins (`sql`, `process`,
  `fs`, conditional `stronghold`, desktop-only `updater`) and an `invoke_handler`.
  **There is no custom menu** — Tauri falls back to its default menu. The builder
  looks like:
  ```rust
  #[cfg_attr(mobile, tauri::mobile_entry_point)]
  pub fn run() {
      tauri::Builder::default()
          .plugin(tauri_plugin_sql::Builder::default().build())
          .plugin(tauri_plugin_process::init())
          .plugin(tauri_plugin_fs::init())
          .setup(|app| { /* stronghold + desktop updater */ Ok(()) })
          .invoke_handler(tauri::generate_handler![ /* … */ ])
          .run(tauri::generate_context!())
          .expect("error while running Northstar");
  }
  ```
- **`src-tauri/Cargo.toml`** — `tauri = { version = "2", features = ["devtools", "macos-private-api"] }`, edition 2021. Patched `tauri-plugin-sql` (single-connection pool — do not disturb).
- **`src-tauri/capabilities/desktop.json`** — desktop-only permissions live here
  (`platforms: ["macOS","windows","linux"]`); the updater permission is here so it
  is NOT referenced on iOS/Android. Any new desktop-only permission goes here, not in
  `default.json`.
- **No Dock badge code**, **no window-state persistence** anywhere (grep confirms).

### Conventions to follow

- Rust style is enforced: `cargo fmt --check` must pass (run `npm run check:tauri`).
- Platform-gate desktop-only code with `#[cfg(desktop)]` — see the existing updater
  block in `lib.rs:setup`. Menu and Dock badge are desktop concepts; gate them so the
  iOS/Android build is unaffected.
- UI copy is zh-TW first (English labels secondary). Menu labels must be zh-TW. The
  app uses a `copy.csv` round-trip for **web** strings, but native menu labels are in
  Rust — hardcode zh-TW strings in `lib.rs` for the menu (they are not part of the
  web i18n catalog). Add a code comment noting this.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Rust fmt + check | `npm run check:tauri` | exit 0, no warnings about your new code |
| Desktop dev run | `npm run tauri dev` | App window opens on macOS |
| Web typecheck | `npx tsc --noEmit` | exit 0 (only if you touch TS — Step 3) |
| Tests | `npm test` | all pass |

## Scope

**In scope**:
- `src-tauri/tauri.conf.json` — title bar style (Step 1)
- `src-tauri/src/lib.rs` — native menu + Dock badge command (Steps 2, 3)
- `src-tauri/Cargo.toml` — `tauri-plugin-window-state` dep (Step 4)
- `src-tauri/capabilities/desktop.json` — window-state permission (Step 4)
- `src/styles/globals.css` and/or `src/components/AppShell.tsx` — drag region + top
  padding so content clears the transparent title bar (Step 1)
- `src/features/notifications/` or a small TS caller — invoke the Dock-badge command
  (Step 3), only if reusing/feeding the reminder count from the web side

**Out of scope** (do NOT touch):
- `src-tauri/vendor/tauri-plugin-sql/` — the single-connection patch; unrelated and fragile
- iOS/Android behavior — all new code is `#[cfg(desktop)]`-gated; the mobile build
  must be byte-for-byte unaffected
- The `windowEffects` vibrancy config — it works; don't "improve" it
- Financial logic, sync, routes content — this is desktop chrome only
- Liquid Glass on macOS 26 — see Maintenance notes; not actionable until Tauri exposes it

## Git workflow

- Branch: `feat/ai-macos-native-polish`
- Conventional commits, one per step, e.g. `feat(macos): add transparent title bar and drag region`
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Transparent title bar with content flowing under it

In `tauri.conf.json`, add to the window object:
```json
"titleBarStyle": "Overlay",
"hiddenTitle": true
```
`Overlay` keeps the traffic-light buttons but makes the title bar transparent so the
vibrant content shows through behind them (the standard modern Mac look). `hiddenTitle`
removes the centered window title text.

Then make the web content account for the now-overlapping title bar:
- The traffic lights sit at top-left (~16px from top). The sidebar/header must not put
  interactive elements under them. Add top padding to the sidebar header equal to the
  title bar height (~28px) **on macOS desktop only** — reuse the existing
  `html[data-native-glass]` selector (already set only on macOS Tauri in
  `AppShell.tsx:applyNativeGlassAttribute`). In `globals.css`:
  ```css
  html[data-native-glass] .ns-sidebar { padding-top: 28px; }
  ```
- Add a drag region so the user can drag the window by the empty header area: set
  `data-tauri-drag-region` on the top strip of the sidebar/header element in
  `AppShell.tsx`. Ensure buttons inside it call `stopPropagation` or sit above the
  drag layer so clicks still work (Tauri treats `data-tauri-drag-region` children as
  draggable unless they're interactive controls).

**Verify**: `npm run tauri dev` → on macOS the title bar is transparent, traffic
lights visible over vibrant content, no title text, and dragging the empty header
area moves the window. No content is hidden behind the traffic lights.

### Step 2: Native localized application menu

Tauri 2.11 builds menus in Rust via `tauri::menu`. Add a `#[cfg(desktop)]` menu in
`run()`'s `setup` (or via `.menu(...)` on the builder). Build a standard Mac menu with
**zh-TW labels**:

- **App menu** (Northstar): About 關於 Northstar, Settings… `⌘,` (emits an event the
  web listens for to open Settings route), Services, Hide/Hide Others/Show All, Quit `⌘Q`.
- **Edit** 編輯: Undo/Redo, Cut 剪下/Copy 複製/Paste 貼上/Select All — use
  `PredefinedMenuItem` variants so the system wires the standard shortcuts (these are
  what make text fields feel native).
- **View** 檢視, **Window** 視窗 (Minimize/Zoom), **Help** 說明 — minimal.

Use `PredefinedMenuItem::{about, separator, services, hide, hide_others, show_all,
quit, undo, redo, cut, copy, paste, select_all, minimize, ...}` for the system items.
For "Settings…", create a custom `MenuItem` with id `"settings"` and accelerator
`CmdOrCtrl+,`; in the menu event handler, emit a Tauri event (e.g. `app.emit("menu://settings", ())`)
that the web `AppShell` listens for to navigate to `/settings`.

> The exact `tauri::menu` API surface (builder method names, `MenuItemBuilder`,
> `SubmenuBuilder`) must match Tauri 2.11.3. If a symbol named here does not exist in
> 2.11, consult the Tauri 2 menu docs and use the equivalent — do NOT invent APIs.

On the web side (`AppShell.tsx`), add a listener:
```ts
import { listen } from "@tauri-apps/api/event";
// inside an effect, desktop only:
const un = await listen("menu://settings", () => router.navigate({ to: "/settings" }));
```

**Verify**: `npm run check:tauri` exits 0. `npm run tauri dev` → menu bar shows
zh-TW menus; `⌘C`/`⌘V` work in a text field; `⌘,` navigates to Settings; `⌘Q` quits.

### Step 3: Dock badge for unread reminders

Show a Dock badge with the count of due-but-unacknowledged reminders (credit-card
payment due today, recurring postings due) — the same data plan 077 Phase 6.1 uses.

Tauri 2.11 sets the macOS Dock badge from the window/app handle. Add a `#[cfg(desktop)]`
Tauri command:
```rust
#[tauri::command]
fn set_dock_badge(app: tauri::AppHandle, label: Option<String>) {
    #[cfg(target_os = "macos")]
    {
        if let Some(win) = app.get_webview_window("main") {
            // Use the Tauri 2.11 badge API. As of 2.x this is
            // `win.set_badge_label(label)` (macOS) / `set_badge_count`.
            let _ = win.set_badge_label(label);
        }
    }
    #[cfg(not(target_os = "macos"))]
    { let _ = (app, label); }
}
```
Register it in `invoke_handler`. From the web side, after the reminder count is
computed (reuse `buildCreditCardReminders` / Phase 6.1 scheduler output), call:
```ts
import { invoke } from "@tauri-apps/api/core";
await invoke("set_dock_badge", { label: count > 0 ? String(count) : null });
```
Call it on app load and whenever data that affects due dates changes (a React effect
keyed on the reminder count). Pass `null` to clear the badge when count is 0.

> Verify the exact badge method name against Tauri 2.11.3 (`set_badge_label` vs
> `set_badge_count`). If neither exists on `WebviewWindow`, check `AppHandle`. If the
> badge API is absent in 2.11, STOP and report — do not reach for a private-API hack.

**Verify**: `npm run tauri dev` with at least one due reminder → the Dock icon shows
a numeric badge; acknowledging/clearing all reminders removes it.

### Step 4: Persist window size and position

Add `tauri-plugin-window-state` (official, MIT) so the window reopens where the user
left it.
- `src-tauri/Cargo.toml`: `tauri-plugin-window-state = "2"`
- In `lib.rs` `run()`: `.plugin(tauri_plugin_window_state::Builder::default().build())`
  — gate with `#[cfg(desktop)]` if the plugin isn't mobile-safe (the window-state
  plugin is desktop-only; add it conditionally).
- `src-tauri/capabilities/desktop.json`: add the plugin's permission (e.g.
  `"window-state:default"`) to the desktop-only permission list — NOT `default.json`.

**Verify**: `npm run check:tauri` exits 0. `npm run tauri dev`, resize/move the
window, quit, relaunch → window restores prior size and position.

## Test plan

This is platform-chrome work with no pure-logic units to test in vitest. Verification
is manual on macOS (each step's **Verify**). Guard rails instead of new tests:

- `npm run check:tauri` must pass after every step (catches Rust mistakes).
- `npm test` must still pass (proves no web regression).
- Build the iOS target to prove the mobile build is unaffected by the desktop-gated
  code: `npm run tauri ios build -- --target aarch64-sim --debug` should still compile.

## Done criteria

ALL must hold:

- [ ] `npm run check:tauri` exits 0 (no fmt diff, no `cargo check` errors)
- [ ] `npm test` exits 0
- [ ] `npx tsc --noEmit` exits 0 (if any TS changed)
- [ ] macOS: transparent title bar, traffic lights over vibrant content, draggable
  header, no clipped content (Step 1)
- [ ] macOS: zh-TW native menu bar; `⌘C/⌘V/⌘,/⌘Q` work (Step 2)
- [ ] macOS: Dock badge shows reminder count and clears at 0 (Step 3)
- [ ] macOS: window position/size restored across relaunch (Step 4)
- [ ] iOS sim build still compiles (`npm run tauri ios build -- --target aarch64-sim --debug`)
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The current `lib.rs`/`tauri.conf.json` does not match the "Current state" excerpts
  (codebase drifted since this plan was written).
- A `tauri::menu` or Dock-badge symbol named in Steps 2–3 does not exist in Tauri
  2.11.3 and the docs show no clear equivalent — report which API is missing.
- Adding `titleBarStyle: "Overlay"` makes the window fail to launch or breaks the
  vibrancy (transparency + overlay can interact on some macOS versions).
- Any change is required in `default.json` (mobile) capabilities or in mobile-built
  code paths — desktop chrome must not leak into the iOS/Android build.
- The window-state plugin pulls a transitive dependency with a GPL/LGPL/AGPL/SSPL
  license — do not proceed; report.

## Maintenance notes

- **Liquid Glass on macOS 26**: Apple's system Liquid Glass material is not yet
  exposable through Tauri's `windowEffects`. When Tauri adds it, it should replace or
  augment the current `mica`/`sidebar` effects on macOS 26+. Track Tauri releases.
- **Menu localization**: menu labels are hardcoded zh-TW in `lib.rs` (NOT in the web
  `copy.csv` catalog). If full menu i18n is wanted later, pass the locale from the web
  side into a Rust command that rebuilds the menu — deferred as over-engineering for now.
- **Dock badge ↔ notifications**: the badge count and plan 077 Phase 6.1 notification
  scheduling derive from the same reminder set. If one changes the reminder definition,
  update both. Consider extracting a single `dueReminderCount()` selector in
  `src/domain/` that both consume.
- **Windows/Linux**: `titleBarStyle` is macOS-only; Step 1's overlay has no effect on
  Windows/Linux (they keep the standard decorated title bar via `windowEffects: mica`).
  A reviewer should confirm the drag region and sidebar top-padding don't look wrong on
  Windows — the `html[data-native-glass]` selector is macOS-only, so they shouldn't.
