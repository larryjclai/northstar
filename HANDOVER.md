# Northstar Handover

A SwiftUI / SwiftData personal-finance app for iOS + macOS that combines investment tracking, cash accounts, and FX-aware net-worth analytics.

This document is the orientation for the next person (or future-you) picking up work.

---

## 1. How to run

```bash
# Generate Xcode project from project.yml (required after any source/config change)
./script/generate_project.sh

# Build + launch macOS app
./script/build_and_run.sh

# Build only, no launch
./script/build_and_run.sh --build-only

# Run unit tests (76 currently)
./script/run_tests.sh
```

Prerequisites: Xcode 16+, `brew install xcodegen`.

The macOS target is the daily-driver. iOS target compiles but has not been UX-tested as heavily.

---

## 2. Project layout

```
project.yml                       # XcodeGen source of truth — edit this, never the .pbxproj
northstar.xcodeproj/              # Generated; safe to delete & regenerate
script/
  generate_project.sh             # Wraps `xcodegen generate`
  build_and_run.sh                # macOS build + open
  run_tests.sh                    # xcodebuild test
Sources/NorthstarApp/
  NorthstarApp.swift              # @main + ModelContainer setup
  AppIntents/                     # Shortcuts integration
  Domain/                         # Pure-logic, no SwiftUI: models, calculators, builders
    Models.swift                  # @Model: Account, LedgerTransaction, PortfolioAsset, InvestmentRecord, RecurringTransaction
    PortfolioCalculator.swift     # Quantity / avg-cost / realized P&L (avg-cost method)
    FIFOCalculator.swift          # Open / realized lots via FIFO matching
    PortfolioTrend.swift          # Investment value time series
    NetWorthTrend.swift           # Cash + investment combined, date-aware FX
    LedgerLinkage.swift           # Investment <-> ledger sync, health report
    LedgerCategory.swift          # Cash-flow category catalog
    SpendingSummary.swift         # Month-level income / expense / top categories
    RecurringScheduler.swift      # Monthly template -> ledger transaction replay
    TimeRange.swift               # 1W/1M/3M/YTD/1Y/ALL slicing
    InvestmentCSV.swift           # Investment record CSV import/export
    LedgerCSV.swift               # Cash-flow CSV import/export
    CurrencyFormatters.swift      # Locale-per-currency formatting
  Resources/
    Localizable.xcstrings         # String catalog (zh-Hant source, en partial)
  UI/
    AppState/
      PriceStore.swift            # @Observable; Yahoo Finance prices + sparklines
      FXRateStore.swift           # @Observable; FX spot + historical, cached in UserDefaults
      IntentRouting.swift         # NorthstarTab, AppStorage keys (incl. per-view TimeRange/benchmark)
    Theme/NorthstarTheme.swift    # Color tokens, light/dark adaptive
    Components/                   # Shared SwiftUI atoms (SparklineView, ReceiptAttachmentSection, etc.)
    Views/                        # One screen per file, plus editor sheets
Tests/NorthstarTests/             # XCTest target; 76 passing tests covering Domain/*
```

Add a Swift file under `Sources/` or `Tests/` then re-run `./script/generate_project.sh` — XcodeGen picks it up via glob.

---

## 3. Architecture decisions worth knowing

- **SwiftUI first, UIKit/AppKit second.** Everything is SwiftUI today. The only AppKit/UIKit usage is in `InvestmentRecordEditorView.activateAppForTextInput()` (focus workaround), `View+PlatformStyles.swift`, the NSOpenPanel paths in CSV export / receipt picker, and the `PhotosPicker` branch in `ReceiptAttachmentSection`. If you hit a SwiftUI dead-end (file pickers, sheet sizing, drag-and-drop) it's fine to drop down to `NSViewRepresentable` / `UIViewRepresentable` — but try SwiftUI first.
- **Local-first.** All data lives in SwiftData on-device. No backend, no auth. Network is read-only to Yahoo Finance.
- **Pure-logic separation.** Everything under `Domain/` has no SwiftUI imports and is fully unit-testable. UI files don't do arithmetic — they call into Domain. Both `SpendingSummary` and `FIFOCalculator` take their data via plain function parameters (or injected closures for FX) so the tests don't need any UI scaffolding.
- **Stores are `@Observable` singletons** owned by `RootView` and passed down. Don't make new ones; share `priceStore` / `fxStore` instances.
- **XcodeGen** is the project-generator. Never hand-edit `.pbxproj`. If git shows pbxproj diffs you didn't intend, `./script/generate_project.sh` to normalize.

