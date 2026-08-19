# ETF Sector (+Country) Feed Pipeline — design doc (Plan 071, Phase 0 spike)

> **Status: PHASE 1 BUILT (operator signed off on the Phase-0 decisions).**
> Phase 0 was a feasibility spike (pipeline, coverage results, infra/privacy/country
> recommendations). Phase 1 hardened it into the live pipeline + app wiring:
> - Build script: `scripts/etf-feed/build_feed.py` (+ `tickers.txt`, `requirements.txt`).
> - Weekly publish: `.github/workflows/etf-feed.yml` → GitHub Pages.
> - Bundled snapshot: `private-assets/etf/etf-sector-feed.json` (gitignored, release-only),
>   injected to `public/` by `scripts/inject-private-assets.mjs`; accessor `src/domain/etfSectorAssets.ts`.
> - Client module: `src/domain/etfSectorFeed.ts` (bundled + on-demand public pull, weekly-TTL cache).
> - Wired into `AnalyticsPosition.sectorWeights` in `src/routes/InvestmentsRoute.tsx`.
> - Native allowlist arm + vite proxy parity (`src-tauri/src/lib.rs`, `vite.config.ts`).
>
> **OPERATOR ONE-TIME STEP — enable GitHub Pages (gated, not done by this build):**
> Repo → **Settings → Pages → Build and deployment → Source: "GitHub Actions"**.
> No secret needed. The `etf-feed.yml` workflow then publishes
> `https://larryjclai.github.io/northstar/etf-sector-feed.json` weekly (and on
> `workflow_dispatch`). Until Pages is enabled, the workflow's deploy step fails
> harmlessly and the app still works from the bundled snapshot.

## 1. Purpose

Plan 068 shipped the 「ETF/基金」 sector bucket but its **weighted multi-sector split is
dormant** — nothing populates `AnalyticsPosition.sectorWeights`. The app's locked native
`fetch_yahoo` can't do Yahoo's crumb+cookie dance to reach `quoteSummary/topHoldings`, and
Finnhub/FMP free tiers are licence-gated (personal-use-only). The open-source **yfinance**
Python lib handles the session/crumb flow and returns ETF sector weights — and it's a
library, not a signed-ToS API, so the "no commercial use" clause that killed Finnhub does
**not** apply.

Strategy: fetch ETF sector weights **server-side via yfinance**, publish a **user-agnostic,
public reference feed** (public ETF facts only), and have the client pull it. The client
never reveals which ETFs the user holds → strictly **more** private than the client hitting
any provider directly.

## 2. Spike: pipeline + coverage results

Throwaway script: [`scratch/etf_sector_spike.py`](../scratch/etf_sector_spike.py) (NOT in
the app build). Given a ticker list it emits, per ticker:

```json
{ "<ticker>": { "sectorWeights": [{ "sector": "<yfinanceKey>", "weight": 0.39 }],
                "assetClasses": { "stockPosition": 0.999, "bondPosition": 0.0009, ... },
                "asOf": "2026-06-26T07:58:25Z" } }
```

Sample output captured at [`scratch/etf_feed_sample.json`](../scratch/etf_feed_sample.json).

**Coverage (real run, yfinance 1.2.0, 2026-06-26):**

| Ticker | Market | Sector weights | asset_classes | Notes |
|---|---|---:|:---:|---|
| VOO | US | 11 ✅ | Y | S&P 500 |
| VTI | US | 11 ✅ | Y | Total US market |
| QQQ | US | 11 ✅ | Y | Nasdaq-100 |
| VT | global | 11 ✅ | Y | All-world |
| VXUS | ex-US | 11 ✅ | Y | Total intl |
| 0050.TW | TW | 11 ✅ | Y | 元大台灣50 |
| 0056.TW | TW | 11 ✅ | Y | 元大高股息 |
| 006208.TW | TW | 11 ✅ | Y | 富邦台50 |
| 00679B.TW | TW | 0 ❌ | N | Bond ETF — `404` on `sector_weightings` (expected: bonds have no equity sectors) |

**Conclusion:** coverage is strong for **all equity ETFs** (US + intl + global + Taiwan),
8/8. The only miss is a **bond ETF**, which legitimately has no equity-sector breakdown —
those should fall through to the 「ETF/基金」 (or a future bond) bucket, not be treated as
a failure. `asset_classes` (stock/bond/cash %) comes back for every equity ETF and can flag
bond/mixed funds so the client can skip the equity-sector split for them.

## 3. Canonical sector mapping (through Plan 070)

yfinance returns Yahoo's snake_case GICS-ish keys. All **11 distinct keys** seen across the
sample map **cleanly, zero gaps** through `src/domain/canonicalSector.ts#toCanonicalSector`
(verified live this spike):

| yfinance key | → canonical (070) |
|---|---|
| `technology` | `technology` |
| `financial_services` | `financials` |
| `healthcare` | `healthcare` |
| `consumer_cyclical` | `consumer_cyclical` |
| `consumer_defensive` | `consumer_defensive` |
| `industrials` | `industrials` |
| `energy` | `energy` |
| `basic_materials` | `materials` |
| `realestate` | `real_estate` |
| `utilities` | `utilities` |
| `communication_services` | `communication` |

