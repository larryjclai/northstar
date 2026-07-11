# Plan 151: Make SITCA funds findable by 受益憑證代號 (e.g. T1605Y)

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat da946482..HEAD -- src/features/market-data/sitcaFundProvider.ts src/features/market-data/sitcaFundProvider.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `da946482`, 2026-07-11

## Why this matters

The operator reported that the fund 「T1605Y 群益新興金鑽基金-新臺幣」 cannot be
found in ticker search, even though Taiwan-fund search (plan 091) shipped. The
advisor verified against the **live SITCA CSV** (2026-07-11): the fund IS in the
file —

```
20260708,A0016,群益投信,48852561A,DIO04,群益新興金鑽基金-新臺幣,14.5,-0.24,-1.62822,AA2,TWD,T1605Y
```

`T1605Y` is the **受益憑證代號** (the last CSV column — the certificate code that
banks and fund platforms display to customers), while the app's search matches
only the 基金代號 (`DIO04`) and the 基金名稱. Users almost never know the internal
基金代號; they know the certificate code from their bank statement. Matching the
certificate code makes every SITCA fund findable by the code users actually see.

## Current state

- `src/features/market-data/sitcaFundProvider.ts` — parses the SITCA NAV CSV
  into a `基金代號 → SitcaFund` map and filters it for search. The relevant
  pieces as of `da946482`:

  Header constants (lines 20–24) — note `受益憑證代號` is **not** among them:
  ```ts
  const COL_DATE = "日期";
  const COL_FUND_CODE = "基金代號";
  const COL_FUND_NAME = "基金名稱";
  const COL_NAV = "基金淨值";
  const COL_CURRENCY = "幣別";
  ```

  The fund record (lines 26–32):
  ```ts
  interface SitcaFund {
    code: string;
    nav: number;
    currency: string;
    name: string;
    date: string;
  }
  ```

  The search filter (lines 80–100) — matches `code` and `name` only:
  ```ts
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
        exchange: "SITCA",
      });
      if (out.length >= max) break;
    }
    return out;
  }
  ```

  The parser (lines 115–131) builds `SitcaFund` from the whitelisted columns;
  it must additionally read the cert-code column.

- `src/features/market-data/sitcaFundProvider.test.ts` — existing test file;
  its `SAMPLE_CSV` already contains a 受益憑證代號 column (last column, values
  `TWDIE02` / `TWFOO99`), and `makeFundMap()` builds fund objects by hand.
  **Follow its structure for the new tests.**

- The CSV header, for reference (full 12 columns):
  `日期,會員代號,公司名稱,基金統編,基金代號,基金名稱,基金淨值,漲跌,漲跌幅,類型代號,幣別,受益憑證代號`

- Repo conventions: comments explain constraints, zh-TW column names are used
  as string constants, pure functions (`parseSitcaNavCsv`, `filterFunds`) are
  exported for tests while I/O stays in module-private helpers. Match this.

- Note on ticker identity: the app's fund ticker remains `SITCA:<基金代號>`
  (e.g. `SITCA:DIO04`). The cert code is a **search key only** — do NOT change
  the `symbol` produced for results, or existing holdings keyed on
  `SITCA:<基金代號>` would break quote lookups.

## Commands you will need

| Purpose   | Command                                        | Expected on success |
|-----------|------------------------------------------------|---------------------|
| Typecheck | `npx tsc`                                      | exit 0, no output   |
| Tests     | `npx vitest run src/features/market-data/sitcaFundProvider.test.ts` | all pass |
| Full tests| `npm test`                                     | all pass            |
| Lint      | `npm run lint`                                 | exit 0              |

## Scope

**In scope** (the only files you should modify):
- `src/features/market-data/sitcaFundProvider.ts`
- `src/features/market-data/sitcaFundProvider.test.ts`

**Out of scope** (do NOT touch, even though they look related):
- `src/features/market-data/useSymbolSearch.ts` — already calls
  `searchFunds(query)`; no change needed there.