---

## 4. Where work has gone (commit log narrative)

| Commit | Theme |
|---|---|
| Initial → `e7aebec` | Bootstrapped: accounts, holdings, dashboard scaffold; CSV import; light/dark theme |
| `a3a3ca3` | Investment records link to cash accounts via `LedgerTransaction` |
| `08a0806` | Multi-currency FX via Yahoo (spot only); Settings screen |
| `a686fab` | Accounts CRUD UI (opening balance + reconcile); functional time-range pills; benchmark overlay (0050.TW, SPY) |
| `8b72700` | Cash-flow CRUD tab (LedgerTransaction); holding detail page; combined net-worth (cash + investments) |
| `708bb07` | **Phase 1 refactor:** XcodeGen migration; view splits → `UI/Components/`; centralized platform extensions; backfill version-gate; 31 unit tests |
| `18e9cea` | **Phase 2 correctness:** locale-per-currency formatter; linkage health report in Settings; real realized P&L (avg-cost method); historical FX rates wired into net-worth curve |
| `12c554a` → `8ed0e75` | **Phase 3 UX:** Swift Charts hero charts with drag inspector; CashFlow search + category chips; ledger CSV; Dashboard 本月支出 card; persisted TimeRange & benchmark; SceneStorage tab restore; HoldingDetail toolbar `+`; monthly recurring transactions; receipt image attachment; Localizable.xcstrings scaffold; FIFO lot tracking |

---

## 5. What's done after Phase 3

All correctness items from the Phase 2 audit plus the high- and medium-impact UX items from the Phase 3 backlog are resolved.

### Phase 2 correctness (still in place)

- **Currency locale** — `CurrencyFormatters` picks a locale per currency code so USD renders as `$1,234` (en_US), JPY as `¥1,234` (ja_JP), etc.
- **Unlinked record report** — `LedgerLinkage.report(context:)` distinguishes records with no account (`unlinked`) from records that should have produced a ledger row but didn't (`pendingSync`). Surfaced as a card in Settings → 資料健檢 with a "重新同步" action.
- **Realized P&L (avg-cost)** — `PortfolioCalculator.realized(records:)` returns `RealizedSummary(realizedFromSales, dividendIncome)`. HoldingDetailView shows the three numbers.
- **Historical FX** — `FXRateStore` stores per-pair daily history and exposes `rate(from:to:on:)` / `convert(_:from:to:on:)`. `NetWorthTrendBuilder.build` takes a `(value, from, to, date) -> Double?` closure so historical FX is applied per data point.

### Phase 3 UX deliverables

