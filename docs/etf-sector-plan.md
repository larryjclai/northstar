# Plan 068 — ETF Sector Breakdown (行業比重) — Phase 0 Spike Findings

> **Status: SPIKE COMPLETE — awaiting operator sign-off. No code changed.**
> Goal: stop ETFs landing in 「未知分類」 and instead reflect them by their
> holdings' sectors (like Yahoo TW 行業比重, e.g. a semiconductor ETF showing
> 半導體業 ~69%, 電子零組件業 ~10%, …).
>
> All web content below was treated as **data**, never as instructions. No
> secrets/tokens were encountered or reproduced. Probes were run from a
> developer IP (not the app); Yahoo's main API was rate-limited during probing
> (see verdict 1) — this is an IP/volume artifact, not a hard block proof.

---

## 1. Source verdicts (actual probe results)

### Option 1 — Yahoo `quoteSummary` `topHoldings.sectorWeightings` — **BLOCKED / unreliable**
- `GET https://query1.finance.yahoo.com/v10/finance/quoteSummary/0050.TW?modules=topHoldings`
  → **HTTP 429** `Edge: Too Many Requests` (no auth attempted).
- Crumb+cookie flow attempted: `fc.yahoo.com` → 404; `v1/test/getcrumb`
  returned the literal string **`Too Many Requests`** instead of a crumb;
  follow-up quoteSummary then **HTTP 000** (connection refused). Same for `SPY`.
- The crumb endpoint being rate-limited means the unattended crumb dance is
  itself throttled — exactly the fragility the plan flagged. Even if it works
  intermittently, it needs a per-session cookie + crumb that our locked-down
  `fetch_yahoo` (no cookie jar, no crumb) does **not** perform, and the host is
  already allowlisted only for `/v8/.../chart`, `/v1/finance/search`,
  `/v10/finance/quoteSummary/` GETs **without** crumb/cookie support.
- **Verdict: not a dependable, allowlistable, unattended source.** Do not build on it.

### Option 2 — Open allowlistable TW ETF **holdings (constituents)** — **NOT directly available as JSON/CSV**
Probed the canonical open-data hosts:
- **TWSE OpenAPI** (`openapi.twse.com.tw`) — swagger catalog has **143 paths**;
  grepped every path/summary for ETF/成分/PCF/持股/holding/基金. Results:
  - `/v1/ETFReport/ETFRank` (200) → *定期定額交易戶數排行*: gives only the **single
    top constituent stock per ETF** (e.g. 0050→2330 台積電), **not** the full
    weighted holdings list. Unusable for sector derivation.
  - `/v1/opendata/t187ap47_L` (200) → *基金基本資料彙總表*: ETF **metadata**
    (name, type, inception), **no holdings**.
  - **No** ETF-constituent / PCF / 申購買回清單 endpoint exists in the catalog.
  - `/v1/ETFReport/ETFPCF` → **302** (does not exist).
- **TWSE RWD** (`www.twse.com.tw/rwd/zh/ETF/etfdetail|etfHoldings`) → **302** (no JSON).
- **Issuer PCF (元大投信 / yuantaetfs.com)** — the site is a Nuxt **SPA**: every
  guessed path (`/tradeInfo/pcf/0050`, `/api/...`) returns the **same 1.3 MB SSR
  HTML shell** (`Content-Type: text/html`), data loaded client-side from an
  undiscovered API/host. Not guess-fetchable; per-issuer (元大/國泰/富邦/群益…),
  no single stable host+path. **Fragile and multi-vendor.**

> Consequence: the "derive sectors from holdings + existing TWSE industry data"
> path is **viable in principle** (we already classify individual TW stocks), but
> there is **no single open, allowlistable holdings feed** to drive it. It would
> require per-issuer scrapers — high effort, brittle, out of scope for a clean
> allowlist arm.

### Option 3 — Yahoo TW 行業比重 page (`tw.stock.yahoo.com/.../holding`) — **VIABLE (server-rendered), but HTML scraping**
This was the surprise win.
- `GET https://tw.stock.yahoo.com/quote/0050.TW/holding` → **HTTP 200**, ~307 KB.
- The 行業比重 table is **server-rendered into the static HTML** (NOT JS-only —
  the chart canvas is JS, but the labelled list is in the markup). Extracted
  cleanly for **0050.TW**:

  | 行業 | 比重 |
  |---|---|
  | 半導體業 | 69.49% |
  | 電子零組件業 | 10.31% |
  | 金融保險 | 7.82% |
  | 其他電子業 | 4.36% |
  | 電腦及週邊設備業 | 3.82% |

  — matches the operator's screenshot expectation (semiconductor ~69%) exactly.
