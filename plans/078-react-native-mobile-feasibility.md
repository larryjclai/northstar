# Plan 078: Evaluate React Native for mobile — feasibility assessment & architecture design

> **This is an architecture evaluation, not an implementation plan.** It assesses
> whether splitting mobile to React Native (while keeping Tauri for desktop) is
> viable for Northstar, with an honest cost/benefit analysis.

## Status

- **Priority**: P2 (informational — decision gate before committing)
- **Effort**: L (if adopted, multi-month migration)
- **Risk**: HIGH — splits the frontend codebase in two
- **Depends on**: none
- **Category**: direction
- **Planned at**: commit `2bfb7636`, 2026-06-26

## Why this matters

The current approach (plan 077) uses Tauri's mobile target to run the same React
web app inside a WKWebView on iOS. An alternative is to build a native React
Native app for mobile. This evaluation determines which path gives better ROI for
a solo/small-team project.

---

## Architecture inventory — what exists today

### Code by layer (LOC, excluding tests)

| Layer | LOC | Tauri-coupled? | RN-compatible? |
|---|---|---|---|
| `src/domain/` (pure logic) | ~8,300 | **No** — zero platform deps | **Yes** — pure TS |
| `src/data/` (repositories) | ~7,050 | **Yes** — `@tauri-apps/plugin-sql` | **No** — needs SQLite adapter swap |
| `src/features/` (sync, backup, market data) | ~4,600 | **Partially** — 5 files import Tauri | **Partially** — need fetch/fs adapters |
| `src/state/` (Zustand stores) | ~590 | **No** | **Yes** |
| `src/components/` (UI) | ~7,200 | **No** (HTML/CSS) | **No** — all `<div>`, CSS, Recharts |
| `src/routes/` (pages) | ~20,200 | **No** (HTML/CSS) | **No** — all `<div>`, CSS, Recharts |
| `src/styles/` (CSS) | ~1,580 | N/A | **No** — CSS doesn't exist in RN |
| Rust backend (`src-tauri/`) | ~190 | N/A | N/A — separate concern |

### Platform coupling points (only 5 files import `@tauri-apps/*`)

| File | Tauri API used | Purpose |
|---|---|---|
| `src/data/repositories.ts` | `plugin-sql` (Database) | All SQLite operations |
| `src/features/connect/crypto/secretStore.ts` | `plugin-stronghold` | Encryption key storage |
| `src/features/local-backup/localBackup.ts` | `plugin-fs` | Backup file read/write |
| `src/features/connect/sync/sync-manager.ts` | `isTauriRuntime()` check | Platform detection |
| `src/lib/foundationModels.ts` | `invoke()` | Apple Foundation Models bridge |

### Web-only APIs used (incompatible with RN)

- `localStorage`: 119 occurrences across src/
- `document.*` / `window.*` / `navigator.*`: 95 occurrences
- `Recharts` (SVG charting, web-only): used in 10 routes
- All CSS: 1,580 lines of custom design system in `globals.css`
- `react-day-picker`, `cmdk`, `react-hook-form` — web-DOM components
- TanStack Router (web-only; RN needs React Navigation)

---

## Feasibility assessment

### What IS shareable between Tauri web + React Native

| Layer | Share strategy | Effort |
|---|---|---|
| `src/domain/` (~8,300 LOC) | **Direct reuse** — extract to a shared `packages/domain` workspace package. Zero changes needed; it's pure TS with no platform imports. | S |
| `src/state/` (~590 LOC) | **Direct reuse** — Zustand works in RN. Extract to shared package. | S |
| `src/data/` types & migrations | **Partial** — types, SQL migration strings, and query builders are reusable. The `Database` wrapper needs a platform adapter interface. | M |
| `src/features/` business logic | **Partial** — sync protocol (push/pull/encrypt), market data parsing are reusable. Transport layer (fetch wrappers, fs) needs adapters. | M |

### What CANNOT be shared (must be rewritten for RN)