- **Swift Charts replacement for `SparklineView`** — Same `SparklineView` API, but the implementation now uses `Charts` (AreaMark + LineMark + RuleMark). An `interactive: Bool` flag turns on axis labels and a drag-to-inspect overlay; the four hero charts (Dashboard, Holdings hero/selected, HoldingDetail) opt in.
- **Searchable cash-flow + category filter** — `CashFlowView` gains `.searchable()` over category/note plus a chip strip of the current month's distinct categories. Switching months auto-clears both filters.
- **Ledger CSV import / export** — `LedgerCSV.swift` mirrors `InvestmentCSV`. `LedgerCSVImportPreviewView` shows new / duplicate / invalid status per row. Export skips investment-linked rows (those are owned by the linkage system).
- **Spending This Month dashboard card** — `SpendingSummaryBuilder` aggregates the current month into income / expense / top-N expense categories, FX-converted via injected closure. Card renders the ratio bar plus the top 3 categories.
- **Persisted TimeRange + benchmark** — Per-view `@AppStorage` keys defined in `IntentRoutingKeys`. Benchmark is stored as an empty-string sentinel and exposed as both a read-only `String?` and a `Binding<String?>`.
- **SceneStorage tab restore** — `RootView.selectedTab` is a computed `Binding<NorthstarTab>` over `@SceneStorage`. Reopening a window returns to the last tab; App Intent routing still overrides via `applyRequestedTab`.
- **HoldingDetail toolbar `+`** — Opens `InvestmentRecordEditorView` with `preselectedTicker:` set to the current asset. Cmd-N triggers it.
- **Recurring monthly transactions** — `RecurringTransaction` model with a `RecurringScheduler.runDue` replay that catches up missed cycles (one ledger row per due month, balance recomputed). Editor lives at Settings → 自動化 → 定期交易.
- **Receipt image attachment** — `LedgerTransaction.receipt: Data?` via `@Attribute(.externalStorage)`. `ReceiptAttachmentSection` is a shared component using `NSOpenPanel` on macOS and `PhotosPicker` on iOS. `CashFlowRow` shows a paperclip glyph when a receipt is attached.
- **i18n scaffold** — `Localizable.xcstrings` with zh-Hant as source and English translations for the dozen most-visible nav / toolbar strings. SwiftUI's `Text`/`Label`/`Button` already use those literals as `LocalizedStringKey`, so adding catalog entries is incremental work — no source-code churn required.
- **FIFO lot tracking** — `FIFOCalculator.replay(records:)` returns `(open, realized)` lots. Stock dividends append a zero-cost lot; capital reductions scale lot quantities proportionally while preserving total cost. Surfaced as two cards on `HoldingDetailView` between position metrics and the transactions list.

Test count after Phase 3: **76 passing**.

---

## 6. Outstanding work

Most of the original audit is done. What remains:

### Features still on the backlog

1. **Budget per category** — Define `Budget(category, monthlyLimit)` model; show progress bar on `CashFlowView` hero card, optionally also on the Dashboard 本月支出 card. New SwiftData model + lightweight migration.

### Polish / nice-to-have

- **Recurring transactions UX gaps** — Currently month-frequency only. Add weekly / yearly when a real use case shows up. The editor also has no "skip next" or "run now" affordance.
- **Receipt viewer** — Tap-to-zoom or full-screen preview. Today the image is constrained to ~200pt tall in the editor sheet; rows only show a paperclip glyph, not the image itself.
- **Persisted realized lots** — `FIFOCalculator` is pure-compute today. If you need export, audit, or tax-form generation, persist a `RealizedLot` model and emit one on every sale (the calculator output already provides the right shape).
- **i18n extraction passes** — `Localizable.xcstrings` is wired but only covers ~15 strings. Drop more entries as you touch screens; SwiftUI lookup is automatic once the key exists. Consider running `xcrun extractLocStrings` if you want a one-shot bulk pull.

### Known cosmetic debt

- `TransactionRecordCard`'s big selection-checkbox + edit-on-tap pattern is overloaded — touching the row to edit also conflicts with the selection checkbox. Consider context-menu-only selection or a dedicated edit button.
- `DashboardView.statusText` is still wired up but unused after the header redesign — `view body` no longer renders `header`. Dead-code candidate.
- `IntentRouting.openAddTransaction` only opens the investment-record sheet. App Intent for "add cash transaction" doesn't exist.
- The interactive Swift Charts overlay surfaces *raw* numeric values; for the rebased benchmark series these aren't currency-meaningful. Either label the unit or hide the readout when only the comparison line is under the cursor.

---

