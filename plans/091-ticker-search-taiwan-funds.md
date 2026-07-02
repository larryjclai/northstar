# Plan 091: Make Taiwan funds (SITCA) findable in ticker search

> **Executor instructions**: Follow step by step. Run every verification command. Touch only
> the in-scope files. NEVER push, NEVER touch `main`. Branch off `main`.

## Status
- **Priority**: P1 (user-reported: can't find funds when searching tickers)
- **Effort**: M  •  **Risk**: LOW-MED (extends the search path; network fetch is Tauri-gated)
- **Depends on**: none  •  **Category**: bug / feature gap
- **Planned at**: commit `a1aaece5`, 2026-06-28

## Why this matters
Ticker search only queries **Yahoo Finance** (`YahooFinanceProvider.searchSymbols`), which
does NOT index Taiwan SITCA domestic mutual funds. The app already has a `SitcaFundProvider`
holding the full ~4,200-fund CSV (`基金代號 → { code, name, nav, currency }`), but it's only
used to fetch NAV for already-known `SITCA:<code>` tickers — it is **never queried by the
search box**. So funds are unfindable. This plan adds a fund search to the SITCA provider and
merges its results into `useSymbolSearch`, so typing a fund name or code surfaces it as a
selectable `SITCA:<code>` result (which the existing NAV path already supports).

## Current state
- `src/features/market-data/useSymbolSearch.ts` — debounced search:
  ```ts
  const provider = new YahooFinanceProvider();
  const twProvider = new TaiwanMarketDataProvider();
  // ...
  provider.searchSymbols(trimmed).then(async (items) => { /* enrich with twProvider profiles */ setResults(enriched); })
  ```
  Only Yahoo is searched. Errors set `error` and clear results.
- `src/features/market-data/sitcaFundProvider.ts` — `fetchFunds()` returns a cached
  `Map<code, SitcaFund>` (`SitcaFund = { code, nav, currency, name, date }`), loaded from
  `SITCA_NAV_URL` via `fetchMarketData(...)` (a Tauri command — works in the app, NOT in a
  plain browser). `SITCA_TICKER_PREFIX = "SITCA:"`. `parseSitcaNavCsv` is already pure +
  tested. The class currently exposes only `fetchQuotes(symbols)`.
- `src/features/market-data/provider.ts` — `SymbolSearchResult = { symbol: string; name: string;
  nameZh?: string|null; nameEn?: string|null; exchange?: string; ... }`.

### Conventions
- The SITCA fetch goes through `fetchMarketData` (Tauri). In a non-Tauri/browser context it
  will reject — handle that gracefully (no funds, Yahoo results still shown; never throw to UI).
- Keep a pure, unit-testable filter function separate from the I/O (mirror how
  `parseSitcaNavCsv` is pure and tested in `sitcaFundProvider.test.ts` if it exists; otherwise
  model the test on `src/domain/nlParser.test.ts`).

## Commands
| Install | `npm install` | exit 0 |
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Targeted test | `npx vitest run src/features/market-data/sitcaFundProvider.test.ts` | pass |
| Tests | `npm test` | all pass |
| Lint | `npm run lint` | exit 0 (0 errors) |

## Scope
**In scope**:
- `src/features/market-data/sitcaFundProvider.ts` — a pure `filterFunds(...)` helper + a
  `searchFunds(query)` method
- `src/features/market-data/useSymbolSearch.ts` — run the SITCA fund search alongside Yahoo and merge
- `src/features/market-data/sitcaFundProvider.test.ts` — tests for `filterFunds` (create if absent)
**Out of scope**: the NAV/quote path (`fetchQuotes` — already handles `SITCA:` tickers on
selection); Yahoo provider; the `TickerSearchField` component UI (it renders whatever results
it's given — no change needed); changing `SymbolSearchResult`'s shape.

## Git workflow
- Branch: `fix/ai-fund-search` (off `main`)
- Commit: `fix(market-data): make Taiwan SITCA funds findable in ticker search`
- Do NOT push.

## Steps

### Step 1: Pure fund filter
In `sitcaFundProvider.ts`, add an exported pure function:
```ts
/** Filter the loaded SITCA fund map into search results: matches fund code (prefix) or
    name (substring), case-insensitive; capped to `max`. Pure — no I/O. */
export function filterFunds(
  byCode: Map<string, SitcaFund>,
  query: string,
  max = 20,
): SymbolSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: SymbolSearchResult[] = [];
  for (const fund of byCode.values()) {
    const codeMatch = fund.code.toLowerCase().includes(q);
    const nameMatch = (fund.name ?? "").toLowerCase().includes(q);
    if (!codeMatch && !nameMatch) continue;
    out.push({
      symbol: `${SITCA_TICKER_PREFIX}${fund.code}`,
      name: fund.name || `${SITCA_TICKER_PREFIX}${fund.code}`,
      nameZh: fund.name || null,
      nameEn: null,
      exchange: "SITCA",
    });
    if (out.length >= max) break;
  }
  return out;
}
```
(Import/confirm `SymbolSearchResult` is available in this module; if it isn't already
imported, import it from `./provider`.)

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: `searchFunds` method (I/O + filter)
On `SitcaFundProvider`, add:
```ts
async searchFunds(query: string, max = 20): Promise<SymbolSearchResult[]> {
  if (query.trim().length < 2) return [];
  try {
    const byCode = await fetchFunds();      // cached; Tauri fetch
    return filterFunds(byCode, query, max);
  } catch {
    return [];                               // non-Tauri / fetch failure → no funds
  }
}
```

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Merge fund results into the search
In `useSymbolSearch.ts`, add a `sitcaProvider = new SitcaFundProvider()` and run the fund
search in parallel with the Yahoo search, merging results. Use `Promise.allSettled` so a
SITCA failure (browser) never breaks the Yahoo results:
```ts
const [yahoo, funds] = await Promise.allSettled([
  provider.searchSymbols(trimmed),
  sitcaProvider.searchFunds(trimmed),
]);
const yahooItems = yahoo.status === "fulfilled" ? yahoo.value : [];
const fundItems = funds.status === "fulfilled" ? funds.value : [];
// enrich yahooItems with twProvider profiles as before, then merge:
const merged = [...enrichedYahoo, ...fundItems];
```
Preserve the existing Taiwan-profile enrichment for the Yahoo items. Append fund results
after the Yahoo results (or interleave — appending is fine). Keep the existing `error`
handling: only set `error` when the Yahoo search itself rejects AND there are no fund
results to show; if funds were found, show them rather than an error. De-dupe by `symbol`
if a symbol appears in both lists (unlikely, but cheap).

**Verify**: `npx tsc --noEmit` → exit 0; `npm run lint` → exit 0.

### Step 4: Tests
In `sitcaFundProvider.test.ts` (create if absent; model on the existing CSV parse test or
`src/domain/nlParser.test.ts`), test `filterFunds` with a small hand-built `Map`:
- **name match**: query "科技" returns funds whose `name` contains 科技.
- **code match**: query a code prefix returns that fund; result `symbol` is `SITCA:<code>`.
- **cap**: given >max matches, returns exactly `max`.
- **empty query**: returns `[]`.
- **result shape**: `symbol` carries the `SITCA:` prefix and `exchange === "SITCA"`.

**Verify**: `npx vitest run src/features/market-data/sitcaFundProvider.test.ts` → all pass.

### Step 5: Full verification
`npx tsc --noEmit` exit 0; `npm run lint` exit 0; `npm test` all pass.

## Done criteria (ALL)
- [ ] `npx tsc --noEmit` exits 0; `npm run lint` exits 0 (0 errors)
- [ ] `npx vitest run src/features/market-data/sitcaFundProvider.test.ts` passes
- [ ] `npm test` exits 0 (no new failures)
- [ ] `grep -n "filterFunds\|searchFunds" src/features/market-data/sitcaFundProvider.ts` shows both
- [ ] `grep -n "searchFunds\|allSettled" src/features/market-data/useSymbolSearch.ts` shows the merge
- [ ] No files outside the in-scope list modified
- [ ] Funds actually appearing in the live search box — **manual-verify-pending** (needs the
  Tauri app, since the SITCA CSV fetch is a Tauri command; operator types a fund name and
  sees `SITCA:` results)

## STOP conditions
- `SitcaFund` / `fetchFunds` / `SITCA_TICKER_PREFIX` don't match the "Current state" excerpts (drift) — report.
- Merging requires changing `SymbolSearchResult`'s shape or the `TickerSearchField` UI — report (it shouldn't).
- The selection path (`onSelect` → downstream NAV fetch) appears NOT to handle `SITCA:` symbols
  — report (the existing `fetchQuotes` does; if a different path breaks, stop and describe it).

## Maintenance notes
- The SITCA CSV is ~4,200 funds; `filterFunds` does a linear scan capped at `max` — fine for a
  debounced search. If it ever feels slow, pre-index by name, but don't optimize prematurely.
- Fund search only works in the Tauri app (the CSV fetch is a Tauri command). That's expected;
  the browser dev server shows Yahoo results only.
- Reviewer: confirm a SITCA fetch failure leaves Yahoo results intact (graceful degradation),
  and that selecting a fund result yields a `SITCA:<code>` symbol the NAV path already resolves.
