# Plan 092: Resolve Chinese names for Taiwan ETFs (ticker search shows English)

> **Executor instructions**: Follow step by step. Run every verification command. Touch only
> the in-scope files. NEVER push, NEVER touch `main`. Branch off `main`.

## Status
- **Priority**: P2 (UX: zh-TW users see English ETF names)
- **Effort**: M  •  **Risk**: LOW-MED (adds a data source + two allowlist entries; the live fetch is Tauri/proxy-gated)
- **Depends on**: none  •  **Category**: bug / feature gap
- **Planned at**: commit `a1aaece5`, 2026-06-28

## Why this matters
Ticker search shows ETFs by their **English** name (e.g. searching `00878` returns
"CATHAY SECS INV TRUST CO LTD TA") even when the user's locale is zh-TW. Root cause:
`TaiwanMarketDataProvider.fetchAssetProfiles` only sources Chinese names from the TWSE/TPEx
**`t187ap03`** datasets, which are **listed-company** basic data (it reads `公司代號` / `公司名稱`).
**ETFs are not companies**, so they're absent → no `nameZh` → the search (`useSymbolSearch`)
falls back to Yahoo's English name. Regular stocks (e.g. `2330` → 台積電) work because they ARE
companies. This plan adds a TWSE all-securities name source (which DOES include ETFs) as a
**fallback** in `fetchAssetProfiles`. Because `useSymbolSearch` already replaces the display name
with `nameZh` when present, the search box (and holdings name resolution app-wide) will show the
Chinese ETF name with **no change to the search code**.

## The data source (verified)
TWSE OpenAPI `https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL` — "每日收盤行情(全部)" —
returns an array of ALL TWSE-listed securities **including ETFs**, with these keys:
`Date, Code, Name, TradeVolume, TradeValue, OpeningPrice, HighestPrice, LowestPrice, ClosingPrice,
Change, Transaction`. The security code is **`Code`** and the Chinese name is **`Name`** (e.g.
`Code: "0050", Name: "元大台灣50"`; `00878` → "國泰永續高股息"). This was confirmed live on
2026-06-28. It is a daily dataset — cache it like the company dataset (24h).

> TPEx-listed (`.TWO`) ETFs are NOT covered by this TWSE endpoint and are a documented follow-up
> (the TPEx daily-quote OpenAPI endpoint must be confirmed separately — see Maintenance notes).
> The user's case (00878.TW) and the vast majority of popular Taiwan ETFs are TWSE-listed.

## Current state (the code to extend)
`src/features/market-data/taiwanMarketDataProvider.ts`:
- `DATASETS` array holds the two t187ap03 company datasets (`jsonUrl`/`csvUrl`/`suffix`).
- `fetchCompanies()` fetches them (cached 24h in `companyCache`), `buildCompanyMap()` keys by
  code/symbol.
- `fetchAssetProfiles(symbols)`: for each wanted symbol, `byKey.get(symbol) ?? byKey.get(stripMarketSuffix(symbol))`;
  on a hit it returns `{ symbol, nameZh: company.nameZh, nameEn: null, assetType: "equity", sector, industry }`.
  On a MISS it currently returns nothing for that symbol — **this is where ETFs fall through.**
- `fetchMarketData(url, responseType)` routes through the Tauri command `fetch_market_data` (app) or
  the `/api/market-data?url=` vite proxy (browser). Both enforce a URL allowlist (see below).