- `fetchQuotes` symbol resolution — quotes are fetched by `SITCA:<基金代號>`;
  resolving quotes by cert code is not needed (users select from search
  results, which carry the canonical symbol).
- `src/data/csv.ts` (`parseCsvTable`) — the parser already returns all columns.

## Git workflow

- Branch: `fix/ai-sitca-cert-code-search` (repo convention: `fix/ai-<name>`,
  mandated by `.agentrules`)
- Commit style: conventional commits, e.g.
  `fix(market-data): match SITCA funds by 受益憑證代號 in ticker search`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Parse the 受益憑證代號 column into `SitcaFund`

In `src/features/market-data/sitcaFundProvider.ts`:

1. Add a column constant next to the others:
   ```ts
   const COL_CERT_CODE = "受益憑證代號";
   ```
2. Add `certCode: string;` to the `SitcaFund` interface (after `code`), with a
   short comment that this is the customer-facing certificate code (what bank
   platforms show, e.g. `T1605Y`) as opposed to the internal 基金代號.
3. In `parseSitcaNavCsv`, populate it: `certCode: clean(row[COL_CERT_CODE])`.

**Verify**: `npx tsc` → exit 0. (The test file's `makeFundMap()` will now have
a type error until Step 3 updates it — if `npx tsc` reports ONLY that, proceed
to Step 3 and re-verify.)

### Step 2: Match the cert code in `filterFunds`

Add a third match clause alongside the existing two:

```ts
const certMatch = (fund.certCode ?? "").toLowerCase().includes(q);
if (!codeMatch && !nameMatch && !certMatch) continue;
```

Do not change the emitted `symbol`/`name`/`exchange` fields.

**Verify**: `npx tsc` → exit 0 (subject to the Step 1 note).

### Step 3: Tests

In `src/features/market-data/sitcaFundProvider.test.ts`:

1. Update `makeFundMap()` to include a `certCode` on each fund (e.g. give
   `AAA01` cert code `T9901Y`), keeping the existing values working.
2. Extend the parse tests: assert `byCode.get("DIE02")?.certCode` equals the
   sample's last-column value (`TWDIE02`).
3. New `filterFunds` cases:
   - query `"T9901Y"` returns exactly the fund whose certCode it is, with
     `symbol` still `SITCA:AAA01` (canonical symbol unchanged);
   - lowercase query `"t9901y"` matches too (case-insensitive);
   - a query matching no code/name/certCode returns `[]` (may already exist —
     keep it passing).
4. Optionally add one realistic regression row to `SAMPLE_CSV` mirroring the
   reported fund (`DIO04` / `群益新興金鑽基金-新臺幣` / cert `T1605Y`) and assert
   `filterFunds(parseSitcaNavCsv(...), "T1605Y")` finds it.

**Verify**: `npx vitest run src/features/market-data/sitcaFundProvider.test.ts`
→ all pass, including the new cases.

## Test plan

Covered in Step 3. Pattern: the existing `describe("filterFunds")` /
`describe("parseSitcaNavCsv")` blocks in the same file.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `npx tsc` exits 0
- [ ] `npm test` exits 0; new cert-code tests exist and pass
- [ ] `grep -n "受益憑證代號" src/features/market-data/sitcaFundProvider.ts` shows
      the new `COL_CERT_CODE` constant (previously only in a comment)
- [ ] `npm run lint` exits 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts.
- You find the SITCA CSV header no longer contains a 受益憑證代號 column
  (check the comment at the top of the test file / the plan's captured row).
- The fix appears to require touching `useSymbolSearch.ts` or `provider.ts`.

## Maintenance notes

- Plan 152 (Chinese-name stock search) touches `useSymbolSearch.ts` but not
  this file; the two compose without conflict.
- Deliberately deferred: resolving a *manually typed* ticker `SITCA:T1605Y`
  in `fetchQuotes` (cert code → 基金代號 aliasing). Only worth doing if users
  report typing cert codes directly instead of picking a search result.
- If SITCA ever renames CSV columns, `parseSitcaNavCsv` silently drops rows;
  the hourly cache masks it. The existing test's captured header is the guard.
