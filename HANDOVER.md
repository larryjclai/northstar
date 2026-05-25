# Handover — Northstar UX Polish (4-part task)

**Branch**: `docs/windows-support-plan` (working directory clean before this batch).
**User**: 賴瑞晟 / larry.jc.lai@gmail.com.
**Date authored**: 2026-05-25.
**Project**: Northstar — Tauri + React 19 + Vite 6 + TanStack Query + SQLite (Tauri SQL plugin) / in-memory (browser).
**Type-check**: `npx tsc --noEmit` (passes after my partial work).

## What I've already done in this branch (don't redo)

1. **Removed FIRE 目標 card from Dashboard** — too much pressure for the daily view.
   - File: [src/routes/DashboardRoute.tsx](src/routes/DashboardRoute.tsx). Removed `import { FireGoalCard }` and the `<div className="mt-4"><FireGoalCard /></div>` block.
   - `FireGoalCard.tsx` is still on disk (used nowhere now). Safe to delete in a follow-up.
2. **Made FIRE 目標 right sidebar responsive** — the 320 px fixed column was overlapping content on common laptop widths.
   - File: [src/routes/GoalsRoute.tsx:147](src/routes/GoalsRoute.tsx#L147). Changed `lg:grid-cols-[minmax(0,1fr)_320px]` → `xl:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]`. Below xl (1280 px) the right panel stacks below the hero — that's the deliberate trade.
3. **Investments → 配置 → 庫存分布 + Top 10 collapse + remove 持倉明細**
   - File: [src/routes/InvestmentsRoute.tsx](src/routes/InvestmentsRoute.tsx) — replaced the two-card block at the bottom of `AccountDetail` with a single new `<AllocationCard>` component that:
     - Shows top 10 positions by market value (already pre-sorted by `sortedPositions`).
     - Has an expand/collapse toggle in the card header that flips between "展開全部（N）" and "收合" when there are more than 10 holdings.
     - Removed the entire `持倉明細` table (user said delete it).
   - The `formatPrice`/`formatQuantity` imports are still needed elsewhere in the file — don't strip them.

## What still needs doing (4 distinct tasks, varying size)

### TASK A — Cash-flow add-transaction form rework (high priority, medium size)

**User's exact ask** (translated): reorder the "新增收支" fields to: **名稱**, **金額**, **分類**, **帳戶**, **日期 + 時間**, **備註** — in that importance order. Style it like a clean modern transaction inspector (similar to the dark Lyft screenshot the user attached, but cleaner — match Northstar's light palette in [src/styles](src/styles)). Also: **let the user create a new category / subcategory inline** in the form, without having to detour to Settings.

**Files to touch**:

