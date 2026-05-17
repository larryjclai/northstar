# northstar

A SwiftUI / SwiftData personal-finance app for iOS + macOS that combines investment tracking, cash accounts, and FX-aware net-worth analytics.

Local-first, privacy-first wealth operating system for individual investors in Taiwan. See [PRODUCT.md](PRODUCT.md) for strategy and design principles, [DESIGN.md](DESIGN.md) for the design system, and [ROADMAP.md](ROADMAP.md) for the prioritized work plan.

---

## 1. How to run

```bash
# Generate Xcode project from project.yml (required after any source/config change)
./script/generate_project.sh

# Build + launch macOS app
./script/build_and_run.sh

# Build only, no launch
./script/build_and_run.sh --build-only

# Run unit tests (76+ currently)
./script/run_tests.sh
```

Prerequisites: Xcode 16+, `brew install xcodegen`.

The macOS target is the daily-driver. iOS target compiles but has not been as thoroughly UX-tested — see ROADMAP §4.10.

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
Tests/NorthstarTests/             # XCTest target; Domain/* coverage
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

## 4. What's implemented today

A short snapshot — the full history lives in `git log`, and what's *next* lives in [ROADMAP.md](ROADMAP.md).

- Dashboard with hero net-worth chart (Swift Charts + drag inspector), benchmark overlay (0050.TW / SPY), monthly spending card.
- Holdings list with sparklines, per-holding detail view, FIFO open/realized lot tracking, avg-cost realized P&L + dividend income.
- Transactions (investment records) and Cash Flow (ledger) — both with search, CSV import preview (new / duplicate / invalid), CSV export.
- Investment actions: Buy / Sell / CashDividend / StockDividend / CapitalReduction. Automatic ledger linkage with currency-mismatch warnings and idempotent backfill.
- Accounts CRUD with opening balance + reconcile flow; multi-currency with FX spot + historical (Yahoo `USDTWD=X` style), surfaced totals in base currency.
- Recurring monthly transactions with launch-time replay catching missed cycles.
- Receipt image attachment per ledger row (NSOpenPanel on macOS, PhotosPicker on iOS).
- Per-view persisted TimeRange + benchmark; SceneStorage tab restore on macOS.
- App Intents: open tab, add investment transaction (cash-transaction intent still missing — see ROADMAP §4.2).
- i18n scaffold via `Localizable.xcstrings` (zh-Hant source, English partial).
- Dark mode, Dynamic Type, glass effect with fallback for pre-iOS-26 / pre-macOS-26.

---

## 5. Gotchas

- **Yahoo Finance rate-limit.** No headers / token, just User-Agent. If you start hammering it (force-refresh in a loop) expect 429s. The 60-second cache in `PriceStore.refresh` is the only guard. Yahoo also occasionally returns sparse historical data for less-liquid symbols.
- **SwiftData migrations.** Lightweight migrations work for new fields with defaults (we added `Account.openingBalance`, `LedgerTransaction.receipt`, and the whole `RecurringTransaction` model that way). Adding required fields or relationships requires a `VersionedSchema`. The schema lives in [NorthstarApp.swift](Sources/NorthstarApp/NorthstarApp.swift).
- **`LedgerLinkage.currentBackfillVersion`.** Bump this constant when you change linkage rules so existing installs re-sync on next launch. UserDefaults key: `northstar.ledgerLinkageBackfillVersion`.
- **`RecurringScheduler.runDue` runs on launch.** Called from `RootView.handleLaunchRouting` after the ledger backfill. If the user keeps the app open across midnight on a due day, nothing fires until the next launch; that's intentionally simple. A background activity / local notification will be wired later (ROADMAP §4.9).
- **`@SceneStorage` is per-window-restoration.** On macOS, closing and reopening the window restores the last tab — but creating a brand-new window starts at Dashboard. App Intents continue to override via `applyRequestedTab` writing to `sceneTabRaw`.
- **FX historical data depth.** Yahoo returns ~1y at daily interval (the current default in `YahooFinanceClient`). The ALL time-range will be capped to that 1y until you change `historyRange`. The `historicalLookup` falls back to the earliest known sample for dates before the window.
- **macOS `glassEffect`.** `NorthstarTheme` uses iOS 26 / macOS 26 glass with a graceful fallback to plain border. Both code paths must keep working.
- **Test target codesign.** `NorthstarTests` uses `CODE_SIGN_IDENTITY: "-"` (ad-hoc). Don't replace with explicit identity unless you also wire DEVELOPMENT_TEAM.
- **Localizable.xcstrings source language is zh-Hant.** Source-code literals stay Chinese; English (and any future locales) live in the catalog. `developmentLanguage` in `project.yml` is still `en` — leave it alone, the catalog overrides at lookup time.
- **FIFO capital-reduction semantics.** A reduction proportionally shrinks every open lot's quantity and bumps per-share cost so the lot's *total* cost is preserved. This matches the avg-cost behaviour but may not match what the brokerage statement reports. If the discrepancy matters, switch to a different cost-allocation rule and add a test in `FIFOCalculatorTests`.

---

## 6. Testing posture

Domain logic is well-covered (76+ tests). UI logic is **not** tested. If you change an editor view or the dashboard layout, build + click-through manually.

Snapshot tests for major screens are tracked in ROADMAP §6.1 — Point-Free's [`swift-snapshot-testing`](https://github.com/pointfreeco/swift-snapshot-testing) would slot in via SPM under the existing `NorthstarTests` target.

---

## 7. Quick orientation

Reading the codebase fresh? Start with these three files in order:

1. [Models.swift](Sources/NorthstarApp/Domain/Models.swift) — what the data is
2. [RootView.swift](Sources/NorthstarApp/UI/Views/RootView.swift) — how the app is shaped
3. [PortfolioCalculator.swift](Sources/NorthstarApp/Domain/PortfolioCalculator.swift) — the most important pure logic; pair-read with [FIFOCalculator.swift](Sources/NorthstarApp/Domain/FIFOCalculator.swift) to see the two cost-basis methods side by side

- The riskiest files (most edits, biggest blast radius): `DashboardView.swift`, `RootView.swift`, `PortfolioCalculator.swift`, `CashFlowView.swift`.
- The most stable: anything in `Domain/` other than `PortfolioCalculator`. They were designed pure and have tests.

---

## 8. Local environment quirks

- The shell's default `xcodebuild` may point to Command Line Tools. Verification can use `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`.
- SwiftData and Observation macros require Xcode's plugin server, so local CLI verification must run with full Xcode installed.

Verified app targets:

- `Northstar macOS`: `xcodebuild ... -scheme "Northstar macOS" ... build` succeeded.
- `Northstar iOS`: `xcodebuild ... -scheme "Northstar iOS" ... build` succeeded for generic iOS Simulator.
