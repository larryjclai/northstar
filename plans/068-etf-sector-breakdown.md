# Plan 068: ETF sector + country/region breakdown by holdings (instead of 「未知分類」)

> **Executor instructions**: This is a **spike-first, design-gated** plan. Phase 0
> determines whether a fetchable ETF sector-weightings source exists — it has a hard
> STOP gate. Do NOT build until Phase 0 confirms a source + the operator signs off.
> Respect the native URL allowlist (security). Run every verification command. If a STOP
> condition occurs, stop and report. Update this plan's row in `plans/README.md` unless a
> reviewer maintains it.
>
> **Drift check (run first)**:
> `git diff --stat <planned-at SHA>..HEAD -- src/features/market-data/ src/domain/portfolioAnalytics.ts src/routes/InvestmentsAnalyticsTab.tsx src-tauri/src/lib.rs`
> Coordinate with plans 067 + 069 (shared `useMarketRefresh.ts`); re-read excerpts first.

## Status
- **Priority**: P2 (direction / feature)
- **Effort**: M–L (gated on the spike; the analytics change is M; the data source is the risk)
- **Risk**: MED–HIGH (depends on an external holdings/sector-weightings source)
- **Depends on**: 069 (manual-classification protection) should land first so this doesn't
  re-clobber user values; shared `useMarketRefresh.ts`
- **Category**: direction (feature) / dependencies (external data)
- **Planned at**: commit `276de422`, 2026-06-25

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

## Phase 0 — SPIKE (REQUIRED; hard STOP gate)
**The feature hinges on a fetchable ETF sector-weightings source.** Investigate + write
`docs/etf-sector-plan.md`, then STOP for operator sign-off.

1. **Find a source for ETF sector weightings (a list of `{ sector, weight }` per ETF).**
   Evaluate, preferring stable/allowlistable:
   - **Yahoo `quoteSummary` `topHoldings.sectorWeightings`** — re-assess whether it can be
     fetched with the crumb+cookie flow (the provider abandoned it; confirm it's still
     blocked or now workable). If workable, it's the cleanest (one provider, all markets).
   - **Taiwan-specific (for TW ETFs):** TWSE/TPEx or the fund houses publish ETF
     **portfolio composition (PCF) / holdings**; data.gov.tw may host a dataset. From
     per-holding industry (you already classify TW stocks via TWSE open data — plan's
     TaiwanMarketDataProvider) you can DERIVE sector weights. Capture the URL + format.
   - **Yahoo TW site 行業比重** (the screenshot source) — HTML; only if it has a stable,
     allowlistable, parseable structure (last resort; scraping is fragile).
2. Confirm the source is allowlistable (fixed host+path) and the response is parseable.
3. **Country/region — capture from the SAME probe.** For each source you evaluate, also
   record whether it yields per-holding **country/region** (Yahoo `topHoldings` carries no
   country, but the underlying-holdings list does — each constituent's listing country is
   known). Confirm the **local derivation** for *direct* holdings: a function mapping
   ticker-suffix/market → country (`.TW`/`.TWO`→TW, `.T`→JP, `.HK`→HK, `.L`→GB, US→US, …)
   with currency as a fallback. ETFs derive country from their holdings (same data as
   sector); direct holdings need no fetch.
4. Decide the **analytics model** (see Decision) and the **fallback** for ETFs the source
   doesn't cover — for BOTH sector and country.

**STOP (fall back) if** no stable, allowlistable source exists. Then do NOT scrape
fragile HTML; recommend the lighter fallback: stop showing ETFs as 未知 by giving them an
「ETF / 基金」 bucket in the breakdown (a one-category improvement), and/or let the user
manually tag an ETF's dominant sector (reuses 069's manual-classification path). Report this.

## Decision gate (Phase 0 outputs; operator signs off)
- **A — analytics model (applies to BOTH sector and country):** an ETF contributes its
  market value **split across buckets by weight** (a holding → many `{bucket, weightedValue}`
  rows), vs. the simpler v1 "assign the ETF to its single largest bucket." Recommend:
  split-by-weight if the source gives weights cleanly; else largest-bucket or an 「ETF」 bucket.
- **B — storage:** where per-ETF sector weights AND per-ETF country weights live (a new
  synced table/blob keyed by ETF symbol, refreshed like quotes), and the cadence. Direct
  holdings need no storage for country (derived on the fly from the ticker/market).
