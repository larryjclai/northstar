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
