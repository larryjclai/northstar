# ETF Sector + Country Exposure — Data Provider Feasibility Spike

> **Status:** Spike (research only, no product code). **Date:** 2026-06-25.
> **Question:** Can **Finnhub's FREE tier** supply, for ETFs, both (1) sector/industry
> exposure and (2) country/region exposure, with usable coverage of a GLOBAL ETF universe
> (US + international + ideally Taiwan-listed, e.g. `0050.TW`)? This feeds a future plan to
> fetch ETF breakdowns server-side (Cloudflare Worker) and serve them to the app.
>
> **No account was created and no API key was obtained** (hard constraint). Findings are
> from Finnhub's official docs (read-only) plus keyless HTTP probes. Actual coverage of
> specific symbols must be verified by the operator with a real free key — see the last
> section.

---

## TL;DR Verdict

**Finnhub FREE cannot deliver this.** Every ETF endpoint on Finnhub — Profile, Holdings,
Sector Exposure, Country Exposure, Equity Allocation — is flagged **Premium** in Finnhub's
own API spec. Sector and country exposure are *not* on the free tier at all (not just
"US-only on free"): they are premium for **all** symbols, US included. So the gap is not a
region gap — it is that the entire `/etf/*` family is paywalled.

Separately, even on a paid Finnhub plan, only `/etf/profile` and `/etf/holdings` are
documented as having **"global coverage"**; `/etf/sector` and `/etf/country` carry **no
global-coverage claim** in the docs, and Finnhub is historically US-centric — so TW-listed
ETF (`0050.TW`) sector/country coverage is doubtful even after paying. (Must be verified.)

**Recommendation for a free server-side fetch:** No single free source covers sector **and**
country for a **global incl. TW** ETF set.
- **US ETFs:** **Alpha Vantage `ETF_PROFILE`** gives sector weights free (verified keyless
  below), but has **no country array** → country must come from elsewhere.
  **Financial Modeling Prep (FMP)** free has both ETF sector *and* country endpoints, but
  free is **US-exchanges-only** + 250 req/day.
- **Taiwan ETFs (`0050.TW`):** **no free API** returns sector/country for TW-listed ETFs.
  Practical path is the issuer/TWSE disclosure (e.g. 元大投信 0050 holdings sheet) parsed
  server-side, or a paid global-fundamentals provider (EODHD). This matches the repo's
  existing pattern of sourcing TW fund data directly (SITCA NAV, see commit `bd9904e0`).

---

## 1. Finnhub ETF endpoints (from finnhub.io/docs/api)

The docs page is a JS-rendered SPA; WebFetch only sees the header. The full OpenAPI-style
spec is embedded in the page HTML and was extracted via `curl`. Each operation object
carries a `"premium"` field: `null` = free, a non-null string = premium. This was
**validated** against known-free endpoints (Quote, Symbol Lookup, Recommendation Trends,
Basic Financials, Company Profile 2 → all `null`) and known-premium ones (Stock Candles,
Crypto Candles, Financial Statements → all `"Premium Access Required"`), so the parse is
trustworthy.

| Endpoint (path) | Summary | Premium flag in spec | Returns sector? | Returns country? | "Global coverage" claim? |
|---|---|---|---|---|---|
| `/etf/profile` | ETFs Profile | **`Premium required.`** | no (profile meta only) | no | **Yes** ("global coverage") |
| `/etf/holdings` | ETFs Holdings | **`Premium required.`** | no (constituent list) | no | **Yes** ("global coverage") |
| `/etf/sector` | ETFs Sector Exposure | **`Premium Access Required`** | **yes** | no | **No claim** |
| `/etf/country` | ETFs Country Exposure | **`Premium Access Required`** | no | **yes** | **No claim** |
| `/etf/allocation` | ETFs Equity Allocation | **`Premium Access Required`** | partial (asset class) | no | no claim |
| `/etf/list` | (supported-ETF list) | key required (401 keyless) | n/a | n/a | n/a |

**Schemas (from the embedded spec):**

- `ETFsSectorExposure`: `{ symbol, sectorExposure: ETFSectorExposureData[] }` where
  `ETFSectorExposureData = { industry: string, exposure: number /* percent, float */ }`.
  → It *does* return `{sector/industry, weight/exposure}` pairs. Good shape — but premium.
- `ETFsCountryExposure`: `{ symbol, countryExposure: ETFCountryExposureData[] }` where
  `ETFCountryExposureData = { country: string, exposure: number /* percent, float */ }`.
  → It *does* return `{country, weight/exposure}` pairs. Good shape — but premium.

**Keyless HTTP probes (read-only, no key):**

```
GET https://finnhub.io/api/v1/etf/sector?symbol=SPY    → HTTP 401 {"error":"Please use an API key."}
GET https://finnhub.io/api/v1/etf/country?symbol=SPY   → HTTP 401 {"error":"Please use an API key."}
GET https://finnhub.io/api/v1/etf/profile?symbol=SPY   → HTTP 401 {"error":"Please use an API key."}
GET https://finnhub.io/api/v1/etf/holdings?symbol=SPY  → HTTP 401 {"error":"Please use an API key."}
GET https://finnhub.io/api/v1/etf/list                 → HTTP 401 {"error":"Please use an API key."}
```

