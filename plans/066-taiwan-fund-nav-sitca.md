# Plan 066: Taiwan mutual-fund NAV via SITCA (auto-price funds not on Yahoo)

> **Executor instructions**: This is a **spike-first, design-gated** plan. Phase 0
> is a feasibility spike on the SITCA data source — it has a hard STOP gate. Do NOT
> build the provider until Phase 0 confirms a stable, fetchable NAV source and the
> operator signs off. Run every verification command. If a STOP condition occurs,
> stop and report. The data/native layers have a security allowlist — respect it.
> Update this plan's row in `plans/README.md` unless a reviewer maintains it.
>
> **Drift check (run first)**:
> `git diff --stat 6138ca74..HEAD -- src/features/market-data/ src-tauri/src/lib.rs src/domain/valuation.ts`
> Compare the "Current state" excerpts against live code before proceeding.

## Status
- **Priority**: P2 (direction / feature — strong TW user value)
- **Effort**: M–L (gated on the spike; the provider itself is M if a source exists)
- **Risk**: MED–HIGH (depends on an UNOFFICIAL external data source; scraping fragility)
- **Depends on**: plans 038/045 (custom/manual-priced assets — merged) as the fallback
- **Category**: direction (feature) / dependencies (external data source)
- **Planned at**: commit `6138ca74`, 2026-06-23

## Why this matters
Operator wants Taiwan mutual funds to **auto-price like Percento** — Percento's own
note: *"Taiwan fund prices use SITCA published NAV; the same-day NAV usually updates
in the evening. Some listed ETFs, such as 0050, also appear here; add them as Taiwan
stocks to track exchange closing prices."*

`ROADMAP.md` 規劃中 already lists *"投資可自訂資產代號（或自訂投資資產），才可以支援
一些不在 Yahoo API 的基金類型資產"* and AGENTS.md invariant #3 says market-data
providers are replaceable. Today, a TW mutual fund (no Yahoo quote) can only be a
**custom asset with MANUAL prices** (plan 045) — the user must type the NAV. This plan
adds **automatic daily NAV** for TW funds via SITCA, behind the existing provider
abstraction.

**Important scope split (from the Percento note):**
- **Listed ETFs (0050, 0056, 00878, …)** already work TODAY as TW stocks via Yahoo
  with a `.TW` suffix (`0050.TW`). They are **out of scope** — they should keep
  tracking exchange closing prices via Yahoo, NOT SITCA. Do not re-route them.
- **Open-end mutual funds (基金, priced by NAV, not exchange-listed)** are the target.

## Current state
- **Provider abstraction** (`src/features/market-data/provider.ts`): a clean
  `MarketDataProvider` interface — `fetchQuotes(symbols) → Record<symbol, MarketQuote>`,
  `fetchHistory`, `searchSymbols`, `fetchAssetProfiles`, `fetchFxRate`. `MarketQuote`
  has `{ symbol, name, currency, price, change, changePercent, marketTime, … }`.
- **Yahoo provider** (`yahooFinanceProvider.ts`): `class YahooFinanceProvider
  implements MarketDataProvider`. Prices everything (incl. `0050.TW`) via the native
  `fetch_yahoo` command.
- **Taiwan provider** (`taiwanMarketDataProvider.ts`): currently ONLY
  `fetchAssetProfiles` (company name/industry for listed TWSE/TPEx stocks via
  `fetch_market_data`). It fetches **no prices** and has **no fund/NAV support**.
- **Native fetch + allowlist** (`src-tauri/src/lib.rs`):
  - `fetch_yahoo(path_and_query)` (line ~67) — Yahoo hosts only, path-restricted.
  - `fetch_market_data(url, response_type)` (line ~104) — gated by
    `is_allowed_market_data_url(url)` (line ~129) which currently allows ONLY
    `openapi.twse.com.tw/v1/opendata/t187ap03_L` and
    `www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O`. **A SITCA source must be added to
    this allowlist** (a deliberate security gate — do not bypass it).
