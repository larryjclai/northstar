# Plan 061: Add a search box to the 持倉 (holdings) list

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result. If a STOP condition occurs, stop and
> report. Update this plan's row in `plans/README.md` unless a reviewer maintains it.
>
> **Drift check (run first)**:
> `git diff --stat 65775330..HEAD -- src/routes/InvestmentsRoute.tsx`
> If it changed, compare the "Current state" excerpts against live code first.

## Status
- **Priority**: P3
- **Effort**: S
- **Risk**: LOW (UI filter only)
- **Depends on**: none
- **Category**: feature (UX)
- **Planned at**: commit `65775330`, 2026-06-23

## Why this matters
Operator-reported: 持倉頁面也要有搜尋的功能. The holdings list can be long (the
operator has 40+ positions across 2 pages); there's a sector filter, an account
filter, sort, and pagination, but no way to type a ticker/name to find a holding.
The bookkeeping 近期動態 and the Accounts list already have search; the holdings
list should match.

## Current state
`src/routes/InvestmentsRoute.tsx` — the holdings table component has filter state and
a filtered list:
```ts
const [filterAccount, setFilterAccount] = useState<string>("all");           // ~line 1011
const [filterSector, setFilterSectorState] = useState<string>(initialSector ?? "all"); // ~1012
useEffect(() => setPage(1), [filterAccount, filterSector]);                   // ~1041 (reset page on filter change)
// …
const filteredPositions = positions.filter((p) => { /* account + sector filters */ }); // ~1149
const sorted = sortHoldings(filteredPositions, sort, accountMap, assetsById, nameLocale, toPrimary);
const totalPages = Math.ceil(sorted.length / pageSize);
const paginated = sorted.slice((page - 1) * pageSize, page * pageSize);
```
Each position has a `ticker` and the asset has a name (`assetsById.get(p.assetId)?.name` /
`nameZh`). There's a filter row UI where `filterAccount`/`filterSector` dropdowns render
(grep `filterControlStyle` / the filter row JSX).

The Accounts search exemplar (plan 021) is in `src/routes/AccountsRoute.tsx` — a text
input that filters rows by name (case-insensitive `.toLowerCase().includes(...)`), shown
only when the list is long, with a "找不到符合的…" empty hint.

### Conventions to follow
- Match the existing filter-row controls' styling (`filterControlStyle` in this file).
- Reset to page 1 when the search term changes (extend the existing `useEffect` deps).
- Filter on BOTH ticker and resolved name (the list shows both); case-insensitive.
- zh-TW placeholder (e.g. `搜尋代號或名稱`).

## Commands you will need
| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | exit 0 |
| Tests | `npm test` | all pass |
| Lint | `npm run lint` | exit 0 (0 errors) |
| Build | `npm run build` | exit 0 |
| Dev (visual) | `npm run dev` | serves 127.0.0.1 |

## Scope
**In scope:**
- `src/routes/InvestmentsRoute.tsx` — add a `searchTerm` state + input in the holdings
  filter row; include it in `filteredPositions`; reset page on change.
**Out of scope:**
- The 交易紀錄 tab (it has its own filters), 分析 tab, the holdings data/valuation.
- Sort, pagination, account/sector filter logic (only ADD the search predicate).

## Git workflow
- Branch from current main: `git checkout -B advisor/061-holdings-search main`.
- Short imperative commit style. Do NOT push/PR.

## Steps
### Step 1: add the search state + predicate
Add `const [searchTerm, setSearchTerm] = useState("")`. In `filteredPositions`, add a
case-insensitive match on the position's ticker AND the resolved asset name
(`assetsById.get(p.assetId)`), e.g. `if (q && !`${ticker} ${name} ${nameZh}`.toLowerCase().includes(q)) return false`.
Add `searchTerm` to the page-reset `useEffect` deps.
**Verify**: `npx tsc --noEmit` → 0.
### Step 2: render the input
Add a text input in the holdings filter row, styled like the existing filter controls
(`filterControlStyle`), placeholder `搜尋代號或名稱`. Optionally gate it on
`positions.length > N` like the Accounts search. If the filtered list is empty due to
search, show a brief "找不到符合的持倉" hint (mirror AccountsRoute).
**Verify**: `npx tsc --noEmit` → 0; `npm run lint` → 0 errors; visually, typing filters the rows.
### Step 3: full verification
`npx tsc --noEmit` 0; `npm test` all pass; `npm run lint` 0 errors; `npm run build` 0.

## Test plan
- UI filter; verify visually (type a ticker → only matching rows; clear → all return).
  If no preview, code inspection + the build/lint/test gates.
- Existing tests stay green (no data/logic change).

## Done criteria
- [ ] The 持倉 list has a search box filtering by ticker + name (case-insensitive)
- [ ] Page resets to 1 on search change; sort/account/sector filters still work
- [ ] `npx tsc --noEmit` 0; `npm test` all pass; `npm run lint` 0 errors; `npm run build` 0
- [ ] Only `src/routes/InvestmentsRoute.tsx` modified
- [ ] `plans/README.md` row updated

## STOP conditions
- Code at cited lines doesn't match (drift since `65775330`).
- The holdings table turns out to be a separate component file — re-point scope and report.

## Maintenance notes
- Reviewer: confirm the search composes with the existing account/sector filters
  (AND semantics) and that pagination resets.
- If a global command-palette search later covers holdings, this local box can stay or fold in.
