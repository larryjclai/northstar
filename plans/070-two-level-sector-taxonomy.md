# Plan 070: Two-level sector taxonomy (canonical GICS-11 + fine industry), stored in the DB

> **Executor instructions**: Follow step by step. Run every verification command. The data
> layer has TWO impls (browser + Tauri SQLite) — keep them consistent, incl. the new SQLite
> column. Touch only in-scope files. If a STOP condition occurs, stop and report. Commit in
> the worktree. SKIP plans/README.md. Audit claims against tool results. Reply with EXACTLY
> the report format.
>
> **Drift check (run first)**:
> `git diff --stat <planned-at SHA>..HEAD -- src/domain/sectorLabels.ts src/domain/portfolioAnalytics.ts src/domain/types.ts src/data/repositories.ts`
> Builds on 068 (`buildSectorBreakdown`) + 069 (`classificationLocked`) — both MERGED.

## Status
- **Priority**: P2 (operator flagged "很重要")
- **Effort**: M (schema-ish field + two impls + a mapping table + breakdown change)
- **Risk**: MED (changes how the sector breakdown groups; finance-adjacent but not valuation)
- **Depends on**: 068 + 069 (MERGED). Pairs with plan 071 (yfinance ETF sector weights map
  through THIS taxonomy).
- **Planned at**: commit `06fb3a97`, 2026-06-26

## Why this matters
The sector breakdown silently **mixes two incompatible taxonomies**, so a cross-market
portfolio's sector chart is not meaningful:
- **TW stocks** → `sector` holds the TWSE 產業別 code (≈39 industries: 半導體業, 電子零組件業,
  金融保險業, 航運業 …) — see `sectorLabels.ts` `TWSE_INDUSTRY`.
- **US / international stocks (and yfinance ETF data, plan 071)** → `sector` holds a Yahoo
  GICS-ish name (11 sectors: Technology, Financial Services, Healthcare …) — see
  `GICS_SECTOR_ZH`.