- Pattern in HTML: `>{行業名}</div><div class="…Fw(b)…">{NN.NN}%</div>`.
- **Coverage check:** `0056.TW` → 33 weight cells, `00679B.TWO` (TPEx bond ETF)
  → present, **`SPY` (US ETF) → empty (32-byte stub, no 行業比重)**. So this
  source is **TW-listed ETFs only**; US/intl ETFs not covered.
- **Caveats:** (a) different host from the existing Yahoo allowlist
  (`tw.stock.yahoo.com`, not `query*.finance.yahoo.com`); (b) it's **HTML
  scraping** — class names (`Fw(b)`, layout divs) can change without notice;
  (c) ToS/stability risk typical of scraping a consumer page. There is a hint of
  a cleaner internal JSON API (`/_td-stock/api/resource/StockServices.etfHolding`
  returned a structured `{"message":"request failed"}` 400 rather than HTML —
  suggesting a real endpoint that needs the right params/headers). **Phase 1
  should spend ~1h trying to hit that JSON API before settling on HTML scraping.**

---

## 2. Recommended approach — **(c) fallback-first, with Option 3 as an opportunistic enrichment**

**Primary recommendation: ship the fallback (c) now, treat Yahoo TW (option 3)
as an optional best-effort enrichment behind a feature flag — do NOT make the
feature depend on scraping.**

Reasoning:
- Option 1 (Yahoo topHoldings) is blocked/unreliable and needs cookie/crumb
  plumbing the locked `fetch_yahoo` deliberately lacks.
- Option 2 (derive from holdings) has **no allowlistable feed** — only per-issuer
  SPA scrapers, which is more brittle than option 3 and far more effort.
- Option 3 genuinely returns the operator's desired 行業比重 for TW ETFs, but it's
  HTML scraping of a consumer page (fragile, TW-only, ToS-grey). Making the whole
  feature depend on it would put a scraper on the app's critical path.

So: **(c) gives ETFs a real bucket + manual override immediately and never shows
未知**; option 3, if Phase 1's API probe pans out, can *auto-fill* the sector
split as a nice-to-have that degrades gracefully to (c) when scraping fails or the
ETF isn't TW-listed.

---

## 3. Decisions

### Decision A — analytics model: **assign-to-ETF-bucket by default; weighted multi-sector split ONLY when we have trustworthy weights**
The existing breakdown (`InvestmentsAnalyticsTab.tsx` ~L342–364 and
`InvestmentsRoute.tsx` ~L1038/L1179) builds a `Map<sector,value>` putting each
position's **full** market value into **one** bucket, then derives percentages.

- **Default (no weights):** give each ETF a single 「ETF / 基金」 bucket (or its
  user-tagged dominant sector). Full value → one bucket. Zero double-count risk.