- **C — coverage + fallback:** ETFs the source misses fall back to 069's manual tag / an
  「ETF」 bucket — never silently 未知 / 未知國家.
- **D — country dimension scope:** confirm v1 = direct holdings by listing country (local,
  no fetch) + ETF holdings by country (from the same source as sector); a country whose
  source is missing for an ETF falls back like C. Region grouping (e.g. 北美/亞太/歐洲) vs.
  individual countries — recommend which granularity to display first.

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | all pass |
| Lint | `npm run lint` | exit 0 (0 errors) |
| Build | `npm run build` | exit 0 |
| Rust | `npm run check:tauri` | exit 0 |

## Scope
**Phase 1 (after the gate) — In scope:**
- `src-tauri/src/lib.rs` — IF a non-Yahoo source: one tight allowlist arm (and vite proxy
  parity, as plan 066 did). IF Yahoo quoteSummary: no native change (path already allowed).
- `src/features/market-data/` — the ETF sector-weightings fetch + parse (a provider method
  or a small module) + a pure parse test.
- A store for per-ETF sector weights **and per-ETF country weights** + refresh wiring in
  `useMarketRefresh.ts`.
- A small pure helper mapping ticker-suffix/market → country (for direct holdings), with a
  unit test. (No fetch; reused by the country breakdown.)
- `src/domain/portfolioAnalytics.ts` (+ the analytics tab) — fold ETF sector weights AND a
  country/region breakdown (direct-holding country + ETF country weights) into the
  analytics per Decision A (the real analytics change; keep both dimensions tested).
**Out of scope:**
- Single-stock classification (unchanged).
- `valuation.ts` / cost-basis / returns math — the breakdown is a presentation/allocation
  layer; don't change how value is computed, only how it's attributed to sectors.
- Overwriting a user's manual classification (plan 069 guards that).

## Git workflow
- Branch from current main (post-069): `git checkout -B advisor/068-etf-sector-breakdown main`.
- Commit the Phase-0 doc separately. Do NOT push/PR.

## Steps
### Step 0 (spike gate): source feasibility + design note → `docs/etf-sector-plan.md`; STOP for sign-off.
### Step 1: fetch + store ETF sector weights (per the confirmed source) + a pure parse test.
### Step 2: fold weights into the sector breakdown (Decision A) in `portfolioAnalytics.ts`
+ the analytics tab; ETFs without weights use the fallback (never 未知).
### Step 3: full verification — tsc 0; `npm test` all pass; lint 0 errors; build 0; check:tauri 0.

## Test plan
- Pure parse test for the chosen source → `{ sector, weight }[]` for an ETF.
- `portfolioAnalytics` test: a portfolio with one ETF (known weights) attributes its value
  across the right sectors (split-by-weight), and the totals still sum to the portfolio
  value (no double-count). An ETF without weights lands in the fallback bucket, not 未知.
- Existing analytics tests stay green.

## Done criteria
- [ ] `docs/etf-sector-plan.md` records the source + Decisions A/B/C (or the STOP/fallback)
- [ ] (if built) ETFs contribute to the sector breakdown by their holdings' weights (or the
      agreed v1 model); no ETF shows as 未知 (fallback bucket at worst)
- [ ] Sector weights stored + refreshed; allowlist (if any) tight; valuation/returns math unchanged
- [ ] tsc 0; `npm test` all pass; lint 0 errors; build 0; check:tauri 0
- [ ] `plans/README.md` row updated

## STOP conditions
- No stable, allowlistable ETF sector-weightings source (or scraping-only/ToS-blocked) —
  STOP; recommend the 「ETF」-bucket + manual-tag fallback (don't ship a brittle scraper).
- The analytics change requires touching valuation/returns math — it must not; stop.
- Operator hasn't signed off on Phase 0 — do not build Phase 1.

## Maintenance notes
- The external source is the fragile part — document the exact URL/format; the abstraction
  contains the blast radius.
- Coordinate with 069 (don't re-clobber a user's manual ETF tag) and 067 (shared file).
- Splitting an ETF across sectors changes the breakdown's mental model — make the
  attribution explainable (per finance-correctness invariant) and tested for no double-count.
