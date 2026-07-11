# Plan 152: Find Taiwan stocks/ETFs by Chinese name in ticker search

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat da946482..HEAD -- src/features/market-data/taiwanMarketDataProvider.ts src/features/market-data/taiwanMarketDataProvider.test.ts src/features/market-data/useSymbolSearch.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED (touches the search merge path used by every ticker field)
- **Depends on**: none (composes with plan 151, which touches a different provider)
- **Category**: bug
- **Planned at**: commit `da946482`, 2026-07-11

## Why this matters

The operator wants ticker search to find stocks by **name**, not just code —
English and Chinese. The advisor verified empirically (2026-07-11) against the
exact Yahoo endpoint+params the app uses (`/v1/finance/search`,
`lang=zh-Hant-TW&region=TW`):

- `台積電` → **0 results**. `富邦金` → **0 results**. Yahoo's search does not
  resolve pure-Chinese equity names.
- `Apple` → AAPL etc. English names already work via Yahoo — nothing to build
  there.
- `元大台灣50` → works only because the digits happen to match.

So Chinese-name search must be served **locally**. The app already downloads
and caches everything needed: the TWSE/TPEx company directories (with Chinese
names) and the TWSE `STOCK_DAY_ALL` list (all TWSE securities incl. ETFs, with
Chinese short names like 台積電). This plan adds a local name/code search over
those caches and merges it into the search hook.

## Current state

- `src/features/market-data/taiwanMarketDataProvider.ts` — Taiwan open-data
  provider. Today it only *enriches known symbols* with Chinese names/industry
  (`fetchAssetProfiles`); it has no search. Key excerpts as of `da946482`:

  ```ts
  interface TaiwanOpenDataRow {
    "公司代號"?: string;
    "公司名稱"?: string;
    "公司簡稱"?: string;
    "產業別"?: string;
  }

  interface TaiwanCompany {
    code: string;
    symbol: string;
    nameZh: string;
    industry: string | null;
    market: TaiwanMarket; // "TWSE" | "TPEx"
  }
  ```

  `rowToCompany` (lines 173–185) currently keeps only ONE name:
  ```ts
  const nameZh = clean(row["公司名稱"]) ?? clean(row["公司簡稱"]);
  ```
  ⚠️ `公司名稱` is the FULL legal name (e.g. 台灣積體電路製造股份有限公司); the
  name users type is the SHORT name `公司簡稱` (台積電). The search must match
  the short name, so it needs to be captured separately.

  Module-level caches (lines 45–47) — reuse them, do not add a new fetch path:
  ```ts
  let companyCache: { updatedAt: number; companies: TaiwanCompany[] } | null = null;
  let securityNamesCache: { updatedAt: number; names: Map<string, string> } | null = null;
  const cacheMaxAgeMs = 24 * 60 * 60 * 1000;
  ```
  `fetchCompanies()` fills the first (TWSE `.TW` + TPEx `.TWO` companies);
  `fetchSecurityNames()` fills the second (TWSE `STOCK_DAY_ALL`: code → 短名,
  covers ETFs; keys both `"00878"` and `"00878.TW"`). Both fail soft.

- `src/features/market-data/useSymbolSearch.ts` — the debounced hook every
  ticker field uses. Current merge (lines 30–64, abbreviated):

  ```ts
  const [yahoo, funds] = await Promise.allSettled([
    provider.searchSymbols(trimmed),
    sitcaProvider.searchFunds(trimmed),
  ]);
  // ... enrich yahoo items with tw profiles ...
  const seen = new Set(enrichedYahoo.map((r) => r.symbol));
  const uniqueFunds = fundItems.filter((f) => !seen.has(f.symbol));
  setResults([...enrichedYahoo, ...uniqueFunds]);
  ```

  The hook already instantiates `const twProvider = new TaiwanMarketDataProvider();`
  at module level (line 8).

- `src/features/market-data/provider.ts` — `SymbolSearchResult` shape:
  `{ symbol, name, currency?, exchange?, typeLabel?, assetType? }`.

- `src/components/TickerSearchField.tsx:28` uppercases input on change
  (`event.target.value.toUpperCase()`). This is harmless for CJK (no case) and
  wanted for codes — do not change it.

