# repositories.ts Refactor Plan

Baseline: commit `9115a2b5` — file is 4772 lines, 10 test files / 52 tests.

## 1. Entity Groups (BrowserFinanceRepository, lines 501–1683)

| Group | Methods | Line range | `RepositoryData` fields touched |
|-------|---------|------------|----------------------------------|
| **Accounts** | `listAccounts`, `createAccount`, `updateAccount`, `deleteAccount` | 582–644 | `accounts`, `ledgerTransactions` (via recompute) |
| **Ledger** | `listLedgerTransactions`, `createLedgerTransaction`, `updateLedgerTransaction`, `setLedgerReviewed`, `deleteLedgerTransaction`, `createInstallmentPlan`, `deleteInstallmentPlan`, `applyRecurringScopeEdit`, `createTransfer`, `importLedgerTransactions` | 646–855 | `ledgerTransactions`, `accounts` (via recompute), `investmentRecords` |
| **Investments (assets + records)** | `listPortfolioAssets`, `createManualHolding`, `updateManualHolding`, `updateAssetClassification`, `deleteManualHolding`, `listInvestmentRecords`, `createInvestmentRecord`, `updateInvestmentRecord`, `deleteInvestmentRecord`, `importInvestmentRecords`, `importInvestmentActivity` | 857–1036 | `portfolioAssets`, `investmentRecords`, `ledgerTransactions`, `accounts` (via recompute) |
| **Recurring transactions** | `listRecurringTransactions`, `createRecurringTransaction`, `updateRecurringTransaction`, `deleteRecurringTransaction`, `postRecurringTransaction`, `postDueRecurringTransactions` | 1038–1141 | `recurringTransactions`, `ledgerTransactions`, `accounts` (via recompute) |
| **Recurring investments** | `listRecurringInvestments`, `createRecurringInvestment`, `updateRecurringInvestment`, `deleteRecurringInvestment`, `postRecurringInvestment` | 1143–1200 | `recurringInvestments`, `investmentRecords`, `portfolioAssets`, `ledgerTransactions`, `accounts` (via recompute) |
| **Admin / bulk** | `adjustAccountBalance`, `recalculateDerivedData`, `renameMerchant`, `renameCategory`, `renameSubcategory` | 1181–1268 | `accounts`, `ledgerTransactions`, `portfolioAssets`, `investmentRecords` |
| **Market data** | `listMarketQuotes`, `saveMarketQuotes`, `listDailyFxRates`, `saveDailyFxRates`, `getDailyFxRate`, `listDailyPrices`, `saveDailyPrices`, `getDailyPrice`, `listManualPriceSnapshots`, `createManualPriceSnapshot`, `deleteManualPriceSnapshot` | 1270–1410 | `marketQuotes`, `dailyFxRates`, `dailyPrices`, `manualPriceSnapshots`; **also** `portfolioAssets` (saveMarketQuotes propagates localized names) |
| **App settings** | `getAppSettings`, `updateAppSettings` | 1295–1304 | `settings`, `settingsRevision`, `settingsUpdatedAt` |
| **Financial goals** | `listFinancialGoals`, `upsertFinancialGoal`, `deleteFinancialGoal` | 1412–1454 | `financialGoals` |
| **Snapshot / sync** | `exportSnapshot`, `importSnapshot`, `applySyncChanges`, `getSyncPayload`, `collectPendingChanges`, `acknowledgePendingChanges`, `listSyncConflicts`, `resolveSyncConflict` | 1456–1673 | all fields |

Note: `getAppSettings` and `updateAppSettings` are interleaved within the market-data line range (1295–1304) but belong to the **App settings** group.

## 2. `recompute()` Fan-out (BrowserFinanceRepository)

`private recompute()` (line 1675) recomputes:
- `this.data.accounts` via `recomputeAccounts(accounts, ledgerTransactions)`
- `this.data.portfolioAssets` via `recomputeAssets(portfolioAssets, investmentRecords)`

Call sites in `BrowserFinanceRepository`:

