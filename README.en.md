[繁體中文](README.md) · **English**

# Northstar

[![Release](https://img.shields.io/github/v/release/larryjclai/northstar?include_prereleases&label=release)](https://github.com/larryjclai/northstar/releases/latest)
[![CI](https://github.com/larryjclai/northstar/actions/workflows/ci.yml/badge.svg)](https://github.com/larryjclai/northstar/actions/workflows/ci.yml)
[![License: GPL-3.0](https://img.shields.io/badge/license-GPL--3.0-blue)](LICENSE)
[![Downloads](https://img.shields.io/github/downloads/larryjclai/northstar/total)](https://github.com/larryjclai/northstar/releases)
![Platforms](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)

> **Alpha preview** · The UI and data structures may still change. Before the general release, the database schema is **not** guaranteed to be backward-compatible.
> For the latest version, see the **[Releases page](https://github.com/larryjclai/northstar/releases)**.

**Understand your spending, and build your assets alongside you.**

Northstar is a local-first, privacy-first personal & household finance app. It merges **cash-flow tracking** (your expenses) and an **investment ledger** (your investments) into one complete **net-worth** picture — all of your data lives on your own device, while you keep the freedom to export to JSON and CSV.

What Northstar aims to help you achieve:
- **Understand your savings rate** — track day-to-day, and know exactly how much you actually save each month.
- **Compare your investment performance against the market** — record investment transactions and compare against a benchmark you choose (e.g. 0050). If you can't beat the market over the long run, then join it!
- **See how far you are from your goal** — set goals and use the FIRE calculator; as your net worth is recalculated, it tells you how far you still are from your target.

## Screenshots

Captured from the built-in **Demo Mode** (loads sample data without touching your real data). The UI is Traditional Chinese-first; English is partially available.

![Dashboard — net-worth trend, portfolio vs benchmark, budget & upcoming bills](docs/screenshots/dashboard.png)

| Portfolio | Performance analysis | Cash flow |
|---|---|---|
| ![Holdings & allocation](docs/screenshots/investments.png) | ![Cumulative return vs 0050.TW](docs/screenshots/analytics.png) | ![Cash flow & category spend](docs/screenshots/cash-flow.png) |

## Feature overview

**Assets & net worth**
- Multiple accounts (bank / cash / credit card / loan / investment / physical assets), multi-currency, converted at the transaction-day exchange rate.
- Net worth is broken down in a reconciliation style: the identity **assets − liabilities = net worth** always holds. The primary net worth is cash-basis, with an additional "adjusted net worth (incl. receivables/payables)".
- The net-worth trend line covers historical investment positions (back-calculated at the cost of the period), not just cash.

**Cash-flow tracking & savings rate**
- Income/expense entries, transfers, and recurring income/expense auto-posting.
- **⌘N Quick Add**: record an expense / income / investment buy-or-sell in one sentence of natural language.
- Installment payments, refund reversals, receivables / payables (incl. money fronted for others), and automatic merchant categorization.
- Credit cards split billing cycles by statement date, distinguishing current-cycle spend from the net amount (after refunds).
- Cash-flow charts (income / expense comparison + cumulative net), switchable across day / week / month / year; savings-rate tracking.

**Portfolio & analysis**
- **Moving-average cost** throughout; buys/sells include fees. Full set of transaction types: buy / sell / cash dividend / stock dividend / stock split / capital reduction.
- **Three return measures side by side**: TWR (time-weighted), XIRR (money-weighted annualized), and period price return.
- Per-holding contribution analysis, dividends and yield, currency exposure, risk metrics (volatility, Sharpe, Sortino, max drawdown), and allocation drift.
- **Benchmark comparison + alpha**, with holding line charts marking buy / sell points.
- Quotes and exchange rates via Yahoo Finance.

**Goals & FIRE**
- Retirement projection including inflation, fees, and accumulation-phase / post-retirement returns, in both real and nominal modes.
- **Three-scenario (pessimistic / neutral / optimistic) success robustness**, plus Coast / Lean / Regular / Fat FIRE calculations.
- Retirement income items (labor insurance / annuities / passive income), each configurable for whether it adjusts with inflation.

**Privacy & data**
- **Local-first**: data lives in local SQLite, not in the cloud.
- The optional multi-device sync is **end-to-end encrypted** (your data is encrypted before it ever leaves the device; the server cannot see the contents).
- Privacy masking, dark / light / follow-system themes, and a Traditional Chinese interface.

## Download & install

Go to the **[Releases page](https://github.com/larryjclai/northstar/releases)** to download the latest installer:

- **macOS** (Apple Silicon / Intel): download the `.dmg`, open it, and drag to "Applications". For first launch, see the note below.
- **Windows**: download the `x64-setup.exe` installer. SmartScreen may show an "unknown publisher" warning on first run — click "More info → Run anyway".
- **Linux**: download the `.deb` (Debian / Ubuntu family).

The app has built-in auto-update and will prompt you when a new version is available.

### Opening on macOS for the first time

Northstar is not yet notarized by Apple (which requires a paid Apple Developer account), so the first launch on macOS will be blocked by Gatekeeper. Do either of the following:

- **If it says "cannot verify the developer"**: go to "System Settings → Privacy & Security", scroll down to the message that Northstar was blocked, and click "**Open Anyway**".
  > Since macOS 15 (Sequoia), the old "right-click → Open" bypass has been removed; use "Open Anyway" instead.

- **If it says "is damaged and should be moved to the Trash" (common when sent via AirDrop)**: open "Terminal" and run the following command to remove the quarantine attribute, then open it normally:
  ```bash
  xattr -dr com.apple.quarantine /Applications/Northstar.app
  ```

> 💡 We recommend updating via the app's built-in auto-update or by downloading the `.dmg` from the Releases page, rather than sending the `.app` over AirDrop — AirDrop is more likely to trigger the "damaged" message.

## It's currently Alpha, please note

- The UI and database structure are still evolving; automatic migration is not guaranteed on version updates (a data rebuild may be required when necessary — we recommend regularly using the built-in "Export backup").
- Exchange rates / quotes go through the public Yahoo Finance API, which may occasionally be rate-limited for short periods.
- App signing / notarization is not yet done: the first launch on macOS requires manual approval; on Windows, SmartScreen will warn about an "unknown publisher".
- **The primary test platform is macOS (Apple Silicon)**; Windows / Linux are source-level compatible but have not been fully verified on real hardware.

## Reporting issues & feature requests

You're welcome to open a [GitHub Issue](https://github.com/larryjclai/northstar/issues) to report a bug or request a feature, including:

- Operating system and version
- Reproduction steps, expected behavior, and actual behavior
- If it's data-related, attach the error message you saw

I also warmly welcome you to share your experience directly — your feedback will directly shape Northstar's direction.

## License & contribution status

**Copyright © 2026 賴瑞晟 LAI Jui Cheng.** Northstar's **source code** is licensed under the **[GNU GPL v3.0 (or later)](LICENSE)**. GPLv3 covers only the code in this repo, and does **not** cover:

- **Bank / brand logos** (third-party trademarks) — stored in the gitignored `private-assets/`, **not** included in the public repo; the app builds fine without them.
- **Bundled fonts** (Space Grotesk, IBM Plex Sans / Mono / Sans TC) — licensed under **SIL OFL-1.1**, compatible with GPLv3 but a separate license. See [THIRD-PARTY-LICENSES.md](THIRD-PARTY-LICENSES.md) for details.

> ⚠️ Northstar does not constitute investment / financial advice. As stated in the GPLv3 terms, this software is provided "as is", without any warranty.

**Submitting a PR requires signing the CLA**: all pull requests must first sign the [Contributor License Agreement (CLA.md)](CLA.md) — a one-time step, guided by a bot's comment on the PR. See [CONTRIBUTING.md](CONTRIBUTING.md) for details. To report a security issue, please see [SECURITY.md](SECURITY.md); do not post full vulnerability details, tokens, personal financial data, or unredacted screenshots in a public issue.

## Build from source

```bash
npm install
npm run build      # tsc + vite build
npm test           # vitest
npm run tauri dev  # run the desktop app (requires the Rust + Tauri toolchain)
```

> **Note on bank logos:** the build copies optional bank/brand logos from a private,
> gitignored `private-assets/bank/` directory (or `$NORTHSTAR_PRIVATE_ASSETS_DIR`) via
> `scripts/inject-private-assets.mjs`. These third-party trademark assets are **not** part
> of this open-source repository. The build runs cleanly without them — it simply ships
> without bundled bank logos. No extra setup is required to build from source.

## Want to contribute?

For local build, test, and packaging instructions, see the **[development docs](docs/DEVELOPMENT.md)**.

Other docs:
- [Product spec](docs/product-spec.md)
- [Architecture](docs/architecture.md)
- [Roadmap](ROADMAP.md)