- `src/features/market-data/taiwanMarketDataProvider.test.ts` — tests the pure
  `parseSecurityNames`. Follow its style: export pure functions, feed
  hand-built rows.

## Commands you will need

| Purpose   | Command                                        | Expected on success |
|-----------|------------------------------------------------|---------------------|
| Typecheck | `npx tsc`                                      | exit 0              |
| Tests     | `npx vitest run src/features/market-data/`     | all pass            |
| Full tests| `npm test`                                     | all pass            |
| Lint      | `npm run lint`                                 | exit 0              |
| Live check (optional, needs network) | `curl -s "https://openapi.twse.com.tw/v1/opendata/t187ap03_L" \| head -c 600` | JSON rows containing `公司簡稱` |

## Scope

**In scope** (the only files you should modify):
- `src/features/market-data/taiwanMarketDataProvider.ts`
- `src/features/market-data/taiwanMarketDataProvider.test.ts`
- `src/features/market-data/useSymbolSearch.ts`

**Out of scope** (do NOT touch, even though they look related):
- `src/features/market-data/yahooFinanceProvider.ts` — English-name search
  already works through it; leave the Yahoo params alone.
- `src/components/TickerSearchField.tsx` — the uppercase behavior stays.
- `src/features/market-data/sitcaFundProvider.ts` — plan 151's territory.
- Quote fetching / asset profiles — search only.

## Git workflow

- Branch: `fix/ai-ticker-search-zh-names`
- Commit style: conventional commits, e.g.
  `feat(market-data): local Chinese-name search for TW stocks and ETFs`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Capture the short company name

In `taiwanMarketDataProvider.ts`:

1. Add `nameShort: string | null;` to `TaiwanCompany`.
2. In `rowToCompany`, set `nameShort: clean(row["公司簡稱"])` and keep `nameZh`
   as-is (full-name-preferring — display behavior elsewhere must not change).

**Verify**: `npx tsc` → exit 0.

### Step 2: Add a pure filter + a provider search method