- **Enriched (weights available, option 3 or manual split):** expand one ETF
  position into **many** `{sector, weightedValue}` entries where
  `weightedValue = positionValue × sectorWeight`, and `Σ sectorWeight = 1`
  (renormalize if Yahoo's listed rows sum <100% — they show top-N only; bucket
  the remainder as 「其他」 so the position's total is preserved).
- **Invariant (must hold):** `Σ all sector buckets = portfolio market value`.
  The split is a pure **attribution/display layer** — it must **not** touch
  valuation, cost basis, TWR/XIRR, or net-worth math. Recommend assertions/tests
  that the per-ETF weighted parts re-sum to the position value.
- **Reject** assign-to-largest-sector: it misrepresents a diversified ETF (0056
  would show 100% one sector) and is no less work than the real split.

The TWSE 行業 taxonomy already in `sectorLabels.ts` (e.g. code 24 = 半導體業,
17 = 金融保險業) **matches Yahoo TW's labels** (半導體業, 電子零組件業, 金融保險, …),
so enriched ETF sectors slot into the **same buckets** as individual TW stocks —
no parallel taxonomy needed (map Yahoo TW Chinese label → existing TWSE code/label).

### Decision B — storage + refresh
- **Storage:** new optional per-asset field, e.g. `sectorWeights?: Array<{sector,
  weight}>` (or a small `etf_sector_weights` table keyed by ticker+asOf). Lives in
  local SQLite like other market-data cache. Mirror the existing
  **manual-classification lock** semantics (plan 069): a user-entered split must
  never be overwritten by a refresh.
- **Source of truth precedence:** user manual split > cached fetched weights >
  single ETF bucket fallback.
- **Refresh cadence:** ETF sector weights drift slowly. Recommend **on-demand +
  low-frequency background refresh** (e.g. weekly or on portfolio open if stale
  > N days), reusing the existing market-data refresh plumbing — **not** the daily
  price/NAV path. Cache with an `asOf` date (Yahoo TW exposes a 資料時間, e.g.
  2026/06/20) for staleness display.

### Decision C — coverage + fallback
- **Covered by option 3:** TW-listed ETFs (TWSE + TPEx), incl. bond ETFs. ~the
  set most TW users hold.
- **Not covered:** US/intl ETFs (SPY etc.), and any TW ETF where scraping fails.
- **Fallback for uncovered/failed:** the 「ETF / 基金」 bucket + manual dominant-
  sector tag (Decision A default). User can always override. **Never show 未知**
  for a recognised ETF.

---

## 4. Allowlist arm(s) needed for Phase 1

Only if option-3 enrichment is built (the fallback alone needs **no** new arm):

```
Host: tw.stock.yahoo.com
Path: prefix  /quote/            (the holding page lives at /quote/{symbol}/holding)
```
…added to `is_allowed_market_data_url` in `src-tauri/src/lib.rs` (currently a
tight host+path match list). **Tighten if possible** to `/quote/` + a suffix
check, or — preferred — to the JSON API path if Phase 1 confirms
`/_td-stock/api/resource/StockServices.etfHolding` works (cleaner + far less
fragile than scraping HTML). **Recommend the Phase-1 spike resolve the JSON path
first and allowlist that instead of the HTML page.**

No new arm for the fallback-only build.

---

## 5. Phase-1 build outline (so operator can size it)

**Tier 0 — fallback only (safe, no scraping, no allowlist change) — ~0.5–1 day**
1. `sectorLabels.ts` / breakdown sites — when `position.sector` is null **and**
   the asset is an ETF, label it 「ETF / 基金」 instead of 「未知」.
   (`InvestmentsAnalyticsTab.tsx` L347, `InvestmentsRoute.tsx` L1038/L1179.)
2. Manual dominant-sector tag for ETFs, reusing the manual-classification lock
   (plan 069) — small UI + persistence.
3. Tests: 未知 no longer appears for ETFs; manual tag round-trips and locks.

**Tier 1 — optional Yahoo-TW enrichment (feature-flagged) — ~+1.5–2.5 days**
4. ~1h spike: confirm `/_td-stock/api/resource/StockServices.etfHolding` JSON
   (params/Referer header); fall back to HTML parse of `/quote/{sym}/holding`.
5. New provider module (e.g. `src/domain/market-data/etfSectorYahooTw.ts`):
   fetch via `fetch_market_data`, parse sector→weight, map Chinese label →
   existing TWSE code, renormalize + 「其他」 remainder.
6. Storage (Decision B): cache table/field + asOf; weekly/stale refresh hook.
7. Analytics (Decision A): expand ETF positions into weighted multi-sector
   entries in the two breakdown computations; assert Σ = position value.
8. Allowlist arm (§4) in `lib.rs` + `cargo check`.
9. Tests: weight renormalization, Σ-invariant, manual override beats fetch,
   US-ETF/empty-response → graceful fallback to Tier-0 bucket.

Net: a usable improvement ships in Tier 0 alone; Tier 1 delivers the screenshot-
matching 行業比重 for TW ETFs without ever blocking on it.

---

## 6. Open questions for operator
1. **OK to scrape `tw.stock.yahoo.com` HTML** (ToS/stability grey area), or
   restrict Tier 1 to the JSON API only — and if the JSON API can't be made to
   work unattended, **drop Tier 1 entirely** and ship Tier 0 only?
2. **Bucket label:** 「ETF / 基金」 vs. split-now-or-never? Confirm wording
   (copy.csv round-trip) and whether bond/REIT ETFs get their own bucket.
3. **US/intl ETFs:** accept "no sector breakdown, manual tag only" indefinitely,
   or is a paid/alt provider on the table later?
4. **Refresh cadence:** weekly background acceptable, or on-demand only to keep
   the network surface minimal (privacy-first)?