| Line | Method |
|------|--------|
| 515 | `initialize` |
| 632 | `createAccount` |
| 675 | `createLedgerTransaction` |
| 684 | `updateLedgerTransaction` |
| 703 | `deleteLedgerTransaction` |
| 724 | `createInstallmentPlan` |
| 737 | `deleteInstallmentPlan` |
| 846 | `createTransfer` |
| 853 | (inside `createTransfer`) |
| 867 | `importLedgerTransactions` |
| 890 | `createManualHolding` |
| 921 | `deleteManualHolding` |
| 940 | `createInvestmentRecord` |
| 970 | `updateInvestmentRecord` |
| 985 | `deleteInvestmentRecord` |
| 1002 | `importInvestmentRecords` |
| 1034 | `importInvestmentActivity` |
| 1092 | `postRecurringTransaction` |
| 1137 | `postDueRecurringTransactions` |
| 1199 | `postRecurringInvestment` |
| 1206 | `adjustAccountBalance` |
| 1571 | `importSnapshot` |
| 1602 | `applySyncChanges` |

**None of the 11 market-data methods call `recompute()`.**

`TauriSqlFinanceRepository` uses async `recomputeSqliteAccounts()` / `recomputeSqliteAssets()` instead; market-data SQL overrides also do NOT call either.

## 3. Shared Private Helpers

| Helper | Line | Used by market-data group? |
|--------|------|---------------------------|
| `nowIso()` | 416 (module-level fn) | YES — `saveMarketQuotes`, `saveDailyFxRates`, `saveDailyPrices`, `createManualPriceSnapshot` |
| `createId(prefix)` | 420 (module-level fn) | YES — `createManualPriceSnapshot` |
| `bump(record)` | 424 (module-level fn) | No |
| `active(rows)` | 428 (module-level fn) | No |
| `persist()` | 1680 (class private) | YES — all write methods |

`nowIso` and `createId` are module-level functions (not class methods), so they can be imported directly in `marketDataStore.ts`. `persist` is a class private; it must be passed via context.

### Special case: `saveMarketQuotes` touches `portfolioAssets`

`saveMarketQuotes` (line 1274) writes back to `data.portfolioAssets` to propagate localized names (`nameZh`, `nameEn`). This means the context object passed to `createMarketDataStore` must include `portfolioAssets` as a **writable reference** (the plan's Pick needs to be extended).

The extended context data pick:
```ts
Pick<RepositoryData, "marketQuotes" | "dailyFxRates" | "dailyPrices" | "manualPriceSnapshots" | "portfolioAssets">
```

This is still safe — the write is not a `recompute()` call; it only denormalizes display names onto assets in-place.

## 4. Proposed Extraction Order

Ordered from least-entangled (fewest cross-group dependencies + no recompute) to hardest:

| Priority | Group | Calls recompute? | Cross-group data writes | Notes |
|----------|-------|-----------------|------------------------|-------|
| **1 — NOW** | Market data | **No** | `portfolioAssets` (name denorm only, no structural change) | Safe seam; extracted in this PR |
| 2 | App settings | No | None | Fully self-contained; tiny (2 methods) |
| 3 | Financial goals | No | None | Fully self-contained; 3 methods, soft-delete pattern |
| 4 | Manual price snapshots (already in market data) | No | None | Already extracted with market data group |
| 5 | Accounts | **Yes** | `ledgerTransactions` (read-only for recompute) | Must carry recompute; 4 methods |
| 6 | Recurring transactions | **Yes** | `ledgerTransactions` write, `accounts` recompute | 6 methods; `postDueRecurringTransactions` is complex |
| 7 | Investments (assets + records) | **Yes** | `ledgerTransactions` write, `accounts` recompute, `portfolioAssets` recompute | Heavy entanglement; 11 methods |
| 8 | Recurring investments | **Yes** | Same as investments + recurring | Depends on investments being stable |
| 9 | Ledger | **Yes** | `accounts` recompute, `investmentRecords` read | Largest group; most complex |
| 10 | Snapshot / sync | **Yes** | All fields | Must come last; depends on all other groups |
| 11 | Admin / bulk | **Yes** | `ledgerTransactions`, `accounts`, `portfolioAssets`, `investmentRecords` | Utility group; best extracted after main groups |

## 5. Current Status

- **Plan 009** (this plan): map written + market-data seam extracted  
- All subsequent extractions pending operator review

See `plans/README.md` for plan status.