1. Export a **pure** function (same testability convention as
   `parseSecurityNames`):

   ```ts
   export function filterTaiwanSecurities(
     companies: TaiwanCompany[],
     securityNames: Map<string, string>,
     query: string,
     max = 10,
   ): SymbolSearchResult[]
   ```

   Matching rules (case-insensitive on the trimmed query; skip when the
   trimmed query is shorter than 2 characters — mirrors the hook's guard):
   - a company matches when `code`, `nameShort`, or `nameZh` contains the query;
   - result: `{ symbol: company.symbol, name: company.nameShort ?? company.nameZh,
     exchange: company.market, typeLabel: "股票", assetType: "equity",
     currency: "TWD" }`;
   - then scan `securityNames` for entries whose **key has the `.TW` suffix**
     (skip the bare-code duplicate keys) and whose name contains the query,
     **excluding symbols already matched from companies** — these are the
     TWSE ETFs and other non-company securities:
     `{ symbol: key, name, exchange: "TWSE", typeLabel: "ETF/證券",
     assetType: "etf", currency: "TWD" }`;
   - cap the combined list at `max`, companies first.

   You will need to type the second parameter with the existing `SitcaFund`-style
   local interfaces; import `SymbolSearchResult` from `./provider` (already
   imported? — it is not; add it as a type-only import).

2. Add a method to the class, reusing the existing cached fetchers and failing
   soft exactly like `SitcaFundProvider.searchFunds`:

   ```ts
   async searchSecurities(query: string, max = 10): Promise<SymbolSearchResult[]> {
     if (query.trim().length < 2) return [];
     try {
       const companies = await fetchCompanies();
       let names: Map<string, string>;
       try { names = await fetchSecurityNames(); } catch { names = new Map(); }
       return filterTaiwanSecurities(companies, names, query, max);
     } catch {
       return [];
     }
   }
   ```

**Verify**: `npx tsc` → exit 0.

### Step 3: Merge into `useSymbolSearch`

In `useSymbolSearch.ts`, extend the parallel fetch:

```ts
const [yahoo, funds, twLocal] = await Promise.allSettled([
  provider.searchSymbols(trimmed),
  sitcaProvider.searchFunds(trimmed),
  twProvider.searchSecurities(trimmed),
]);
```

Merge order and dedup (Yahoo stays first — it has richer type labels and its
items get profile-enriched; local TW results fill in what Yahoo can't find):

```ts
const twItems = twLocal.status === "fulfilled" ? twLocal.value : [];
const seen = new Set(enrichedYahoo.map((r) => r.symbol));
const uniqueTw = twItems.filter((r) => !seen.has(r.symbol));
uniqueTw.forEach((r) => seen.add(r.symbol));
const uniqueFunds = fundItems.filter((f) => !seen.has(f.symbol));
setResults([...enrichedYahoo, ...uniqueTw, ...uniqueFunds]);
```

Keep the existing error rule but extend it so the "Yahoo failed" warning only
shows when there are no local results either:
`yahoo.status === "rejected" && uniqueTw.length === 0 && uniqueFunds.length === 0`.

**Verify**: `npx tsc` → exit 0.

### Step 4: Tests

In `taiwanMarketDataProvider.test.ts`, new `describe("filterTaiwanSecurities")`
with hand-built fixtures:

- companies: `{ code: "2330", symbol: "2330.TW", nameZh: "台灣積體電路製造股份有限公司", nameShort: "台積電", industry: "半導體業", market: "TWSE" }`
  and one TPEx company (e.g. `5483.TWO` / 中美晶 style) — assert:
  - query `"台積電"` → 1 result, symbol `2330.TW`, name `台積電`;
  - query `"2330"` → same result (code path);
  - query `"積體電路"` → same result (full-name path);
  - TPEx company query returns the `.TWO` symbol with `exchange: "TPEx"`.
- securityNames map: `{ "0050.TW" → "元大台灣50", "0050" → "元大台灣50", "2330.TW" → "台積電", "2330" → "台積電" }` — assert:
  - query `"元大台灣"` → includes `0050.TW` exactly once (bare-code key skipped);
  - a query matching both a company and the same symbol in securityNames
    returns it only once (company wins);
  - `max` caps the result count;
  - query `"台"` (1 char)… note the length guard lives in `searchSecurities`,
    not the pure filter — assert whichever you implement; keep guard placement
    as specified in Step 2.

**Verify**: `npx vitest run src/features/market-data/` → all pass.

### Step 5: Live verification in the preview

Start the dev server (`.claude/launch.json` → `northstar-dev`), open a ticker
search field (投資 → 匯入現有持倉 or any holding form / 設定 → 一般 benchmark
field), type `台積電`, and confirm `2330.TW 台積電` appears. Also type `0050`
and `Apple` to confirm no regression in code/English search. Screenshot for
the report.

## Test plan

Covered in Step 4 (pure-filter unit tests; the hook itself has no test file
today — do not create one, the merge logic is exercised by the live check).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc` exits 0
- [ ] `npm test` exits 0; `filterTaiwanSecurities` tests exist and pass
- [ ] `grep -n "searchSecurities" src/features/market-data/useSymbolSearch.ts` → 1 match
- [ ] `npm run lint` exits 0
- [ ] Preview check: `台積電` yields `2330.TW` in the dropdown (screenshot)
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts.
- The TWSE dataset turns out not to carry `公司簡稱` (verify with the optional
  curl in Commands if in doubt) — the name source assumption would be wrong.
- Yahoo result enrichment (`fetchAssetProfiles`) conflicts with the merge in a
  way requiring changes to `yahooFinanceProvider.ts`.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- Plan 151 (SITCA cert-code search) is independent; if both land, re-run the
  full market-data test folder once after the second merge.
- TPEx ETFs (e.g. 00679B-style bond ETFs listed on TPEx) are NOT covered by
  `STOCK_DAY_ALL` (TWSE only) nor the company directory; if users report a
  missing TPEx ETF by name, the TPEx equivalent endpoint is a follow-up.
- English names for TW stocks are intentionally not indexed locally (Yahoo
  handles `TSMC` → ADR; the `.TW` listing by English name is a rare ask).
- The 24 h cache means a brand-new listing appears in name search a day late;
  acceptable.
