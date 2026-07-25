# Plan 257: Make every SITCA fund reachable in ticker search — normalize the query, rank matches, and tell the user when results are truncated

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> ```bash
> git diff --stat b22c566e..HEAD -- src/features/market-data/sitcaFundProvider.ts src/features/market-data/sitcaFundProvider.test.ts src/features/market-data/useSymbolSearch.ts src/components/TickerSearchField.tsx
> ```
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `b22c566e`, 2026-07-25

## Why this matters

The operator reports that 「群益新興金鑽基金 - 新臺幣」
(https://www.capitalfund.com.tw/fund/detail/019) is still not findable in the
app's fund search. **The fund is not missing from the data.** It is row 1398 of
the live SITCA NAV CSV:

```
20260723,A0016,群益投信,48852561A,DIO04,群益新興金鑽基金-新臺幣,14.16,0.13,0.92659,AA2,TWD,T1605Y
```

The bug is in the search layer, and it has two independent causes:

1. **No ranking + a hard 20-result cap taken in raw CSV order.** `filterFunds`
   walks the fund list in file order and `break`s at `max` (default 20). Verified
   against the live CSV (4,430 rows, fetched 2026-07-25):

   | query | matching funds | rank of the target fund | in top 20? |
   |---|---|---|---|
   | `群益` | 259 | **151** | NO |
   | `新興` | 386 | **87** | NO |
   | `群益新興` | 2 | 1 | yes |
   | `T1605Y` | 1 | 1 | yes |

   Typing the fund company name — the most natural first query — silently returns
   20 arbitrary 群益 funds that do not include the one being looked for, with no
   indication that 239 more matched.

2. **No query normalization.** The fund company's own page titles the fund
   「群益新興金鑽基金 **- ** 新臺幣」 (spaces around the hyphen); the CSV writes
   「群益新興金鑽基金**-**新臺幣」 (no spaces). Pasting the name off the fund
   company's site returns **zero** results (verified). The 臺/台 variant has the
   same problem: 767 fund names in the file use 臺 and 874 use 台, so a user who
   types 新台幣 misses every 新臺幣 fund and vice versa.

A previous fix (`33b9add2`, 2026-07-11) named this exact fund and repaired the
*data* layer — 基金代號 collisions were collapsing ~3,600 funds. That fix is
correct and still holds; `docs/taiwan-fund-nav-plan.md:45` records it. What was
never fixed is the *search* layer on top of it. This plan closes that gap.

Secondary defect fixed here because it is one line and directly on the same
path: SITCA search results carry no `assetType`, so selecting a fund in
新增持倉 leaves 類型 on whatever was already chosen (usually 股票) instead of
共同基金.

## Current state

### Files

- `src/features/market-data/sitcaFundProvider.ts` — SITCA CSV fetch, parse,
  symbol index, and the `filterFunds` search filter (lines 106–133). **The
  ranking bug lives here.**
- `src/features/market-data/sitcaFundProvider.test.ts` — existing vitest suite
  for the above. Use it as the structural pattern for new tests.
- `src/features/market-data/useSymbolSearch.ts` — merges Yahoo + Taiwan-local +
  SITCA results for the ticker dropdown.
- `src/components/TickerSearchField.tsx` — the dropdown UI. Renders **every**
  result with no scroll container.

### Excerpts as they exist today

`src/features/market-data/sitcaFundProvider.ts:32-41` — the parsed record.
Note 公司名稱 is **not** captured:

```ts
interface SitcaFund {
  code: string;
  // Customer-facing certificate code (what bank/fund-platform statements
  // show, e.g. `T1605Y`) — distinct from the internal 基金代號 (e.g. `DIO04`).
  certCode: string;
  nav: number;
  currency: string;
  name: string;
  date: string;
}
```

`src/features/market-data/sitcaFundProvider.ts:106-133` — the buggy filter.
Plain `includes`, no scoring, `break` at `max` in file order:

```ts
/**
 * Pure filter: match funds by 基金代號, name, or 受益憑證代號 (the customer-facing
 * certificate code shown on bank statements, e.g. `T1605Y`) against a query
 * string. Returns up to `max` SymbolSearchResult items. No I/O — testable
 * standalone.
 */
export function filterFunds(
  funds: SitcaFund[],
  query: string,
  max = 20,
): SymbolSearchResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: SymbolSearchResult[] = [];
  for (const fund of funds) {
    const codeMatch = fund.code.toLowerCase().includes(q);
    const nameMatch = (fund.name ?? "").toLowerCase().includes(q);
    const certMatch = (fund.certCode ?? "").toLowerCase().includes(q);
    if (!codeMatch && !nameMatch && !certMatch) continue;
    out.push({
      symbol: fundSymbol(fund),
      name: fund.name || fundSymbol(fund),
      exchange: "SITCA",
    });
    if (out.length >= max) break;
  }
  return out;
}
```

`src/features/market-data/sitcaFundProvider.ts:65-73` — the provider method:

```ts
  async searchFunds(query: string, max = 20): Promise<SymbolSearchResult[]> {
    if (query.trim().length < 2) return [];
    try {
      const { funds } = await fetchFunds();
      return filterFunds(funds, query, max);
    } catch {
      return [];
    }
  }
```

`src/features/market-data/sitcaFundProvider.ts:157-174` — the parser (add
公司名稱 here in Step 2):

```ts
export function parseSitcaNavCsv(csv: string): SitcaFund[] {
  const table = parseCsvTable(stripBom(csv));
  const funds: SitcaFund[] = [];
  for (const row of table.rows) {
    const code = clean(row[COL_FUND_CODE]);
    const nav = Number(clean(row[COL_NAV]));
    if (!code || !Number.isFinite(nav)) continue;
    funds.push({
      code,
      certCode: clean(row[COL_CERT_CODE]),
      nav,
      currency: clean(row[COL_CURRENCY]) || "TWD",
      name: clean(row[COL_FUND_NAME]),
      date: clean(row[COL_DATE]),
    });
  }
  return funds;
}
```

`src/features/market-data/useSymbolSearch.ts:28-39` — the merge (the SITCA call
is `sitcaProvider.searchFunds(trimmed)`, i.e. `max` = 20):

```ts
    const timer = window.setTimeout(async () => {
      try {
        const [yahoo, funds, twLocal] = await Promise.allSettled([
          provider.searchSymbols(trimmed),
          sitcaProvider.searchFunds(trimmed),
          twProvider.searchSecurities(trimmed),
        ]);
        if (cancelled) return;

        const yahooItems = yahoo.status === "fulfilled" ? yahoo.value : [];
        const fundItems = funds.status === "fulfilled" ? funds.value : [];
        const twItems = twLocal.status === "fulfilled" ? twLocal.value : [];
```

…and `src/features/market-data/useSymbolSearch.ts:60-91`:

```ts
        if (cancelled) return;

        // De-duplicate: if Yahoo already returned a symbol, skip the local TW / SITCA entry.
        const seen = new Set(enrichedYahoo.map((r) => r.symbol));
        const uniqueTw = twItems.filter((r) => !seen.has(r.symbol));
        uniqueTw.forEach((r) => seen.add(r.symbol));
        const uniqueFunds = fundItems.filter((f) => !seen.has(f.symbol));

        setResults([...enrichedYahoo, ...uniqueTw, ...uniqueFunds]);

        // Only show an error when Yahoo failed AND no local/fund results to fall back on.
        if (yahoo.status === "rejected" && uniqueTw.length === 0 && uniqueFunds.length === 0) {
          const err = yahoo.reason;
          setError(err instanceof Error ? err.message : "搜尋 ticker 失敗。");
        }
      } catch (outerError: unknown) {
        if (cancelled) return;
        setResults([]);
        setError(outerError instanceof Error ? outerError.message : "搜尋 ticker 失敗。");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  return { results, isLoading, error };
}
```

`src/components/TickerSearchField.tsx:35-64` — the dropdown panel. Note there is
**no** `max-height` and **no** `overflow-y`, so raising the result cap without
Step 6 would push the list off-screen:

```tsx
      {showPanel ? (
        <div className="absolute left-0 right-0 z-20 mt-2 overflow-hidden rounded-lg border shadow-lg" style={{ background: "var(--ns-surface)", borderColor: "var(--ns-border)" }}>
          {isLoading ? <div className="px-3 py-3 text-sm" style={{ color: "var(--ns-muted)" }}>搜尋中...</div> : null}
          {error ? (
            <div className="flex items-center gap-2 px-3 py-3 text-sm" style={{ color: "var(--ns-warn)" }}>
              <WarningCircle size={16} />可手動輸入；Yahoo 搜尋暫時無法使用。
            </div>
          ) : null}
          {results.map((result) => (
```

### Conventions this plan must honor

Quoted from `AGENTS.md` (the executor has not read it):

> **樣式撰寫優先序**：(1) COSS 元件；(2) `ns-*` utility class 與 Tailwind utilities；
> (3) inline `style={{}}` **僅限動態值**（來自 props/state/計算）。靜態樣式不要寫
> inline——用既有 class 或抽新的 `ns-*` class。

→ In Step 6, the new `max-height` / `overflow-y` go on as Tailwind utility
classes (`max-h-80 overflow-y-auto`), **not** as inline `style`.

> **Correctness first for finance.** Calculations must be explainable and
> testable. […] Don't silently change financial math.

→ This plan touches **search only**. `fetchQuotes`, `buildFundSymbolIndex`,
`fundSymbol`, and `parseSitcaNavCsv`'s numeric handling are pricing paths. Do
not change their behavior. The only permitted change to `parseSitcaNavCsv` is
capturing one extra string column (Step 2).

> **Always branch:** AI work goes on `feat/ai-<name>` or `fix/ai-<name>`, never
> directly on `main`.

Also from `AGENTS.md`: i18n is zh-TW default. **New UI strings in this plan are
written directly in the TSX**, matching the existing hard-coded zh-TW strings in
`TickerSearchField.tsx` (`"搜尋中..."`, `"可手動輸入；Yahoo 搜尋暫時無法使用。"`).
Do **not** route them through `copy.csv` / `translation.json` — that catalog
covers onboarding copy, not this component, and adding one file's strings to it
is out of scope.

The decided fund-symbol convention, quoted from `docs/taiwan-fund-nav-plan.md:50-56`
— **do not change any of this**:

> - **Canonical ticker: `SITCA:<受益憑證代號>`** (e.g. `SITCA:T1605Y`). […]
> - **Legacy tickers keep working when safe.** `SITCA:<基金代號>` holdings still
>   price iff the code maps to exactly one fund; ambiguous codes return **no
>   quote** (fail soft) […]
> - Parsing keeps **every** row (list, not code-keyed map); search returns
>   cert-code symbols.

Test style: plain `vitest` with `describe`/`it`/`expect`, hand-built fixtures,
Chinese comments explaining *why* a regression row exists. See
`src/features/market-data/sitcaFundProvider.test.ts:16-24` and its `makeFunds()`
helper at lines 66–73.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0, no errors |
| Unit tests (this file) | `npx vitest run src/features/market-data/sitcaFundProvider.test.ts` | all pass |
| Full test suite | `npm test` | exit 0, all pass |
| Lint | `npm run lint` | exit 0 |

Do **not** run `npm run build` (its `prebuild` step injects private assets) and
do **not** run `npm run test:e2e` (needs a browser install).

## Scope

**In scope** (the only files you may modify):

- `src/features/market-data/sitcaFundProvider.ts`
- `src/features/market-data/sitcaFundProvider.test.ts`
- `src/features/market-data/useSymbolSearch.ts`
- `src/components/TickerSearchField.tsx`
- `docs/taiwan-fund-nav-plan.md` (append one short section — Step 7)
- `plans/README.md` (status row only)

**Out of scope** (do NOT touch, even though they look related):

- `src/features/market-data/yahooFinanceProvider.ts` and
  `taiwanMarketDataProvider.ts` — the Yahoo and TWSE/TPEx search paths have
  their own ranking behavior; changing them is a separate, riskier change and
  is not what the operator reported.
- `src/features/market-data/useMarketRefresh.ts` — the daily NAV refresh
  routing. It already works; the reported fund prices correctly once added.
- `fetchQuotes`, `buildFundSymbolIndex`, `fundSymbol`, `fetchFunds`, and the
  truncated-CSV cache guard (`isPlausibleFundList`, `MIN_EXPECTED_FUND_COUNT`)
  in `sitcaFundProvider.ts` — pricing paths, unrelated to search.
- `src/routes/InvestmentsAddSheet.tsx` and `src/components/HoldingForm.tsx` —
  their `onSelect` handlers already read `result.assetType` correctly
  (`assetType: result.assetType ?? …`); Step 5 makes SITCA results supply it.
  No edit needed in those files.
- **Offshore funds (境外基金).** The SITCA CSV covers 境內 investment-trust funds
  only, by design (`docs/taiwan-fund-nav-plan.md` decision 2: "Domestic
  investment-trust funds only… Offshore / futures-trust funds… are out of
  scope"). Do not add a second data source. The fund in this report is domestic.
- `copy.csv` / `src/locales/**` — see the i18n note above.

## Git workflow

- Branch: `fix/ai-fund-search-ranking` (created off the current `main`).
- Conventional commits, matching this repo's `git log`
  (e.g. `fix(market-data): guard SITCA fund cache against truncated NAV CSV`).
  One commit per step, or per logical pair of steps.
- Do **not** push and do **not** open a PR. Report the branch name when done and
  let the operator decide.

## Steps

### Step 1: Write the failing regression tests first

Add a new `describe` block to
`src/features/market-data/sitcaFundProvider.test.ts`. These tests must **fail**
before Steps 2–4 and pass after. Build the fixture so it reproduces the live
file's shape: many funds sharing the 群益 brand prefix, with the target fund
buried deep.

```ts
// Reproduces the live failure (SITCA NAV CSV, 2026-07-25): 259 funds' names
// begin 「群益」 and the reported 「群益新興金鑽基金-新臺幣」 is the 151st of
// them in file order, so a file-ordered 20-result cap hid it entirely.
function makeBrandedFunds(count: number, targetIndex: number) {
  const funds = [];
  for (let i = 0; i < count; i++) {
    if (i === targetIndex) {
      funds.push({
        code: "DIO04",
        certCode: "T1605Y",
        nav: 14.16,
        currency: "TWD",
        name: "群益新興金鑽基金-新臺幣",
        company: "群益投信",
        date: "20260723",
      });
      continue;
    }
    const n = String(i).padStart(3, "0");
    funds.push({
      code: `DIO${n}`,
      certCode: `T9${n}Y`,
      nav: 10,
      currency: "TWD",
      name: `群益其他基金${n}`,
      company: "群益投信",
      date: "20260723",
    });
  }
  return funds;
}
```

Then the cases (all in one `describe("fund search ranking", …)`):

1. **`ranks an exact 受益憑證代號 match first`** — `filterFunds(makeBrandedFunds(259, 150), "T1605Y")[0].symbol === "SITCA:T1605Y"`.
2. **`surfaces the target fund for a full-name query even when it is 151st in file order`** —
   `filterFunds(makeBrandedFunds(259, 150), "群益新興金鑽基金-新臺幣")[0].symbol === "SITCA:T1605Y"`.
3. **`matches a name pasted from the fund company's site (spaces around the hyphen)`** —
   query `"群益新興金鑽基金 - 新臺幣"` returns exactly one result, `SITCA:T1605Y`.
   *(This is the exact string in the page title of https://www.capitalfund.com.tw/fund/detail/019.)*
4. **`folds 臺 and 台 so either spelling finds the fund`** — query `"群益新興金鑽基金-新台幣"`
   (note 台) returns `SITCA:T1605Y` as the first result.
5. **`prefers a prefix match over a mid-string match`** — with funds named
   `"群益新興金鑽基金-新臺幣"` and `"某某群益概念基金"`, query `"群益"` puts the
   prefix-matching fund ahead of the mid-string one.
6. **`counts every match even when the returned list is capped`** —
   `countFundMatches(makeBrandedFunds(259, 150), "群益") === 259` while
   `filterFunds(…, "群益", 20).length === 20`.
7. **`normalizes full-width characters and stray whitespace`** —
   query `"  T1605Y  "` and the full-width `"Ｔ１６０５Ｙ"` both return `SITCA:T1605Y`.
8. **`matches by 公司名稱 even when the brand is spelled differently in the name`** —
   fixture fund `{ name: "匯豐中華平衡基金", company: "滙豐投信", … }` (note 滙 vs 匯);
   query `"滙豐"` finds it. *(112 live rows have exactly this mismatch.)*
9. **`tags fund results as 共同基金`** —
   `filterFunds(makeFunds(), "科技")[0].assetType === "mutual_fund"` and
   `.currency === "TWD"`.

Note: the existing `makeFunds()` helper at lines 66–73 has no `company` field.
After Step 2, `SitcaFund` gains a required `company: string`, so add
`company: "某投信"` to each of its three entries and to the inline fixture at
line 130 (`{ code: "ZZZ09", certCode: "", … }`). Do not otherwise change
existing tests — they all must keep passing.

**Verify**: `npx vitest run src/features/market-data/sitcaFundProvider.test.ts`
→ the 9 new tests **fail** (`countFundMatches` is not exported yet, so expect a
mix of import errors and assertion failures); every pre-existing test in the
file still passes. Record which fail — Step 4 must turn all 9 green.

### Step 2: Capture 公司名稱 in the parsed fund record

In `src/features/market-data/sitcaFundProvider.ts`:

- Add the column constant next to the others (lines 25–30):
  ```ts
  const COL_COMPANY = "公司名稱";
  ```
- Add `company: string;` to the `SitcaFund` interface with a short comment
  (「基金公司名稱, e.g. 群益投信 — searchable so a brand query finds the fund even when
  the 基金名稱 spells the brand differently (滙豐投信 vs 匯豐…基金).」).
- In `parseSitcaNavCsv`, add `company: clean(row[COL_COMPANY]),` to the pushed
  object.

Do **not** change the row-skip condition, the NAV parse, or anything numeric.

**Verify**: `npx tsc --noEmit` → exit 0 (after you added `company` to the test
fixtures in Step 1; if TS still errors on a fixture, fix that fixture, not the
interface).

### Step 3: Add a pure `normalizeFundQuery` helper

Add to `src/features/market-data/sitcaFundProvider.ts`, exported (the tests
import it in Step 4's optional direct checks, and Step 4 uses it internally):

```ts
/**
 * Fold a fund name / code / query to a comparable form. Taiwanese fund names are
 * written inconsistently across the SITCA file, fund-company sites, and bank
 * statements, so a raw `includes` misses obvious matches:
 *   - 群益 writes 「群益新興金鑽基金-新臺幣」; its own site titles the same fund
 *     「群益新興金鑽基金 - 新臺幣」 (spaces around the hyphen) → zero hits.
 *   - 767 live fund names use 臺 and 874 use 台; 滙豐投信's funds are named 匯豐….
 * Folding: NFKC (full-width → half-width), lowercase, drop whitespace and
 * separator punctuation, and unify the 臺/台 and 滙/匯 variants.
 */
export function normalizeFundQuery(text: string): string {
  return (text ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s　]/g, "")
    .replace(/[-‐‑–—－ー_()（）[\]【】{}.,，、·・/／|｜]/g, "")
    .replace(/臺/g, "台")
    .replace(/滙/g, "匯");
}
```

**Verify**: `npx tsc --noEmit` → exit 0. Then, in a throwaway check:

```bash
npx vitest run src/features/market-data/sitcaFundProvider.test.ts -t "spaces around the hyphen"
```
→ still fails (ranking not implemented yet). This confirms the helper compiles
without changing behavior.

### Step 4: Rank matches in `filterFunds` and add `countFundMatches`

Replace the body of `filterFunds` (lines 106–133 in the "Current state" excerpt).
Keep the exported name, parameter order, and return type
(`SymbolSearchResult[]`) so existing callers and tests are unaffected.

Target shape — score every fund, sort by `(score, original index)`, then slice:

```ts
// Lower score = better match. Ties keep the file's original order (stable sort),
// so a query that matches hundreds of funds is at least deterministic.
const SCORE_EXACT_CODE = 0;   // query === 受益憑證代號 or === 基金代號
const SCORE_CODE_PREFIX = 1;  // code / certCode starts with the query
const SCORE_NAME_EXACT = 2;   // 基金名稱 === query
const SCORE_NAME_PREFIX = 3;  // 基金名稱 starts with the query
const SCORE_NAME_SUBSTR = 4;  // 基金名稱 contains the query
const SCORE_CODE_SUBSTR = 5;  // code / certCode contains the query
const SCORE_COMPANY = 6;      // only 公司名稱 matched
const NO_MATCH = Number.POSITIVE_INFINITY;

/** Score one fund against an already-normalized query. `NO_MATCH` = filtered out. */
function scoreFund(fund: SitcaFund, q: string): number { … }
```

`scoreFund` must compare **normalized** values on both sides — normalize
`fund.code`, `fund.certCode`, `fund.name`, and `fund.company` with
`normalizeFundQuery` before comparing. Return the *lowest* (best) applicable
score.

`filterFunds` then:

```ts
export function filterFunds(
  funds: SitcaFund[],
  query: string,
  max = 20,
): SymbolSearchResult[] {
  const q = normalizeFundQuery(query);
  if (!q) return [];
  const scored: Array<{ fund: SitcaFund; score: number; index: number }> = [];
  funds.forEach((fund, index) => {
    const score = scoreFund(fund, q);
    if (score !== NO_MATCH) scored.push({ fund, score, index });
  });
  scored.sort((a, b) => a.score - b.score || a.index - b.index);
  return scored.slice(0, max).map(({ fund }) => ({
    symbol: fundSymbol(fund),
    name: fund.name || fundSymbol(fund),
    currency: fund.currency || "TWD",
    exchange: "SITCA",
    assetType: "mutual_fund",
  }));
}

/**
 * How many funds match `query` in total, ignoring the display cap. The ticker
 * dropdown uses this to tell the user their query matched more funds than it
 * can show, instead of silently truncating (the failure that hid
 * 「群益新興金鑽基金-新臺幣」 — 151st of 259 「群益」 matches).
 */
export function countFundMatches(funds: SitcaFund[], query: string): number {
  const q = normalizeFundQuery(query);
  if (!q) return 0;
  let total = 0;
  for (const fund of funds) if (scoreFund(fund, q) !== NO_MATCH) total += 1;
  return total;
}
```

`assetType: "mutual_fund"` must typecheck against `AssetType` in
`src/domain/types.ts` — it is a valid member (line 23). Import the type if
TypeScript widens the literal to `string`.

Note that the existing test `it("caps results at max", …)` (line 97) passes
query `"基金"` with `max: 2` against the 3-fund `makeFunds()` fixture and expects
length 2 — the new code still satisfies it.

**Verify**:
```bash
npx vitest run src/features/market-data/sitcaFundProvider.test.ts
```
→ **all** tests pass, including the 9 added in Step 1. Then:
```bash
npx tsc --noEmit && npm run lint
```
→ both exit 0.

### Step 5: Return the total match count from the provider and the hook

In `src/features/market-data/sitcaFundProvider.ts`, change `searchFunds`
(lines 65–73). `SitcaFundProvider` does not implement the `MarketDataProvider`
interface in `provider.ts`, and `useSymbolSearch.ts:32` is its **only** caller —
verified — so changing the return shape is safe:

```ts
  /**
   * Ranked fund search. Returns the capped display list plus `total`, the
   * unfiltered match count, so the caller can tell the user when a broad query
   * (e.g. a bare fund-company name) matched far more funds than are shown.
   */
  async searchFunds(query: string, max = 20): Promise<{ items: SymbolSearchResult[]; total: number }> {
    if (query.trim().length < 2) return { items: [], total: 0 };
    try {
      const { funds } = await fetchFunds();
      return { items: filterFunds(funds, query, max), total: countFundMatches(funds, query) };
    } catch {
      return { items: [], total: 0 };
    }
  }
```

Raise the display cap where the hook calls it. In
`src/features/market-data/useSymbolSearch.ts`:

- Add a module constant with a comment:
  ```ts
  // Funds outnumber every other source (~4,400 rows in the SITCA file), so the
  // dropdown shows more of them than the old 20 — paired with a "narrow your
  // search" hint when even 50 is not the whole match set. The panel scrolls
  // (TickerSearchField), so a long list does not run off-screen.
  const MAX_FUND_RESULTS = 50;
  ```
- Change the call to `sitcaProvider.searchFunds(trimmed, MAX_FUND_RESULTS)`.
- Where `fundItems` is derived, unwrap the new shape and keep the total:
  ```ts
  const fundResult = funds.status === "fulfilled" ? funds.value : { items: [], total: 0 };
  const fundItems = fundResult.items;
  ```
- Add state `const [fundMatchTotal, setFundMatchTotal] = useState(0);`, reset it
  to `0` in the early-return branch (`trimmed.length < 2`) and in the `catch`
  block alongside `setResults([])`, and set it next to `setResults(...)`:
  ```ts
  setResults([...enrichedYahoo, ...uniqueTw, ...uniqueFunds]);
  setFundMatchTotal(fundResult.total);
  ```
- Extend the return: `return { results, isLoading, error, fundMatchTotal, shownFundCount: /* uniqueFunds.length via state */ };`

  To keep this simple, store one derived boolean instead of two counts:
  ```ts
  const [fundOverflow, setFundOverflow] = useState<number>(0);
  // …
  setFundOverflow(Math.max(0, fundResult.total - uniqueFunds.length));
  ```
  and return `{ results, isLoading, error, fundOverflow }`. Reset `fundOverflow`
  to `0` in the same two places as above.

The `if (yahoo.status === "rejected" && uniqueTw.length === 0 && uniqueFunds.length === 0)`
error condition still references `uniqueFunds` — leave it exactly as-is.

**Verify**: `npx tsc --noEmit` → exit 0. `npm test` → all pass.

### Step 6: Show the overflow hint and make the dropdown scrollable

In `src/components/TickerSearchField.tsx`:

- Destructure the new field: `const { results, isLoading, error, fundOverflow } = useSymbolSearch(value);`
- Add `max-h-80 overflow-y-auto` to the panel's className (replacing
  `overflow-hidden`, which would clip a scrolling list):
  ```tsx
  <div className="absolute left-0 right-0 z-20 mt-2 max-h-80 overflow-y-auto rounded-lg border shadow-lg" style={{ background: "var(--ns-surface)", borderColor: "var(--ns-border)" }}>
  ```
  Tailwind utilities, **not** inline `style` — per the AGENTS.md style order
  quoted above.
- After the `{results.map(…)}` block, before the closing `</div>`, add the hint.
  It must render only when there is overflow **and** at least one result is
  shown (never as the sole content of an empty panel):
  ```tsx
  {fundOverflow > 0 && results.length > 0 ? (
    <div className="px-3 py-2 text-xs" style={{ color: "var(--ns-muted)" }}>
      還有 {fundOverflow} 檔基金符合，請輸入更完整的基金名稱或受益憑證代號（例：T1605Y）。
    </div>
  ) : null}
  ```
  `style={{ color: "var(--ns-muted)" }}` is inline here only to match the two
  sibling elements in the same component (lines 37 and 58) — keep the file
  internally consistent rather than introducing a lone new class.

**Verify**:
```bash
npx tsc --noEmit && npm run lint && npm test
```
→ all exit 0.

Then a live check (the app's dev server; do **not** use `npm run build`):
```bash
npm run dev
```
Open the app, go to 投資 → 新增持倉, and in the 股票代號 field type:

| Type this | Expect |
|---|---|
| `T1605Y` | 「群益新興金鑽基金-新臺幣」 is the **first** result, right label reads `TWD · SITCA` |
| `群益新興金鑽` | the fund appears in the list |
| `群益新興金鑽基金 - 新臺幣` (paste, with spaces) | the fund appears — this returned **nothing** before this plan |
| `群益` | a scrollable list plus the 「還有 N 檔基金符合…」 hint at the bottom |

Selecting the fund must set 類型 to 共同基金 and the ticker to `SITCA:T1605Y`.
Capture a screenshot of the `T1605Y` result for the report. Stop the dev server
when done.

### Step 7: Record the fix in the design note

Append a short section to the end of `docs/taiwan-fund-nav-plan.md` (after the
「Adding a fund (user flow)」 section). Do not edit or contradict the existing
「Correction (2026-07-11)」 section — that data-layer fix is still correct; this
is the *search-layer* sequel to it:

```markdown
## Correction (2026-07-25) — search ranking, not the data, hid 群益新興金鑽基金

The 2026-07-11 fix put every fund back in the parsed list, but the fund was
still unfindable in the UI. `filterFunds` walked the list in raw CSV order and
`break`ed at 20 results, so a 「群益」 query returned the first 20 of 259 matches
and the target fund (151st) never appeared. Pasting the name off the fund
company's own page (「群益新興金鑽基金 - 新臺幣」, spaces around the hyphen) matched
nothing at all, because the CSV writes it without spaces.

Implemented in `sitcaFundProvider.ts`:

- `normalizeFundQuery` folds both sides before comparing: NFKC (full-width →
  half-width), lowercase, drop whitespace and separator punctuation, 臺→台, 滙→匯.
- `filterFunds` scores every match (exact code → code prefix → name exact →
  name prefix → name substring → code substring → company-only) and sorts by
  `(score, file order)` before capping, instead of `break`ing at the cap.
- `公司名稱` is parsed and searchable (112 live 滙豐投信 rows name their funds 匯豐…).
- `countFundMatches` reports the uncapped total; the dropdown shows 50 results
  and a 「還有 N 檔基金符合」 hint so a broad query never silently truncates.
- SITCA search results now carry `currency` and `assetType: "mutual_fund"`, so
  picking a fund sets 類型 = 共同基金 instead of leaving the previous selection.

Still out of scope, unchanged from decision 2: **境外基金 (offshore funds)** are
not in this CSV and are not searchable. Only 境內 investment-trust funds are.
```

**Verify**: `git diff --stat` shows only the six in-scope files.

## Test plan

All new tests go in `src/features/market-data/sitcaFundProvider.test.ts`,
modeled structurally on the existing `describe("filterFunds", …)` block
(lines 75–149) — same `makeFunds()`-style hand-built fixtures, same
`expect(results[0].symbol).toBe("SITCA:…")` assertion style, Chinese comments
explaining why each regression row exists.

Cases (the 9 listed in Step 1), in one `describe("fund search ranking", …)`:

| # | Case | Guards against |
|---|---|---|
| 1 | exact 受益憑證代號 ranks first | code matches losing to name matches |
| 2 | target found at file position 151 of 259 | **the reported bug** |
| 3 | name pasted with spaces around the hyphen | zero-result normalization failure |
| 4 | 臺/台 folding | the 767-vs-874 spelling split |
| 5 | prefix beats mid-string | ranking regression |
| 6 | `countFundMatches` counts past the cap | silent truncation returning |
| 7 | full-width + whitespace normalization | NFKC regression |
| 8 | 公司名稱 match (滙豐 → 匯豐…基金) | brand-spelling mismatch |
| 9 | results carry `assetType`/`currency` | 類型 not auto-set on select |

Every pre-existing test in the file must still pass unchanged (except for
adding the required `company` field to the three `makeFunds()` fixtures and the
one inline `ZZZ09` fixture — a fixture-shape change only, no assertion change).

Verification: `npm test` → exit 0, with 9 new tests passing and the existing
count risen by exactly 9.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc --noEmit` exits 0
- [ ] `npm run lint` exits 0
- [ ] `npm test` exits 0; the 9 new ranking tests exist and pass
- [ ] `grep -n "if (out.length >= max) break" src/features/market-data/sitcaFundProvider.ts` returns **no matches** (the file-ordered cap is gone)
- [ ] `grep -n "normalizeFundQuery\|countFundMatches\|scoreFund" src/features/market-data/sitcaFundProvider.ts` returns matches for all three
- [ ] `grep -n "max-h-80 overflow-y-auto" src/components/TickerSearchField.tsx` returns a match
- [ ] `git status --short` lists **only**: `sitcaFundProvider.ts`, `sitcaFundProvider.test.ts`, `useSymbolSearch.ts`, `TickerSearchField.tsx`, `docs/taiwan-fund-nav-plan.md`, `plans/README.md`
- [ ] Live check in Step 6 done: a screenshot showing 「群益新興金鑽基金-新臺幣」 as the first result for `T1605Y`
- [ ] `plans/README.md` status row for 257 updated
- [ ] Work is on branch `fix/ai-fund-search-ranking`, not `main` (`git branch --show-current`)

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows any in-scope file changed since `b22c566e` and the
  "Current state" excerpts no longer match the live code.
- `SitcaFundProvider.searchFunds` turns out to have a caller other than
  `src/features/market-data/useSymbolSearch.ts:32`
  (check: `grep -rn "searchFunds" src/`). The Step 5 signature change assumes
  exactly one caller.
- Making the ranking tests pass appears to require changing `fetchQuotes`,
  `buildFundSymbolIndex`, `fundSymbol`, or the numeric parsing in
  `parseSitcaNavCsv`. Those are pricing paths and are out of scope — a search
  fix that needs them means the diagnosis is wrong.
- Any pre-existing test in `sitcaFundProvider.test.ts` fails and cannot be fixed
  by adding the `company` field to a fixture. That means the ranking change
  altered behavior it should not have.
- After Step 4, `filterFunds(liveFunds, "T1605Y")` does not put the target fund
  first — the core assumption of this plan is that the fund **is** in the data
  and only ranking hid it. If it is genuinely absent from the CSV, stop: that is
  a different (data-source) problem.
- A step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

For whoever owns this code next:

- **Ranking is now the contract.** `filterFunds` sorts before capping. If
  someone later reintroduces an early `break` inside the scan loop for
  performance, the reported bug comes straight back. **Measured on the live
  4,251-row parse (2026-07-25, reviewer's machine): 26–32 ms per keystroke** for
  `filterFunds` + `countFundMatches` together — two full passes, each calling
  `normalizeFundQuery` on 4 fields per fund. That sits comfortably inside the
  250 ms debounce and is off the render path, so it is fine as-is; do not
  "optimize" it back into a truncating loop. If it ever needs to be faster, the
  right move is to memoize the normalized fields on the cached fund list (they
  only change when the CSV is refetched), not to re-truncate.
- **`normalizeFundQuery` is applied to both sides.** Adding a fold (e.g. another
  character variant) silently changes what matches. Any new fold needs a test.
- **The 50-result cap and the overflow hint are a pair.** Raising the cap
  without the scroll container puts the list off-screen; removing the hint
  restores silent truncation for broad queries. Review them together.
- **Offshore funds remain the real completeness gap.** The SITCA CSV is 境內
  investment-trust funds only (~4,400 rows across 36 companies). Funds sold via
  基富通/銀行通路 that are 境外-domiciled are not in it and cannot be found or
  priced. Supporting them needs a second data source and is a separate,
  larger piece of work — deliberately deferred out of this plan.
- **What a reviewer should scrutinize**: that `scoreFund` normalizes both the
  query and each fund field (an un-normalized side silently reintroduces the
  zero-result bug), and that no pricing-path function was touched
  (`git diff` on `fetchQuotes` / `buildFundSymbolIndex` should be empty).