- **Asset model** (`src/domain/types.ts`): `AssetType` includes `"mutual_fund"` and
  `"custom"`. Valuation (`src/domain/valuation.ts`): a normal asset resolves
  quote → daily close → cost; an `assetType === "custom"` asset uses
  `manualPriceLookup` (manual NAV). A fund with a real fetched NAV (saved as a quote)
  would resolve via the normal quote/close path — **no valuation change needed** if the
  NAV is saved as a `MarketQuote` for the fund's symbol.
- **Refresh wiring** (`useMarketRefresh.ts`): builds symbols from `assets.map(a =>
  a.ticker)`, calls `provider.fetchQuotes(...)`, `repository.saveMarketQuotes(quotes,
  sourceName)`. New providers plug in here.

### Conventions to follow
- **Provider abstraction** (invariant #3): implement `MarketDataProvider` (or the
  subset needed); set a distinct `sourceName` (e.g. `"SITCA"`). Don't hard-couple.
- **Native allowlist**: any new outbound host/path goes through
  `is_allowed_market_data_url` in `lib.rs` — add SITCA's exact host+path prefix; never
  open it to arbitrary URLs.
- **Finance correctness**: a NAV is a price; saving it as a `MarketQuote` lets existing
  valuation/trend math consume it unchanged. Don't fork valuation.
- zh-TW; funds are `assetType: "mutual_fund"`.

## Phase 0 — SPIKE (REQUIRED; hard STOP gate)
**The whole feature hinges on a stable, fetchable SITCA NAV source. SITCA
(sitca.org.tw) has NO official public REST API.** Before writing any provider:

1. **Find + evaluate a source.** Investigate, in order of preference:
   - SITCA's own published NAV data (the site's NAV query/export — find a stable URL
     that returns NAV by fund code and date; capture the exact request + response format).
   - A government open-data source (`data.gov.tw`) hosting fund-NAV datasets.
   - The fund houses' published NAV (last resort; per-house, fragile).
   For the chosen source, document: the exact URL/request, the response format
   (HTML/CSV/JSON), how a fund is keyed (SITCA fund code? name?), and the **update
   timing** (the operator's note says NAV updates in the evening).
2. **Confirm it's allowlistable** in `fetch_market_data` (a fixed host + path prefix,
   not arbitrary query-driven hosts).
3. Write the findings to `docs/taiwan-fund-nav-plan.md` and present to the operator:
   the source, its stability/legality (ToS), the fund-symbol convention, and the
   refresh timing. **STOP and get sign-off before Phase 1.**

**STOP (fall back) if:** no stable, allowlistable source exists, or it requires
fragile HTML scraping with no contract / violates ToS. In that case do NOT build a
brittle scraper — report that the **manual-price path (045) + CSV import (048) remain
the supported way** to track these funds, and recommend a lighter alternative
(e.g. a "paste NAV" quick action or a periodic CSV import) instead.

## Decision gate (Phase 0 outputs the operator signs off on)
- **A — fund symbol convention:** how a TW fund is identified (e.g. its SITCA fund
  code as the asset `ticker`, with `assetType: "mutual_fund"`), kept distinct from
  `.TW`/`.TWO` listed symbols so refresh routes funds → SITCA, stocks → Yahoo.
- **B — refresh model:** funds get end-of-day NAV (evening); intraday shows the last
  NAV. Confirm cache/refresh cadence.
- **C — coverage + fallback:** funds the source doesn't cover stay on the manual path.

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | all pass |
| Lint | `npm run lint` | exit 0 (0 errors) |
| Build | `npm run build` | exit 0 |
| Rust check | `npm run check:tauri` | exit 0 |

## Scope
**Phase 1 (after the gate) — In scope:**
- `src-tauri/src/lib.rs` — add SITCA's host+path to `is_allowed_market_data_url` (the
  ONLY native change; keep it as tight as the existing TWSE/TPEx entries).
- `src/features/market-data/` — a `SitcaFundProvider` (or extend
  `TaiwanMarketDataProvider`) implementing `fetchQuotes` for fund symbols, returning
  NAV as `MarketQuote.price`; plus a co-located unit test of the parse layer (feed a
  captured sample response → expect a NAV; pure, no network).