(401 only proves "key required"; it does **not** by itself prove premium. The **premium**
conclusion comes from the spec flags above, validated against known free/premium endpoints.)

**Source:** `https://finnhub.io/docs/api/etfs-sector-exposure` (and sibling
`/etfs-country-exposure`) — same embedded spec serves the whole API reference.

---

## 2. Coverage (US / international / Taiwan) on Finnhub

- **US ETFs (VOO, SPY, QQQ, VTI):** Endpoints exist and likely return data — but **only on a
  premium plan**, since `/etf/sector` and `/etf/country` are premium-flagged. Not free.
- **Broad-international (VT, VXUS):** Same — premium-gated. `/etf/profile` and
  `/etf/holdings` claim "global coverage" (paid), but the *exposure* endpoints make no such
  claim.
- **Taiwan-listed (`0050.TW`):** **Unverified / doubtful even on paid.** `/etf/sector` and
  `/etf/country` carry no global-coverage statement, and Finnhub's exposure data is
  historically US-centric. Cannot be confirmed without a key, and there's no evidence it's
  covered. The supported-ETF list (`/etf/list`) is itself behind the key (401), so coverage
  can't be enumerated keylessly.

**Bottom line on coverage:** moot for the free question — sector/country are premium for *all*
regions. For a future paid evaluation, US/intl are plausible; TW is the real risk.

---

## 3. Free-tier limits (Finnhub)

- **Rate limit:** **60 API calls / minute** on the free tier (also ~30 calls/second burst).
  Widely documented; consistent across Finnhub marketing + third-party writeups.
- **Monthly cap:** No hard monthly call cap on free beyond the per-minute throttle; access is
  gated by **endpoint** (premium endpoints simply 403/require upgrade), not by a monthly
  quota.
- **Commercial-use / redistribution:** Finnhub's free tier is positioned for
  **non-professional / personal use**; signup requires asserting non-professional status, and
  commercial/professional use requires a paid plan + written approval. **Caching and
  redistributing derived data via our own server (a finance app) is a commercial use and is
  not covered by the free tier ToS.** This alone disqualifies Finnhub-free for the
  server-side-fetch-and-serve model, independent of the premium-endpoint issue. (Confirm exact
  current wording in Finnhub ToS before relying on any plan.)

---

## 4. Fallback alternatives (free ETF sector AND country?)

One line each. "Country" is the scarce dimension; most free ETF APIs give sector but not country.

| Provider | Free? | Sector exposure | Country exposure | Intl ETF | TW ETF (`0050.TW`) | Key required | Notes |
|---|---|---|---|---|---|---|---|
| **Finnhub** | endpoints **premium** | yes (premium) | yes (premium) | paid only | unverified/doubtful | yes | All `/etf/*` premium; free = non-commercial only |
| **Alpha Vantage** | **yes** (`ETF_PROFILE`) | **yes** `sectors[{sector,weight}]` | **no** (holdings only, no country array) | partial | **no** | yes (free, 25 req/day) | Verified keyless w/ `demo`: returns `sectors[]`, **no country** |
| **Financial Modeling Prep** | **yes** (250 req/day) | **yes** (sector-weighting ep) | **yes** (country-weighting ep) | **paid** (free = US exchanges only) | **no** (not on free) | yes (free) | Best free *shape* (both dims) but **US-only** on free |
| **EOD Historical Data (EODHD)** | trial only (20/day, US) | yes (sector weights breakdown) | yes (world-regions breakdown) | **yes (paid)** — 10k+ ETFs, many exchanges | likely (paid, TW exchange supported) | yes | Strongest **global incl. TW** but **paid**; closest single paid source |
| **Twelve Data** | limited free credits | not a clear dedicated exposure ep | not a clear dedicated exposure ep | ETF data 50 countries (higher tiers) | maybe (paid) | yes | No clear free sector+country exposure endpoint |
| **Yahoo Finance** | (already known) | HTML-only/blocked | HTML-only/blocked | partial | TW blocked/HTML-only | no | Not usable as an API; excluded |

---

## 5. Recommendation (best free option for server-side fetch)

There is **no single free source** that covers ETF **sector + country** for a **global,
TW-inclusive** universe. The realistic shape of a free/cheap solution is a **mix**, and TW is
the part that has no free answer:

1. **US ETFs (VOO/SPY/QQQ/VTI/VT/VXUS):**
   - **Sector:** Alpha Vantage `ETF_PROFILE` (free, sector weights) **or** FMP sector-weighting (free, US).
   - **Country:** FMP country-weighting (free, US-only) — Alpha Vantage has no country dimension.
   - → A free combo works for **US-listed** ETFs, subject to each provider's
     low free quotas (AV 25/day, FMP 250/day) and **non-commercial** caveats. Verify each
     provider's free-tier license actually permits caching + serving derived data from our
     server; some free tiers restrict redistribution.
