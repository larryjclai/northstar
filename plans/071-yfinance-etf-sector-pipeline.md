# Plan 071: Server-side yfinance ETF sector (+country) pipeline → privacy-preserving client feed

> **Executor instructions**: This is a **design + spike-gated** plan that introduces the
> app's FIRST server component. Phase 0 stands up a minimal pipeline and validates coverage
> on the operator's real ETFs, then STOPS for sign-off on the infra + privacy mode before
> the client-side wiring (Phase 1). Respect the native URL allowlist (security) + the
> local-first/privacy invariant. If a STOP condition occurs, stop and report.

## Status
- **Priority**: P2 (feature; lights up 068's dormant ETF weighted-split)
- **Effort**: Phase 0 ~0.5d (script + coverage check); Phase 1 ~1.5–2.5d (feed + client)
- **Risk**: MED — external scraping lib (fragility) + a new server component + ToS-grey
- **Depends on**: 070 (canonical taxonomy — ETF weights map through it), 068 (`sectorWeights`
  plumbing already exists on `AnalyticsPosition`, currently never populated), 069 (manual lock)
- **Planned at**: commit `06fb3a97`, 2026-06-26

## Why this matters
068 shipped the ETF 「ETF/基金」 bucket but its **weighted multi-sector split is dormant** —
no source populated `sectorWeights`. The 068+Finnhub spikes proved: Yahoo `quoteSummary`
`topHoldings` IS the data, but the app's **locked native `fetch_yahoo` can't do the
crumb+cookie dance**, and Finnhub free is premium-gated + personal-use-only (licensing).
**Live-tested finding:** the open-source **yfinance** library (Python) DOES return
`funds_data.sector_weightings` for **US + international + Taiwan** ETFs (VT, VOO, VXUS,
0050.TW, 006208.TW all returned 11-sector weights) — because it handles the session/crumb
flow. It is NOT a signed-ToS API service, so the "free tier = no commercial use" clause that
kills Finnhub/FMP doesn't apply (only Yahoo's general scraping greyness, contained server-side).

So: fetch ETF sector weights **server-side via yfinance**, publish a generic reference feed,
and have the client pull it — never exposing holdings. This is strictly MORE private than the
client hitting any provider directly.