- `src/features/market-data/useMarketRefresh.ts` — route `mutual_fund` symbols to the
  SITCA provider; save NAV quotes (`sourceName: "SITCA"`); keep stocks/ETFs on Yahoo.
- A way to add a fund (symbol convention from Decision A) — reuse the existing
  add-holding/custom-asset entry; mark `assetType: "mutual_fund"`.

**Out of scope:**
- Listed ETFs (`0050.TW` etc.) — already priced by Yahoo; do NOT route to SITCA.
- `valuation.ts` math — a saved NAV quote flows through the existing quote/close path.
- A full fund symbol-search UI (nice-to-have; note as follow-up unless the source
  makes it trivial).
- Scraping anything not behind the tight `is_allowed_market_data_url` allowlist.

## Git workflow
- Branch from current main: `git checkout -B advisor/066-taiwan-fund-nav main`.
- Commit the Phase-0 doc separately from any Phase-1 code. Do NOT push/PR unless told.

## Steps
### Step 0 (spike gate): source feasibility + design note
Do Phase 0; write `docs/taiwan-fund-nav-plan.md`; **STOP for operator sign-off.**
### Step 1: native allowlist
Add the SITCA host+path to `is_allowed_market_data_url`. **Verify**: `npm run check:tauri` → 0.
### Step 2: SITCA provider + parse test
Implement the provider's `fetchQuotes` (NAV) using `fetch_market_data`; unit-test the
pure parse on a captured sample. **Verify**: `npx vitest run <the new test>` → pass.
### Step 3: wire into refresh
Route `mutual_fund` symbols to SITCA in `useMarketRefresh`; save NAV quotes. Stocks/ETFs
unchanged. **Verify**: `npx tsc --noEmit` → 0.
### Step 4: full verification
`npx tsc --noEmit` 0; `npm test` all pass; `npm run lint` 0 errors; `npm run build` 0;
`npm run check:tauri` 0.

## Test plan
- Pure parse test for the SITCA response → NAV (the only deterministic, offline test).
- A wiring test if practical: an asset with `assetType:"mutual_fund"` + a fund symbol
  routes to the SITCA provider (mock the fetch) and saves a quote.
- Listed-ETF regression: a `.TW` symbol still routes to Yahoo (not SITCA).
- Existing suite stays green.

## Done criteria
- [ ] `docs/taiwan-fund-nav-plan.md` records the confirmed source + Decisions A/B/C (or
      the STOP/fallback recommendation if no source exists)
- [ ] (if built) a TW mutual fund auto-fetches daily NAV; listed ETFs still use Yahoo
- [ ] SITCA host added to `is_allowed_market_data_url` only (tight allowlist)
- [ ] valuation/cost-basis math unchanged
- [ ] `npx tsc --noEmit` 0; `npm test` all pass; `npm run lint` 0 errors; `npm run build` 0;
      `npm run check:tauri` 0
- [ ] `plans/README.md` row updated

## STOP conditions
- No stable, allowlistable SITCA NAV source (or ToS-prohibited / scraping-only) — STOP,
  recommend the manual-price/CSV fallback (do NOT ship a brittle scraper).
- The source needs arbitrary/dynamic hosts that can't be tightly allowlisted — STOP
  (security: `is_allowed_market_data_url` must stay narrow).
- Pricing funds requires changing `valuation.ts` math — it must not (save NAV as a
  quote); if it seems to, stop and report.
- Operator hasn't signed off on Phase 0 — do not build Phase 1.

## Maintenance notes
- The fragile part is the EXTERNAL source — document the exact URL/format so a future
  break is diagnosable; if SITCA changes its format, only the provider's parse + the
  allowlist entry need updating (the abstraction contains the blast radius).
- Listed ETFs stay on Yahoo by design — keep the fund/stock routing explicit so 0050
  never accidentally hits SITCA.
- Fallback path (manual price 045 / CSV import 048) stays for funds the source misses.
- Follow-ups: fund symbol search; NAV history backfill (`fetchHistory`) for fund trend charts.