2. **Taiwan ETFs (`0050.TW` etc.):** No free API. Options, in order of fit with this repo:
   - **Issuer / TWSE disclosure parse** (e.g. 元大投信 0050 holdings + the underlying index's
     sector/country, or fund factsheet) parsed server-side — consistent with the repo's
     existing "go to the Taiwan source directly" pattern (SITCA NAV, commit `bd9904e0`;
     ETF-sector spike plan 068). For a broad-market TW ETF, sector/country can also be
     **derived from holdings** mapped to a sector/country reference.
   - **Paid global provider (EODHD)** if a single vendor for both US + intl + TW is preferred
     and a small monthly cost is acceptable. EODHD is the strongest *single* source for
     global incl. TW, but it is **not free**.

**Net recommendation:** Do **not** build on Finnhub free (premium endpoints + non-commercial
ToS). For a free path, use **FMP (US: sector+country) + Alpha Vantage (US sector backup)**,
and treat **TW separately** via issuer/TWSE disclosure or a paid global feed (EODHD). If the
project wants *one* vendor for global+TW and can pay, **EODHD** is the front-runner — but that
exits the "free" question.

---

## 6. What's needed to verify for real (operator must supply a key)

I **cannot** create a Finnhub (or FMP / AV / EODHD) account or obtain a key. Real coverage
testing requires the **operator** to generate a **free** key and run the probes below. The
spec already tells us the `/etf/sector` and `/etf/country` endpoints are premium — so the
**first useful test is whether a free key gets 403/"premium" on these**, confirming the
paywall, and then whether a (hypothetical) paid key returns data for `0050.TW`.

**Finnhub — confirm free-tier paywall + (if upgraded) TW coverage:**
```bash
KEY="<FINNHUB_FREE_KEY>"
# Expect 403 / premium error on FREE for these (confirms sector/country are paywalled):
curl -s "https://finnhub.io/api/v1/etf/sector?symbol=VOO&token=$KEY"   | head -c 400; echo
curl -s "https://finnhub.io/api/v1/etf/country?symbol=VT&token=$KEY"   | head -c 400; echo
# Whether 0050.TW is even a known symbol / covered (needs paid to return data):
curl -s "https://finnhub.io/api/v1/etf/sector?symbol=0050.TW&token=$KEY"  | head -c 400; echo
curl -s "https://finnhub.io/api/v1/etf/country?symbol=0050.TW&token=$KEY" | head -c 400; echo
# Enumerate which ETFs Finnhub claims to support (also key-gated):
curl -s "https://finnhub.io/api/v1/etf/list?token=$KEY" | head -c 800; echo
```

**Financial Modeling Prep — does free return sector+country, and is TW present?**
```bash
FMP="<FMP_FREE_KEY>"
# US (expect data on free): sector + country weightings
curl -s "https://financialmodelingprep.com/stable/etf-sector-weightings?symbol=VOO&apikey=$FMP"  | head -c 400; echo
curl -s "https://financialmodelingprep.com/stable/etf-country-weightings?symbol=VT&apikey=$FMP"  | head -c 400; echo
# TW (expect empty / 'not available on free' — free is US exchanges only):
curl -s "https://financialmodelingprep.com/stable/etf-country-weightings?symbol=0050.TW&apikey=$FMP" | head -c 400; echo
```

**Alpha Vantage — sector present, country absent (already shown keyless w/ demo):**
```bash
AV="<ALPHAVANTAGE_FREE_KEY>"
# Returns sectors[]; note: NO country array exists in this payload:
curl -s "https://www.alphavantage.co/query?function=ETF_PROFILE&symbol=VOO&apikey=$AV" | head -c 800; echo
# TW (expect empty/n/a — AV ETF_PROFILE is US-centric):
curl -s "https://www.alphavantage.co/query?function=ETF_PROFILE&symbol=0050.TW&apikey=$AV" | head -c 400; echo
```

Already established **keyless** during this spike (no key needed, reproducible now):
```bash
# Alpha Vantage demo key — proves ETF_PROFILE returns sectors[] but no country dimension:
curl -s "https://www.alphavantage.co/query?function=ETF_PROFILE&symbol=QQQ&apikey=demo"
# Finnhub keyless — proves key is required (401) for every /etf/* endpoint:
curl -s "https://finnhub.io/api/v1/etf/sector?symbol=SPY"   # → 401 "Please use an API key."
```

---

## Sources
- Finnhub API docs (embedded spec): `https://finnhub.io/docs/api/etfs-sector-exposure`,
  `https://finnhub.io/docs/api/etfs-country-exposure`
- Finnhub pricing: `https://finnhub.io/pricing` (JS shell; free = 60 calls/min, non-pro use)
- Alpha Vantage docs: `https://www.alphavantage.co/documentation/` (`ETF_PROFILE`; free 25 req/day)
- FMP docs: `https://site.financialmodelingprep.com/developer/docs/stable/sector-weighting`,
  `.../stable/country-weighting`; pricing/FAQ (free 250 req/day, US exchanges only)
- EODHD: `https://eodhd.com/financial-apis/stock-etfs-fundamental-data-feeds` (10k+ ETFs,
  multi-exchange, paid; free trial 20/day US)
- Twelve Data: `https://twelvedata.com/etf`, `https://twelvedata.com/pricing`
