# Plan 068: ETF sector + country/region breakdown by holdings (instead of 「未知分類」)

> **Executor instructions**: Phase 0 (spike) is **DONE** and the operator **signed off**
> on the DECISIONS LOCKED below. Build **Tier 0 unconditionally**; build **Tier 1 ONLY if
> the Step-3 ~1h JSON-endpoint confirmation passes** (no HTML scraping — that's forbidden).
> Respect the native URL allowlist (security). Run every verification command. If a STOP
> condition occurs, stop and report. Update this plan's row in `plans/README.md` unless a
> reviewer maintains it.
>
> **Drift check (run first)**:
> `git diff --stat <planned-at SHA>..HEAD -- src/features/market-data/ src/domain/portfolioAnalytics.ts src/routes/InvestmentsAnalyticsTab.tsx src-tauri/src/lib.rs`
> 069 + 067 are MERGED; re-read excerpts against current main first.

## Status
- **EXECUTED 2026-06-25**: **Tier 0 SHIPPED**; **Tier 1 STOPPED at the gate** (Step 3/5).
  The Yahoo TW `StockServices.etfHolding` JSON resource returns `{"message":"request
  failed"}` HTTP 400 to every unattended GET (tested with/without cookies, referer,
  X-Requested-With, crumb; param names symbol/symbols/key/id/ric/stockId + region/lang/
  bkt/device). The 行業比重 data (`investIndustryWeights.detail[]`, e.g. `TWSE-24` 半導體業
  69.x%) exists ONLY inside the server-rendered HTML of `/quote/<sym>/holding` — extracting
  it is forbidden HTML scraping. STOP condition met → shipped Tier 0 only, no lib.rs change.
- **Priority**: P2 (direction / feature)
- **Effort**: Tier 0 ~0.5–1d (no network); Tier 1 ~+1.5–2.5d (JSON enrichment, gated)
- **Risk**: Tier 0 LOW; Tier 1 MED (external JSON source, feature-flagged + fallback)
- **Depends on**: 069 (manual-lock) + 067 — both MERGED. Shared `useMarketRefresh.ts`.
- **Category**: direction (feature) / dependencies (external data)
- **Planned at**: commit `276de422`; Phase 0 done + signed off 2026-06-25 (doc 9db191a2)

## Why this matters
Operator wants the portfolio broken down on **two dimensions**, both reflecting an ETF's
**underlying holdings** rather than treating the ETF as one opaque blob:
1. **Sector / 行業比重** — ETFs are returned as 「未知分類」 (unknown sector) today; the
   operator wants them shown by their holdings' sectors, like Yahoo TW's 行業比重 (e.g. a
   TW semiconductor-heavy ETF showing 半導體業 69%, 電子零組件 10%, …).
2. **Country / region / 國家權重** — so the analytics tab can later show geographic
   exposure (how much of the portfolio is Taiwan vs. US vs. rest-of-world, etc.).

Today an ETF is a single asset with no sector, so the breakdown lumps all ETFs into 未知,
understating real exposure on both axes.

**Key asymmetry — country is much cheaper than sector:**
- A **direct** stock/fund holding's country is derivable **locally, no fetch** — from the
  listing market / ticker suffix (`.TW`/`.TWO`→Taiwan, `.T`→Japan, `.HK`→Hong Kong, `.L`→UK,
  no-suffix US tickers→USA, …) plus currency as a tiebreak. So a portfolio's country
  breakdown of *direct* holdings can ship with **no external data source at all**.
- Only **ETFs** need a holdings source for country (a global ETF spans many countries) —
  and it's the **same holdings data** the sector breakdown needs. So both dimensions are
  served by one ETF-holdings fetch; country additionally has a zero-dependency path for
  direct holdings.

## Current state
- `src/features/market-data/yahooFinanceProvider.ts` — asset classification comes from the
  `/v1/finance/search` payload (`quoteType` + sector/industry). It explicitly notes
  **"ETFs/funds don't carry sector in the search payload — assetType alone"** (~line 240),
  so ETFs get `assetType: "etf"` and `sector: null`. The richer Yahoo
  `/v10/quoteSummary` `topHoldings` module (which DOES carry `sectorWeightings`) is noted
  as **crumb/cookie-blocked since Yahoo's 2023 change** ("Invalid Crumb", ~line 218–221),
  which is why the provider switched to the search payload.
- `src-tauri/src/lib.rs` — `fetch_yahoo` allows `/v10/finance/quoteSummary/` paths, but
  the crumb requirement makes that module unreliable. `fetch_market_data` has a tight
  host allowlist (`is_allowed_market_data_url`) for any non-Yahoo source.
- `src/domain/portfolioAnalytics.ts` / `src/routes/InvestmentsAnalyticsTab.tsx` — compute
  the sector/industry breakdown by grouping each holding into ITS ONE sector. There is no
  concept today of one asset spanning MULTIPLE sectors by weight.
- `PortfolioAsset` has `assetType: "etf"`, `sector`, `industry` (single values).

## Phase 0 — SPIKE: DONE (verdict in `docs/etf-sector-plan.md`)
Findings (commit 9db191a2): Yahoo `topHoldings` = **blocked** (429 + needs cookie/crumb the
locked `fetch_yahoo` lacks). TWSE/TPEx/data.gov.tw = **no ETF holdings/PCF feed exists**
(143 OpenAPI paths, none carry constituents; issuer sites are SPAs). Yahoo TW
`tw.stock.yahoo.com/quote/<sym>/holding` = server-renders the 行業比重 table (verified:
0050.TW → 半導體 69.49%, 電子零組件 10.31%, … matches the screenshot) but **TW-listed ETFs
only** and it's a consumer HTML page; a cleaner JSON endpoint hint exists
(`/_td-stock/api/resource/StockServices.etfHolding` returned a structured 400, not HTML).

## DECISIONS LOCKED (operator signed off — build to these)
- **Source policy = JSON-API-only enrichment, NO HTML scraping.** Base layer never touches
  the network. The ONLY permitted enrichment source is the Yahoo TW **JSON** endpoint
  (`/_td-stock/api/resource/StockServices.etfHolding` or whatever the Phase-1 confirmation
  finds) — **HTML scraping of `tw.stock.yahoo.com/quote/.../holding` is OUT OF SCOPE / forbidden.**
- **Refresh cadence = weekly background refresh** for the enrichment cache (NOT the daily
  price path; on-demand also allowed when stale).
- **A — analytics model:** assign each ETF to a single 「ETF / 基金」 **bucket by default**;
  use a **weighted multi-bucket split** (position value × weight, renormalized with an
  「其他」 remainder) ONLY when trustworthy weights exist for that ETF. Pure attribution
  layer — must NOT touch valuation/returns; **Σ buckets = portfolio value** per dimension.
  Reject assign-to-largest.
- **B — storage:** optional per-ETF cache in local SQLite keyed by `ticker + asOf`, holding
  BOTH `sectorWeights` and (if available) `countryWeights`; honors the plan-069 manual lock;
  weekly/stale background refresh, off the daily price path.
- **C — coverage + fallback:** TW-listed ETFs may get enrichment; US/intl ETFs + any
  fetch/parse failure fall back to the 「ETF / 基金」 bucket + a manual dominant-sector/region
  tag (reusing the 069 lock). Precedence: **manual > fetched > bucket**. Never 未知 / 未知國家.
- **D — country/region:** v1 = **direct holdings by listing country, derived locally
  (no fetch)** via a ticker-suffix/market→country map (`.TW`/`.TWO`→TW, `.T`→JP, `.HK`→HK,
  `.L`→GB, no-suffix US→US, …) + currency tiebreak; **ETF country** comes from the same JSON
  enrichment as sector IF that payload carries region data (confirm in the Phase-1 spike),
  else fallback per C. Display **individual countries** first; region grouping (北美/亞太/
  歐洲) is a later cosmetic layer.

**Tiering (ship order):**
- **Tier 0 — no network, ship first:** 「ETF / 基金」 bucket + manual tag, AND the
  direct-holding **country** breakdown (local map). Kills 未知 on both dimensions with zero
  network surface.
- **Tier 1 — JSON-API enrichment, gated:** start with a ~1h confirmation that the Yahoo TW
  **JSON** endpoint works **unattended** (right params/headers, parseable, allowlistable as
  a fixed host+path). **If it can't be made to work unattended without scraping HTML →
  STOP Tier 1, ship Tier 0 only, report.** If it works: feature-flagged provider, weekly
  background cache, weighted split per A, allowlist arm for the JSON path.

## Decision compatibility & sequencing (A+B+C+D compose — no conflict)
A/B/C/D are **orthogonal layers of one feature**, not competing options: A = how value is
attributed (model), B = where weights are stored, C = missing-data fallback, D = the country
dimension. They stack (A needs B's stored weights + C's fallback; D reuses A's model). Two
correctness rules the build must hold:
- **Each dimension independently sums to the portfolio value.** Sector sums = country sums =
  total. A holding appearing in both "半導體" and "台灣" is correct, not double-counting —
  test each dimension separately.
- **Symmetric direct-vs-ETF split.** Direct stocks already have a sector (classification) and
  a *locally derivable* country (ticker/market map, no fetch); only ETFs need the holdings
  source, and that one fetch feeds BOTH dimensions (B stores one ETF→{sectorWeights,
  countryWeights} record).

**Ship in two tiers** (this is the only sequencing nuance):
- **Tier 1 — zero external dependency, ships regardless of the spike:** direct-holding
  **country** breakdown (local ticker/market→country map). Direct-holding sector already works.
- **Tier 2 — gated on the Phase-0 spike:** ETF sector + ETF country weights (same holdings
  source). If no source, Tier 2 degrades to C's 「ETF」 bucket / manual tag while Tier 1 still ships.
The spike (Phase 0) should confirm this split and size each tier separately.

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | all pass |
| Lint | `npm run lint` | exit 0 (0 errors) |
| Build | `npm run build` | exit 0 |
| Rust | `npm run check:tauri` | exit 0 |

## Scope
**Tier 0 (no network — build first) — In scope:**
- `src/domain/` — a pure helper mapping ticker-suffix/market → country (`.TW`/`.TWO`→TW,
  `.T`→JP, `.HK`→HK, `.L`→GB, no-suffix US→US, …; currency tiebreak) + a unit test.
- `src/domain/portfolioAnalytics.ts` (+ analytics tab `InvestmentsAnalyticsTab.tsx`) — a
  **country/region breakdown** of direct holdings (local map) AND give ETFs an 「ETF / 基金」
  bucket on the **sector** breakdown instead of 未知. Keep both dimensions tested (Σ=total).
- Manual dominant-sector / region **tag** for an ETF, reusing the plan-069
  `classificationLocked` lock (precedence manual > fetched > bucket).
- Bucket label wording via `copy.csv` (round-trip per repo convention) — don't hand-edit .tsx.

**Tier 1 (JSON-API enrichment — ONLY if the 1h confirmation passes) — In scope:**
- A ~1h confirmation that the Yahoo TW **JSON** endpoint
  (`/_td-stock/api/resource/StockServices.etfHolding`, or the real one) returns parseable
  ETF sector (and ideally region) weights **unattended** (correct params/headers, no login).
  **If it needs HTML scraping or a browser to work → STOP Tier 1.**
- `src-tauri/src/lib.rs` — ONE tight allowlist arm for that JSON **host+path** (e.g.
  `tw.stock.yahoo.com` + the exact `/_td-stock/api/...` path), + vite-proxy parity (as 066).
  **Do NOT allowlist the `/quote/.../holding` HTML page.**
- `src/features/market-data/etfSectorYahooTw.ts` (new) — fetch + parse + map Yahoo-TW sector
  labels onto the existing TWSE taxonomy (`sectorLabels.ts`) + renormalize with an 「其他」
  remainder; a pure parse test off a captured JSON sample.
- A per-ETF cache (local SQLite, key `ticker+asOf`, `sectorWeights` + optional
  `countryWeights`) + **weekly/stale background** refresh wiring (NOT the daily price path);
  honors the 069 lock.
- Fold the weighted split into the analytics per Decision A (weighted multi-bucket only when
  trustworthy weights exist; else the 「ETF」 bucket). Σ-invariant tests.

**Out of scope (hard):**
- **HTML scraping** of any consumer page (forbidden per operator decision).
- US/intl ETF holdings (no source — manual tag only).
- Single-stock classification; `valuation.ts` / cost-basis / returns math (attribution
  layer only — never change how value is computed).
- Overwriting a user's manual classification/tag (069 guards it).

## Git workflow
- Branch from current main: `git checkout -B advisor/068-etf-sector-breakdown main`.
- Short imperative commits (Tier 0 and Tier 1 may be separate commits). Do NOT push/PR.

## Steps
### Step 1 (Tier 0): country helper + tests → tsc 0.
### Step 2 (Tier 0): country/region breakdown (direct holdings) + ETF 「ETF/基金」 bucket on
the sector breakdown in `portfolioAnalytics.ts` + the analytics tab; manual tag via 069 lock;
labels via copy.csv. Σ=total tests per dimension. Verify: tsc 0; `npm test` pass.
### Step 3 (Tier 1 gate): ~1h confirmation the Yahoo-TW JSON endpoint works unattended.
**If it can't without HTML scraping → STOP, ship Tier 0, report.**
### Step 4 (Tier 1, only if Step 3 passes): allowlist arm (JSON path) + vite parity →
`check:tauri` 0; `etfSectorYahooTw.ts` provider + parse test; per-ETF cache + weekly bg
refresh; weighted split per A. Verify: tsc 0; parse test; check:tauri 0.
### Step 5: full verification — tsc 0; `npm test` all pass; lint 0 errors; build 0; check:tauri 0.

## Test plan
- Country helper: `2330.TW`→TW, `AAPL`→US, `7203.T`→JP, `0700.HK`→HK; currency tiebreak.
- `portfolioAnalytics` country test: a mixed portfolio attributes each direct holding to its
  country; Σ countries = portfolio value.
- `portfolioAnalytics` sector test: ETFs without weights land in 「ETF/基金」 (not 未知);
  Σ sectors = portfolio value.
- (Tier 1) parse test for the JSON payload → `{sector, weight}[]`; weighted-split test:
  an ETF with known weights splits across buckets + an 「其他」 remainder; Σ = position value.
- Manual tag beats fetched beats bucket. Existing analytics tests stay green.

## Done criteria
- [ ] (Tier 0) Direct holdings show a country/region breakdown (local, no fetch); no ETF
      shows 未知 on either dimension (「ETF/基金」 bucket + manual tag at worst)
- [ ] (Tier 1, if Step 3 passed) TW ETFs auto-fill sector (+region if available) from the
      JSON endpoint; weekly background cache; manual > fetched > bucket precedence
- [ ] NO HTML scraping anywhere; any allowlist arm is a tight JSON host+path; vite parity
- [ ] valuation/returns math unchanged; Σ buckets = portfolio value per dimension
- [ ] tsc 0; `npm test` all pass; lint 0 errors; build 0; check:tauri 0
- [ ] `plans/README.md` row updated

## STOP conditions
- The Yahoo-TW JSON endpoint can't be made to work unattended without HTML scraping or a
  browser/login — STOP Tier 1, ship Tier 0 only, report (do NOT fall back to scraping).
- The analytics change would require touching valuation/returns math — it must not; stop.
- Adding the allowlist arm isn't a clean tight host+path (like the existing entries) — report.

## Maintenance notes
- The external source is the fragile part — document the exact URL/format; the abstraction
  contains the blast radius.
- Coordinate with 069 (don't re-clobber a user's manual ETF tag) and 067 (shared file).
- Splitting an ETF across sectors changes the breakdown's mental model — make the
  attribution explainable (per finance-correctness invariant) and tested for no double-count.