| Layer | Why | Rewrite LOC estimate |
|---|---|---|
| All routes (~20,200 LOC) | `<div>` → `<View>`, CSS → StyleSheet, Recharts → react-native-svg-charts or Victory Native, react-day-picker → RN date picker, cmdk → custom | ~15,000+ new LOC |
| All components (~7,200 LOC) | Same: HTML elements → RN primitives, CSS classes → StyleSheet | ~5,000+ new LOC |
| All CSS (~1,580 LOC) | No CSS in RN; everything becomes StyleSheet objects or styled-components | Full rewrite |
| Router | TanStack Router → React Navigation | ~500 new LOC |
| Charting (10 routes) | Recharts (web SVG) → Victory Native or react-native-chart-kit | ~2,000+ new LOC |

### Rust core sharing

The Rust code in `src-tauri/` is thin (~190 LOC): Yahoo Finance proxy, market data
fetcher, and Apple Foundation Models FFI. It's not a "core engine" — the real
business logic is in TypeScript (`src/domain/`).

To share Rust with RN, you'd need:
1. Compile Rust to a native library (.framework/.xcframework for iOS, .so for Android)
2. Bridge it via `react-native-turbo-modules` or `expo-modules`
3. But there's almost nothing to bridge — the TS domain layer is the engine

**Verdict**: Rust sharing is not worth the toolchain complexity for 190 LOC of proxy
commands. In RN, you'd just make the Yahoo Finance / market data fetches directly
from JS (no CORS in native).

---

## Cost/benefit comparison

### Option A: Tauri mobile (current plan 077)

| | |
|---|---|
| **Code reuse** | ~100% — same React app, responsive CSS |
| **New code needed** | ~500 LOC (responsive CSS, sync lifecycle, glass material) |
| **New dependencies** | 0 |
| **Build toolchain** | Already working (`npm run tauri ios dev`) |
| **Native feel** | Limited — it's a WebView. CSS glass ≈ Liquid Glass. No native navigation gestures, no native scroll, no haptics. |
| **Performance** | WebView rendering: adequate for a finance dashboard but noticeably not native (scroll inertia, keyboard handling, input focus). |
| **Android** | Tauri 2 supports Android too — same codebase, one more target. |
| **Maintenance** | One codebase. Responsive CSS is the only mobile-specific work. |
| **Timeline** | 2-4 weeks to ship a usable companion app (plan 077). |

### Option B: React Native for mobile

| | |
|---|---|
| **Code reuse** | ~18% by LOC (domain + state = ~8,900 of ~49,600 total) |
| **New code needed** | ~22,000+ LOC (all UI, navigation, charting, styling, platform adapters) |
| **New dependencies** | react-native, expo, react-navigation, victory-native or react-native-chart-kit, react-native-reanimated, react-native-gesture-handler, expo-sqlite, expo-secure-store, react-native-svg, ... |
| **Build toolchain** | New: Expo or bare RN setup, Xcode + Android Studio, EAS Build or local. |
| **Native feel** | Excellent — native navigation transitions, native scroll, native inputs, haptics, Liquid Glass (via SwiftUI bridging in iOS 26). |
| **Performance** | Native rendering via Fabric/JSI. Smoother than WebView. |
| **Android** | Yes, but doubles the testing surface (RN + Android-specific issues). |
| **Maintenance** | **Two separate UI codebases** that must stay feature-synced. Every new feature = implement twice. Every design change = update twice. |
| **Timeline** | 3-6 months for feature parity with the existing web app. |

### Option C: Hybrid — React Native with react-native-web (Solito/Tamagui pattern)

Share components across web and native using `react-native-web` + a universal
component library. Theoretically the best of both worlds.

| | |
|---|---|
| **Code reuse** | ~60-70% in theory |
| **Reality** | Requires rewriting ALL existing components from HTML/CSS to RN primitives + `react-native-web`. The existing 28,000+ LOC of components/routes/CSS is not compatible. This is a **full frontend rewrite**, not an incremental migration. |
| **Charting** | Victory Native works on both platforms but has different APIs from Recharts. Full chart rewrite. |
| **Build complexity** | Metro bundler (RN) + Vite (web) + shared packages. Monorepo tooling overhead. |
| **Timeline** | 4-8 months for the rewrite + feature parity. |