A TW chip maker shows as 「半導體業」 while a US chip maker (and any ETF's tech slice) shows as
「資訊科技」 — same thing, never combined. Operator wants them aligned **into one canonical
taxonomy**, while **keeping the fine TW/industry detail** for a drill-down. Decision (operator):
**store BOTH levels in the DB.**

## Current state
- `src/domain/types.ts` — `PortfolioAsset` has `sector: string | null` and
  `industry: string | null` (lines ~165-166).
- `src/data/repositories.ts` — SQLite columns added via
  `ensureSqliteColumn("portfolio_assets","sector","text")` / `"industry"` (~2033-2034);
  sector/industry are threaded through `updateAssetClassification` (browser + SQLite ~2415),
  the manual-holding UPDATE (~2391), and the asset INSERT (~3810).
- `src/features/market-data/taiwanMarketDataProvider.ts` — for TW it sets BOTH
  `sector: company.industry` and `industry: company.industry` (the TWSE code; ~59-60).
- `src/features/market-data/yahooFinanceProvider.ts` — for US/intl it sets
  `sector` = Yahoo `sectorDisp` and `industry` = Yahoo `industryDisp` (finer; ~242-243).
- `src/domain/sectorLabels.ts` — `TWSE_INDUSTRY` (code→{zh,en}), `GICS_SECTOR_ZH`
  (English GICS→zh), `resolveSectorLabel`, `etfBucketLabel`.
- `src/domain/portfolioAnalytics.ts` — `buildSectorBreakdown` groups each holding by its
  `sector` (raw), resolved via `sectorLabelOf`; manual `classificationLocked` sector wins;
  ETFs without weights → 「ETF/基金」 bucket. (Plan 068.)

## Decision (implement this)
Introduce **one canonical taxonomy = the GICS 11 sectors** (it's the international standard
and exactly what Yahoo/yfinance already emit, so US + ETF data need no remap). Persist TWO
levels per asset:
- **Canonical (coarse)** — a NEW field `sectorCanonical: string | null` holding one of the 11
  canonical keys. The DEFAULT breakdown groups by this → cross-market coherent.
- **Fine (detail)** — the EXISTING `industry` field keeps the source detail (TWSE industry /
  Yahoo industry) for a drill-down / TW-only view. (`sector` stays as the raw source value;
  `sectorCanonical` is derived from it.)

The 11 canonical keys + zh/en labels (use these exact keys):
`technology` 資訊科技 · `financials` 金融 · `healthcare` 醫療保健 · `consumer_cyclical` 非必需消費 ·
`consumer_defensive` 必需消費 · `industrials` 工業 · `energy` 能源 · `materials` 原物料 ·
`real_estate` 房地產 · `utilities` 公用事業 · `communication` 通訊服務 · plus `other` 其他.

### TWSE 產業別 code → canonical (the load-bearing mapping — make it a tested table)
| canonical | TWSE codes (name) |
|---|---|
| technology | 13 電子工業, 24 半導體, 25 電腦及週邊, 26 光電, 28 電子零組件, 29 電子通路, 30 資訊服務, 31 其他電子, 36 數位雲端 |
| communication | 27 通信網路 |
| financials | 17 金融保險 |
| healthcare | 7 化學生技醫療, 22 生技醫療 |
| materials | 1 水泥, 3 塑膠, 8 玻璃陶瓷, 9 造紙, 10 鋼鐵, 11 橡膠, 21 化學工業 |
| industrials | 5 電機機械, 6 電器電纜, 14 建材營造, 15 航運, 35 綠能環保 |
| consumer_cyclical | 4 紡織, 12 汽車, 16 觀光餐旅, 18 貿易百貨, 32 文化創意, 34 電子商務, 37 運動休閒, 38 居家生活 |
| consumer_defensive | 2 食品, 33 農業科技 |
| utilities | 23 油電燃氣 |
| other | 19 綜合, 20 其他業, 80 管理股票 |

(Documented **judgment calls** — keep as comments so they're reviewable: 7 化學生技醫療→healthcare
not materials; 12 汽車→consumer_cyclical not industrials; 23 油電燃氣→utilities not energy. TWSE
has no clean real_estate/energy code in this list — fine, those buckets just come from Yahoo data.)

### Yahoo GICS name → canonical
Normalize the existing `GICS_SECTOR_ZH` keys onto the 11 (`"technology"/"information technology"`→
technology; `"financial services"/"financials"`→financials; `"communication services"`→
communication; `"real estate"/"realestate"`→real_estate; `"basic materials"`→materials;
`"consumer cyclical"`→consumer_cyclical; `"consumer defensive"`→consumer_defensive; etc.).
yfinance ETF keys (plan 071) use the same snake_case → align to these.

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | all pass |
| Mapping test | `npx vitest run src/domain/canonicalSector.test.ts` | pass |
| Lint | `npm run lint` | exit 0 (0 errors) |
| Build | `npm run build` | exit 0 |
| Rust | `npm run check:tauri` | exit 0 |

## Scope
**In scope:**
- `src/domain/canonicalSector.ts` (new) — the 11 canonical keys + zh/en labels +
  `toCanonicalSector(input: { sector?: string|null; industry?: string|null }): string|null`
  handling BOTH a TWSE numeric code and a Yahoo GICS name; + a unit test with the full table.
- `src/domain/types.ts` — `sectorCanonical?: string | null` on `PortfolioAsset`.
- `src/data/repositories.ts` — `ensureSqliteColumn("portfolio_assets","sector_canonical","text")`
  + row mapper + INSERT + the two UPDATEs; populate `sectorCanonical` (derive via
  `toCanonicalSector`) in `updateAssetClassification` (browser + SQLite); backfill old rows
  by deriving on read when the column is null (so no destructive migration needed).
- `src/features/market-data/{taiwanMarketDataProvider,yahooFinanceProvider}.ts` — set
  `sectorCanonical` alongside sector/industry (or let the repo derive it centrally — pick one
  place, document it).
- `src/domain/portfolioAnalytics.ts` — `buildSectorBreakdown` groups by `sectorCanonical`
  (resolved to label) by DEFAULT; the manual `classificationLocked` tag maps through
  `toCanonicalSector` too; ETF bucket unchanged. Add an optional `level: "canonical"|"industry"`
  param (default canonical) so a future drill-down can request the fine `industry` grouping.
- `src/domain/sectorLabels.ts` — add canonical-key→label resolution (reuse for both levels).
- Tests.
**Out of scope:**
- `valuation.ts` / cost-basis / returns math.
- The analytics-tab UI drill-down interaction (this plan makes the DATA two-level + the
  default canonical; a UI toggle is a follow-up — just don't hard-block it).
- yfinance ETF sector weights (plan 071 — but its weights map through `toCanonicalSector`).

## Git workflow
- Branch from current main: `git checkout -B advisor/070-canonical-sector-taxonomy main`.
- Short imperative commit. Do NOT push/PR.

## Steps
### Step 1: `canonicalSector.ts` (keys + labels + `toCanonicalSector`) + the full mapping test.
Verify: `npx vitest run src/domain/canonicalSector.test.ts` passes; tsc 0.
### Step 2: `sectorCanonical?` on PortfolioAsset; persist in both impls + `sector_canonical`
SQLite column (mapper/INSERT/UPDATEs); derive in `updateAssetClassification`; old rows derive
on read. Verify: tsc 0; `npm run check:tauri` 0.
### Step 3: providers set `sectorCanonical` (or central derive). Verify: tsc 0.
### Step 4: `buildSectorBreakdown` groups by canonical by default (+ `level` param for
industry); manual tag maps through canonical. Verify: tsc 0; analytics tests pass.
### Step 5: full verification — tsc 0; `npm test` all pass; lint 0 errors; build 0; check:tauri 0.

## Test plan
- `toCanonicalSector`: every TWSE code in the table → expected canonical; key Yahoo names →
  expected canonical; unknown/null → null; the documented judgment calls asserted explicitly.
- `buildSectorBreakdown` canonical: a portfolio with a TW 半導體 stock + a US Technology stock
  lands BOTH in `資訊科技` (the whole point); Σ buckets = portfolio value; `level:"industry"`
  still splits them by fine industry.
- Old asset with `sectorCanonical=null` but a TWSE `sector` code still groups correctly
  (derive-on-read). Existing tests stay green.

## Done criteria
- [ ] One canonical GICS-11 taxonomy; TW + US + (future) ETF data all map onto it
- [ ] Two levels PERSISTED: `sectorCanonical` (coarse) + `industry` (fine); browser ≡ SQLite
- [ ] Default sector breakdown is canonical (cross-market coherent); fine industry still available
- [ ] Old rows derive canonical on read (no destructive migration); manual tag maps through canonical
- [ ] valuation/returns untouched; Σ buckets = portfolio value
- [ ] tsc 0; `npm test` all pass; lint 0 errors; build 0; check:tauri 0
- [ ] No files outside scope modified

## STOP conditions
- Cited code doesn't match (drift since 06fb3a97).
- Adding `sector_canonical` isn't a clean `ensureSqliteColumn` add — report.
- Making the breakdown canonical would force a valuation/returns change — it must not; stop.

## Maintenance notes
- The TWSE→canonical table is the reviewable, finance-correctness-sensitive artifact — every
  bucket must be explainable; keep the judgment-call comments.
- Plan 071's yfinance ETF `sectorWeights` keys must be normalized through `toCanonicalSector`
  so ETF slices land in the same 11 buckets.
- A UI drill-down (canonical ⇄ industry toggle) is the natural follow-up now the data supports it.