## Live spike facts (don't re-derive)
- `yfinance.Ticker(sym).funds_data.sector_weightings` → dict of 11 Yahoo sector keys
  (`technology`, `financial_services`, `realestate`, `consumer_cyclical`, …) → weight. Works
  for US/intl/**TW** ETFs. Also `.asset_classes` (stock/bond/cash %). **No** country/region field.
- Taxonomy: yfinance returns Yahoo's 11 GICS-ish keys (NOT the TWSE 行業 names) → must map
  through plan 070's `toCanonicalSector` so ETF slices land in the same canonical buckets.
- Country: yfinance gives no ETF country breakdown → use the tiered approach (below).

## Phase 0 — minimal pipeline + coverage validation (STOP gate)
1. A small standalone script (Python, `yfinance`) — NOT in the app build — that, given a list
   of ETF tickers, emits a JSON `{ ticker: { sectorWeights: [{sector, weight}], assetClasses,
   asOf } }`. Live-test it on the operator's actual ETFs (ask for the list, or use a broad
   set incl. TW + US + global).
2. Write `docs/etf-feed-pipeline.md`: the feed schema, coverage results, and the infra +
   privacy-mode recommendation (below). **STOP for operator sign-off** before Phase 1.

## Decision gate (operator signs off in Phase 0)
- **Infra (where the job + feed live):** RECOMMEND a **Python cron → static JSON on a CDN**
  (Cloudflare R2 / Pages, or any static host): yfinance is Python (native fit); the output is
  a small static file; serving it as a plain CDN asset means the client fetch is
  indistinguishable from fetching any public file (no per-user logging). (Alternative: a
  Cloudflare Worker with the Node `yahoo-finance2` lib — viable but yfinance/Python is the
  tested path. Decide + record.) Refresh cadence = **weekly** (operator already chose).
- **Privacy mode (how the client consumes):** RECOMMEND **bundle a small snapshot of common
  ETFs into the app build** (like the existing bundled bank-logo assets) for the zero-network
  common case + **pull the long-tail feed on demand** (a generic GET of a public file; never
  sends holdings up). Confirm the client never does per-held-ticker authenticated queries.
- **Country dimension (tiered):** direct holdings already local (068). ETFs:
  single-market ETFs → attribute to the fund's home market (derivable, no source); true global
  ETFs (VT/VXUS) → either approximate from yfinance `top_holdings` (top-10) × the 070 country
  map, or a 「全球/多國」 bucket for v1. Recommend the bucket for v1; top-10 derive as a follow-up.
- **ToS:** the operator accepts the Yahoo-scraping greyness (server-side, cached, low-frequency,
  one fetch serves all). Record explicitly.

## Phase 1 (after sign-off) — scope
**In scope:**
- The server-side job (in the recommended infra) producing the reference feed (sector weights
  keyed by ticker, canonical-mapped, `asOf`, source tag). Lives OUTSIDE the Tauri app build.
- A bundled common-ETF snapshot in the app (refreshed at release time) + a client module that
  loads it and optionally fetches the public feed for misses, caches locally (weekly TTL),
  and exposes `{ ticker → sectorWeights }`.
- Wiring those weights into `AnalyticsPosition.sectorWeights` so 068's weighted split lights up
  (mapped through 070's `toCanonicalSector`; coverage ≥ trustworthy threshold → split, else
  the 「ETF/基金」 bucket). Manual `classificationLocked` tag still wins (precedence
  manual > fetched > bucket).
- If the client fetches the feed at runtime: a tight allowlist arm for the feed's host+path in
  `src-tauri/src/lib.rs` (+ vite parity) — a single static URL, no per-ticker params.
- Tests: feed parse → canonical sectorWeights; the weighted split via real sample data.
**Out of scope:**
- `valuation.ts` / returns math (attribution layer only).
- Precise global-ETF country (paid EODHD) — v1 uses the bucket per the gate.
- Putting yfinance/scraping in the Tauri client (forbidden — server-side only).

## Commands you will need (Phase 1, app-side)
| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | all pass |
| Lint | `npm run lint` | exit 0 (0 errors) |
| Build | `npm run build` | exit 0 |
| Rust | `npm run check:tauri` | exit 0 (if lib.rs touched) |

## Git workflow
- Branch from current main (post-070): `git checkout -B advisor/071-yfinance-etf-feed main`.
- Commit the Phase-0 doc + script separately from the app-side wiring. Do NOT push/PR.

## Done criteria
- [ ] `docs/etf-feed-pipeline.md` records schema + coverage + infra/privacy/country/ToS decisions
- [ ] Server job emits a canonical-mapped per-ETF sector-weights feed (US+intl+TW)
- [ ] Client populates `sectorWeights` (through 070 taxonomy) → 068 weighted split lights up;
      manual > fetched > bucket; Σ = portfolio value
- [ ] Client consumption reveals NO holdings (bundled snapshot + generic public-file pull);
      any allowlist arm is a single static host+path
- [ ] No scraping/yfinance in the client; valuation/returns unchanged
- [ ] tsc 0; `npm test` all pass; lint 0 errors; build 0; check:tauri 0 (if lib.rs touched)

## STOP conditions
- yfinance coverage on the operator's real ETFs is poor (re-test + report before building the feed).
- Operator hasn't signed off on infra + privacy mode — do not build Phase 1.
- Wiring would require touching valuation/returns math — it must not; stop.

## Maintenance notes
- yfinance is the fragile part (community lib, breaks on Yahoo changes) — but server-side +
  cached means the client only ever sees stale-at-worst data; pin the version + watch upstream.
- The feed must stay USER-AGNOSTIC (public ETF facts only) — never key it by user or log who
  fetches, or it becomes a readable holdings signal (violates the local-first invariant).
- Coordinate taxonomy with 070; coordinate the manual-tag precedence with 069.
