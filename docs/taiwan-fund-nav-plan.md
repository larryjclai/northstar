# Taiwan Fund NAV via SITCA — design note (plan 066, Phase 1)

Automatic daily NAV for **Taiwan domestic open-end mutual funds** sourced from the SITCA
(中華民國證券投資信託暨顧問商業同業公會) government open-data CSV. Phase 0 (feasibility)
is done; this note records the confirmed source and the operator-signed-off decisions that
Phase 1 implements.

## Confirmed source (verified live)

- **URL:** `https://www.sitca.org.tw/MemberK0000/F/03/nav.csv`
  (data.gov.tw dataset #11109, published by FSC 證期局; refreshed daily).
- **Licence:** Taiwan Government Open Data License v1 — redistribution OK.
- **Live check:** HTTP 200, ~590 KB, ~4,273 rows. One CSV holds **all** ~4,200 domestic
  investment-trust funds — a single fetch covers every fund the user might hold.

### Encoding correction — UTF-8 **WITH a BOM**, NOT BIG5

The file begins with the UTF-8 BOM (`EF BB BF`). It is **not** BIG5. Earlier spikes
assumed a BIG5 government feed; that is wrong for this dataset. Consequences:

- **No charset conversion**, no Rust decode change. `fetch_market_data` returns the bytes
  as UTF-8 text and they are already correct.
- The only handling needed is to **strip a single leading `﻿`** in the JS parse so the
  first header (`日期`) — and therefore the first column of every row — is not corrupted.

### Columns (header, comma-separated)

```
日期,會員代號,公司名稱,基金統編,基金代號,基金名稱,基金淨值,漲跌,漲跌幅,類型代號,幣別,受益憑證代號
```

| Field | Column | Used as |
|---|---|---|
| 日期 | 1 | quote `marketTime` (NAV date) |
| 基金代號 | 5 | fund code → ticker `SITCA:<基金代號>` |
| 基金名稱 | 6 | quote `nameZh` |
| 基金淨值 | 7 | quote `price` (NAV) |
| 幣別 | 11 | quote `currency` (native) |

## Operator-signed-off decisions

1. **Symbol convention.** A fund's `ticker` is `SITCA:<基金代號>` (e.g. `SITCA:DIE02`);
   `assetType: "mutual_fund"`. The `SITCA:` prefix namespaces fund codes so they never
   collide with listed tickers (`0050.TW`, US symbols) and lets refresh routing recognise
   funds by prefix.
2. **v1 scope.** Domestic investment-trust funds only (this one CSV). Offshore /
   futures-trust funds and a full fund symbol-search UI are out of scope.
3. **Refresh cadence.** Once daily (NAV publishes in the evening); no intraday polling.
4. **Currency.** Store NAV in its **native** currency (col 11) and let the existing FX
   conversion handle display — same as every other quote.
5. **Encoding.** Strip the UTF-8 BOM in the JS parse (see correction above).
6. **Auto-fetch is the goal.** Manual-price (plan 045) and CSV-import (plan 048) remain as
   fallbacks.

## How it wires into the existing pipeline (no valuation change)

- `sitcaFundProvider.ts` fetches the CSV once via `invoke("fetch_market_data", …)` (Tauri)
  or the `/api/market-data` dev proxy (browser), strips the BOM, parses with `parseCsvTable`,
  and builds `基金代號 → { nav, currency, name, date }`. For each requested `SITCA:<code>`
  symbol it returns a `MarketQuote` whose `symbol` equals the requested ticker, `price` is the
  NAV, `currency` is col 11, `nameZh` is 基金名稱, and `marketTime` is the NAV date.
  `sourceName = "SITCA"`.
- `useMarketRefresh.ts` routes fund symbols (ticker starts with `SITCA:`) to the SITCA
  provider and saves their NAV quotes under `source: "SITCA"`. Stocks/ETFs stay on Yahoo;
  `.TW` / `.TWO` / US tickers are **not** routed to SITCA.
- A SITCA quote is matched to its fund asset by `quote.symbol === asset.ticker`, exactly like
  every other quote. `valuation.ts` then resolves quote → daily close → cost as usual, so
  **the financial math is unchanged** — the NAV simply flows through the normal quote path.

## Native URL allowlist (security)

`is_allowed_market_data_url` (src-tauri/src/lib.rs) and the `/api/market-data` dev proxy
(vite.config.ts) each gain **one** arm allowing **only** the exact path:

```
www.sitca.org.tw  →  path == "/MemberK0000/F/03/nav.csv"
```

Exact-match, as tight as the existing TWSE/TPEx entries — no wildcard, no path prefix.

## Adding a fund (user flow)

The existing add-holding form already supports this: in the 新增持倉 / HoldingForm the user
types the ticker `SITCA:<code>` (e.g. `SITCA:DIE02`) and picks 類型 = 共同基金 (`mutual_fund`).
Tickers are trimmed + upper-cased on save, which leaves `SITCA:DIE02` intact, so the daily
refresh auto-prices it. No new screen is required.