## 7. Gotchas to be aware of

- **Yahoo Finance rate-limit.** No headers / token, just User-Agent. If you start hammering it (force-refresh in a loop) expect 429s. The 60-second cache in `PriceStore.refresh` is the only guard. Yahoo also occasionally returns sparse historical data for less-liquid symbols.
- **SwiftData migrations.** Lightweight migrations work for new fields with defaults (we added `Account.openingBalance`, `LedgerTransaction.receipt`, and the whole `RecurringTransaction` model that way). Adding required fields or relationships requires a `VersionedSchema`. The schema lives in [NorthstarApp.swift](Sources/NorthstarApp/NorthstarApp.swift).
- **`LedgerLinkage.currentBackfillVersion`.** Bump this constant when you change linkage rules so existing installs re-sync on next launch. UserDefaults key: `northstar.ledgerLinkageBackfillVersion`.
- **`RecurringScheduler.runDue` runs on launch.** Called from `RootView.handleLaunchRouting` after the ledger backfill. If the user keeps the app open across midnight on a due day, nothing fires until the next launch; that's intentionally simple. A background activity could be wired later if it ever matters.
- **`@SceneStorage` is per-window-restoration.** On macOS, closing and reopening the window restores the last tab — but creating a brand-new window starts at Dashboard. App Intents continue to override via `applyRequestedTab` writing to `sceneTabRaw`.
- **FX historical data depth.** Yahoo returns ~1y at daily interval (the current default in `YahooFinanceClient`). The ALL time-range will be capped to that 1y until you change `historyRange`. The `historicalLookup` falls back to the earliest known sample for dates before the window.
- **macOS `glassEffect`.** `NorthstarTheme` uses iOS 26 / macOS 26 glass with a graceful fallback to plain border. Both code paths must keep working.
- **Test target codesign.** `NorthstarTests` uses `CODE_SIGN_IDENTITY: "-"` (ad-hoc). Don't replace with explicit identity unless you also wire DEVELOPMENT_TEAM.
- **Localizable.xcstrings source language is zh-Hant.** Source-code literals stay Chinese; English (and any future locales) live in the catalog. `developmentLanguage` in `project.yml` is still `en` — leave it alone, the catalog overrides at lookup time.
- **FIFO capital-reduction semantics.** A reduction proportionally shrinks every open lot's quantity and bumps per-share cost so the lot's *total* cost is preserved. This matches the avg-cost behaviour but may not match what the brokerage statement reports. If the discrepancy matters, switch to a different cost-allocation rule and add a test in `FIFOCalculatorTests`.

---

## 8. Testing posture

Domain logic is well-covered (76 tests). UI logic is **not** tested. If you change an editor view or the dashboard layout, build + click-through manually.

A reasonable next step is to add **snapshot tests** for the major screens — Point-Free's [`swift-snapshot-testing`](https://github.com/pointfreeco/swift-snapshot-testing) would slot in via SPM under the existing `NorthstarTests` target.

---

## 9. Quick orientation

- Reading the codebase fresh? Start with these three files in order:
  1. [Models.swift](Sources/NorthstarApp/Domain/Models.swift) — what the data is
  2. [RootView.swift](Sources/NorthstarApp/UI/Views/RootView.swift) — how the app is shaped
  3. [PortfolioCalculator.swift](Sources/NorthstarApp/Domain/PortfolioCalculator.swift) — the most important pure logic; pair-read with [FIFOCalculator.swift](Sources/NorthstarApp/Domain/FIFOCalculator.swift) to see the two cost-basis methods side by side
- The riskiest files (most edits, biggest blast radius): `DashboardView.swift`, `RootView.swift`, `PortfolioCalculator.swift`, `CashFlowView.swift`.
- The most stable: anything in `Domain/` other than `PortfolioCalculator`. They were designed pure and have tests.

Last updated: 2026-05-17, after Phase 3 (commit `8ed0e75`).