- [src/routes/CashFlowRoute.tsx:185-256](src/routes/CashFlowRoute.tsx#L185) — the `mode === "single"` branch. This is the form being rebuilt.
- [src/data/repositories.ts:11](src/data/repositories.ts) — `LedgerDraft` has no `name` field today. **"名稱"** in the user's request maps to the existing `merchant` field (e.g. "Trader Joe's", "Lyft"). Don't add a new column — re-label and re-purpose `merchant` as 名稱 in the UI. (If you decide a separate name+merchant split makes sense, that's a bigger schema change — discuss with user first.)
- [src/components/Field.tsx](src/components/Field.tsx) — existing primitives (Field, TextInput, SelectInput).
- For inline category creation: extend the category `<SelectInput>` to either (a) become a combobox that accepts free text and persists to `AppSettings.categories` on submit, or (b) add a small "+ 新增分類" affordance below the dropdown that opens a tiny inline editor. Persistence path: `useFinanceData().settings.data` → mutate via `useRepositoryMutation((repo, next: AppSettings) => repo.updateAppSettings(next), ["settings"])`. Pattern already in use at [src/routes/CashFlowRoute.tsx:102-113](src/routes/CashFlowRoute.tsx#L102) (`rememberMerchants`) — copy that shape for `rememberCategory(name)` / `rememberSubcategory(parentName, childName)`.
- Subcategories live as children of a category — see `CategoryGroup` in [src/domain/types.ts:145](src/domain/types.ts#L145).

**Design notes**:
- The user wants "名稱" as the **most prominent** field (large input, top). Echo the Lyft inspector: title-like field at top, big right-aligned amount, then meta fields in a tighter grid.
- Keep the existing amount-expression input (`amountExpression` state — supports `120+85`-style math via `evaluateAmountExpression`). Don't break it.
- Keep the 支出/收入 toggle. Move it to live next to the amount (sign indicator).
- Keep `DateTimeField` for date+time (one composite field, demoted to lower priority).
- Settlement status (`已收付 / 應收 / 應付`) and 幣別 — move to a collapsible "進階" group; they're rarely changed for a single keystroke entry.

**Acceptance**:
- Field order top-to-bottom matches: 名稱 → 金額 → 分類(+子分類) → 帳戶 → 日期+時間 → 備註 (advanced: 幣別, 狀態).
- Typing a new category name and submitting persists it to `AppSettings.categories` so it shows up in the dropdown next time without visiting Settings.
- Same for subcategories under the chosen category.
- Editing an existing transaction still works (the route reuses the same form via `setEditingId` / `setLedgerForm` — see lines 330-347).
- E2E test: [playwright.config.ts](playwright.config.ts) defines the suite root; check `tests/` for ledger flow tests if they exist and update.

### TASK B — Investment account view: sticky left account list (small)

**User's ask**: on the 投資 → 帳戶 tab, when the right panel scrolls long, the **left account list should stay visible like a sidebar** (sticky), not scroll away with the page.

**Files to touch**:

- [src/routes/InvestmentsRoute.tsx:229-234](src/routes/InvestmentsRoute.tsx#L229) — `AccountsTab` returns:
  ```tsx
  <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
    <AccountList … />
    <AccountDetail … />
  </div>
  ```
- The page itself scrolls via the outer route wrapper. The AppShell already makes the nav sticky (see [src/components/AppShell.tsx:33](src/components/AppShell.tsx#L33) — `lg:sticky lg:top-0 lg:block lg:h-screen lg:self-start`).
- Apply the **same pattern to `<AccountList>`** at lg+: wrap (or add to its root div) the classes `lg:sticky lg:top-4 lg:self-start lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto`. The existing inner `max-h-[70vh] overflow-y-auto` on line 259 can stay — outer sticky + inner scroll is the desired feel.
- Verify on the 投資 → 帳戶 tab in a window short enough that `AccountDetail` exceeds the viewport. The account chooser should stay visible at the top-left as you scroll.

### TASK C — Yahoo Finance asset type / sector enrichment (the biggest piece)

**User's ask**: when looking at 持倉 / 庫存分布, they want each ticker classified by **產業 (sector)** and by **type (ETF vs Equity etc.)**, editable in the 持倉 編輯 dialog. They also want to **bulk-backfill** these fields for tickers they already hold, since old data doesn't have them.

#### Can Yahoo give us this?

Yes, but **not via the endpoints currently in use**. Current usage in [src/features/market-data/yahooFinanceProvider.ts](src/features/market-data/yahooFinanceProvider.ts):

- `/v8/finance/chart/{symbol}` — price + name. **No sector/industry/quoteType in the response.**
- `/v1/finance/search?q=...` — already returns `quoteType` (EQUITY / ETF / MUTUALFUND / INDEX) and `typeDisp` (line 113-122). Used only at the symbol-picker. **Could be leveraged opportunistically when adding a new holding** to capture asset type cheaply.

To get **sector** + **industry** + reliable **quoteType** for an existing ticker, add a new endpoint:

```
GET /v10/finance/quoteSummary/{symbol}?modules=assetProfile,summaryProfile,quoteType,fundProfile
```

Returns (shape simplified):
- `quoteType.quoteType`: "EQUITY" | "ETF" | "MUTUALFUND" | ...
- `assetProfile.sector` / `assetProfile.industry` — only for equities.
- `summaryProfile.sector` / `summaryProfile.industry` — fallback for equities.
- `fundProfile.categoryName` — "Technology", "Large Blend", etc. — for ETFs / mutual funds.

This call works through the existing Tauri proxy: see the `fetch_yahoo` command wired up in [src-tauri](src-tauri/). Should "just work" if you reuse `fetchYahooJson()` and update the `quoteSummary` URL path. Test against `2330.TW` (Equity, 半導體業) and `0050.TW` (ETF, no sector but has `fundProfile.categoryName`).

> **Caveat**: Yahoo occasionally rate-limits `quoteSummary` for unauthenticated traffic and may require a crumb. The chart endpoint Northstar uses today does not. If a 401/429 surfaces, look at the existing Tauri proxy at [src-tauri/src](src-tauri/src) — you may need to extend it to forward `crumb`/cookies the way newer wrappers do. Plan B: scrape `summaryProfile` from `https://query2.finance.yahoo.com/v10/finance/quoteSummary/` and degrade gracefully if it fails (degrade ≠ silently — surface "未能取得分類，請手動填入").

#### Schema additions

`portfolio_assets` table — add three nullable text columns (mirror the pattern at [src/data/repositories.ts:957-961](src/data/repositories.ts#L957) using `ensureSqliteColumn`):

```ts
await this.ensureSqliteColumn("portfolio_assets", "asset_type", "text"); // 'equity' | 'etf' | 'mutual_fund' | 'index' | 'crypto' | 'cash' | 'other'
await this.ensureSqliteColumn("portfolio_assets", "sector", "text");
await this.ensureSqliteColumn("portfolio_assets", "industry", "text");
```

Then plumb through:
- [src/domain/types.ts:56](src/domain/types.ts#L56) — `PortfolioAsset` add three optional fields.
- [src/data/repositories.ts:88](src/data/repositories.ts#L88) — `PortfolioAssetDraft` add the three fields.
- `manualHoldingFields()` and `createManualHoldingRow()` at [src/data/repositories.ts:2191-2218](src/data/repositories.ts#L2191) — pass through.
- `updateManualHolding` SQL at line 1112 — extend the `set` clause.
- `insertAssetRow` for snapshot import at line 1806 — extend insert columns.
- `listPortfolioAssets` query at line 1093-1097 — extend select.

#### UI — 持倉 編輯

[src/components/HoldingForm.tsx](src/components/HoldingForm.tsx) — add two fields below 起始日期:

- **類型 (asset_type)**: SelectInput with options 股票 / ETF / 共同基金 / 指數 / 加密貨幣 / 現金 / 其他.
- **產業 / 類別 (sector + industry)**: For equities, two text inputs (with autocomplete from a small fixed list of 11 GICS sectors). For ETFs/funds, one input mapped to Yahoo's `fundProfile.categoryName`.

Wire the dialog at [src/routes/InvestmentsRoute.tsx:717-747](src/routes/InvestmentsRoute.tsx#L717) (`editingAsset && editForm` block) — already pipes through to `updateManualHolding`. Just make sure `editForm` carries the new fields when `startEdit()` initializes it (line 603-615).

#### Bulk backfill

User specifically asks: "如果有這個功能的話也希望你能夠讓我一次性回補相關的資料". Add a **回補資料** action button on the 持倉 tab (next to 更新報價 at [src/routes/InvestmentsRoute.tsx:110-117](src/routes/InvestmentsRoute.tsx#L110)).

Recommended shape:

1. Add a new market-data method `fetchAssetProfiles(symbols: string[]): Promise<Record<string, { assetType, sector, industry }>>` to [src/features/market-data/provider.ts](src/features/market-data/provider.ts) + Yahoo impl. Batch / throttle (Yahoo is iffy; 4-8 in flight is safe — use `Promise.allSettled` like the existing `fetchQuotes`).
2. New mutation hook in [src/features/market-data/useMarketRefresh.ts](src/features/market-data/useMarketRefresh.ts) — `useBackfillAssetProfiles()` — that:
   - Reads all current `PortfolioAsset` rows.
   - Filters to ones missing `assetType` (or all of them, behind a "強制重新分類" toggle).
   - Calls `fetchAssetProfiles` in chunks.
   - For each successful result, calls `updateManualHolding` (manual rows) **and** writes a new repo method `updateAssetClassification(id, { assetType, sector, industry })` that works on `holdingSource = 'transactions'` rows too (those can't be edited via `updateManualHolding`).
3. UI feedback: toast progress ("回補中 12 / 47…") via the existing `useToast()` hook. Confirm before running — call this out as "會打 Yahoo Finance 數十次".

> **Why a separate write path for transaction-sourced holdings?** Today `updateManualHolding` rejects non-manual rows (see line 621-624). Classification is metadata, not quantity — it should be editable regardless of `holdingSource`. Add `updateAssetClassification` so we don't soften the existing manual-vs-transactions invariant.

#### Surface the classification

Once the data exists, surface it. Lightweight wins:

- 持倉 table at [src/routes/InvestmentsRoute.tsx:651-661](src/routes/InvestmentsRoute.tsx#L651) — add a 類型 column (chip-style, small).
- 庫存分布 card I just added — optionally add a 依產業分組 toggle to roll up bars by sector instead of by ticker.
- Don't over-engineer — let the user decide which views they want once the data is in.

### TASK D (already partly done; nothing left from item 4 except what's covered in Task C)

The rename, Top 10 collapse, and 持倉明細 removal are done. Task C above covers the Yahoo classification piece.

## Patterns / conventions worth knowing before you start

- **No new files for one-shot ideas.** Edit existing files unless the new module pulls its weight.
- **No comments unless the WHY is non-obvious** — Larry has a clean codebase. Read [.claude](.claude/) settings + recent commits for tone (`git log --oneline -20`).
- **All UI strings are Traditional Chinese (zh-Hant-TW)** with the occasional English label for technical concepts (Coast FIRE, Ticker). Match that voice.
- **Tailwind v4** with CSS variables (`var(--ns-accent)`, `var(--ns-surface)`, etc.) — see [src/styles](src/styles/) for the token list. Don't introduce hex codes inline.
- **Repository pattern**: there are two impls (Tauri SQLite and browser in-memory) sharing one interface in [src/data/repositories.ts](src/data/repositories.ts). Anything you add to the interface needs both impls. The browser impl is what `vitest` and dev-server hit; Tauri impl is the shipping app.
- **Migrations** are forward-only via `ensureSqliteColumn` (idempotent `ADD COLUMN`) — no down-migrations. Mirror what's there at lines 947-976.
- **Tests**: `npm test` for unit (vitest), `npm run test:e2e` for Playwright. Don't add either unless the change is non-trivial — Larry runs them himself when reviewing.
- **Type check**: `npx tsc --noEmit` runs clean as of this handover. Run it after schema/draft changes.
- **No emojis in code or commit messages.**

## Recommended order

1. **Task B** (sticky sidebar) — ~10 lines of Tailwind. Ship as its own commit.
2. **Task A** (cash-flow form) — biggest UX surface; user feels it daily. Inline-category creation is the headline win.
3. **Task C** (Yahoo enrichment) — split into two commits: (1) schema + HoldingForm fields + manual edit path, (2) bulk backfill + new endpoint. Skip the table column / sector grouping unless time permits — those are bonus.

## Things I'd flag before you start

- **`merchant` vs new "名稱" field** in Task A: I recommend re-purposing `merchant` rather than adding a new column. If the user pushes back ("名稱 should be free text, merchant is the vendor"), revisit and add a `name text not null default ''` column via `ensureSqliteColumn`. Existing rows backfill to empty string.
- **Yahoo `quoteSummary` rate limiting** is a real risk for the bulk backfill. Build the throttling early; don't rely on testing it post hoc on a portfolio of 30+ tickers.
- **Sticky sidebar interaction with PageHeader**: the PageHeader at the top of [InvestmentsRoute.tsx](src/routes/InvestmentsRoute.tsx) and the SegmentedControl tab bar should probably **not** scroll under the sticky AccountList. Test the visual once it's sticky and adjust `top-` offset if it looks off.
- The user said "謝謝" at the end — they're aware this is a big batch. It's fine to ship in pieces and ask before scope-creeping into adjacent cleanups.

— previous agent (Claude Opus 4.7), 2026-05-25
