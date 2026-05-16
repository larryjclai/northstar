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

# Run unit tests (42 currently)
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
    Models.swift                  # @Model: Account, LedgerTransaction, PortfolioAsset, InvestmentRecord
    PortfolioCalculator.swift     # Quantity / avg-cost / realized P&L
    PortfolioTrend.swift          # Investment value time series
    NetWorthTrend.swift           # Cash + investment combined, date-aware FX
    LedgerLinkage.swift           # Investment <-> ledger sync, health report
    LedgerCategory.swift          # Cash-flow category catalog
    TimeRange.swift               # 1W/1M/3M/YTD/1Y/ALL slicing
    InvestmentCSV.swift           # CSV import/export parser
    CurrencyFormatters.swift      # Locale-per-currency formatting
  UI/
    AppState/
      PriceStore.swift            # @Observable; Yahoo Finance prices + sparklines
      FXRateStore.swift           # @Observable; FX spot + historical, cached in UserDefaults
      IntentRouting.swift         # NorthstarTab, AppStorage keys, base-currency defaults
    Theme/NorthstarTheme.swift    # Color tokens, light/dark adaptive
    Components/                   # Shared SwiftUI atoms (SparklineView, TimeRangeSelector, etc.)
    Views/                        # One screen per file, plus editor sheets