---

## Recommendation

**For a solo/small team: stick with Tauri mobile (Option A).** Here's why:

1. **The ROI is inverted.** You'd spend 3-6 months rewriting 82% of the codebase
   to get native navigation and haptics. Meanwhile, plan 077 ships a usable iOS
   companion in 2-4 weeks.

2. **The maintenance tax is the real killer.** Every new feature, every design
   tweak, every bug fix must be done twice. For a solo developer, this halves your
   velocity permanently.

3. **Northstar's UI is data-dense.** Finance dashboards are tables, charts, and
   numbers — the kind of UI where WebView's limitations matter least. Users spend
   most time reading, not gesturing. This isn't a social media app where 60fps
   scroll and native gestures are table stakes.

4. **Tauri mobile is good enough.** WKWebView on modern iOS is fast. The CSS glass
   material is convincing. Safe area insets, dark mode, and bottom tab bar are
   already in place. The gaps (haptics, native keyboard) are nice-to-haves for a
   finance companion app.

5. **The Rust "shared core" argument doesn't apply here.** Your core logic is
   TypeScript, not Rust. The Rust layer is a thin proxy. There's nothing
   substantial to share via FFI.

### When React Native WOULD make sense

- If you have 2+ frontend developers who can maintain parallel UIs
- If the mobile app needs capabilities WebView can't provide (e.g., background
  processing, widgets, Apple Watch companion, Shortcuts/Siri integration)
- If App Store reviewers reject the WebView app (Apple sometimes pushes back on
  "web app wrapped in native", though Tauri apps are generally accepted)
- If user research shows that perceived "nativeness" is a top-3 retention driver

### If you DO decide to go RN despite the above

The migration path would be:

1. **Extract shared packages first** (domain, state, data-types) into a
   `packages/` monorepo structure — this is useful regardless.
2. **Build the RN app incrementally** — start with read-only dashboard + holdings
   view, not full feature parity. Let the desktop Tauri app remain the "power user"
   tool.
3. **Use Expo** (MIT) for the managed build pipeline — avoid bare RN setup overhead.
4. **Use `expo-sqlite`** (MIT) for SQLite — same SQL, different driver.
5. **Use Victory Native** (MIT) for charts — closest to Recharts API.
6. **Don't attempt to share UI components** between web and RN — accept two UIs,
   optimize for each platform's idioms.

### License notes for potential RN dependencies

| Package | License | Notes |
|---|---|---|
| react-native | MIT | ✅ |
| expo | MIT | ✅ |
| react-navigation | MIT | ✅ |
| victory-native | MIT | ✅ |
| expo-sqlite | MIT | ✅ |
| expo-secure-store | MIT | ✅ (replaces Stronghold on mobile) |
| react-native-reanimated | MIT | ✅ |
| react-native-gesture-handler | MIT | ✅ |
| react-native-svg | MIT | ✅ |

No GPL/LGPL concerns in the standard RN ecosystem.

---

## Decision gate

This plan does not recommend implementation. It recommends **proceeding with plan
077 (Tauri mobile)** and revisiting React Native only if:

- [ ] Tauri mobile WebView proves unacceptably slow in real-world use
- [ ] Apple rejects the app due to WebView policies
- [ ] The team grows to 2+ frontend developers
- [ ] Product direction requires native-only capabilities (widgets, Watch, Shortcuts)

No executor action needed — this is a reference document for the decision.

## Maintenance notes

- Revisit this assessment when Tauri 3 ships (may improve mobile WebView integration).
- Revisit if Apple changes App Store WebView policies.
- If extracting `src/domain/` into a shared package is done for other reasons
  (e.g., testing, Cloudflare Worker for sync server), it reduces future RN adoption
  cost — but don't do it solely for a speculative RN migration.
