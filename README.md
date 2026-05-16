# northstar

SwiftUI multi-platform MVP for portfolio tracking (iOS, iPadOS, macOS).

## Current MVP scope

### Done
- Dashboard for total assets, unrealized PnL, allocation, accounts, holdings.
- Holdings view with sparklines, allocation, and macOS dual-pane brokerage detail.
- Transactions view: list, add, edit, delete, mark reviewed, CSV export (with `id`).
- CSV import for investment records: file picker → preview (new / duplicate / error) → confirm.
- UUID dedupe on import; auto-create missing `PortfolioAsset` / `Account` from CSV rows.
- Investment actions: `Buy`, `Sell`, `CashDividend`, `StockDividend`, `CapitalReduction`.
- Idempotent cost basis recalculation after add / edit / delete / import.
- **Cash account linkage via `LedgerTransaction` model**: Buy / Sell / CashDividend create paired ledger entries and recompute `Account.balance`. Currency-mismatch is detected and skipped with an editor warning.
- One-time backfill on launch for pre-existing investment records.
- Yahoo Finance price + sparkline integration.
- App Intents shortcuts (open tab, add transaction).
- macOS sidebar shell + iOS TabView.
- Light / dark adaptive color tokens.

### Next up
- **Multi-currency FX rates + base currency**: pull rates from Yahoo (`USDTWD=X` style symbols), store user-selected base currency, show converted net worth on Dashboard.
- Cash account CRUD UI with opening balance (currently auto-created with 0 balance only).

### Remaining (per PRD)
- Settings screen (base currency, privacy copy).
- Historical net worth series + working 1W / 1M / 3M / YTD / 1Y / ALL time ranges.
- Benchmark comparison (0050, SPY) wired into the chart UI (`PriceStore.benchmarks` already stores the data).
- Fugle API for Taiwan equities (currently Yahoo only).
- TWSE OpenAPI for post-close dividend / capital-reduction reconciliation.
- Daily ledger (`Ledger.csv` import per PRD §4 first table).
- Supabase E2EE sync (Pro tier).

## Project structure

- `northstar.xcodeproj`: Formal Xcode app project with separate iOS and macOS app targets.
- `Sources/NorthstarApp/Resources/Assets.xcassets`: Shared app icon, accent color, and named UI colors.
- `Sources/NorthstarApp/NorthstarApp.swift`: App entry point and SwiftData container.
- `Sources/NorthstarApp/Domain/*`: Models, portfolio calculator, formatters, sample bootstrap.
- `Sources/NorthstarApp/UI/*`: Theme, app state, dashboard/holdings/transactions views.
- `script/build_and_run.sh`: Shell-first macOS build/run entrypoint for the formal Xcode target.
- `PRODUCT.md`: Product strategy and design principles.
- `DESIGN.md`: Seed design system with Radix-inspired semantic color steps.

## Run in Xcode

1. Open Xcode (full app, not only Command Line Tools).
2. File -> Open -> select `/Volumes/SATECHI/northstar/northstar.xcodeproj`.
3. Choose `Northstar macOS` for My Mac or `Northstar iOS` for iPhone/iPad Simulator.
4. Run from those app schemes. This repository no longer defines a SwiftPM executable app route.

## Run from Terminal

```sh
./script/build_and_run.sh
```

Build without launching:

```sh
./script/build_and_run.sh --build-only
```

## Known local environment issue in this container

- The shell's default `xcodebuild` points to Command Line Tools here, so verification used `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`.
- SwiftData and Observation macros require Xcode's plugin server, so local CLI verification must run outside the Codex sandbox.

Verified app targets:

- `Northstar macOS`: `xcodebuild ... -scheme "Northstar macOS" ... build` succeeded.
- `Northstar iOS`: `xcodebuild ... -scheme "Northstar iOS" ... build` succeeded for generic iOS Simulator.