- `rowToCompany(row, dataset)` reads `公司代號` + `公司名稱`/`公司簡稱` (a DIFFERENT row shape than
  STOCK_DAY_ALL's `Code`/`Name` — you need a separate parser).

The **two** allowlists that gate `fetchMarketData` (both must be extended):
- `src-tauri/src/lib.rs` `is_allowed_market_data_url` (~line 163):
  `Some("openapi.twse.com.tw") => url.path().starts_with("/v1/opendata/t187ap03_L"),`
- `vite.config.ts` `isAllowedMarketDataUrl` (~line 129):
  `if (url.hostname === "openapi.twse.com.tw") return url.pathname.startsWith("/v1/opendata/t187ap03_L");`

`useSymbolSearch.ts` already does: `const profiles = await twProvider.fetchAssetProfiles(symbols); ... if (tw && tw.nameZh) return { ...item, name: tw.nameZh };` — so **no change needed there.**

### Conventions
- The new source is a **fallback only**: a real company (in t187ap03) keeps its richer profile
  (industry/sector). Only when the company lookup misses do we use the securities-name map.
- Best-effort: a STOCK_DAY_ALL fetch failure must not break the company path or the search
  (wrap in try/catch; `Promise.allSettled` style). Keep the existing 24h cache pattern.
- Keep a pure, unit-testable row parser (mirror `rowToCompany`'s purity; there are existing tests
  in the market-data area to model on).

## Commands
| Install | `npm install` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Rust check (allowlist compiles) | `npm run check:tauri` | exit 0 |
| Tests | `npm test` | all pass |
| Lint | `npm run lint` | exit 0 (0 errors) |

## Scope
**In scope**:
- `src/features/market-data/taiwanMarketDataProvider.ts` — add the STOCK_DAY_ALL fetch + parser + fallback in `fetchAssetProfiles`
- `src-tauri/src/lib.rs` — allow the STOCK_DAY_ALL path in `is_allowed_market_data_url`
- `vite.config.ts` — allow the STOCK_DAY_ALL path in `isAllowedMarketDataUrl`
- `src/features/market-data/taiwanMarketDataProvider.test.ts` — test the new row parser (create if absent)
**Out of scope**: `useSymbolSearch.ts` (already consumes `nameZh` — no change); the SITCA fund path
(091, separate); the Yahoo provider; the company (t187ap03) path; TPEx ETFs (follow-up).

## Git workflow
- Branch: `fix/ai-etf-chinese-names` (off `main`)
- Commit: `fix(market-data): resolve Chinese names for Taiwan ETFs via TWSE STOCK_DAY_ALL`
- Do NOT push.

## Steps

### Step 1: Allowlist the new endpoint (BOTH places)
- `src-tauri/src/lib.rs`, in `is_allowed_market_data_url`, extend the `openapi.twse.com.tw` arm to also
  allow the new path:
  ```rust
  Some("openapi.twse.com.tw") => {
      url.path().starts_with("/v1/opendata/t187ap03_L")
          || url.path() == "/v1/exchangeReport/STOCK_DAY_ALL"
  }
  ```
- `vite.config.ts`, in `isAllowedMarketDataUrl`, extend the matching line:
  ```ts
  if (url.hostname === "openapi.twse.com.tw")
    return url.pathname.startsWith("/v1/opendata/t187ap03_L")
      || url.pathname === "/v1/exchangeReport/STOCK_DAY_ALL";
  ```

**Verify**: `npm run check:tauri` → exit 0 (Rust compiles); `npx tsc --noEmit` → exit 0.

### Step 2: Fetch + parse the securities-name dataset
In `taiwanMarketDataProvider.ts` add:
- A module constant `const STOCK_DAY_ALL_URL = "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL";`
- A pure parser, e.g.:
  ```ts
  interface TwseSecurityRow { Code?: string; Name?: string }
  /** Map TWSE STOCK_DAY_ALL rows → { `<code>.TW` : nameZh }. Pure. */
  export function parseSecurityNames(rows: TwseSecurityRow[]): Map<string, string> {
    const map = new Map<string, string>();
    for (const row of rows) {
      const code = clean(row.Code);
      const name = clean(row.Name);
      if (!code || !name) continue;
      map.set(`${code}.TW`, name);
      map.set(code, name);
    }
    return map;
  }
  ```
  (Reuse the existing `clean()` helper in this file.)
- A cached fetch `fetchSecurityNames(): Promise<Map<string,string>>` mirroring `fetchCompanies`'s
  cache shape (a module-level `securityNamesCache` with the same 24h `cacheMaxAgeMs`), calling
  `fetchJsonRows(STOCK_DAY_ALL_URL)` and `parseSecurityNames(...)`. On error return an empty Map
  (best-effort).

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Use it as a fallback in `fetchAssetProfiles`
In `fetchAssetProfiles`, fetch the securities-name map alongside the companies (best-effort), and
when the company lookup misses, fall back to the securities name:
```ts
const companies = await fetchCompanies();
const byKey = buildCompanyMap(companies);
let securityNames: Map<string, string>;
try { securityNames = await fetchSecurityNames(); } catch { securityNames = new Map(); }

for (const symbol of wanted) {
  const company = byKey.get(symbol) ?? byKey.get(stripMarketSuffix(symbol));
  if (company) {
    result[symbol] = { symbol, nameZh: company.nameZh, nameEn: null, assetType: "equity", sector: company.industry, industry: company.industry };
    continue;
  }
  const nameZh = securityNames.get(symbol) ?? securityNames.get(stripMarketSuffix(symbol));
  if (nameZh) {
    result[symbol] = { symbol, nameZh, nameEn: null, assetType: "etf", sector: null, industry: null };
  }
}
```
Confirm `assetType: "etf"` and `sector: null` are valid for the `AssetProfile` type; if the type
doesn't allow `"etf"` or null sector, use the nearest valid values (e.g. `assetType: "equity"`) and
note it — do NOT change the `AssetProfile` type.

**Verify**: `npx tsc --noEmit` → exit 0; `npm run lint` → exit 0.

### Step 4: Test the parser
In `taiwanMarketDataProvider.test.ts` (create if absent; model on existing market-data tests):
- `parseSecurityNames` maps `[{ Code: "00878", Name: "國泰永續高股息" }]` → both `"00878.TW"` and
  `"00878"` resolve to "國泰永續高股息".
- Rows missing `Code` or `Name` are skipped.

**Verify**: `npx vitest run src/features/market-data/taiwanMarketDataProvider.test.ts` → all pass.

### Step 5: Full verification
`npm run check:tauri` exit 0; `npx tsc --noEmit` exit 0; `npm run lint` exit 0; `npm test` all pass.

## Done criteria (ALL)
- [ ] `npm run check:tauri` exits 0 (Rust allowlist compiles)
- [ ] `npx tsc --noEmit` exits 0; `npm run lint` exits 0 (0 errors); `npm test` all pass
- [ ] `grep -n "STOCK_DAY_ALL" src-tauri/src/lib.rs vite.config.ts src/features/market-data/taiwanMarketDataProvider.ts` shows it in all three
- [ ] `parseSecurityNames` test passes
- [ ] `useSymbolSearch.ts` is UNCHANGED (`git status` shows it untouched)
- [ ] No files outside the in-scope list modified
- [ ] ETF Chinese name actually appearing in the live search — **manual-verify-pending** (needs the
  Tauri app; type `00878` → result shows "國泰永續高股息", not the English name)

## STOP conditions
- The `is_allowed_market_data_url` / `isAllowedMarketDataUrl` excerpts don't match (drift) — report.
- The `AssetProfile` type rejects `assetType: "etf"` or `sector: null` AND there's no clean nearest
  value — report rather than changing the type.
- STOCK_DAY_ALL's response shape differs from `{ Code, Name }` when you fetch it — report (the
  endpoint was verified 2026-06-28 but gov endpoints change).
- Resolving the name appears to require editing `useSymbolSearch.ts` — it shouldn't; report.

## Maintenance notes
- **TPEx (.TWO) ETFs follow-up**: this covers TWSE-listed ETFs only. For TPEx ETFs, add the TPEx
  daily-quote OpenAPI endpoint (confirm its host/path + the code/name field keys first — it was not
  verifiable via plain HTTP during planning) to `DATASETS`-style handling + BOTH allowlists.
- This fix improves ETF names **everywhere** `fetchAssetProfiles` feeds (search, holdings, name
  resolution), not just the search box — a bonus, but reviewers should sanity-check holdings still
  render correctly for ETFs.
- STOCK_DAY_ALL is a large daily payload (~1000+ rows); the 24h cache keeps it to one fetch/day.
- Reviewer: confirm the company (stock) path is unchanged (stocks keep industry/sector), the ETF
  path is a pure fallback, and a STOCK_DAY_ALL fetch failure degrades gracefully (Yahoo English name).
