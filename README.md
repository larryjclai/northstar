# northstar

SwiftUI multi-platform MVP for portfolio tracking (iOS, iPadOS, macOS).

## Current MVP scope

- Dashboard for total assets and unrealized PnL.
- Holdings list for stocks/ETFs/funds.
- Transaction list and add transaction flow.
- Investment actions: `Buy`, `Sell`, `CashDividend`, `StockDividend`, `CapitalReduction`.
- Cost basis and quantity recalculation logic.
- Seed sample data for local-first development.

## Project structure

- `Package.swift`: Swift package entry.
- `Sources/NorthstarApp/NorthstarApp.swift`: App entry point and SwiftData container.
- `Sources/NorthstarApp/Domain/*`: Models, portfolio calculator, formatters, sample bootstrap.
- `Sources/NorthstarApp/UI/*`: Theme, app state, dashboard/holdings/transactions views.
- `PRODUCT.md`: Product strategy and design principles.
- `DESIGN.md`: Seed design system with Radix-inspired semantic color steps.

## Run in Xcode

1. Open Xcode (full app, not only Command Line Tools).
2. File -> Open -> select `/Volumes/SATECHI/northstar/Package.swift`.
3. Choose the `northstar` executable scheme.
4. Run on macOS first, then create iOS/iPadOS destinations in Xcode as needed.

## Known local environment issue in this container

- `xcodebuild` is unavailable because the active developer directory is Command Line Tools.
- Current CLI Swift compiler and SDK patch versions do not match, so `swift build` fails in this environment.

The source code is scaffolded and ready to open in full Xcode on your machine.