`GICS_NAME_TO_CANONICAL` in 070 already contains every one of these snake_case keys (it was
pre-seeded for 071), so **no taxonomy change is needed**. The server feed should store the
**canonical** key (mapped at build time through 070), keeping the client dumb. Weights sum to
~1.0 per ETF; the client scales by position value.

## 4. Feed schema (proposed for Phase 1)

A single static JSON file, user-agnostic, refreshed **weekly** (operator's cadence):

```jsonc
{
  "schemaVersion": 1,
  "source": "yahoo/yfinance@1.2.0",
  "generatedAt": "2026-06-26T07:58:25Z",
  "etfs": {
    "VOO": {
      "asOf": "2026-06-26T07:58:25Z",
      "assetClasses": { "stock": 0.999, "bond": 0.0, "cash": 0.001, "other": 0.0 },
      "sectorWeights": [            // canonical (070) keys, already mapped
        { "sector": "technology", "weight": 0.3913 },
        { "sector": "financials", "weight": 0.1092 }
        // ... sums ≈ 1.0
      ]
    }
    // 0050.TW, VT, ...
  }
}
```

Notes:
- **Canonical keys baked in** server-side → client never re-maps; 070 stays the single source
  of truth and the server simply imports the same table (or hardcodes the 11-entry map).
- `assetClasses` lets the client gate: if `stock` share is low (bond/mixed fund), skip the
  equity-sector split and use the bucket.
- Bond/empty ETFs are simply **absent** (or present with empty `sectorWeights`) → client
  treats a miss as "use 068 bucket".
- The feed is **keyed only by public ticker** and contains **only public ETF facts** — never
  a user id, never a log of who fetched what. (Invariant: the feed must stay USER-AGNOSTIC,
  or it becomes a readable holdings signal.)

## 5. Infra recommendation — `python-cron → static CDN JSON` (GH-Action-driven)

### What `worker/` looks like today
`worker/` is the **E2E-sync relay only** — `northstar-sync` (`wrangler.jsonc`): a single
`fetch` handler (`worker/src/index.ts`, 386 lines) routing encrypted-envelope sync over **D1**
(`DB` binding, 3 migrations). **No** `scheduled`/cron trigger, **no** R2 bucket, **no** KV. Its
entire job is opaque-ciphertext relay ("the server stores only opaque ciphertext"). Deployed
via `wrangler deploy`. There are **no static-asset CI workflows** yet (`.github/workflows/`
holds only `cla.yml` + `release.yml`).

### Options assessed
1. **Extend the Worker (`yahoo-finance2` Node lib + cron + R2/D1).** Viable, but: (a) it bolts
   a market-data scraper onto the privacy-critical **sync** worker, blurring a clean boundary
   (the sync worker's whole selling point is "stores only ciphertext" — adding a scraper +
   cache muddies that story); (b) `yahoo-finance2` is the **untested** path (yfinance is what
   the spike proved, incl. TW); (c) requires adding R2/cron to a worker that currently needs
   neither.
2. **Separate Python cron → static JSON on a CDN (RECOMMENDED).** yfinance is Python (native
   fit, the tested path incl. Taiwan ETFs). Output is one small static file. Served as a plain
   public CDN asset, the client GET is **indistinguishable from fetching any public file** — no
   per-user logging, no auth. Now that the repo is **public (MIT)**, **GitHub Actions is free
   and unlimited**, so a **scheduled GH Action** (`cron: weekly`) can `pip install yfinance`,
   run the spike-derived script, map through 070, and **commit/publish the feed** — to GitHub
   Pages, an `etf-feed` branch, or push to Cloudflare R2/Pages. Zero new always-on server; the
   "infra" is just a YAML workflow + a committed JSON file.

### Pick & why
**`python-cron` realized as a weekly scheduled GitHub Action publishing a static
`etf-sector-feed.json`.** It keeps the proven Python/yfinance path, keeps the sync worker
clean and single-purpose, costs nothing (free Actions on the now-public repo), and makes the
client fetch a generic public-file GET — the most privacy-neutral consumption possible. R2/Pages
or GitHub Pages are interchangeable static hosts for the published file; GH Pages is the
zero-extra-infra default, an R2 bucket is the upgrade if a custom domain / cache headers are
wanted. (If a Worker is ever wanted as a thin CDN front, it can serve the same static file
read-only — but it should **not** live inside the sync worker.)

## 6. Privacy mode — bundle + on-demand public pull

Two-tier, mirroring the existing bundled **bank-logo** pattern (`src/domain/bankLogoAssets.ts`
+ `public/bank/*`, injected at release time):

1. **Bundled common-ETF snapshot (zero-network common case).** Ship a small snapshot of the
   most common ETFs (VOO/VTI/QQQ/VT/VXUS/0050.TW/0056.TW/006208.TW/…) **inside the app build**,
   refreshed at release time. Most users hold these → the weighted split lights up with **no
   network at all**. Same mechanism as bundled logos (a static asset, optionally
   private-injected at package time).
2. **On-demand long-tail pull (a generic public GET).** For an ETF not in the bundled snapshot,
   the client fetches the **single static public feed file** (the whole feed, or — if split —
   a fixed public path), caches it locally with a **weekly TTL**. Because it pulls the *whole*
   public file (or a fixed path), the request body/URL **does not encode which ticker the user
   was missing** → no holdings leak.

**Confirmed: the client never does per-held-ticker authenticated queries.** It either reads a
bundled asset or does an unauthenticated GET of a public, user-agnostic file. No user id, no
ticker in the request that reveals holdings, no server log tying a fetch to a portfolio. This
is strictly more private than the client calling Yahoo/Finnhub per ticker.

**Phase-1 allowlist note (not done yet):** if the client fetches at runtime, add **one** tight
arm to `is_allowed_market_data_url` in `src-tauri/src/lib.rs` (+ vite parity) for the feed's
exact **host + fixed path prefix** — a single static URL, **no per-ticker query params** — the
same shape as the existing TWSE/TPEX/SITCA arms.

## 7. Country dimension — tiered (v1 = bucket)

yfinance returns **no ETF country/region breakdown** (confirmed). Tiered plan:

- **Direct holdings** — already local (plan 068 shipped); no feed needed.
- **Single-market ETFs** (0050.TW, 0056.TW, 006208.TW, QQQ, VOO, VTI…) → attribute to the
  **fund's home market** (TW / US). Derivable from the ticker suffix / listing, **no source
  required**.
- **True global / multi-country ETFs** (VT, VXUS) → **v1: a 「全球/多國」 bucket.** yfinance has
  no country field; deriving from `top_holdings` (top-10) × the 070 country map is a
  **follow-up**, not v1 (top-10 understates the long tail; the bucket is honest).

**Recommendation: ship the 「全球/多國」 bucket in v1; top-10 country-derive is a later option.**

## 8. ToS posture (operator to confirm)

yfinance scrapes Yahoo (general scraping greyness, not a signed-API violation). Contained
**server-side**, **cached**, **low-frequency (weekly)**, **one fetch serves all users**. The
client only ever sees stale-at-worst public data. Operator accepts this greyness — **record
explicitly at sign-off.**

## 9. Phase-1 build outline (after sign-off)

| Area | Files | Effort |
|---|---|---|
| Server job | `scratch/etf_sector_spike.py` → hardened `scripts/etf-feed/build_feed.py` (canonical-map via the 070 table, emit schema §4, pin yfinance version) | ~0.5d |
| Publish infra | `.github/workflows/etf-feed.yml` (weekly `cron`, `pip install`, run, commit/publish JSON to GH Pages or R2) | ~0.3d |
| Bundled snapshot | `private-assets/etf/etf-sector-feed.json` + inject step in `scripts/inject-private-assets.mjs` (mirror bank-logo path); a `src/domain/etfSectorAssets.ts` accessor | ~0.3d |
| Client feed module | `src/domain/etfSectorFeed.ts` — load bundled snapshot, optional public GET on miss, weekly-TTL local cache, expose `{ ticker → canonical sectorWeights }` | ~0.5d |
| Wire into analytics | populate `AnalyticsPosition.sectorWeights` (through 070); precedence **manual (069 `classificationLocked`) > fetched > 068 bucket**; coverage threshold → split else bucket; Σ = portfolio value | ~0.5d |
| Native allowlist | one arm in `src-tauri/src/lib.rs` `is_allowed_market_data_url` (host + fixed path, no per-ticker params) + vite parity — **only if** runtime fetch is enabled | ~0.2d |
| Tests | feed-parse → canonical `sectorWeights`; weighted split via real sample data; bond/empty → bucket; manual-lock precedence | ~0.4d |

**Total Phase 1 ≈ 1.5–2.5d.** Out of scope: valuation/returns math (attribution layer only);
precise global-ETF country; any yfinance/scraping in the Tauri client (server-side only).

## 10. Open questions for operator (sign-off gate)

1. **Infra pick:** confirm **GH-Action python-cron → static feed** (vs extending the sync
   worker). And the static host: **GitHub Pages** (zero extra infra) vs **Cloudflare R2/Pages**
   (custom domain / cache headers)?
2. **Privacy mode:** confirm **bundled snapshot + whole-file public pull** (no per-ticker
   request). Which ETFs go in the bundled snapshot (operator's real common set)?
3. **Country v1:** confirm **「全球/多國」 bucket** for true global ETFs (top-10 derive later)?
4. **ToS:** confirm acceptance of Yahoo-scraping greyness (server-side, cached, weekly).
5. **Bond/mixed ETFs:** OK to fall through to the 068 bucket in v1 (no bond-sector dimension
   yet), gated off `assetClasses`?