Tests/NorthstarTests/             # XCTest target; 42 passing tests covering Domain/*
```

Add a Swift file under `Sources/` or `Tests/` then re-run `./script/generate_project.sh` — XcodeGen picks it up via glob.

---

## 3. Architecture decisions worth knowing

- **SwiftUI first, UIKit/AppKit second.** Everything is SwiftUI today. The only AppKit/UIKit usage is in `InvestmentRecordEditorView.activateAppForTextInput()` (focus workaround) and `View+PlatformStyles.swift`. If you hit a SwiftUI dead-end (file pickers, sheet sizing, drag-and-drop) it's fine to drop down to `NSViewRepresentable` / `UIViewRepresentable` — but try SwiftUI first.
- **Local-first.** All data lives in SwiftData on-device. No backend, no auth. Network is read-only to Yahoo Finance.
- **Pure-logic separation.** Everything under `Domain/` has no SwiftUI imports and is fully unit-testable. UI files don't do arithmetic — they call into Domain.
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
| `(this commit)` | **Phase 2 correctness:** locale-per-currency formatter; linkage health report in Settings; real realized P&L (avg-cost method); historical FX rates wired into net-worth curve |

---

## 5. What's done after Phase 2

All correctness items from the audit are resolved:

- ✅ **#4 Currency locale** — `CurrencyFormatters` now picks a locale per currency code so USD renders as `$1,234` (en_US), JPY as `¥1,234` (ja_JP), etc., instead of everything wearing zh_Hant_TW conventions.
- ✅ **#2 Unlinked record report** — `LedgerLinkage.report(context:)` distinguishes records with no account (`unlinked`) from records that should have produced a ledger row but didn't (`pendingSync`). Surfaced as a card in Settings → 資料健檢 with a "重新同步" action.
- ✅ **#3 Realized P&L** — `PortfolioCalculator.realized(records:)` returns `RealizedSummary(realizedFromSales, dividendIncome)` using the average-cost method (sell-side P&L uses the running avg cost at time of sale). HoldingDetailView shows the three numbers instead of the previous flawed "sell + dividend" sum.
- ✅ **#1 Historical FX** — `FXRateStore` now stores per-pair daily history (already fetched by the Yahoo client) and exposes `rate(from:to:on:)` / `convert(_:from:to:on:)`. `NetWorthTrendBuilder.build` takes a `(value, from, to, date) -> Double?` closure so historical FX is applied per data point. Falls back to spot rate when no historical sample is available.

Test count after Phase 2: **42 passing**.

---

## 6. Outstanding work (Phase 3 — UX polish)

These are the original audit items #10–#17. Roughly ordered by impact:

### High-impact

1. **Swift Charts replacement for `SparklineView`** — The hand-rolled Path-based chart in [SparklineView.swift](Sources/NorthstarApp/UI/Components/SparklineView.swift) is ~100 lines and supports no interactivity. iOS 16+ / macOS 13+ ship `Charts` framework which gives hover-to-inspect, axis labels, and `AreaMark` + `LineMark` for free. Replacing this also unlocks dual-y-axis support if you later want absolute-value benchmark comparison instead of normalized.

2. **CashFlowView search & category filter** — Currently only month navigation. With more than ~20 entries per month it's hard to find anything. Add a filter chip strip (categories of the selected month) + a `.searchable()` modifier hooked to category/note. Probably 1 hour.

3. **Ledger CSV import/export** — Today only `InvestmentRecord` has CSV ([InvestmentCSV.swift](Sources/NorthstarApp/Domain/InvestmentCSV.swift)). For real-world use, bank statement import is the high-volume input. Mirror that file as `LedgerCSV.swift` plus a similar `CSVImportPreviewView` flavor. Same parser architecture, different columns: date / amount / currency / category / note / account.

4. **Dashboard Spending This Month card** — Now that cash-flow data exists, surface it: top-3 spending categories, total income vs expense bar. Drop into the existing `LazyVGrid` in [DashboardView.swift:104](Sources/NorthstarApp/UI/Views/DashboardView.swift:104).

### Medium-impact

5. **Persist selected TimeRange & benchmark** — `@AppStorage` keyed by view. Two-line change but quality-of-life-y.

6. **HoldingDetailView "add buy/sell" shortcut** — Toolbar `+` that opens the editor sheet with the asset pre-filled.

7. **Budget per category** — Define `Budget(category, monthlyLimit)` model; show progress bar on CashFlowView hero card. New SwiftData model + lightweight migration.

8. **Asset detail with lot-level cost basis** — FIFO lot tracking alongside the existing avg-cost method. Useful for tax. Big-ish change; would add a `RealizedLot` model.

### Polish / nice-to-have

9. **macOS scene restoration via `SceneStorage`** — Restart returns to Dashboard regardless of where you were.

10. **i18n** — Strings are hard-coded zh-Hant. Extract to `Localizable.strings`. Low value if Chinese is the only target user, but trivial to do as work happens.

11. **Recurring transactions** — Schedule next-occurrence on save; auto-insert at month boundary.

12. **Receipt attachment** — Image picker on `LedgerTransaction`, stored as Data (or external file ref). SwiftData supports `@Attribute(.externalStorage)` for blobs.

### Known cosmetic debt

- `TransactionRecordCard`'s big selection-checkbox + edit-on-tap pattern is overloaded — touching the row to edit also conflicts with the selection checkbox. Consider context-menu-only selection or a dedicated edit button.
- `DashboardView.statusText` is still wired up but unused after the header redesign — `view body` no longer renders `header`. Dead code candidate ([DashboardView.swift:179](Sources/NorthstarApp/UI/Views/DashboardView.swift:179)).
- `IntentRouting.openAddTransaction` only opens the investment-record sheet. App Intent for "add cash transaction" doesn't exist.

---

## 7. Gotchas to be aware of

- **Yahoo Finance rate-limit.** No headers / token, just User-Agent. If you start hammering it (force-refresh in a loop) expect 429s. The 60-second cache in `PriceStore.refresh` is the only guard. Yahoo also occasionally returns sparse historical data for less-liquid symbols.
- **SwiftData migrations.** Lightweight migrations work for new fields with defaults (we added `Account.openingBalance` that way). Adding required fields or relationships requires a `VersionedSchema`. The schema lives in [NorthstarApp.swift](Sources/NorthstarApp/NorthstarApp.swift).
- **`LedgerLinkage.currentBackfillVersion`.** Bump this constant when you change linkage rules so existing installs re-sync on next launch. UserDefaults key: `northstar.ledgerLinkageBackfillVersion`.
- **FX historical data depth.** Yahoo returns ~1y at daily interval (the current default in `YahooFinanceClient`). The ALL time-range will be capped to that 1y until you change `historyRange`. The `historicalLookup` falls back to the earliest known sample for dates before the window.
- **macOS `glassEffect`.** `NorthstarTheme` uses iOS 26 / macOS 26 glass with a graceful fallback to plain border. Both code paths must keep working.
- **Test target codesign.** `NorthstarTests` uses `CODE_SIGN_IDENTITY: "-"` (ad-hoc). Don't replace with explicit identity unless you also wire DEVELOPMENT_TEAM.

---

## 8. Testing posture

Domain logic is well-covered (42 tests). UI logic is **not** tested. If you change an editor view or the dashboard layout, build + click-through manually.

A reasonable next step is to add **snapshot tests** for the major screens — Point-Free's [`swift-snapshot-testing`](https://github.com/pointfreeco/swift-snapshot-testing) would slot in via SPM under the existing `NorthstarTests` target.

---

## 9. Quick orientation

- Reading the codebase fresh? Start with these three files in order:
  1. [Models.swift](Sources/NorthstarApp/Domain/Models.swift) — what the data is
  2. [RootView.swift](Sources/NorthstarApp/UI/Views/RootView.swift) — how the app is shaped
  3. [PortfolioCalculator.swift](Sources/NorthstarApp/Domain/PortfolioCalculator.swift) — the most important pure logic
- The riskiest files (most edits, biggest blast radius): `DashboardView.swift`, `RootView.swift`, `PortfolioCalculator.swift`.
- The most stable: anything in `Domain/` other than `PortfolioCalculator`. They were designed pure and have tests.

Last updated: 2026-05-16, after Phase 2 (commit `(pending)`).
