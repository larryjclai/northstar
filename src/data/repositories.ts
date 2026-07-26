import type Database from "@tauri-apps/plugin-sql";
import { createMarketDataStore, type MarketDataStore } from "./marketDataStore";
import type {
  Account,
  AppSettings,
  AssetType,
  Book,
  BookKind,
  Client,
  CreditGroup,
  DailyFxRate,
  DailyPrice,
  FinancialGoal,
  GoalDisplayMode,
  GoalKind,
  IncomeItem,
  Invoice,
  InvestmentAction,
  InvestmentRecord,
  LedgerTransaction,
  ManualPriceSnapshot,
  PortfolioAsset,
  RecalculationReport,
  RecurringInvestment,
  RecurringInvestmentMode,
  RecurringTransaction,
  SpendingItem,
} from "../domain/types";
import type { MarketQuote } from "../features/market-data";
import { calculateInvestmentAccountQuantity, calculateInvestmentCashDelta, calculateInvestmentQuantity, isEffectivelyNegative } from "../domain/investmentCash";
import { buildPositionMetrics } from "../domain/portfolioMetrics";
import { firstFutureRunDate, nextRecurringDate } from "../domain/recurringDates";
import { buildInstallmentSchedule } from "../domain/installments";
import { buildSplitLegs, type SplitLegInput, type SplitSharedFields, type SplitShareInput } from "../domain/splitLegs";
import { toCanonicalSector } from "../domain/canonicalSector";
import { isTaiwanListedTicker } from "../domain/marketSymbols";
import { planMintMerge } from "../domain/bookMerge";
import { accountBalanceDelta, assertLedgerInvariants, assertTransferInvariants, buildRecalculationReport, deriveAccountBalances, findMissingFxPairs } from "../domain/ledgerTrust";
import {
  buildPendingChanges,
  type SyncApplyChange,
  type SyncConflictRecord,
  type SyncEntity,
  type SyncSource,
} from "../domain/sync";
import {
  ADDITIVE_COLUMNS,
  ADDITIVE_INDEXES,
  migrations,
  schemaFingerprint,
  splitSqlStatements,
  SYNC_TRIGGER_ENTITIES,
} from "./migrations";
import {
  seedAccounts,
  seedAssets,
  seedInvestmentRecords,
  seedLedgerTransactions,
  seedRecurringTransactions,
} from "./seed";

export interface StoredMarketQuote extends MarketQuote {
  source: string;
  updatedAt: string;
}

export interface LedgerDraft {
  accountId: string;
  /** Reimbursement (代墊) counter account. See LedgerTransaction.counterAccountId. */
  counterAccountId?: string | null;
  date: string;
  name: string;
  amount: number;
  currency: string;
  originalAmount?: number | null;
  originalCurrency?: string | null;
  category: string;
  subcategory: string;
  merchant: string;
  entryType: "income" | "expense" | "transfer";
  settlementStatus: "settled" | "receivable" | "payable";
  note: string;
  groupId?: string | null;
  /** 多類別拆分/分帳 leg discriminator. See LedgerTransaction.legKind. */
  legKind?: "category" | "share" | null;
  feeAmount?: number;
  installmentGroupId?: string | null;
  installmentIndex?: number | null;
  installmentTotal?: number | null;
  refundOfLedgerId?: string | null;
  recurringOccurrenceKey?: string | null;
  postDate?: string | null;
}

export type AccountDraft = Pick<Account, "name" | "currency" | "openingBalance" | "type" | "creditLimit" | "creditLimitGroup" | "statementDay" | "paymentDueDay" | "creditPaymentPaidUntil" | "isSharedToHousehold" | "loanStartDate" | "annualInterestRate" | "loanTerm" | "iconName" | "color" | "bankBrandDomain"> & {
  customGroup?: string;
  /** 帳本 the account belongs to. Omitted → repositories assign the default 個人帳. */
  bookId?: string;
  /** 信用卡群組 (plan 254/255). Omitted → repositories keep the account's existing
   *  linkage (update) or leave it ungrouped (create). Optional (not in the strict
   *  Pick above) because UI callers predating plan 256 don't set it yet. */
  creditGroupId?: string | null;
};

/** Fields a caller supplies to create/update a 帳本 (Book). */
export type BookDraft = Pick<Book, "name" | "kind" | "includeInPersonalNetWorth" | "includeInFireMetrics" | "color">;

/**
 * Fields a caller supplies to create/update an 發票 (Invoice). No `settledAt`
 * — a new invoice always starts unsettled; `stampInvoiceSettled` is the only
 * way to set or clear it.
 */
export type InvoiceDraft = Pick<
  Invoice,
  "bookId" | "clientId" | "invoiceNumber" | "issueDate" | "dueDate" | "amount" | "taxExclusiveAmount" | "taxAmount" | "linkedLedgerTransactionId"
>;

/** Fields a caller supplies to create/update a 客戶 (Client). */
export type ClientDraft = Pick<Client, "bookId" | "name" | "taxId" | "defaultPaymentTerms">;

/** Fields a caller supplies to create/update a 信用卡群組 (Credit group, plan 254/255). */
export type CreditGroupDraft = Pick<CreditGroup, "name" | "currency" | "creditLimit" | "statementDay" | "paymentDueDay">;

export interface RecurringDraft {
  accountId: string;
  counterAccountId?: string | null;
  amount: number;
  currency: string;
  category: string;
  subcategory: string;
  merchant: string;
  entryType: "income" | "expense";
  settlementStatus: "settled" | "receivable" | "payable";
  note: string;
  frequency: import("../domain").RecurringFrequency;
  dayOfMonth: number;
  nextRunDate: string;
  isActive: boolean;
  /** App-timezone "today" for seeding the first run; omitted → UTC fallback. */
  seedToday?: string;
}

/** Scope for editing a recurring-rule-generated ledger occurrence. */
export type RecurringEditScope = "this" | "future" | "all";

export interface RecurringInvestmentDraft {
  accountId: string;
  ticker: string;
  name: string;
  currency: string;
  mode: RecurringInvestmentMode;
  amount: number;
  quantity: number;
  price: number;
  fee: number;
  frequency: import("../domain").RecurringFrequency;
  dayOfMonth: number;
  nextRunDate: string;
  isActive: boolean;
  note: string;
  /** App-timezone "today" for seeding the first run; omitted → UTC fallback. */
  seedToday?: string;
}

export interface TransferDraft {
  date: string;
  sourceAccountId: string;
  destinationAccountId: string;
  sourceCurrency: string;
  destinationCurrency: string;
  sourceAmount: number;
  destinationAmount?: number;
  note: string;
  feeAmount?: number;
}

export interface InvestmentDraft {
  ticker: string;
  name: string;
  currency: string;
  linkedAccountId?: string | null;
  date: string;
  action: InvestmentAction;
  price: number;
  quantity: number;
  fee: number;
  note: string;
  assetType?: AssetType | null;
  sector?: string | null;
  industry?: string | null;
  /** Opening-balance lot: skip the cash/交割 ledger leg. See InvestmentRecord.cashless. */
  cashless?: boolean;
}

/**
 * 股息再投入 (DRIP) input: one dividend reinvested into the same asset. Creates a
 * linked `cashDividend` leg (the full dividend amount) + a `buy` leg (the
 * reinvested shares at the reinvestment price), both sharing one `dripGroupId`.
 * See docs/drip-plan.md. Residual cash = dividendAmount − quantity × price stays
 * in the account (≥ 0).
 */
export interface DividendReinvestmentDraft {
  ticker: string;
  name: string;
  currency: string;
  linkedAccountId?: string | null;
  date: string;
  /** Shares bought with the dividend (Q > 0). */
  quantity: number;
  /** Reinvestment price per share (P > 0). */
  price: number;
  /** Total cash dividend received (A ≥ Q × P). */
  dividendAmount: number;
  /** Tax / fee withheld from the dividend (reduces the counted dividend). */
  dividendFee?: number;
  /** Brokerage fee on the reinvestment buy. */
  buyFee?: number;
  note: string;
  assetType?: AssetType | null;
  sector?: string | null;
  industry?: string | null;
}

export interface PortfolioAssetDraft {
  ticker: string;
  name: string;
  currency: string;
  totalQuantity: number;
  averageCost: number;
  acquisitionDate: string | null;
  accountId: string | null;
  assetType?: AssetType | null;
  sector?: string | null;
  industry?: string | null;
}

type AssetClassificationInput = Pick<PortfolioAssetDraft, "assetType" | "sector" | "industry"> & {
  nameZh?: string | null;
  nameEn?: string | null;
  /**
   * Manual-lock signal. Set true only when the USER saves a classification by
   * hand in the edit modal — it sets `classificationLocked` so 回補分類 skips the
   * row. Omitted/false on auto-backfill calls, which then preserves whatever
   * lock state the row already had.
   */
  lockClassification?: boolean;
};

export interface ManualPriceSnapshotDraft {
  assetId: string;
  date: string;
  price: number;
  note: string;
}

type ImportMeta = { importRow?: number; importLabel?: string };

export interface InvestmentActivityImportDraft {
  investments: Array<InvestmentDraft & ImportMeta>;
  cash: Array<LedgerDraft & ImportMeta>;
}

export interface FinancialGoalDraft {
  kind: GoalKind;
  name: string;
  currency: string;
  annualSpending: number;
  withdrawalRate: number;
  expectedAnnualReturn: number;
  monthlyContribution: number;
  targetAmount: number | null;
  startDate: string;
  // Phase 7 extensions — all optional so existing callers (CSV importer, old
  // FireGoalEditor) keep compiling. The repo normalizer fills defaults.
  currentAge?: number | null;
  retirementAge?: number | null;
  planThroughAge?: number | null;
  preRetirementReturn?: number | null;
  postRetirementReturn?: number | null;
  inflationRate?: number | null;
  annualFee?: number | null;
  contributionGrowthRate?: number | null;
  spendingItems?: SpendingItem[];
  incomeItems?: IncomeItem[];
  displayMode?: GoalDisplayMode;
  accountShareMap?: Record<string, number>;
  targetDate?: string | null;
}

export interface FinanceRepository {
  initialize(): Promise<void>;
  /** 帳本 (Books). There is always at least the default 個人帳 —
   *  `deleteBook` refuses to remove the last personal book. Delete is a
   *  soft-delete (deletedAt + revision bump) so the tombstone syncs. */
  listBooks(): Promise<Book[]>;
  createBook(input: BookDraft): Promise<void>;
  updateBook(id: string, input: BookDraft): Promise<void>;
  /** Soft-delete a 帳本. Throws (zh-TW) if the book still has accounts,
   *  invoices, or clients, or if it is the last personal book. Never cascades. */
  deleteBook(id: string): Promise<void>;
  /**
   * Plan 211 — drains (returns and resets to 0) the count of books THIS
   * device's own merge routine (`planMintMerge`) has tombstoned since the
   * last drain. A book this device only ever RECEIVED as an already-
   * tombstoned row via sync (another device computed the merge) never
   * increments this counter — only a merge this device itself computed does.
   * The UI/sync-layer announce hook (plan 211 decision 1) calls this after
   * every point it might have triggered a merge (app init, a sync pull) and
   * raises a toast when the result is > 0. Safe to call repeatedly — returns
   * 0 when there is nothing new to announce.
   */
  consumeBookMergeAnnouncement(): Promise<number>;
  /** 發票 (Invoices) — plan 190. Additive metadata; see `Invoice`. */
  listInvoices(): Promise<Invoice[]>;
  createInvoice(input: InvoiceDraft): Promise<void>;
  updateInvoice(id: string, input: InvoiceDraft): Promise<void>;
  /** 客戶主檔 (Clients) — plan 190. See `Client`. */
  listClients(): Promise<Client[]>;
  createClient(input: ClientDraft): Promise<void>;
  updateClient(id: string, input: ClientDraft): Promise<void>;
  /** 信用卡群組 (Credit groups) — plan 254/255. See `CreditGroup`. */
  listCreditGroups(): Promise<CreditGroup[]>;
  createCreditGroup(input: CreditGroupDraft): Promise<void>;
  updateCreditGroup(id: string, input: CreditGroupDraft): Promise<void>;
  deleteCreditGroup(id: string): Promise<void>;
  /**
   * Stamp (or clear, when `settledAt` is null) the `settledAt` field on the
   * invoice whose `linkedLedgerTransactionId` matches `linkedLedgerTransactionId`.
   * A no-op if no invoice links to that ledger row. Plan 191 wires this into
   * the settle flow (`confirmSettle`) — this plan only provides the method.
   */
  stampInvoiceSettled(linkedLedgerTransactionId: string, settledAt: string | null): Promise<void>;
  /** Find the invoice (if any) linked to a given ledger transaction id. */
  findInvoiceByLedgerId(ledgerId: string): Promise<Invoice | null>;
  listAccounts(): Promise<Account[]>;
  createAccount(input: AccountDraft): Promise<void>;
  updateAccount(id: string, input: AccountDraft): Promise<void>;
  deleteAccount(id: string): Promise<void>;
  listLedgerTransactions(): Promise<LedgerTransaction[]>;
  createLedgerTransaction(input: LedgerDraft): Promise<void>;
  /**
   * Split one purchase into `periods` monthly ledger rows (信用卡分期). Rows
   * share an installmentGroupId; amounts sum exactly to `input.amount` and
   * dates step monthly from `input.date` (day clamped to month end).
   */
  createInstallmentPlan(input: LedgerDraft, periods: number): Promise<void>;
  /**
   * Soft-delete installment rows. With `fromIndex`, only that period and the
   * later ones go (提前清償/部分取消); without it the whole plan goes.
   */
  deleteInstallmentPlan(installmentGroupId: string, opts?: { fromIndex?: number }): Promise<void>;
  /**
   * 多類別拆分: create N sibling rows (`legKind: "category"`) sharing one fresh
   * groupId, atomically. Legs come from `buildSplitLegs` (total = leg sum by
   * construction; per-leg positive amounts get the entryType's sign). Deleting
   * any leg later tombstones the whole group (existing groupId cascade).
   */
  createSplit(shared: SplitSharedFields, legs: SplitLegInput[], shares?: SplitShareInput[]): Promise<void>;
  /**
   * Replace the legs of an existing split group in place. The groupId is
   * PRESERVED (list grouping and sync identity depend on it). Strategy:
   * tombstone-all + recreate with the same groupId — every prior row's
   * revision bumps (so sync LWW propagates the deletes) and fresh rows carry
   * the new legs. Throws when the group has no active rows.
   */
  updateSplit(groupId: string, shared: SplitSharedFields, legs: SplitLegInput[], shares?: SplitShareInput[]): Promise<void>;
  updateLedgerTransaction(id: string, input: LedgerDraft): Promise<void>;
  setLedgerReviewed(id: string, reviewed: boolean): Promise<void>;
  setLedgerPostDate(id: string, postDate: string | null): Promise<void>;
  deleteLedgerTransaction(id: string): Promise<void>;
  /**
   * Edit a ledger row that was materialized from a recurring rule, applying the
   * change at the requested scope (calendar-style):
   * - "this": only this occurrence.
   * - "future": this occurrence + the rule template (affects future postings).
   * - "all": this occurrence + the rule + every already-posted occurrence
   *   (money/classification fields only — each sibling keeps its own date).
   */
  applyRecurringScopeEdit(id: string, scope: RecurringEditScope, input: LedgerDraft): Promise<void>;
  createTransfer(input: TransferDraft): Promise<void>;
  /**
   * In-place update of an existing transfer group's legs (source, dest, and
   * optional fee) — NOT tombstone+recreate. Leg ids, `isReviewed`, and
   * `postDate` survive the edit (reconcile state lives on the legs).
   * Throws when the group doesn't resolve to exactly one source + one dest
   * transfer leg (`"找不到轉帳交易。"`).
   */
  updateTransfer(groupId: string, input: TransferDraft): Promise<void>;
  importLedgerTransactions(rows: LedgerDraft[]): Promise<void>;
  listPortfolioAssets(): Promise<PortfolioAsset[]>;
  createManualHolding(input: PortfolioAssetDraft): Promise<void>;
  updateManualHolding(id: string, input: PortfolioAssetDraft): Promise<void>;
  updateAssetClassification(id: string, input: AssetClassificationInput): Promise<void>;
  deleteManualHolding(id: string): Promise<void>;
  listInvestmentRecords(): Promise<InvestmentRecord[]>;
  createInvestmentRecord(input: InvestmentDraft): Promise<void>;
  /** 股息再投入 (DRIP): create a linked cashDividend + buy on the same asset. */
  createDividendReinvestment(input: DividendReinvestmentDraft): Promise<void>;
  updateInvestmentRecord(id: string, input: InvestmentDraft): Promise<void>;
  deleteInvestmentRecord(id: string): Promise<void>;
  importInvestmentRecords(rows: InvestmentDraft[]): Promise<void>;
  importInvestmentActivity(input: InvestmentActivityImportDraft): Promise<void>;
  listRecurringTransactions(): Promise<RecurringTransaction[]>;
  createRecurringTransaction(input: RecurringDraft): Promise<void>;
  updateRecurringTransaction(id: string, input: RecurringDraft): Promise<void>;
  deleteRecurringTransaction(id: string): Promise<void>;
  postRecurringTransaction(id: string): Promise<void>;
  /**
   * Materialize every active recurring rule whose nextRunDate is on or before
   * `today`, advancing each rule past today (catching up missed periods).
   * Returns the number of ledger rows created.
   */
  postDueRecurringTransactions(today: string): Promise<number>;
  listRecurringInvestments(): Promise<RecurringInvestment[]>;
  createRecurringInvestment(input: RecurringInvestmentDraft): Promise<void>;
  updateRecurringInvestment(id: string, input: RecurringInvestmentDraft): Promise<void>;
  deleteRecurringInvestment(id: string): Promise<void>;
  /** Materialize a buy InvestmentRecord for the rule's current occurrence and advance it. */
  postRecurringInvestment(id: string): Promise<void>;
  listMarketQuotes(): Promise<StoredMarketQuote[]>;
  saveMarketQuotes(quotes: MarketQuote[], source: string): Promise<void>;
  getAppSettings(): Promise<AppSettings>;
  updateAppSettings(input: AppSettings): Promise<void>;
  listDailyFxRates(filter?: { from?: string; to?: string; since?: string }): Promise<DailyFxRate[]>;
  saveDailyFxRates(rates: DailyFxRate[]): Promise<void>;
  getDailyFxRate(from: string, to: string, date: string): Promise<DailyFxRate | null>;
  listDailyPrices(filter?: { ticker?: string; since?: string }): Promise<DailyPrice[]>;
  saveDailyPrices(prices: DailyPrice[]): Promise<void>;
  getDailyPrice(ticker: string, date: string): Promise<DailyPrice | null>;
  listManualPriceSnapshots(filter?: { assetId?: string }): Promise<ManualPriceSnapshot[]>;
  createManualPriceSnapshot(input: ManualPriceSnapshotDraft): Promise<void>;
  deleteManualPriceSnapshot(id: string): Promise<void>;
  listFinancialGoals(): Promise<FinancialGoal[]>;
  upsertFinancialGoal(input: FinancialGoalDraft & { id?: string }): Promise<FinancialGoal>;
  deleteFinancialGoal(id: string): Promise<void>;
  adjustAccountBalance(accountId: string, targetBalance: number, date: string, note: string): Promise<void>;
  renameMerchant(oldName: string, newName: string): Promise<void>;
  renameCategory(oldName: string, newName: string): Promise<void>;
  renameSubcategory(category: string, oldSub: string, newSub: string): Promise<void>;
  exportSnapshot(): Promise<RepositorySnapshot>;
  importSnapshot(snapshot: RepositorySnapshot): Promise<void>;
  getSyncPayload(entity: SyncEntity, entityId: string): Promise<Record<string, unknown> | null>;
  /**
   * Batched form of getSyncPayload: fetch every existing payload for the given
   * entity ids in one shot, keyed by entity id (missing ids are simply absent).
   * The sync pull uses this to prefetch a page's records instead of issuing one
   * SELECT per incoming envelope (N+1). Payloads are byte-identical to what
   * getSyncPayload returns for the same id.
   */
  getSyncPayloads(entity: SyncEntity, entityIds: string[]): Promise<Map<string, Record<string, unknown>>>;
  applySyncChanges(changes: SyncApplyChange[], conflicts?: SyncConflictRecord[]): Promise<void>;
  recalculateDerivedData(): Promise<RecalculationReport>;
  /** Connect Sync prep: records changed since `sinceCursor` (an updatedAt). */
  collectPendingChanges(sinceCursor: string | null): Promise<import("../domain").PendingChangeSet>;
  acknowledgePendingChanges(outboxIds: string[]): Promise<void>;
  /**
   * Re-queue EVERY local record for push (clears the "already pushed" mark).
   * Recovery primitive: after re-pairing or switching sync accounts, the local
   * data must be re-uploaded even though it was pushed to a previous account.
   * The SQLite outbox tracks `pushed_at` per row; the browser repo derives
   * pending rows from the push cursor, so callers also reset localPushCursor.
   */
  requeueAllPendingChanges(): Promise<void>;
  listSyncConflicts(): Promise<SyncConflictRecord[]>;
  resolveSyncConflict(id: string, strategy: "keepLocal" | "useIncoming"): Promise<void>;
  clearSyncConflicts(): Promise<void>;
}

export interface RepositorySnapshot {
  version: number;
  exportedAt: string;
  /** 帳本 (Books). Optional so pre-books backups round-trip cleanly. */
  books?: Book[];
  accounts: Account[];
  ledgerTransactions: LedgerTransaction[];
  portfolioAssets: PortfolioAsset[];
  investmentRecords: InvestmentRecord[];
  recurringTransactions: RecurringTransaction[];
  recurringInvestments?: RecurringInvestment[];
  marketQuotes: StoredMarketQuote[];
  settings: AppSettings;
  settingsRevision?: number;
  settingsUpdatedAt?: string;
  dailyFxRates: DailyFxRate[];
  dailyPrices: DailyPrice[];
  financialGoals?: FinancialGoal[];
  manualPriceSnapshots?: ManualPriceSnapshot[];
  /** 發票/客戶 (Invoices/Clients). Optional so pre-190 backups round-trip cleanly. */
  invoices?: Invoice[];
  clients?: Client[];
  /** 信用卡群組 (Credit groups) — plan 254/255. Optional so pre-255 backups round-trip cleanly. */
  creditGroups?: CreditGroup[];
}

const personalSpace = "space_personal_default";
const unassignedAccountName = "未指定";
const defaultSettings: AppSettings = {
  primaryCurrency: "TWD",
  categories: [
    { name: "餐飲", children: ["點心", "飲料", "菜錢", "外食"] },
    { name: "交通", children: ["捷運", "加油", "停車", "計程車"] },
    { name: "居住", children: ["房租", "水電", "管理費"] },
    { name: "收入", children: ["薪資", "獎金", "退款"] },
    { name: "投資", children: ["買進", "賣出", "股利"] },
    { name: "轉帳", children: ["帳戶轉移", "外幣兌換"] },
  ],
  merchants: ["全家", "7-ELEVEN", "Uber", "Costco", "公司", "房東"],
  exchangeRates: [
    { from: "USD", to: "TWD", rate: 32, updatedAt: "2026-05-24T00:00:00.000Z" },
    { from: "JPY", to: "TWD", rate: 0.22, updatedAt: "2026-05-24T00:00:00.000Z" },
  ],
};

export interface RepositoryData {
  books: Book[];
  invoices: Invoice[];
  clients: Client[];
  creditGroups: CreditGroup[];
  accounts: Account[];
  ledgerTransactions: LedgerTransaction[];
  portfolioAssets: PortfolioAsset[];
  investmentRecords: InvestmentRecord[];
  recurringTransactions: RecurringTransaction[];
  recurringInvestments: RecurringInvestment[];
  marketQuotes: StoredMarketQuote[];
  settings: AppSettings;
  settingsRevision: number;
  settingsUpdatedAt: string;
  dailyFxRates: DailyFxRate[];
  dailyPrices: DailyPrice[];
  financialGoals: FinancialGoal[];
  manualPriceSnapshots: ManualPriceSnapshot[];
  syncConflicts: SyncConflictRecord[];
}

let repositoryPromise: Promise<FinanceRepository> | null = null;

export function getFinanceRepository(): Promise<FinanceRepository> {
  repositoryPromise ??= createFinanceRepository();
  return repositoryPromise;
}

export function createMemoryFinanceRepositoryForTests(data: Partial<RepositoryData> = {}): FinanceRepository {
  const repository = new BrowserFinanceRepository();
  repository.loadDataForTests(data);
  return repository;
}

export async function createSqliteFinanceRepositoryForTests(db: Database): Promise<FinanceRepository> {
  const repository = new TauriSqlFinanceRepository(db);
  await repository.initialize();
  return repository;
}

async function createFinanceRepository(): Promise<FinanceRepository> {
  if (isTauriRuntime()) {
    const mod = await import("@tauri-apps/plugin-sql");
    const db = await mod.default.load("sqlite:northstar.db");
    // WAL mode lets reads (React Query refetches) run concurrently with the
    // long write transaction in importSnapshot(); busy_timeout makes SQLite
    // wait-and-retry instead of immediately failing with "database is locked"
    // (SQLITE_BUSY, code 5) when two operations overlap.
    //
    // iOS storage is markedly slower than desktop: a bulk forceFullResync can
    // hold the WAL write lock well past the old 5s window, so a concurrent op
    // would still fail. 15s gives heavy imports room to finish. We also read
    // journal_mode back — on some iOS sandboxes the WAL switch can silently
    // fail, leaving rollback-journal mode where readers block writers and slow
    // I/O turns ordinary overlaps into persistent locks. Logging the effective
    // mode makes that diagnosable from `tauri ios dev` console output.
    try {
      await db.execute("PRAGMA journal_mode=WAL;");
      await db.execute("PRAGMA busy_timeout=15000;");
      // WAL defaults to synchronous=FULL, which fsyncs on every commit — the
      // dominant cost of a small write on iOS storage. NORMAL is SQLite's
      // recommended setting under WAL: the WAL file stays crash-safe, and only
      // a power loss at the moment of commit can cost the most recent
      // transaction (never corruption). Set AFTER journal_mode so it applies to
      // the WAL journal, not the rollback journal.
      await db.execute("PRAGMA synchronous=NORMAL;");
      await db.execute("PRAGMA foreign_keys=ON;");
      const journal = await db.select<{ journal_mode: string }[]>("PRAGMA journal_mode;");
      const mode = journal?.[0]?.journal_mode ?? "unknown";
      if (mode.toLowerCase() !== "wal") {
        console.warn(`[db] journal_mode is '${mode}', expected 'wal' — lock contention is more likely on this platform`);
      } else {
        console.info("[db] journal_mode=wal, busy_timeout=15000, synchronous=normal");
      }
    } catch (e) {
      console.warn("[db] failed to set pragmas", e);
    }
    const repository = new TauriSqlFinanceRepository(db);
    await repository.initialize();
    return repository;
  }

  const repository = new BrowserFinanceRepository();
  await repository.initialize();
  return repository;
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function bump<T extends { revision: number; updatedAt: string }>(record: T): T {
  return { ...record, revision: record.revision + 1, updatedAt: nowIso() };
}

function active<T extends { deletedAt: string | null }>(rows: T[]) {
  return rows.filter((row) => row.deletedAt === null);
}

/**
 * Derive-on-read (plan 254/255): an account with `creditGroupId` set to a
 * live (non-deleted) group reports that group's statementDay/paymentDueDay/
 * creditLimit instead of its own stale columns. Shared by both repos so the
 * override logic can't drift between the browser (in-memory) and SQLite
 * implementations — accounts lists are small, so this runs in JS with no
 * caching (per plan 255 Step 8 escape hatch).
 */
function applyCreditGroupDerivation(accounts: Account[], groups: CreditGroup[]): Account[] {
  if (accounts.every((account) => !account.creditGroupId)) return accounts;
  const groupById = new Map(groups.filter((g) => !g.deletedAt).map((g) => [g.id, g]));
  return accounts.map((account) => {
    if (!account.creditGroupId) return account;
    const group = groupById.get(account.creditGroupId);
    if (!group) return account;
    return {
      ...account,
      statementDay: group.statementDay,
      paymentDueDay: group.paymentDueDay,
      creditLimit: group.creditLimit,
    };
  });
}

/** Minimal shape the backfill plan needs from an ungrouped credit account. */
interface CreditGroupBackfillCandidate {
  id: string;
  currency: string;
  creditLimitGroup: string;
  statementDay: number | null;
  paymentDueDay: number | null;
  creditLimit: number | null;
  updatedAt: string;
}

interface CreditGroupBackfillPlan {
  /** Brand-new groups this device needs to create, keyed by creditLimitGroup name. */
  groupsToCreate: Array<{
    name: string;
    currency: string;
    statementDay: number | null;
    paymentDueDay: number | null;
    creditLimit: number | null;
    memberIds: string[];
  }>;
  /** Existing (same-named) groups whose members just need creditGroupId set. */
  groupsToReuse: Array<{ groupId: string; memberIds: string[] }>;
  /** creditLimitGroup names skipped because members disagree on currency —
   *  a shared bill can't span currencies, so backfill leaves these untouched. */
  skipped: string[];
}

/** Among `members`, the value most commonly held for `selector`; ties broken
 *  by the member with the latest `updatedAt` (plan 255 Step 9 Decision 4). */
function mostCommonValue<T>(members: CreditGroupBackfillCandidate[], selector: (m: CreditGroupBackfillCandidate) => T): T {
  const byKey = new Map<string, { value: T; count: number; latestUpdatedAt: string }>();
  for (const member of members) {
    const value = selector(member);
    const key = JSON.stringify(value);
    const entry = byKey.get(key);
    if (entry) {
      entry.count += 1;
      if (member.updatedAt > entry.latestUpdatedAt) entry.latestUpdatedAt = member.updatedAt;
    } else {
      byKey.set(key, { value, count: 1, latestUpdatedAt: member.updatedAt });
    }
  }
  let best: { value: T; count: number; latestUpdatedAt: string } | null = null;
  for (const entry of byKey.values()) {
    if (!best || entry.count > best.count || (entry.count === best.count && entry.latestUpdatedAt > best.latestUpdatedAt)) {
      best = entry;
    }
  }
  return best!.value;
}

/**
 * Plan 254/255 Step 9 — non-destructive backfill of the legacy free-text
 * `creditLimitGroup` into first-class `credit_groups` rows. Pure planning
 * function shared by both repos (browser calls it against `this.data`
 * in-memory; SQLite calls it against rows loaded via `listAccounts`/
 * `listCreditGroups`) so the grouping/tie-break/currency-mismatch decisions
 * can't drift between implementations, and so it's unit-testable without a
 * database. Idempotent by construction: callers only pass candidates with
 * `creditGroupId == null`, and an existing group with a matching name is
 * reused rather than duplicated — re-running produces `groupsToCreate: []`.
 */
function planCreditGroupBackfill(
  candidates: CreditGroupBackfillCandidate[],
  existingGroups: Array<{ id: string; name: string }>,
): CreditGroupBackfillPlan {
  const byName = new Map<string, CreditGroupBackfillCandidate[]>();
  for (const candidate of candidates) {
    if (!candidate.creditLimitGroup) continue;
    const list = byName.get(candidate.creditLimitGroup) ?? [];
    list.push(candidate);
    byName.set(candidate.creditLimitGroup, list);
  }
  const groupsToCreate: CreditGroupBackfillPlan["groupsToCreate"] = [];
  const groupsToReuse: CreditGroupBackfillPlan["groupsToReuse"] = [];
  const skipped: string[] = [];
  for (const [name, members] of byName) {
    // A "group" of one has nothing to share a bill with — leave it as plain
    // free-text; nothing forces a lone card into a first-class group.
    if (members.length < 2) continue;
    const currencies = new Set(members.map((m) => m.currency));
    if (currencies.size > 1) {
      skipped.push(name);
      continue;
    }
    const memberIds = members.map((m) => m.id);
    const existing = existingGroups.find((g) => g.name === name);
    if (existing) {
      groupsToReuse.push({ groupId: existing.id, memberIds });
      continue;
    }
    groupsToCreate.push({
      name,
      currency: members[0].currency,
      statementDay: mostCommonValue(members, (m) => m.statementDay),
      paymentDueDay: mostCommonValue(members, (m) => m.paymentDueDay),
      creditLimit: mostCommonValue(members, (m) => m.creditLimit),
      memberIds,
    });
  }
  return { groupsToCreate, groupsToReuse, skipped };
}

/**
 * Fee-leg reconciliation for `updateLedgerTransaction` (plan 226 — 手續費
 * editable on edit). See the Design table in
 * plans/226-fee-editable-on-edit.md. Shared decision logic between the
 * browser (in-memory array) and SQLite (raw SQL) repos, which each apply the
 * resulting plan with their own persistence primitives.
 *
 * `feeAmount === undefined` means "no opinion, leave the leg alone" — this is
 * what keeps fee edits scoped to the directly-edited occurrence instead of
 * fanning out: `applyRecurringScopeEdit`'s "all"-scope sibling rewrite never
 * sets `feeAmount` on its per-sibling drafts, so siblings always resolve to
 * `{ kind: "none" }` here regardless of whether they already have a fee leg.
 */
type FeeLegPlan =
  | { kind: "none" }
  | { kind: "create" }
  | { kind: "update"; legId: string }
  | { kind: "tombstone"; legId: string };

function planFeeLegUpdate(existingLegId: string | undefined, feeAmount: number | undefined): FeeLegPlan {
  if (feeAmount === undefined) return { kind: "none" };
  if (!existingLegId) return feeAmount > 0 ? { kind: "create" } : { kind: "none" };
  return feeAmount > 0 ? { kind: "update", legId: existingLegId } : { kind: "tombstone", legId: existingLegId };
}

/** Same lookup contract as fee-leg creation (createLedgerTransaction): same
 * groupId + category === "手續費" + legKind == null (system leg, not a user
 * split/share leg) + active. */
function findFeeLegId(rows: LedgerTransaction[], groupId: string | null): string | undefined {
  if (!groupId) return undefined;
  return rows.find((row) => row.groupId === groupId && row.category === "手續費" && row.legKind == null && row.deletedAt === null)?.id;
}

/** Draft for a linked fee leg, matching the shape createLedgerTransaction
 * emits (same name/category/subcategory/note conventions). */
function feeLegDraft(input: LedgerDraft, groupId: string): LedgerDraft {
  return {
    accountId: input.accountId,
    date: input.date,
    name: "手續費",
    amount: -Math.abs(input.feeAmount ?? 0),
    currency: input.currency,
    category: "手續費",
    // Income fees are bank/remittance charges, not FX surcharges.
    subcategory: input.entryType === "income" ? "收入手續費" : "海外交易手續費",
    merchant: input.merchant,
    entryType: "expense",
    settlementStatus: "settled",
    note: "由系統自動建立的手續費紀錄",
    groupId,
  };
}

const recomputeAccounts = deriveAccountBalances;

function recomputeAssets(assets: PortfolioAsset[], records: InvestmentRecord[]) {
  const activeRecords = active(records);
  const recordsByAsset = new Map<string, InvestmentRecord[]>();
  for (const record of activeRecords) {
    const list = recordsByAsset.get(record.assetId);
    if (list) list.push(record);
    else recordsByAsset.set(record.assetId, [record]);
  }
  return assets.map((asset) => {
    if (asset.deletedAt !== null) return asset;
    const assetRecords = recordsByAsset.get(asset.id) ?? [];
    // Single source of truth for moving-average quantity + cost (see
    // domain/portfolioMetrics). Manual holdings now carry a cashless "opening
    // balance" record, so every asset — manual or transaction-based — derives
    // quantity and blended cost from its records uniformly. This keeps
    // unrealized and realized P/L on the same basis and blends later buys into
    // a manual snapshot's average cost (previously frozen).
    //
    // Defensive fallback: a manual snapshot with no records yet (pre-migration
    // edge) keeps its stored quantity/cost rather than collapsing to zero.
    if (assetRecords.length === 0) return asset;
    // Self-healing for sync: a manual holding's quantity baseline lives in a
    // cashless opening-balance record. If that record hasn't reached this
    // device yet (it can lag behind a later buy that synced first), the
    // manual shares would otherwise be silently dropped — only the later
    // trades would count. Reconstruct the opening lot from `baseQuantity`,
    // which always rides on the asset row itself, so the baseline survives.
    // Once the real opening record arrives it simply replaces the synthetic
    // one. Cost stays on the asset's last-known value while degraded (the
    // synthetic price is only a placeholder for the quantity math).
    const missingOpening =
      asset.holdingSource === "manual" &&
      asset.baseQuantity != null &&
      !assetRecords.some((record) => record.cashless);
    const computeRecords = missingOpening
      ? [syntheticOpeningRecord(asset), ...assetRecords]
      : assetRecords;
    const metrics = buildPositionMetrics(computeRecords);
    return {
      ...asset,
      totalQuantity: metrics.quantity,
      averageCost: missingOpening ? asset.averageCost : metrics.averageCost,
    };
  });
}

/**
 * Rebuild the cashless opening-balance lot for a manual holding from the
 * durable `baseQuantity` on the asset row. Used only as a sync self-heal when
 * the real opening record is temporarily absent — see `recomputeAssets`.
 */
function syntheticOpeningRecord(asset: PortfolioAsset): InvestmentRecord {
  return {
    id: openingRecordId(asset.id),
    spaceId: asset.spaceId,
    revision: 0,
    createdAt: asset.createdAt,
    updatedAt: asset.updatedAt,
    deletedAt: null,
    assetId: asset.id,
    linkedAccountId: asset.accountId ?? null,
    date: asset.acquisitionDate || asset.createdAt.slice(0, 10),
    action: "buy",
    price: asset.averageCost,
    quantity: asset.baseQuantity ?? 0,
    fee: 0,
    note: "期初部位",
    isReviewed: false,
    linkedLedgerTransactionId: null,
    cashless: true,
    dripGroupId: null,
  };
}

class BrowserFinanceRepository implements FinanceRepository {
  private readonly storageKey = "northstar.browserRepository.v1";
  private data: RepositoryData = createInitialData();
  private skipPersist = false;
  /**
   * Plan 211 announce signal — accumulates the count of books this device's
   * own `mergeAndHealBooks(InMemory)` has tombstoned since the last drain.
   * Shared by both repo implementations (SQLite subclasses this one), since
   * it's a plain instance counter, not tied to `this.data`. See
   * `consumeBookMergeAnnouncement` on the FinanceRepository interface.
   */
  protected bookMergeAnnounceCount = 0;
  /**
   * Market-data sub-store, lazily created on first access so it always sees the
   * most recent `this.data` reference (which is reassigned during initialize /
   * loadDataForTests). The context getter/setter pair keeps the store in sync
   * without copying or snapshotting the data object.
   */
  private _marketData: MarketDataStore | null = null;
  private get marketData(): MarketDataStore {
    if (!this._marketData) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const self = this;
      this._marketData = createMarketDataStore({
        get data() { return self.data; },
        set data(v) { self.data = v; },
        persist: () => self.persist(),
        nowIso,
        createId,
      });
    }
    return this._marketData;
  }

  loadDataForTests(data: Partial<RepositoryData>) {
    this.skipPersist = true;
    this.data = normalizeStoredData({ ...createInitialData(), ...data });
    this.ensureDefaultBookInMemory();
  }

  async initialize() {
    const stored = await loadBrowserRepositoryData(this.storageKey);
    this.data = stored ? normalizeStoredData(stored) : createInitialData();
    this.ensureDefaultBookInMemory();
    this.mergeAndHealBooksInMemory();
    this.backfillUnassignedAccountInMemory();
    this.backfillCreditGroupsInMemory();
    this.recompute();
    await this.persist();
  }

  /**
   * Plan 254/255 Step 9 — see `planCreditGroupBackfill`. Not suppressed from
   * the sync feed (reviewer correction): the browser repo has no outbox to
   * suppress, so the `bump()`ed accounts and newly-pushed `creditGroups` rows
   * flow into the very next `collectPendingChanges` like any other mutation,
   * which is required so the backfill propagates to other devices.
   */
  protected backfillCreditGroupsInMemory() {
    const candidates: CreditGroupBackfillCandidate[] = this.data.accounts
      .filter((account) => account.deletedAt === null && account.type === "credit" && account.creditLimitGroup && !account.creditGroupId)
      .map((account) => ({
        id: account.id,
        currency: account.currency,
        creditLimitGroup: account.creditLimitGroup,
        statementDay: account.statementDay,
        paymentDueDay: account.paymentDueDay,
        creditLimit: account.creditLimit,
        updatedAt: account.updatedAt,
      }));
    if (candidates.length === 0) return;
    const existingGroups = active(this.data.creditGroups).map((g) => ({ id: g.id, name: g.name }));
    const plan = planCreditGroupBackfill(candidates, existingGroups);
    for (const name of plan.skipped) {
      console.warn(`[backfillCreditGroups] skipped "${name}": members disagree on currency, a shared bill can't span currencies.`);
    }
    const memberIdToGroupId = new Map<string, string>();
    for (const group of plan.groupsToCreate) {
      const timestamp = nowIso();
      const id = createId("creditGroup");
      this.data.creditGroups.push({
        id,
        spaceId: personalSpace,
        revision: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
        name: group.name,
        currency: group.currency,
        creditLimit: group.creditLimit,
        statementDay: group.statementDay,
        paymentDueDay: group.paymentDueDay,
      });
      for (const memberId of group.memberIds) memberIdToGroupId.set(memberId, id);
    }
    for (const group of plan.groupsToReuse) {
      for (const memberId of group.memberIds) memberIdToGroupId.set(memberId, group.groupId);
    }
    if (memberIdToGroupId.size === 0) return;
    this.data.accounts = this.data.accounts.map((account) =>
      memberIdToGroupId.has(account.id) ? bump({ ...account, creditGroupId: memberIdToGroupId.get(account.id)! }) : account,
    );
  }

  /** Plan 211 — see FinanceRepository.consumeBookMergeAnnouncement. */
  async consumeBookMergeAnnouncement(): Promise<number> {
    const count = this.bookMergeAnnounceCount;
    this.bookMergeAnnounceCount = 0;
    return count;
  }

  /**
   * Guarantee a default 帳本 (個人帳) exists and that every account belongs to a
   * book — the browser mirror of `ensureSqliteDefaultBook`. Idempotent: once a
   * personal book exists and no account has an empty bookId, it's a no-op.
   * Returns the default book id so createAccount can assign it.
   */
  protected ensureDefaultBookInMemory(): string {
    let defaultBook = this.data.books.find((book) => book.deletedAt === null && book.kind === "personal");
    if (!defaultBook) {
      const timestamp = nowIso();
      defaultBook = {
        id: createId("book"),
        spaceId: personalSpace,
        revision: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
        name: "個人帳",
        kind: "personal",
        includeInPersonalNetWorth: true,
        includeInFireMetrics: true,
        color: null,
      };
      this.data.books.push(defaultBook);
    }
    const defaultId = defaultBook.id;
    this.data.accounts = this.data.accounts.map((account) =>
      account.bookId ? account : bump({ ...account, bookId: defaultId }),
    );
    return defaultId;
  }

  /**
   * Plan 211 — merge untouched system-minted duplicate 個人帳 (decision 2's
   * narrowed domain, `planMintMerge`) then run the kind-aware straggler heal
   * (decision 4). In-memory mirror of `mergeAndHealBooks` (SQLite). Called
   * right after `ensureDefaultBookInMemory` at every wired call site
   * (initialize, importSnapshot, applySyncChanges) — never from createBook/
   * updateBook/deleteBook, so a book the user creates or edits is never a
   * merge candidate (planMintMerge's domain already guarantees this too;
   * not calling it from those paths is belt-and-suspenders).
   */
  protected mergeAndHealBooksInMemory(): { mergedCount: number } {
    const plan = planMintMerge(active(this.data.books));
    let mergedCount = 0;

    if (plan) {
      const loserIds = new Set(plan.loserIds);
      const timestamp = nowIso();
      this.data.books = this.data.books.map((book) =>
        loserIds.has(book.id) ? bump({ ...book, deletedAt: timestamp }) : book,
      );
      this.data.accounts = this.data.accounts.map((account) =>
        loserIds.has(account.bookId) ? bump({ ...account, bookId: plan.survivorId }) : account,
      );
      this.data.invoices = this.data.invoices.map((invoice) =>
        loserIds.has(invoice.bookId) ? bump({ ...invoice, bookId: plan.survivorId }) : invoice,
      );
      this.data.clients = this.data.clients.map((client) =>
        loserIds.has(client.bookId) ? bump({ ...client, bookId: plan.survivorId }) : client,
      );
      mergedCount = plan.loserIds.length;
    }

    this.healStragglerBooksInMemory();

    // Only a merge THIS device computed (planMintMerge found ≥2 mints in its
    // own local book set) increments the announce counter — a tombstone this
    // device merely received via sync leaves only 1 active mint, so `plan`
    // above is null and nothing is added here. See consumeBookMergeAnnouncement.
    if (mergedCount > 0) this.bookMergeAnnounceCount += mergedCount;

    return { mergedCount };
  }

  /**
   * Plan 211 decision 4 — kind-aware straggler self-heal. Generalizes the
   * ''/null sentinel backfill above to also catch accounts whose book_id
   * references a book that is dead (tombstoned) or entirely unknown to this
   * device. Dead COMPANY book → resurrect (can never move a KPI — the
   * account's scoping returns to exactly what the user set, and a company
   * book can never be an untouched mint so this can't loop with the merge
   * above). Dead PERSONAL book, or an id this device has never seen → re-home
   * to the current default (we cannot know an unknown id's kind; this also
   * matches the existing ''-sentinel behavior).
   */
  protected healStragglerBooksInMemory(): void {
    const activeBookIds = new Set(active(this.data.books).map((book) => book.id));
    const strays = this.data.accounts.filter(
      (account) => account.bookId !== "" && !activeBookIds.has(account.bookId),
    );
    if (strays.length === 0) return;

    const bookById = new Map(this.data.books.map((book) => [book.id, book]));
    const distinctDeadIds = [...new Set(strays.map((account) => account.bookId))];

    const toResurrect = new Set(
      distinctDeadIds.filter((id) => bookById.get(id)?.kind === "company"),
    );
    if (toResurrect.size > 0) {
      this.data.books = this.data.books.map((book) =>
        toResurrect.has(book.id) ? bump({ ...book, deletedAt: null }) : book,
      );
    }

    const strayIdsToRehome = new Set(
      strays
        .filter((account) => bookById.get(account.bookId)?.kind !== "company")
        .map((account) => account.id),
    );
    if (strayIdsToRehome.size > 0) {
      const defaultId = this.ensureDefaultBookInMemory();
      this.data.accounts = this.data.accounts.map((account) =>
        strayIdsToRehome.has(account.id) ? bump({ ...account, bookId: defaultId }) : account,
      );
    }
  }

  /**
   * Mirror of the SQLite Unassigned-account backfill for the browser fallback.
   * Creates an `未指定` investment account if any manual holding or investment
   * record lacks an account binding, then points them at it.
   */
  protected backfillUnassignedAccountInMemory() {
    const orphanAssets = this.data.portfolioAssets.some(
      (asset) => asset.holdingSource === "manual" && !asset.accountId && asset.deletedAt === null,
    );
    const orphanRecords = this.data.investmentRecords.some(
      (record) => !record.linkedAccountId && record.deletedAt === null,
    );
    if (!orphanAssets && !orphanRecords) return;

    let unassigned = this.data.accounts.find(
      (account) => account.type === "investment" && account.name === unassignedAccountName && account.deletedAt === null,
    );
    if (!unassigned) {
      const timestamp = nowIso();
      unassigned = {
        id: createId("acct"),
        spaceId: personalSpace,
        revision: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
        name: unassignedAccountName,
        currency: "TWD",
        openingBalance: 0,
        balance: 0,
        type: "investment",
        bookId: this.ensureDefaultBookInMemory(),
        creditLimit: null,
        creditLimitGroup: "",
        creditGroupId: null,
        isSharedToHousehold: false,
        loanStartDate: null,
        annualInterestRate: null,
        loanTerm: null,
        iconName: null,
        color: null,
        bankBrandDomain: null,
        statementDay: null,
        paymentDueDay: null,
        creditPaymentPaidUntil: null,
      };
      this.data.accounts.push(unassigned);
    }

    if (orphanAssets) {
      this.data.portfolioAssets = this.data.portfolioAssets.map((asset) =>
        asset.holdingSource === "manual" && !asset.accountId && asset.deletedAt === null
          ? { ...asset, accountId: unassigned!.id, updatedAt: nowIso() }
          : asset,
      );
    }
    if (orphanRecords) {
      this.data.investmentRecords = this.data.investmentRecords.map((record) =>
        !record.linkedAccountId && record.deletedAt === null
          ? { ...record, linkedAccountId: unassigned!.id, updatedAt: nowIso() }
          : record,
      );
    }
  }

  async listBooks() {
    return active(this.data.books).map((row) => ({ ...row, color: row.color ?? null }));
  }

  async createBook(input: BookDraft) {
    const timestamp = nowIso();
    this.data.books.push({
      id: createId("book"),
      spaceId: personalSpace,
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
      name: input.name,
      kind: input.kind,
      includeInPersonalNetWorth: input.includeInPersonalNetWorth,
      includeInFireMetrics: input.includeInFireMetrics,
      color: input.color ?? null,
    });
    await this.persist();
  }

  async updateBook(id: string, input: BookDraft) {
    this.data.books = this.data.books.map((book) =>
      book.id === id ? bump({
        ...book,
        name: input.name,
        kind: input.kind,
        includeInPersonalNetWorth: input.includeInPersonalNetWorth,
        includeInFireMetrics: input.includeInFireMetrics,
        color: input.color ?? null,
      }) : book,
    );
    await this.persist();
  }

  async deleteBook(id: string) {
    const book = this.data.books.find((row) => row.id === id && row.deletedAt === null);
    if (!book) return;
    const accountCount = this.data.accounts.filter((row) => row.bookId === id && row.deletedAt === null).length;
    if (accountCount > 0) throw new Error(`此帳本還有 ${accountCount} 個帳戶，請先將它們移到其他帳本。`);
    const hasInvoicesOrClients = this.data.invoices.some((row) => row.bookId === id && row.deletedAt === null)
      || this.data.clients.some((row) => row.bookId === id && row.deletedAt === null);
    if (hasInvoicesOrClients) throw new Error("此帳本還有發票或客戶資料，不能刪除。");
    if (book.kind === "personal") {
      const otherPersonalBooks = this.data.books.filter((row) =>
        row.id !== id && row.kind === "personal" && row.deletedAt === null,
      ).length;
      if (otherPersonalBooks === 0) throw new Error("這是最後一個個人帳本，不能刪除。");
    }
    this.data.books = this.data.books.map((row) =>
      row.id === id ? bump({ ...row, deletedAt: nowIso() }) : row,
    );
    await this.persist();
  }

  async listInvoices() {
    return active(this.data.invoices);
  }

  async createInvoice(input: InvoiceDraft) {
    const timestamp = nowIso();
    this.data.invoices.push({
      id: createId("invoice"),
      spaceId: personalSpace,
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
      bookId: input.bookId,
      clientId: input.clientId ?? null,
      invoiceNumber: input.invoiceNumber,
      issueDate: input.issueDate,
      dueDate: input.dueDate ?? null,
      amount: input.amount,
      taxExclusiveAmount: input.taxExclusiveAmount,
      taxAmount: input.taxAmount,
      settledAt: null,
      linkedLedgerTransactionId: input.linkedLedgerTransactionId ?? null,
    });
    await this.persist();
  }

  async updateInvoice(id: string, input: InvoiceDraft) {
    this.data.invoices = this.data.invoices.map((invoice) =>
      invoice.id === id ? bump({
        ...invoice,
        bookId: input.bookId,
        clientId: input.clientId ?? null,
        invoiceNumber: input.invoiceNumber,
        issueDate: input.issueDate,
        dueDate: input.dueDate ?? null,
        amount: input.amount,
        taxExclusiveAmount: input.taxExclusiveAmount,
        taxAmount: input.taxAmount,
        linkedLedgerTransactionId: input.linkedLedgerTransactionId ?? null,
      }) : invoice,
    );
    await this.persist();
  }

  async listClients() {
    return active(this.data.clients);
  }

  async createClient(input: ClientDraft) {
    const timestamp = nowIso();
    this.data.clients.push({
      id: createId("client"),
      spaceId: personalSpace,
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
      bookId: input.bookId,
      name: input.name,
      taxId: input.taxId ?? "",
      defaultPaymentTerms: input.defaultPaymentTerms ?? null,
    });
    await this.persist();
  }

  async updateClient(id: string, input: ClientDraft) {
    this.data.clients = this.data.clients.map((client) =>
      client.id === id ? bump({
        ...client,
        bookId: input.bookId,
        name: input.name,
        taxId: input.taxId ?? "",
        defaultPaymentTerms: input.defaultPaymentTerms ?? null,
      }) : client,
    );
    await this.persist();
  }

  async listCreditGroups() {
    return active(this.data.creditGroups);
  }

  async createCreditGroup(input: CreditGroupDraft) {
    const timestamp = nowIso();
    this.data.creditGroups.push({
      id: createId("creditGroup"),
      spaceId: personalSpace,
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
      name: input.name,
      currency: input.currency,
      creditLimit: input.creditLimit ?? null,
      statementDay: input.statementDay ?? null,
      paymentDueDay: input.paymentDueDay ?? null,
    });
    await this.persist();
  }

  async updateCreditGroup(id: string, input: CreditGroupDraft) {
    this.data.creditGroups = this.data.creditGroups.map((group) =>
      group.id === id ? bump({
        ...group,
        name: input.name,
        currency: input.currency,
        creditLimit: input.creditLimit ?? null,
        statementDay: input.statementDay ?? null,
        paymentDueDay: input.paymentDueDay ?? null,
      }) : group,
    );
    await this.persist();
  }

  async deleteCreditGroup(id: string) {
    this.data.creditGroups = this.data.creditGroups.map((group) =>
      group.id === id ? bump({ ...group, deletedAt: nowIso() }) : group,
    );
    await this.persist();
  }

  async stampInvoiceSettled(linkedLedgerTransactionId: string, settledAt: string | null) {
    const match = this.data.invoices.find(
      (invoice) => invoice.linkedLedgerTransactionId === linkedLedgerTransactionId && invoice.deletedAt === null,
    );
    if (!match) return;
    this.data.invoices = this.data.invoices.map((invoice) =>
      invoice.id === match.id ? bump({ ...invoice, settledAt }) : invoice,
    );
    await this.persist();
  }

  async findInvoiceByLedgerId(ledgerId: string): Promise<Invoice | null> {
    return (
      this.data.invoices.find(
        (invoice) => invoice.linkedLedgerTransactionId === ledgerId && invoice.deletedAt === null,
      ) ?? null
    );
  }

  async listAccounts() {
    const rows = active(this.data.accounts).map((row) => ({
      ...row,
      loanStartDate: row.loanStartDate ?? null,
      annualInterestRate: row.annualInterestRate ?? null,
      loanTerm: row.loanTerm ?? null,
      iconName: row.iconName ?? null,
      color: row.color ?? null,
      bankBrandDomain: row.bankBrandDomain ?? null,
      statementDay: row.statementDay ?? null,
      paymentDueDay: row.paymentDueDay ?? null,
      creditGroupId: row.creditGroupId ?? null,
    }));
    return applyCreditGroupDerivation(rows, this.data.creditGroups);
  }

  async createAccount(input: AccountDraft) {
    const timestamp = nowIso();
    const bookId = input.bookId || this.ensureDefaultBookInMemory();
    this.data.accounts.push({
      id: createId("acct"),
      spaceId: personalSpace,
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
      balance: input.openingBalance,
      ...input,
      bookId,
      creditGroupId: input.creditGroupId ?? null,
      creditLimit: input.type === "credit" ? input.creditLimit : null,
      creditLimitGroup: input.type === "credit" ? input.creditLimitGroup : "",
      statementDay: input.type === "credit" ? (input.statementDay ?? null) : null,
      paymentDueDay: input.type === "credit" ? (input.paymentDueDay ?? null) : null,
      loanStartDate: input.type === "loan" ? (input.loanStartDate ?? null) : null,
      annualInterestRate: input.type === "loan" ? (input.annualInterestRate ?? null) : null,
      loanTerm: input.type === "loan" ? (input.loanTerm ?? null) : null,
      bankBrandDomain: input.bankBrandDomain ?? null,
    });
    await this.persist();
  }

  async updateAccount(id: string, input: AccountDraft) {
    this.data.accounts = this.data.accounts.map((account) => {
      if (account.id !== id) return account;
      const priorCreditGroupId = account.creditGroupId;
      const nextCreditGroupId = input.creditGroupId !== undefined ? input.creditGroupId : priorCreditGroupId;
      // Leave-group snapshot (plan 254/255 Decision 2): if the caller clears the
      // link, freeze the group's current values onto the account's own columns
      // so it keeps its last billing cycle/limit after leaving the group.
      let leaveGroupOverrides: Partial<Account> = {};
      if (priorCreditGroupId && !nextCreditGroupId) {
        const group = this.data.creditGroups.find((g) => g.id === priorCreditGroupId && !g.deletedAt);
        if (group) {
          leaveGroupOverrides = {
            statementDay: group.statementDay,
            paymentDueDay: group.paymentDueDay,
            creditLimit: group.creditLimit,
          };
        }
      }
      return bump({
        ...account,
        ...input,
        bookId: input.bookId ?? account.bookId,
        creditGroupId: nextCreditGroupId,
        creditLimit: input.type === "credit" ? input.creditLimit : null,
        creditLimitGroup: input.type === "credit" ? input.creditLimitGroup : "",
        loanStartDate: input.type === "loan" ? (input.loanStartDate ?? null) : null,
        annualInterestRate: input.type === "loan" ? (input.annualInterestRate ?? null) : null,
        loanTerm: input.type === "loan" ? (input.loanTerm ?? null) : null,
        bankBrandDomain: input.bankBrandDomain ?? null,
        ...leaveGroupOverrides,
      });
    });
    this.recompute();
    await this.persist();
  }

  async deleteAccount(id: string) {
    const hasRows = this.data.ledgerTransactions.some((row) =>
        (row.accountId === id || row.counterAccountId === id) && row.deletedAt === null)
      || this.data.investmentRecords.some((row) => row.linkedAccountId === id && row.deletedAt === null);
    if (hasRows) throw new Error("已有交易的帳戶不能刪除。");
    this.data.accounts = this.data.accounts.map((account) =>
      account.id === id ? bump({ ...account, deletedAt: nowIso() }) : account,
    );
    await this.persist();
  }

  async listLedgerTransactions() {
    return active(this.data.ledgerTransactions).sort((a, b) => b.date.localeCompare(a.date));
  }

  async createLedgerTransaction(input: LedgerDraft) {
    assertLedgerInvariants(input, this.data.accounts);
    if (input.feeAmount && input.feeAmount > 0) {
      const groupId = input.groupId || createId("group");
      this.data.ledgerTransactions.push(
        createLedgerRow({ ...input, groupId }),
        createLedgerRow({
          accountId: input.accountId,
          date: input.date,
          name: "手續費",
          amount: -Math.abs(input.feeAmount),
          currency: input.currency,
          category: "手續費",
          // Income fees are bank/remittance charges, not FX surcharges.
          subcategory: input.entryType === "income" ? "收入手續費" : "海外交易手續費",
          merchant: input.merchant,
          entryType: "expense",
          settlementStatus: "settled",
          note: "由系統自動建立的手續費紀錄",
          groupId,
        })
      );
    } else {
      this.data.ledgerTransactions.push(createLedgerRow(input));
    }
    this.recompute();
    await this.persist();
  }

  async updateLedgerTransaction(id: string, input: LedgerDraft) {
    assertLedgerInvariants(input, this.data.accounts, { allowTransfer: input.entryType === "transfer" });
    const existingRow = this.data.ledgerTransactions.find((row) => row.id === id);
    // Fee-leg reconciliation (plan 226) only applies to expense/income rows —
    // transfers keep their separate createTransfer fee path.
    const feeEligible = Boolean(existingRow) && (input.entryType === "expense" || input.entryType === "income");
    const existingLegId = feeEligible ? findFeeLegId(this.data.ledgerTransactions, existingRow!.groupId) : undefined;
    const plan: FeeLegPlan = feeEligible ? planFeeLegUpdate(existingLegId, input.feeAmount) : { kind: "none" };
    // Preserve the row's own groupId across the edit (needed so a later edit
    // can still find the linked fee leg via the lookup contract above); only
    // mint a fresh one when we're about to create the first fee leg for a
    // previously ungrouped row. Non-fee-eligible rows keep the legacy
    // `input.groupId ?? null` behavior — the recurring "all"-scope sibling
    // rewrite (applyRecurringScopeEdit) still passes groupId explicitly when
    // it wants a specific value.
    let groupId = feeEligible ? existingRow!.groupId : (input.groupId ?? null);
    if (plan.kind === "create" && !groupId) groupId = createId("group");
    this.data.ledgerTransactions = this.data.ledgerTransactions.map((row) => {
      if (row.id === id) return bump({ ...row, ...input, counterAccountId: input.counterAccountId ?? null, groupId });
      if (plan.kind === "update" && row.id === plan.legId) {
        return bump({ ...row, amount: -Math.abs(input.feeAmount!), date: input.date, merchant: input.merchant, accountId: input.accountId, currency: input.currency });
      }
      if (plan.kind === "tombstone" && row.id === plan.legId) return bump({ ...row, deletedAt: nowIso() });
      return row;
    });
    if (plan.kind === "create") {
      this.data.ledgerTransactions.push(createLedgerRow(feeLegDraft(input, groupId!)));
    }
    this.recompute();
    await this.persist();
  }

  async setLedgerReviewed(id: string, reviewed: boolean) {
    this.data.ledgerTransactions = this.data.ledgerTransactions.map((row) =>
      row.id === id ? bump({ ...row, isReviewed: reviewed }) : row,
    );
    await this.persist();
  }

  async setLedgerPostDate(id: string, postDate: string | null) {
    this.data.ledgerTransactions = this.data.ledgerTransactions.map((row) =>
      row.id === id ? bump({ ...row, postDate }) : row,
    );
    await this.persist();
  }

  async deleteLedgerTransaction(id: string) {
    const target = this.data.ledgerTransactions.find((row) => row.id === id);
    const groupId = target?.groupId;
    this.data.ledgerTransactions = this.data.ledgerTransactions.map((row) =>
      row.id === id || (groupId && row.groupId === groupId)
        ? bump({ ...row, deletedAt: nowIso() })
        : row,
    );
    this.recompute();
    await this.persist();
  }

  async createInstallmentPlan(input: LedgerDraft, periods: number) {
    assertLedgerInvariants(input, this.data.accounts);
    const schedule = buildInstallmentSchedule({ totalAmount: input.amount, periods, startDate: input.date });
    const installmentGroupId = createId("inst");
    for (const period of schedule) {
      this.data.ledgerTransactions.push(createLedgerRow({
        ...input,
        date: period.date,
        amount: period.amount,
        // Installments never carry a fee leg; the fee field is hidden in the UI.
        feeAmount: 0,
        groupId: null,
        installmentGroupId,
        installmentIndex: period.index,
        installmentTotal: periods,
      }));
    }
    this.recompute();
    await this.persist();
  }

  async deleteInstallmentPlan(installmentGroupId: string, opts?: { fromIndex?: number }) {
    const fromIndex = opts?.fromIndex;
    this.data.ledgerTransactions = this.data.ledgerTransactions.map((row) =>
      row.installmentGroupId === installmentGroupId
        && row.deletedAt === null
        && (fromIndex === undefined || (row.installmentIndex ?? 0) >= fromIndex)
        ? bump({ ...row, deletedAt: nowIso() })
        : row,
    );
    this.recompute();
    await this.persist();
  }

  async createSplit(shared: SplitSharedFields, legs: SplitLegInput[], shares: SplitShareInput[] = []) {
    const drafts = buildSplitLegs(shared, legs, createId("group"), shares);
    for (const draft of drafts) {
      if ("counterAccountId" in draft && !this.data.accounts.some((a) => a.id === draft.counterAccountId && a.deletedAt === null)) {
        throw new Error("找不到應收帳戶。");
      }
      assertLedgerInvariants(draft, this.data.accounts);
    }
    this.data.ledgerTransactions.push(...drafts.map((draft) => createLedgerRow(draft)));
    this.recompute();
    await this.persist();
  }

  async updateSplit(groupId: string, shared: SplitSharedFields, legs: SplitLegInput[], shares: SplitShareInput[] = []) {
    // Tombstone-all + recreate with the SAME groupId (simpler than diffing
    // legs; see FinanceRepository.updateSplit). bump() raises each tombstoned
    // row's revision so sync LWW propagates the deletes alongside the new rows.
    const drafts = buildSplitLegs(shared, legs, groupId, shares);
    for (const draft of drafts) {
      if ("counterAccountId" in draft && !this.data.accounts.some((a) => a.id === draft.counterAccountId && a.deletedAt === null)) {
        throw new Error("找不到應收帳戶。");
      }
      assertLedgerInvariants(draft, this.data.accounts);
    }
    const hasGroup = this.data.ledgerTransactions.some((row) => row.groupId === groupId && row.deletedAt === null);
    if (!hasGroup) throw new Error("找不到拆分群組。");
    this.data.ledgerTransactions = this.data.ledgerTransactions.map((row) =>
      row.groupId === groupId && row.deletedAt === null ? bump({ ...row, deletedAt: nowIso() }) : row,
    );
    this.data.ledgerTransactions.push(...drafts.map((draft) => createLedgerRow(draft)));
    this.recompute();
    await this.persist();
  }

  async applyRecurringScopeEdit(id: string, scope: RecurringEditScope, input: LedgerDraft) {
    // Implemented with the public CRUD methods so the SQLite subclass inherits
    // it unchanged (its overrides of update/list are picked up via `this`).
    const ledger = await this.listLedgerTransactions();
    const target = ledger.find((row) => row.id === id);
    // Always update the edited occurrence itself.
    await this.updateLedgerTransaction(id, input);
    const ruleId = target?.recurringRuleId ?? null;
    if (scope === "this" || !ruleId) return;

    // Update the rule template (money/classification fields) for "future"/"all".
    const rules = await this.listRecurringTransactions();
    const rule = rules.find((r) => r.id === ruleId);
    if (rule && (input.entryType === "income" || input.entryType === "expense")) {
      await this.updateRecurringTransaction(ruleId, {
        ...rule,
        accountId: input.accountId,
        counterAccountId: input.counterAccountId ?? null,
        amount: input.amount,
        currency: input.currency,
        category: input.category,
        subcategory: input.subcategory,
        merchant: input.merchant,
        entryType: input.entryType,
        settlementStatus: input.settlementStatus,
        note: input.note,
      });
    }
    if (scope !== "all") return;

    // Rewrite every other already-posted occurrence, preserving each one's own
    // date (and FX original amount / group), per the agreed "全部" semantics.
    const siblings = ledger.filter((row) => row.recurringRuleId === ruleId && row.id !== id);
    for (const sib of siblings) {
      await this.updateLedgerTransaction(sib.id, {
        accountId: input.accountId,
        counterAccountId: input.counterAccountId ?? null,
        date: sib.date,
        name: input.name,
        amount: input.amount,
        currency: input.currency,
        originalAmount: sib.originalAmount,
        originalCurrency: sib.originalCurrency,
        category: input.category,
        subcategory: input.subcategory,
        merchant: input.merchant,
        entryType: input.entryType,
        settlementStatus: input.settlementStatus,
        note: input.note,
        groupId: sib.groupId,
      });
    }
  }

  async createTransfer(input: TransferDraft) {
    assertTransferInvariants(input, this.data.accounts);
    const groupId = createId("group");
    this.data.ledgerTransactions.push(
      createLedgerRow({
        accountId: input.sourceAccountId,
        date: input.date,
        name: input.sourceCurrency === input.destinationCurrency ? "轉出" : "外幣換出",
        amount: -Math.abs(input.sourceAmount),
        currency: input.sourceCurrency,
        category: input.sourceCurrency === input.destinationCurrency ? "轉帳" : "外幣兌換",
        subcategory: input.sourceCurrency === input.destinationCurrency ? "帳戶轉移" : "外幣兌換",
        merchant: "",
        entryType: "transfer",
        settlementStatus: "settled",
        note: input.note,
        groupId,
      }),
      createLedgerRow({
        accountId: input.destinationAccountId,
        date: input.date,
        name: input.sourceCurrency === input.destinationCurrency ? "轉入" : "外幣換入",
        amount: input.destinationCurrency === input.sourceCurrency
          ? Math.abs(input.sourceAmount)
          : Math.abs(input.destinationAmount ?? 0),
        currency: input.destinationCurrency,
        category: input.sourceCurrency === input.destinationCurrency ? "轉帳" : "外幣兌換",
        subcategory: input.sourceCurrency === input.destinationCurrency ? "帳戶轉移" : "外幣兌換",
        merchant: "",
        entryType: "transfer",
        settlementStatus: "settled",
        note: input.note,
        groupId,
      }),
    );
    if (input.feeAmount && input.feeAmount > 0) {
      this.data.ledgerTransactions.push(createLedgerRow({
        accountId: input.sourceAccountId,
        date: input.date,
        name: "手續費",
        amount: -Math.abs(input.feeAmount),
        currency: input.sourceCurrency,
        category: "手續費",
        subcategory: "轉帳手續費",
        merchant: "",
        entryType: "expense",
        settlementStatus: "settled",
        note: "由系統自動建立的轉帳手續費紀錄",
        groupId,
      }));
    }
    this.recompute();
    await this.persist();
  }

  async updateTransfer(groupId: string, input: TransferDraft) {
    assertTransferInvariants(input, this.data.accounts);
    const groupRows = this.data.ledgerTransactions.filter(
      (row) => row.groupId === groupId && row.deletedAt === null,
    );
    const transferLegs = groupRows.filter((row) => row.entryType === "transfer");
    const sourceLegs = transferLegs.filter((row) => row.amount < 0);
    const destLegs = transferLegs.filter((row) => row.amount >= 0);
    if (sourceLegs.length !== 1 || destLegs.length !== 1) throw new Error("找不到轉帳交易。");
    const sourceLeg = sourceLegs[0];
    const destLeg = destLegs[0];
    const feeLeg = groupRows.find((row) => row.category === "手續費");

    const sameCurrency = input.sourceCurrency === input.destinationCurrency;
    const destAmount = sameCurrency
      ? Math.abs(input.sourceAmount)
      : Math.abs(input.destinationAmount ?? 0);
    const transferName = sameCurrency ? { source: "轉出", dest: "轉入" } : { source: "外幣換出", dest: "外幣換入" };
    const transferCategory = sameCurrency ? "轉帳" : "外幣兌換";
    const transferSubcategory = sameCurrency ? "帳戶轉移" : "外幣兌換";

    this.data.ledgerTransactions = this.data.ledgerTransactions.map((row) => {
      if (row.id === sourceLeg.id) {
        return bump({
          ...row,
          accountId: input.sourceAccountId,
          date: input.date,
          name: transferName.source,
          amount: -Math.abs(input.sourceAmount),
          currency: input.sourceCurrency,
          category: transferCategory,
          subcategory: transferSubcategory,
          note: input.note,
        });
      }
      if (row.id === destLeg.id) {
        return bump({
          ...row,
          accountId: input.destinationAccountId,
          date: input.date,
          name: transferName.dest,
          amount: destAmount,
          currency: input.destinationCurrency,
          category: transferCategory,
          subcategory: transferSubcategory,
          note: input.note,
        });
      }
      return row;
    });

    const wantsFee = Boolean(input.feeAmount && input.feeAmount > 0);
    if (feeLeg && wantsFee) {
      this.data.ledgerTransactions = this.data.ledgerTransactions.map((row) =>
        row.id === feeLeg.id
          ? bump({
              ...row,
              accountId: input.sourceAccountId,
              date: input.date,
              amount: -Math.abs(input.feeAmount ?? 0),
              currency: input.sourceCurrency,
            })
          : row,
      );
    } else if (feeLeg && !wantsFee) {
      this.data.ledgerTransactions = this.data.ledgerTransactions.map((row) =>
        row.id === feeLeg.id ? bump({ ...row, deletedAt: nowIso() }) : row,
      );
    } else if (!feeLeg && wantsFee) {
      this.data.ledgerTransactions.push(createLedgerRow({
        accountId: input.sourceAccountId,
        date: input.date,
        name: "手續費",
        amount: -Math.abs(input.feeAmount ?? 0),
        currency: input.sourceCurrency,
        category: "手續費",
        subcategory: "轉帳手續費",
        merchant: "",
        entryType: "expense",
        settlementStatus: "settled",
        note: "由系統自動建立的轉帳手續費紀錄",
        groupId,
      }));
    }

    this.recompute();
    await this.persist();
  }

  async importLedgerTransactions(rows: LedgerDraft[]) {
    rows.forEach((row) => assertLedgerInvariants(row, this.data.accounts));
    this.data.ledgerTransactions.push(...rows.map(createLedgerRow));
    this.recompute();
    await this.persist();
  }

  async listPortfolioAssets() {
    return active(this.data.portfolioAssets);
  }

  async createManualHolding(input: PortfolioAssetDraft) {
    const asset = createManualHoldingRow(input);
    this.data.portfolioAssets.push(asset);
    // Materialize the opening-balance lot so quantity, blended cost, P/L, XIRR,
    // and the net-worth trend all derive from records uniformly.
    this.data.investmentRecords.push(buildOpeningRecord(asset, input));
    this.recompute();
    await this.persist();
  }

  async updateManualHolding(id: string, input: PortfolioAssetDraft) {
    const asset = this.data.portfolioAssets.find((a) => a.id === id && a.holdingSource === "manual");
    if (!asset) return;
    this.data.portfolioAssets = this.data.portfolioAssets.map((a) =>
      a.id === id && a.holdingSource === "manual" ? bump({ ...a, ...manualHoldingFields(input) }) : a,
    );
    // The snapshot's numbers live on the opening record (single source of truth);
    // keep it in sync with the edited qty/price/date/account.
    const openingId = openingRecordId(id);
    const rebuilt = buildOpeningRecord({ id, accountId: input.accountId || null }, input);
    if (this.data.investmentRecords.some((r) => r.id === openingId)) {
      this.data.investmentRecords = this.data.investmentRecords.map((r) =>
        r.id === openingId
          ? bump({ ...r, deletedAt: null, linkedAccountId: rebuilt.linkedAccountId, date: rebuilt.date, price: rebuilt.price, quantity: rebuilt.quantity })
          : r,
      );
    } else {
      this.data.investmentRecords.push(rebuilt);
    }
    this.recompute();
    await this.persist();
  }

  async updateAssetClassification(id: string, input: AssetClassificationInput) {
    const classification = assetClassificationFields(input);
    this.data.portfolioAssets = this.data.portfolioAssets.map((asset) =>
      asset.id === id && asset.deletedAt === null
        ? bump({
            ...asset,
            ...classification,
            nameZh: input.nameZh ?? asset.nameZh ?? null,
            nameEn: input.nameEn ?? asset.nameEn ?? null,
            // Manual edits lock the row; auto-backfill (no signal) preserves the
            // existing lock state so it never clears a user's lock.
            classificationLocked: input.lockClassification ? true : (asset.classificationLocked ?? false),
          })
        : asset,
    );
    await this.persist();
  }

  async deleteManualHolding(id: string) {
    // The opening-balance lot is cashless and ours to remove; only real trades
    // (cashless === false) block direct deletion.
    const hasRealRecords = this.data.investmentRecords.some((record) => record.assetId === id && record.deletedAt === null && !record.cashless);
    if (hasRealRecords) throw new Error("已有逐筆交易的持倉不能直接刪除。");
    const timestamp = nowIso();
    this.data.portfolioAssets = this.data.portfolioAssets.map((asset) =>
      asset.id === id && asset.holdingSource === "manual" ? bump({ ...asset, deletedAt: timestamp }) : asset,
    );
    this.data.investmentRecords = this.data.investmentRecords.map((record) =>
      record.id === openingRecordId(id) && record.deletedAt === null ? bump({ ...record, deletedAt: timestamp }) : record,
    );
    this.recompute();
    await this.persist();
  }

  async listInvestmentRecords() {
    return active(this.data.investmentRecords).sort((a, b) => b.date.localeCompare(a.date));
  }

  async createInvestmentRecord(input: InvestmentDraft) {
    const existingAsset = this.findTransactionAsset(input) ?? this.findManualAsset(input);
    this.validateInvestmentDraft(input, existingAsset);
    const asset = this.findOrCreateAsset(input);
    const record = createInvestmentRow(input, asset.id);
    const ledger = createInvestmentLedgerRow(input, record.id);
    if (ledger) {
      record.linkedLedgerTransactionId = ledger.id;
      this.data.ledgerTransactions.push(ledger);
    }
    this.data.investmentRecords.push(record);
    this.recompute();
    await this.persist();
  }

  async createDividendReinvestment(input: DividendReinvestmentDraft) {
    validateDividendReinvestment(input);
    const { dividend, buy } = dividendReinvestmentLegs(input);
    const dripGroupId = createId("drip");

    // Order matters: post the dividend (+amount) before validating/posting the
    // buy (−qty×price) so the buy's purchasing-power check sees the credited
    // dividend. Both legs resolve to the same asset and share one dripGroupId.
    const buildLeg = (leg: InvestmentDraft) => {
      const existingAsset = this.findTransactionAsset(leg) ?? this.findManualAsset(leg);
      this.validateInvestmentDraft(leg, existingAsset);
      const asset = this.findOrCreateAsset(leg);
      const record = createInvestmentRow(leg, asset.id);
      record.dripGroupId = dripGroupId;
      const ledger = createInvestmentLedgerRow(leg, record.id);
      if (ledger) {
        record.linkedLedgerTransactionId = ledger.id;
        this.data.ledgerTransactions.push(ledger);
      }
      this.data.investmentRecords.push(record);
      // Recompute after each leg so the buy's validation sees the dividend's cash.
      this.recompute();
    };

    buildLeg(dividend);
    buildLeg(buy);
    await this.persist();
  }

  async updateInvestmentRecord(id: string, input: InvestmentDraft) {
    const existingRecord = this.data.investmentRecords.find((record) => record.id === id && record.deletedAt === null);
    if (!existingRecord) throw new Error("找不到投資交易。");
    // The cashless flag is a stored property of the record, not something the edit
    // UI supplies — an opening lot must stay cashless no matter what draft arrives.
    const effective: InvestmentDraft = { ...input, cashless: existingRecord.cashless };
    const existingAsset = this.findTransactionAsset(effective) ?? this.findManualAsset(effective);
    this.validateInvestmentDraft(effective, existingAsset, {
      excludeRecordId: id,
      excludeLedgerId: existingRecord.linkedLedgerTransactionId,
    });
    const asset = this.findOrCreateAsset(effective);
    const ledger = createInvestmentLedgerRow(effective, id);
    let linkedLedgerTransactionId: string | null = existingRecord.linkedLedgerTransactionId;
    if (linkedLedgerTransactionId) {
      this.data.ledgerTransactions = this.data.ledgerTransactions.map((row) => {
        if (row.id !== linkedLedgerTransactionId) return row;
        return ledger
          ? bump({ ...row, ...investmentLedgerFields(effective, id) })
          : bump({ ...row, deletedAt: nowIso() });
      });
      if (!ledger) linkedLedgerTransactionId = null;
    } else if (ledger) {
      linkedLedgerTransactionId = ledger.id;
      this.data.ledgerTransactions.push(ledger);
    }
    this.data.investmentRecords = this.data.investmentRecords.map((record) =>
      record.id === id ? bump({ ...record, ...investmentDraftFields(effective), assetId: asset.id, linkedLedgerTransactionId }) : record,
    );
    this.recompute();
    await this.persist();
  }

  async deleteInvestmentRecord(id: string) {
    const existingRecord = this.data.investmentRecords.find((record) => record.id === id && record.deletedAt === null);
    if (!existingRecord) throw new Error("找不到投資交易。");
    // Deleting a manual holding's opening lot must remove the whole holding —
    // otherwise recomputeAssets self-heals the quantity from baseQuantity and the
    // holding resurrects. Defer to deleteManualHolding, which tombstones the asset
    // + opening record and enforces the "已有逐筆交易" guard when real trades exist.
    if (existingRecord.id === openingRecordId(existingRecord.assetId)) {
      const asset = this.data.portfolioAssets.find((item) => item.id === existingRecord.assetId);
      if (asset?.holdingSource === "manual") {
        await this.deleteManualHolding(existingRecord.assetId);
        return;
      }
    }
    // A 股息再投入 (DRIP) entry is two linked legs sharing one dripGroupId; deleting
    // either removes both so the dividend and its reinvestment never half-exist.
    const targets = existingRecord.dripGroupId
      ? this.data.investmentRecords.filter((record) => record.dripGroupId === existingRecord.dripGroupId && record.deletedAt === null)
      : [existingRecord];
    const targetIds = new Set(targets.map((record) => record.id));
    const ledgerIds = new Set(targets.map((record) => record.linkedLedgerTransactionId).filter((value): value is string => value !== null));
    this.data.investmentRecords = this.data.investmentRecords.map((record) =>
      targetIds.has(record.id) ? bump({ ...record, deletedAt: nowIso() }) : record,
    );
    if (ledgerIds.size > 0) {
      this.data.ledgerTransactions = this.data.ledgerTransactions.map((row) =>
        ledgerIds.has(row.id) ? bump({ ...row, deletedAt: nowIso() }) : row,
      );
    }
    this.recompute();
    await this.persist();
  }

  async importInvestmentRecords(rows: InvestmentDraft[]) {
    for (const row of rows) {
      const existingAsset = this.findTransactionAsset(row) ?? this.findManualAsset(row);
      this.validateInvestmentDraft(row, existingAsset);
      const asset = this.findOrCreateAsset(row);
      const record = createInvestmentRow(row, asset.id);
      const ledger = createInvestmentLedgerRow(row, record.id);
      if (ledger) {
        record.linkedLedgerTransactionId = ledger.id;
        this.data.ledgerTransactions.push(ledger);
      }
      this.data.investmentRecords.push(record);
    }
    this.recompute();
    await this.persist();
  }

  async importInvestmentActivity(input: InvestmentActivityImportDraft) {
    const rows = [
      ...input.cash.map((row) => ({ kind: "cash" as const, row })),
      ...input.investments.map((row) => ({ kind: "investment" as const, row })),
    ].sort((a, b) => (a.row.importRow ?? Number.MAX_SAFE_INTEGER) - (b.row.importRow ?? Number.MAX_SAFE_INTEGER));

    for (const item of rows) {
      try {
        if (item.kind === "cash") {
          assertLedgerInvariants(item.row, this.data.accounts, { allowTransfer: item.row.entryType === "transfer" });
          this.data.ledgerTransactions.push(createLedgerRow(item.row));
        } else {
          const row = item.row;
          const existingAsset = this.findTransactionAsset(row) ?? this.findManualAsset(row);
          this.validateInvestmentDraft(row, existingAsset);
          const asset = this.findOrCreateAsset(row);
          const record = createInvestmentRow(row, asset.id);
          const ledger = createInvestmentLedgerRow(row, record.id);
          if (ledger) {
            record.linkedLedgerTransactionId = ledger.id;
            this.data.ledgerTransactions.push(ledger);
          }
          this.data.investmentRecords.push(record);
        }
      } catch (error) {
        throw formatImportError(item.row, error);
      }
    }
    this.recompute();
    await this.persist();
  }

  async listRecurringTransactions() {
    return active(this.data.recurringTransactions).map((row) => ({
      ...row,
      frequency: (row.frequency ?? "monthly") as import("../domain").RecurringFrequency,
    }));
  }

  async createRecurringTransaction(input: RecurringDraft) {
    assertLedgerInvariants(input, this.data.accounts);
    this.data.recurringTransactions.push(createRecurringRow(input));
    await this.persist();
  }

  async updateRecurringTransaction(id: string, input: RecurringDraft) {
    assertLedgerInvariants(input, this.data.accounts);
    this.data.recurringTransactions = this.data.recurringTransactions.map((row) =>
      row.id === id ? bump({ ...row, ...input, counterAccountId: input.counterAccountId ?? null }) : row,
    );
    await this.persist();
  }

  async deleteRecurringTransaction(id: string) {
    this.data.recurringTransactions = this.data.recurringTransactions.map((row) =>
      row.id === id ? bump({ ...row, deletedAt: nowIso() }) : row,
    );
    await this.persist();
  }

  async postRecurringTransaction(id: string) {
    const recurring = this.data.recurringTransactions.find((row) => row.id === id && row.deletedAt === null);
    if (!recurring) throw new Error("找不到週期事件。");
    const recurringOccurrenceKey = recurringKey(recurring.id, recurring.nextRunDate);
    if (this.data.ledgerTransactions.some((row) => row.recurringOccurrenceKey === recurringOccurrenceKey && row.deletedAt === null)) {
      throw new Error("這一期週期交易已經建立。");
    }
    this.data.ledgerTransactions.push(createLedgerRow({
      accountId: recurring.accountId,
      counterAccountId: recurring.counterAccountId ?? null,
      date: `${recurring.nextRunDate}T09:00`,
      name: recurring.merchant || recurring.category,
      amount: recurring.amount,
      currency: recurring.currency,
      category: recurring.category,
      subcategory: recurring.subcategory,
      merchant: recurring.merchant,
      entryType: recurring.entryType,
      settlementStatus: recurring.settlementStatus,
      note: recurring.note,
      recurringRuleId: recurring.id,
      recurringOccurrenceKey,
    }));
    this.data.recurringTransactions = this.data.recurringTransactions.map((row) =>
      row.id === id ? bump({ ...row, nextRunDate: nextRecurringDate(row.nextRunDate, row.frequency ?? "monthly", row.dayOfMonth) }) : row,
    );
    this.recompute();
    await this.persist();
  }

  async postDueRecurringTransactions(today: string) {
    let posted = 0;
    const advanced = new Map<string, string>();
    for (const rule of this.data.recurringTransactions) {
      if (rule.deletedAt !== null || !rule.isActive) continue;
      const frequency = rule.frequency ?? "monthly";
      let next = rule.nextRunDate;
      let guard = 0;
      while (next <= today && guard < 120) {
        const recurringOccurrenceKey = recurringKey(rule.id, next);
        if (this.data.ledgerTransactions.some((row) => row.recurringOccurrenceKey === recurringOccurrenceKey && row.deletedAt === null)) {
          next = nextRecurringDate(next, frequency, rule.dayOfMonth);
          guard += 1;
          continue;
        }
        this.data.ledgerTransactions.push(createLedgerRow({
          accountId: rule.accountId,
          counterAccountId: rule.counterAccountId ?? null,
          date: `${next}T09:00`,
          name: rule.merchant || rule.category,
          amount: rule.amount,
          currency: rule.currency,
          category: rule.category,
          subcategory: rule.subcategory,
          merchant: rule.merchant,
          entryType: rule.entryType,
          settlementStatus: rule.settlementStatus,
          note: rule.note,
          recurringRuleId: rule.id,
          recurringOccurrenceKey,
        }));
        next = nextRecurringDate(next, frequency, rule.dayOfMonth);
        posted += 1;
        guard += 1;
      }
      if (next !== rule.nextRunDate) advanced.set(rule.id, next);
    }
    // Persist advances even when nothing was posted: if every due occurrence
    // already exists (e.g. arrived via sync), the rule must still move past
    // today rather than stay perpetually overdue. Matches the SQLite twin,
    // which writes the advance unconditionally per rule.
    if (advanced.size > 0) {
      this.data.recurringTransactions = this.data.recurringTransactions.map((row) =>
        advanced.has(row.id) ? bump({ ...row, nextRunDate: advanced.get(row.id)! }) : row,
      );
    }
    if (posted > 0) this.recompute(); // balances only change when rows were created
    if (advanced.size > 0 || posted > 0) await this.persist();
    return posted;
  }

  async listRecurringInvestments() {
    return active(this.data.recurringInvestments).map((row) => ({
      ...row,
      frequency: (row.frequency ?? "monthly") as import("../domain").RecurringFrequency,
      mode: (row.mode ?? "fixedAmount") as RecurringInvestmentMode,
    }));
  }

  async createRecurringInvestment(input: RecurringInvestmentDraft) {
    this.data.recurringInvestments.push(createRecurringInvestmentRow(input));
    await this.persist();
  }

  async updateRecurringInvestment(id: string, input: RecurringInvestmentDraft) {
    this.data.recurringInvestments = this.data.recurringInvestments.map((row) =>
      row.id === id ? bump({ ...row, ...input }) : row,
    );
    await this.persist();
  }

  async deleteRecurringInvestment(id: string) {
    this.data.recurringInvestments = this.data.recurringInvestments.map((row) =>
      row.id === id ? bump({ ...row, deletedAt: nowIso() }) : row,
    );
    await this.persist();
  }

  async postRecurringInvestment(id: string) {
    const rule = this.data.recurringInvestments.find((row) => row.id === id && row.deletedAt === null);
    if (!rule) throw new Error("找不到定期定額計畫。");
    // createInvestmentRecord persists + recomputes; then advance the schedule.
    await this.createInvestmentRecord(recurringInvestmentToDraft(rule));
    this.data.recurringInvestments = this.data.recurringInvestments.map((row) =>
      row.id === id ? bump({ ...row, nextRunDate: nextRecurringDate(row.nextRunDate, row.frequency ?? "monthly", row.dayOfMonth) }) : row,
    );
    await this.persist();
  }

  async adjustAccountBalance(accountId: string, targetBalance: number, date: string, note: string) {
    const account = this.data.accounts.find((row) => row.id === accountId && row.deletedAt === null);
    if (!account) throw new Error("找不到帳戶。");
    const diff = targetBalance - account.balance;
    if (diff === 0) return;
    this.data.ledgerTransactions.push(createLedgerRow({
      accountId,
      date,
      name: "餘額調整",
      amount: diff,
      currency: account.currency,
      category: "餘額調整",
      subcategory: "",
      merchant: "",
      entryType: diff > 0 ? "income" : "expense",
      settlementStatus: "settled",
      note,
    }));
    this.recompute();
    await this.persist();
  }

  async recalculateDerivedData(): Promise<RecalculationReport> {
    const beforeAccounts = this.data.accounts;
    const beforeAssets = this.data.portfolioAssets;
    this.recompute();
    const report = buildRecalculationReport(
      beforeAccounts,
      this.data.accounts,
      beforeAssets,
      this.data.portfolioAssets,
      this.data.ledgerTransactions,
      this.data.investmentRecords,
      findMissingFxPairs(this.data.accounts, this.data.ledgerTransactions, this.data.portfolioAssets, this.data.settings, this.data.dailyFxRates),
    );
    await this.persist();
    return report;
  }

  async renameMerchant(oldName: string, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed) throw new Error("新商家名稱不能為空。");
    this.data.ledgerTransactions = this.data.ledgerTransactions.map((row) =>
      row.merchant === oldName ? bump({ ...row, merchant: trimmed }) : row,
    );
    const current = this.data.settings;
    if (current.merchants.includes(oldName)) {
      this.data.settings = {
        ...current,
        merchants: current.merchants.map((m) => (m === oldName ? trimmed : m)),
      };
    }
    await this.persist();
  }

  async renameCategory(oldName: string, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed) throw new Error("新分類名稱不能為空。");
    this.data.ledgerTransactions = this.data.ledgerTransactions.map((row) =>
      row.category === oldName ? bump({ ...row, category: trimmed }) : row,
    );
    const current = this.data.settings;
    this.data.settings = {
      ...current,
      categories: current.categories.map((group) =>
        group.name === oldName ? { ...group, name: trimmed } : group,
      ),
    };
    await this.persist();
  }

  async renameSubcategory(category: string, oldSub: string, newSub: string) {
    const trimmed = newSub.trim();
    if (!trimmed) throw new Error("新子分類名稱不能為空。");
    this.data.ledgerTransactions = this.data.ledgerTransactions.map((row) =>
      row.category === category && row.subcategory === oldSub ? bump({ ...row, subcategory: trimmed }) : row,
    );
    const current = this.data.settings;
    this.data.settings = {
      ...current,
      categories: current.categories.map((group) =>
        group.name === category
          ? { ...group, children: group.children.map((c) => (c === oldSub ? trimmed : c)) }
          : group,
      ),
    };
    await this.persist();
  }

  async listMarketQuotes() { return this.marketData.listMarketQuotes(); }
  async saveMarketQuotes(quotes: MarketQuote[], source: string) { return this.marketData.saveMarketQuotes(quotes, source); }

  async getAppSettings() {
    return this.data.settings;
  }

  async updateAppSettings(input: AppSettings) {
    this.data.settings = normalizeSettings(input);
    this.data.settingsRevision = (this.data.settingsRevision ?? 0) + 1;
    this.data.settingsUpdatedAt = nowIso();
    await this.persist();
  }

  async listDailyFxRates(filter?: { from?: string; to?: string; since?: string }) { return this.marketData.listDailyFxRates(filter); }
  async saveDailyFxRates(rates: DailyFxRate[]) { return this.marketData.saveDailyFxRates(rates); }
  async getDailyFxRate(from: string, to: string, date: string) { return this.marketData.getDailyFxRate(from, to, date); }
  async listDailyPrices(filter?: { ticker?: string; since?: string }) { return this.marketData.listDailyPrices(filter); }
  async saveDailyPrices(prices: DailyPrice[]) { return this.marketData.saveDailyPrices(prices); }
  async getDailyPrice(ticker: string, date: string) { return this.marketData.getDailyPrice(ticker, date); }
  async listManualPriceSnapshots(filter?: { assetId?: string }) { return this.marketData.listManualPriceSnapshots(filter); }
  async createManualPriceSnapshot(input: ManualPriceSnapshotDraft) { return this.marketData.createManualPriceSnapshot(input); }
  async deleteManualPriceSnapshot(id: string) { return this.marketData.deleteManualPriceSnapshot(id); }

  async listFinancialGoals() {
    return this.data.financialGoals
      .filter((goal) => goal.deletedAt === null)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async upsertFinancialGoal(input: FinancialGoalDraft & { id?: string }) {
    const timestamp = nowIso();
    if (input.id) {
      const existing = this.data.financialGoals.find((goal) => goal.id === input.id);
      if (!existing) throw new Error("找不到要更新的目標。");
      const next: FinancialGoal = {
        ...existing,
        ...goalFieldsFromDraft(input),
        updatedAt: timestamp,
        revision: existing.revision + 1,
      };
      this.data.financialGoals = this.data.financialGoals.map((goal) =>
        goal.id === existing.id ? next : goal,
      );
      await this.persist();
      return next;
    }
    const goal: FinancialGoal = {
      id: createId("goal"),
      spaceId: personalSpace,
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
      ...goalFieldsFromDraft(input),
    };
    this.data.financialGoals.push(goal);
    await this.persist();
    return goal;
  }

  async deleteFinancialGoal(id: string) {
    this.data.financialGoals = this.data.financialGoals.map((goal) =>
      goal.id === id ? { ...goal, deletedAt: nowIso(), updatedAt: nowIso(), revision: goal.revision + 1 } : goal,
    );
    await this.persist();
  }

  async exportSnapshot(): Promise<RepositorySnapshot> {
    return {
      version: 1,
      exportedAt: nowIso(),
      books: this.data.books,
      accounts: this.data.accounts,
      ledgerTransactions: this.data.ledgerTransactions,
      portfolioAssets: this.data.portfolioAssets,
      investmentRecords: this.data.investmentRecords,
      recurringTransactions: this.data.recurringTransactions,
      recurringInvestments: this.data.recurringInvestments,
      marketQuotes: this.data.marketQuotes,
      settings: this.data.settings,
      settingsRevision: this.data.settingsRevision,
      settingsUpdatedAt: this.data.settingsUpdatedAt,
      dailyFxRates: this.data.dailyFxRates,
      dailyPrices: this.data.dailyPrices,
      financialGoals: this.data.financialGoals,
      manualPriceSnapshots: this.data.manualPriceSnapshots,
      invoices: this.data.invoices,
      clients: this.data.clients,
      creditGroups: this.data.creditGroups,
    };
  }

  // Sync-tracked records INCLUDING soft-deleted ones (deletes must propagate).
  // Overridden for SQLite to query rows directly so it isn't subject to the
  // deleted_at filter that the public list* methods apply.
  protected async allSyncRecords(): Promise<SyncSource> {
    return {
      books: this.data.books,
      invoices: this.data.invoices,
      clients: this.data.clients,
      creditGroups: this.data.creditGroups,
      accounts: this.data.accounts,
      ledgerTransactions: this.data.ledgerTransactions,
      portfolioAssets: this.data.portfolioAssets,
      investmentRecords: this.data.investmentRecords,
      recurringTransactions: this.data.recurringTransactions,
      recurringInvestments: this.data.recurringInvestments,
      financialGoals: this.data.financialGoals,
      appSettings: [{
        id: "app_settings",
        revision: this.data.settingsRevision ?? 1,
        updatedAt: this.data.settingsUpdatedAt ?? nowIso(),
        deletedAt: null,
      }],
    };
  }

  async collectPendingChanges(sinceCursor: string | null) {
    return buildPendingChanges(await this.allSyncRecords(), sinceCursor);
  }

  async acknowledgePendingChanges(_outboxIds: string[]) {
    // Browser storage derives pending rows from the timestamp cursor.
  }

  async requeueAllPendingChanges() {
    // Browser storage derives pending rows from the push cursor, so re-queuing
    // is handled entirely by the caller resetting localPushCursor to null.
  }

  async listSyncConflicts() {
    return this.data.syncConflicts;
  }

  async resolveSyncConflict(id: string, strategy: "keepLocal" | "useIncoming") {
    const conflict = this.data.syncConflicts.find((row) => row.id === id && row.resolvedAt === null);
    if (!conflict) throw new Error("找不到待處理的同步衝突。");
    if (strategy === "useIncoming") {
      await this.applySyncChanges([{ entity: conflict.entity, payload: conflict.incomingPayload }]);
    } else {
      const payload = await this.getSyncPayload(conflict.entity, conflict.entityId);
      if (!payload) throw new Error("找不到本機版本。");
      await this.applySyncChanges([{
        entity: conflict.entity,
        payload: { ...payload, revision: Number(payload.revision ?? 0) + 1, updatedAt: nowIso() },
      }]);
    }
    this.data.syncConflicts = this.data.syncConflicts.map((row) =>
      row.id === id ? { ...row, resolvedAt: nowIso() } : row,
    );
    await this.persist();
  }

  async clearSyncConflicts(): Promise<void> {
    this.data.syncConflicts = [];
    await this.persist();
  }

  async getSyncPayload(entity: SyncEntity, entityId: string): Promise<Record<string, unknown> | null> {
    if (entity === "settings") {
      return entityId === "app_settings" ? {
        id: "app_settings",
        revision: this.data.settingsRevision,
        updatedAt: this.data.settingsUpdatedAt,
        deletedAt: null,
        settings: this.data.settings,
      } : null;
    }
    const rowsByEntity = {
      account: this.data.accounts,
      ledger: this.data.ledgerTransactions,
      asset: this.data.portfolioAssets,
      investment: this.data.investmentRecords,
      recurring: this.data.recurringTransactions,
      recurringInvestment: this.data.recurringInvestments,
      goal: this.data.financialGoals,
      book: this.data.books,
      invoice: this.data.invoices,
      client: this.data.clients,
      creditGroup: this.data.creditGroups,
    };
    return (rowsByEntity[entity].find((row) => row.id === entityId) as unknown as Record<string, unknown> | undefined) ?? null;
  }

  async getSyncPayloads(entity: SyncEntity, entityIds: string[]): Promise<Map<string, Record<string, unknown>>> {
    const map = new Map<string, Record<string, unknown>>();
    // Dedupe so a page with repeated ids resolves each once. In-memory lookups
    // have no round-trip cost, so a per-id resolve keeps parity with getSyncPayload.
    for (const id of new Set(entityIds)) {
      const payload = await this.getSyncPayload(entity, id);
      if (payload) map.set(id, payload);
    }
    return map;
  }

  async importSnapshot(snapshot: RepositorySnapshot) {
    this.data = normalizeStoredData({
      books: snapshot.books,
      accounts: snapshot.accounts,
      ledgerTransactions: snapshot.ledgerTransactions,
      portfolioAssets: snapshot.portfolioAssets,
      investmentRecords: snapshot.investmentRecords,
      recurringTransactions: snapshot.recurringTransactions,
      recurringInvestments: snapshot.recurringInvestments,
      marketQuotes: snapshot.marketQuotes,
      settings: snapshot.settings,
      settingsRevision: snapshot.settingsRevision,
      settingsUpdatedAt: snapshot.settingsUpdatedAt,
      dailyFxRates: snapshot.dailyFxRates,
      dailyPrices: snapshot.dailyPrices,
      financialGoals: snapshot.financialGoals,
      manualPriceSnapshots: snapshot.manualPriceSnapshots,
      invoices: snapshot.invoices,
      clients: snapshot.clients,
      creditGroups: snapshot.creditGroups,
    });
    // A pre-books snapshot carries no books; guarantee the default 個人帳 and
    // that every imported account belongs to a book before deriving anything.
    this.ensureDefaultBookInMemory();
    // Plan 211 — an imported snapshot (e.g. a restore, or a pre-books backup)
    // can itself carry duplicate untouched mints; converge them the same way
    // a sync pull would.
    this.mergeAndHealBooksInMemory();
    // Recompute balances from the merged ledger/investment data so two devices
    // that each had different transactions converge to the same balance after sync,
    // instead of keeping whichever device's stale stored balance "won" the merge.
    this.recompute();
    await this.persist();
  }

  async applySyncChanges(changes: SyncApplyChange[], conflicts: SyncConflictRecord[] = []) {
    for (const change of changes) {
      const payload = change.payload;
      if (change.entity === "settings") {
        if (payload.settings) this.data.settings = normalizeSettings(payload.settings as AppSettings);
        this.data.settingsRevision = Number(payload.revision ?? this.data.settingsRevision);
        this.data.settingsUpdatedAt = String(payload.updatedAt ?? this.data.settingsUpdatedAt);
        continue;
      }
      const keyByEntity = {
        account: "accounts",
        ledger: "ledgerTransactions",
        asset: "portfolioAssets",
        investment: "investmentRecords",
        recurring: "recurringTransactions",
        recurringInvestment: "recurringInvestments",
        goal: "financialGoals",
        book: "books",
        invoice: "invoices",
        client: "clients",
        creditGroup: "creditGroups",
      } as const;
      // Recurring-occurrence de-dup: when two devices each post the same
      // occurrence, both rows arrive via sync under one recurringOccurrenceKey.
      // Converge to a single live row using the same winner rule as the SQLite
      // twin (applySqliteSyncChange): among non-deleted rows sharing the key,
      // the lexicographically smallest id survives; the loser is tombstoned
      // (bump() so the tombstone itself propagates to other devices).
      if (change.entity === "ledger") {
        const incoming = payload as unknown as LedgerTransaction;
        const occurrenceKey = incoming.recurringOccurrenceKey;
        if (occurrenceKey && !incoming.deletedAt) {
          const dupes = this.data.ledgerTransactions.filter(
            (row) => row.recurringOccurrenceKey === occurrenceKey && row.deletedAt === null && row.id !== incoming.id,
          );
          if (dupes.length > 0) {
            const existingId = dupes[0].id;
            const winner = [existingId, incoming.id].sort()[0];
            const now = nowIso();
            if (winner === incoming.id) {
              this.data.ledgerTransactions = this.data.ledgerTransactions.map((row) =>
                row.id === existingId ? bump({ ...row, deletedAt: now }) : row,
              );
            } else {
              incoming.deletedAt = incoming.deletedAt ?? now;
            }
          }
        }
      }
      const key = keyByEntity[change.entity];
      const rows = this.data[key] as Array<{ id: string }>;
      const index = rows.findIndex((row) => row.id === payload.id);
      if (index >= 0) rows[index] = payload as { id: string };
      else rows.push(payload as { id: string });
    }
    for (const conflict of conflicts) {
      if (!this.data.syncConflicts.some((row) => row.id === conflict.id)) this.data.syncConflicts.push(conflict);
    }
    this.recompute();
    // Plan 211 — the in-memory repo has no outbox-suppression concept (that's
    // a SQLite-only mechanism, see the SQLite override), so there is no trap
    // here: this call's tombstones/re-points are ordinary field writes that
    // flow into the very next collectPendingChanges/getSyncPayload call like
    // any other mutation.
    this.mergeAndHealBooksInMemory();
    await this.persist();
  }

  private findTransactionAsset(input: InvestmentDraft): PortfolioAsset | undefined {
    const ticker = input.ticker.trim().toUpperCase();
    return this.data.portfolioAssets.find((item) => item.ticker === ticker && item.deletedAt === null && item.holdingSource === "transactions");
  }

  // Decision A: a trade resolves to the SAME-ticker manual holding, preferring
  // one whose accountId matches the trade's account, then an account-less
  // import (the trade later adopts its account in findOrCreateAsset). This
  // closes the old account-scoped gap that split a position into two rows when
  // an imported holding had a different (or null) account than the trade.
  private findManualAsset(input: InvestmentDraft): PortfolioAsset | undefined {
    const ticker = input.ticker.trim().toUpperCase();
    const candidates = this.data.portfolioAssets.filter(
      (item) => item.ticker === ticker && item.deletedAt === null && item.holdingSource === "manual",
    );
    return (
      candidates.find((item) => item.accountId === input.linkedAccountId) ??
      candidates.find((item) => item.accountId === null)
    );
  }

  private findOrCreateAsset(input: InvestmentDraft): PortfolioAsset {
    const ticker = input.ticker.trim().toUpperCase();
    // Prefer a same-ticker manual holding (the imported position) over creating
    // or reusing a transaction asset, so trades accumulate into ONE asset.
    const manualAsset = this.findManualAsset(input);
    if (manualAsset) {
      // Account adoption: an account-less import takes on the trade's account so
      // per-account available quantity (sell-validation) stays correct. Re-point
      // the cashless opening record's linkedAccountId to match. Bump revision +
      // updatedAt on both the asset and the opening record so the adoption wins
      // LWW and propagates over E2E sync — matching findOrCreateSqliteAsset.
      if (manualAsset.accountId === null && input.linkedAccountId) {
        const adoptedAccountId = input.linkedAccountId;
        const adopted = bump({ ...manualAsset, accountId: adoptedAccountId });
        this.data.portfolioAssets = this.data.portfolioAssets.map((asset) =>
          asset.id === adopted.id ? adopted : asset,
        );
        this.data.investmentRecords = this.data.investmentRecords.map((record) =>
          record.id === openingRecordId(adopted.id) && record.deletedAt === null
            ? bump({ ...record, linkedAccountId: adoptedAccountId })
            : record,
        );
        return adopted;
      }
      return manualAsset;
    }
    const existing = this.findTransactionAsset(input);
    if (existing) return existing;
    const timestamp = nowIso();
    const asset: PortfolioAsset = {
      id: createId("asset"),
      spaceId: personalSpace,
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
      ticker,
      name: input.name || ticker,
      nameZh: null,
      nameEn: null,
      currency: input.currency,
      totalQuantity: 0,
      averageCost: 0,
      holdingSource: "transactions",
      acquisitionDate: null,
      ...assetClassificationFields(input),
      accountId: null,
      baseQuantity: null,
    };
    this.data.portfolioAssets.push(asset);
    return asset;
  }

  private validateInvestmentDraft(
    input: InvestmentDraft,
    existingAsset: PortfolioAsset | undefined,
    options: { excludeRecordId?: string; excludeLedgerId?: string | null } = {},
  ) {
    const account = this.data.accounts.find((row) => row.id === input.linkedAccountId && row.deletedAt === null);
    if (!account || account.type !== "investment") throw new Error("請選擇投資帳戶。");
    if (input.currency.trim().toUpperCase() !== account.currency.trim().toUpperCase()) throw new Error("交易幣別必須與投資帳戶一致。");

    if (input.action === "sell") {
      if (!existingAsset) throw new Error("賣出股數大於目前庫存。");
      // Manual holdings now carry their opening lot as a record in the same
      // account, so available quantity is the per-account record sum for both
      // manual and transaction-based holdings.
      const available = calculateInvestmentAccountQuantity(this.data.investmentRecords, existingAsset.id, account.id, options.excludeRecordId);
      if (input.quantity > available + 0.000001) throw new Error(`賣出股數大於目前庫存，可賣出 ${available} 股。`);
    }

    // Cashless opening lots never settle cash, so purchasing power is irrelevant.
    if (input.cashless) return;
    const cashDelta = calculateInvestmentCashDelta(input);
    if (cashDelta >= 0) return;
    if (allowsTwdTPlus2Buffer(input, account.currency)) return;
    const baseBalance = computeAccountBalance(account, this.data.ledgerTransactions, options.excludeLedgerId ?? null);
    const nextBalance = baseBalance + cashDelta;
    if (isEffectivelyNegative(nextBalance)) throw new Error(`購買力不足，目前餘額 ${formatPlainAmount(baseBalance)} ${account.currency}。`);
  }

  private recompute() {
    this.data.accounts = recomputeAccounts(this.data.accounts, this.data.ledgerTransactions);
    this.data.portfolioAssets = recomputeAssets(this.data.portfolioAssets, this.data.investmentRecords);
  }

  private async persist() {
    if (this.skipPersist) return;
    await persistBrowserRepositoryData(this.storageKey, this.data);
  }
}

const browserRepositoryDbName = "northstar.browserRepository";
const browserRepositoryStoreName = "snapshots";
const browserRepositoryObjectKey = "default";

async function loadBrowserRepositoryData(storageKey: string): Promise<Partial<RepositoryData> | null> {
  const indexedDbData = await readIndexedDbRepositoryData();
  if (indexedDbData) return indexedDbData;

  const localStorageData = readLocalStorageRepositoryData(storageKey);
  if (!localStorageData) return null;

  // Best-effort migration for existing browser users. If IndexedDB is not
  // available, persistBrowserRepositoryData will continue using localStorage.
  try {
    await persistBrowserRepositoryData(storageKey, normalizeStoredData(localStorageData));
  } catch (error) {
    console.warn("[repository] could not migrate browser data to IndexedDB", error);
  }
  return localStorageData;
}

async function persistBrowserRepositoryData(storageKey: string, data: RepositoryData) {
  if (canUseIndexedDb()) {
    try {
      await writeIndexedDbRepositoryData(data);
      removeLocalStorageRepositoryData(storageKey);
      return;
    } catch (indexedDbError) {
      try {
        writeLocalStorageRepositoryData(storageKey, data);
        return;
      } catch (localStorageError) {
        console.error("[repository] browser persistence failed", { indexedDbError, localStorageError });
        throw new Error("瀏覽器儲存空間不足，無法寫入這份備份。請使用支援 IndexedDB 的瀏覽器，或改用桌面 App 匯入。", { cause: localStorageError });
      }
    }
  }

  try {
    writeLocalStorageRepositoryData(storageKey, data);
  } catch (error) {
    console.error("[repository] localStorage persistence failed", error);
    throw new Error("瀏覽器 localStorage 空間不足，無法寫入這份備份。請改用支援 IndexedDB 的瀏覽器或桌面 App。", { cause: error });
  }
}

function readLocalStorageRepositoryData(storageKey: string): Partial<RepositoryData> | null {
  const stored = window.localStorage.getItem(storageKey);
  return stored ? JSON.parse(stored) as Partial<RepositoryData> : null;
}

function writeLocalStorageRepositoryData(storageKey: string, data: RepositoryData) {
  window.localStorage.setItem(storageKey, JSON.stringify(data));
}

function removeLocalStorageRepositoryData(storageKey: string) {
  try {
    window.localStorage.removeItem(storageKey);
  } catch {
    // Ignore cleanup failures; the IndexedDB copy is already durable.
  }
}

function canUseIndexedDb() {
  return typeof window !== "undefined" && "indexedDB" in window && window.indexedDB !== undefined;
}

async function readIndexedDbRepositoryData(): Promise<Partial<RepositoryData> | null> {
  if (!canUseIndexedDb()) return null;
  try {
    const db = await openBrowserRepositoryDb();
    try {
      return await new Promise<Partial<RepositoryData> | null>((resolve, reject) => {
        const transaction = db.transaction(browserRepositoryStoreName, "readonly");
        const request = transaction.objectStore(browserRepositoryStoreName).get(browserRepositoryObjectKey);
        request.onsuccess = () => resolve((request.result as Partial<RepositoryData> | undefined) ?? null);
        request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed"));
        transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
        transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
      });
    } finally {
      db.close();
    }
  } catch (error) {
    console.warn("[repository] could not read IndexedDB browser data", error);
    return null;
  }
}

async function writeIndexedDbRepositoryData(data: RepositoryData) {
  const db = await openBrowserRepositoryDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(browserRepositoryStoreName, "readwrite");
      transaction.objectStore(browserRepositoryStoreName).put(data, browserRepositoryObjectKey);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
      transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    });
  } finally {
    db.close();
  }
}

function openBrowserRepositoryDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(browserRepositoryDbName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(browserRepositoryStoreName)) {
        db.createObjectStore(browserRepositoryStoreName);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
    request.onblocked = () => reject(new Error("IndexedDB upgrade is blocked by another open Northstar tab."));
  });
}

/**
 * Serialize every access to a Tauri SQL `Database` through one in-process queue.
 *
 * `@tauri-apps/plugin-sql` runs each execute()/select() against a sqlx
 * connection *pool* (up to 10 connections). `importSnapshot()` issues
 * BEGIN / …many statements… / COMMIT as *separate* execute() calls, which is
 * only correct if every one of those calls lands on the same pooled connection.
 *
 * Auto-sync is triggered by the window-focus event — and that very same event
 * makes React Query refetch every active query (listAccounts, listLedger…).
 * Those reads run concurrently with the import and can grab the connection
 * *between* two of the import's statements. The next statement then runs on a
 * different connection (outside the transaction), while the original connection
 * is left holding a dangling, never-committed write transaction. That stranded
 * transaction keeps the WAL write lock, so every later write fails with
 * "database is locked" (code: 5) until the process restarts.
 *
 * This is in-memory pool state, not on-disk data — which is why deleting
 * northstar.db doesn't clear it. Chaining every operation onto a single promise
 * means no two ever run concurrently, so the pool only ever hands out ONE
 * connection (it grows past one connection only under concurrent demand). With
 * a single connection the whole BEGIN…COMMIT can never be split, and the lock
 * is impossible. This app has exactly one Database.load() and one repository
 * singleton, so routing all access through here covers every code path.
 *
 * Serializing *individual* statements is not enough for multi-statement
 * transactions. `withTransaction()` issues BEGIN / …writes… / COMMIT as separate
 * execute() calls. If a second write operation (e.g. auto-sync firing on
 * window-focus while the user saves an edit) enqueues *its* BEGIN between the
 * first transaction's BEGIN and COMMIT, that second BEGIN runs while the first
 * transaction is still open on the single shared connection — SQLite then throws
 * "cannot start a transaction within a transaction". plugin-sql surfaces that as
 * a bare string (not an Error), so the UI shows its generic save-failed message.
 *
 * `runExclusive()` fixes this with a SECOND lock — a transaction mutex — that is
 * separate from the statement queue. A whole BEGIN…COMMIT holds the tx mutex, so
 * no other transaction can issue its BEGIN until this one commits. Crucially,
 * every individual statement (including the transaction's own BEGIN/writes/COMMIT)
 * STILL goes through the statement queue, so the sqlx pool never sees two
 * concurrent statements and only ever hands out ONE connection.
 *
 * Do NOT "optimise" this by letting a transaction's statements bypass the queue:
 * sqlx releases the connection back to the pool after every execute(), so if an
 * external read/write runs concurrently with a transaction's statement, the pool
 * hands out a 2nd connection. The transaction's next statement may then land on a
 * connection with no open BEGIN, and a write on the 2nd connection fails with
 * "database is locked" (code 5) because the 2nd connection's busy_timeout is the
 * default 0. The two locks must stay independent: tx mutex (one transaction at a
 * time) + statement queue (one statement at a time).
 */
const runExclusiveKey = Symbol("northstar.runExclusive");

interface SerializedDatabase extends Database {
  [runExclusiveKey]<T>(operation: () => Promise<T>): Promise<T>;
}

function serializeDatabase(db: Database): SerializedDatabase {
  // Statement queue: every execute()/select() runs one at a time → pool only
  // ever uses one connection.
  let tail: Promise<unknown> = Promise.resolve();
  const run = <T,>(op: () => Promise<T>): Promise<T> => {
    // Run `op` once the previous operation settles (success OR failure), so a
    // single failed query never skips or blocks the ones queued behind it.
    const result = tail.then(op, op);
    tail = result.then(noop, noop);
    return result;
  };
  // Transaction mutex: only one BEGIN…COMMIT runs at a time. Independent of the
  // statement queue, so the transaction's own statements still flow through
  // `run()` without deadlocking on the mutex they hold.
  let txLock: Promise<unknown> = Promise.resolve();
  const runExclusive = <T,>(operation: () => Promise<T>): Promise<T> => {
    const result = txLock.then(operation, operation);
    txLock = result.then(noop, noop);
    return result;
  };
  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === "execute") {
        return (sql: string, values?: unknown[]) => run(() => target.execute(sql, values));
      }
      if (prop === "select") {
        return (sql: string, values?: unknown[]) => run(() => target.select(sql, values));
      }
      if (prop === runExclusiveKey) {
        return runExclusive;
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(target) : value;
    },
  }) as SerializedDatabase;
}

function noop() { /* swallow */ }

class TauriSqlFinanceRepository extends BrowserFinanceRepository {
  private readonly db: SerializedDatabase;
  // > 0 while a BEGIN…COMMIT is in flight. A nested withTransaction() call runs
  // as part of the outer transaction (SQLite has no nested BEGIN), so it must
  // not issue its own BEGIN/COMMIT — that would error and could strand the txn.
  private txDepth = 0;

  constructor(db: Database) {
    super();
    this.db = serializeDatabase(db);
  }

  private async withTransaction<T>(operation: () => Promise<T>): Promise<T> {
    // Already inside a transaction: run inline as part of it. No new BEGIN.
    if (this.txDepth > 0) return operation();

    // Claim the connection for the whole BEGIN…COMMIT so no other operation can
    // slip its own BEGIN in between (which SQLite rejects as "cannot start a
    // transaction within a transaction"). See serializeDatabase() for details.
    return this.db[runExclusiveKey](async () => {
      this.txDepth += 1;
      await this.db.execute("BEGIN");
      try {
        const result = await operation();
        await this.db.execute("COMMIT");
        return result;
      } catch (error) {
        try {
          await this.db.execute("ROLLBACK");
        } catch {
          // Preserve the originating write failure.
        }
        throw error;
      } finally {
        this.txDepth -= 1;
      }
    });
  }

  /**
   * Schema DDL only. Every statement here is `create … if not exists` or an
   * `alter table … add column` guarded by a probe — i.e. provably terminal: once
   * applied to a database it can never need applying again.
   *
   * ⚠️ NOTHING THAT TOUCHES ROWS MAY GO IN THIS METHOD. It is skipped whenever
   * the schema fingerprint is unchanged, so a data statement placed here would
   * silently stop running. Data repairs and backfills belong in
   * runDataHealing() — see plan 268 and the 260 post-mortem.
   */
  private async runSchemaDdl() {
    for (const migration of migrations) {
      for (const statement of splitSqlStatements(migration.sql)) {
        await this.db.execute(statement);
      }
    }
    for (const [table, column, definition] of ADDITIVE_COLUMNS) {
      await this.ensureSqliteColumn(table, column, definition);
    }
    for (const sql of ADDITIVE_INDEXES) {
      await this.db.execute(sql);
    }
    await this.ensureSyncTriggers();
  }

  /**
   * Data repairs, backfills and self-heals. These run on EVERY launch and must
   * never be gated: a row that needs healing can arrive at any time via sync
   * from an older client or an import — not only when the schema changes.
   * Plan 260 tried to gate these and broke the credit-group self-heal.
   *
   * Order matters and is preserved from the original initialize():
   * base_quantity is set before the opening-lot insert reads it.
   */
  private async runDataHealing() {
    await this.db.execute(
      `update portfolio_assets set base_quantity = total_quantity where holding_source = 'manual' and base_quantity is null`,
    );
    // Opening-balance lot model: every manual holding is backed by a cashless
    // "opening" investment record so quantity, blended cost, P/L, XIRR and the
    // net-worth trend all derive from records uniformly. Materialize one for any
    // manual holding that lacks it. Idempotent via the deterministic id
    // (`inv_open_<assetId>`) — re-running, or two synced devices, converge on a
    // single row instead of duplicating the opening lot.
    //
    // Data repair for the opening-lot cash leak: editing an opening lot used to
    // silently create/update a settled ledger row against it. A cashless record
    // must never carry a linked settled ledger leg — tombstone any such leg and
    // clear the record's link so recomputeSqliteAccounts derives balances without
    // the erroneous cash movement. Idempotent: once no cashless record has a
    // linked ledger row, both statements match nothing. Revision/updated_at are
    // bumped so the repair wins last-write-wins and propagates over sync.
    await this.db.execute(
      `update ledger_transactions set deleted_at = $1, updated_at = $1, revision = revision + 1
       where deleted_at is null and linked_investment_record_id in
         (select id from investment_records where cashless = 1)`,
      [nowIso()],
    );
    await this.db.execute(
      `update investment_records set linked_ledger_transaction_id = null, updated_at = $1, revision = revision + 1
       where cashless = 1 and linked_ledger_transaction_id is not null`,
      [nowIso()],
    );
    await this.db.execute(
      `insert into investment_records (id, space_id, revision, created_at, updated_at, deleted_at, asset_id, linked_account_id, date, action, price, quantity, fee, note, is_reviewed, linked_ledger_transaction_id, cashless)
       select 'inv_open_' || a.id, a.space_id, 1, $1, $1, null, a.id, a.account_id,
         coalesce(a.acquisition_date, substr(a.created_at, 1, 10)), 'buy', a.average_cost, coalesce(a.base_quantity, a.total_quantity), 0, '期初部位', 0, null, 1
       from portfolio_assets a
       where a.holding_source = 'manual' and a.deleted_at is null
         and not exists (select 1 from investment_records r where r.id = 'inv_open_' || a.id)`,
      [nowIso()],
    );
    // Decision B (SQLite mirror): collapse any historical manual+transaction
    // split for a ticker into the manual asset. Move the transaction assets'
    // records onto the canonical (MIN id) manual asset, then tombstone the empty
    // transaction assets. Idempotent — once a ticker has no live transaction
    // asset alongside a manual one, both statements match nothing on rerun.
    // Same-ticker only (join is on ticker), so GOOG/GOOGL never merge.
    await this.db.execute(
      `update investment_records set asset_id = (
         select min(m.id) from portfolio_assets m
         join portfolio_assets t on t.ticker = m.ticker
         where m.holding_source = 'manual' and m.deleted_at is null
           and t.id = investment_records.asset_id
           and t.holding_source = 'transactions' and t.deleted_at is null
       ), updated_at = $1, revision = revision + 1
       where exists (
         select 1 from portfolio_assets t
         join portfolio_assets m on m.ticker = t.ticker
         where t.id = investment_records.asset_id
           and t.holding_source = 'transactions' and t.deleted_at is null
           and m.holding_source = 'manual' and m.deleted_at is null
       )`,
      [nowIso()],
    );
    await this.db.execute(
      `update portfolio_assets set deleted_at = $1, updated_at = $1, revision = revision + 1
       where holding_source = 'transactions' and deleted_at is null
         and exists (
           select 1 from portfolio_assets m
           where m.ticker = portfolio_assets.ticker and m.holding_source = 'manual' and m.deleted_at is null
         )`,
      [nowIso()],
    );
    await this.ensureSqliteDefaultBook();
    await this.mergeAndHealBooks();
    await this.backfillUnassignedAccount();
    await this.backfillCreditGroups();
  }

  override async initialize() {
    // DDL is skipped when the schema definition is byte-identical to what this
    // database was last stamped with. The fingerprint is derived from the DDL
    // itself, so it invalidates automatically when the schema changes — there is
    // no constant to forget to bump (plan 268).
    const fingerprint = schemaFingerprint();
    if ((await this.readSchemaFingerprint()) !== fingerprint) {
      await this.runSchemaDdl();
      await this.writeSchemaFingerprint(fingerprint);
    }

    // Never gated. See runDataHealing()'s doc comment.
    await this.runDataHealing();
    await this.ensureDefaultSettings();
    const rows = await this.db.select<Array<{ count: number }>>("select count(*) as count from accounts");
    if ((rows[0]?.count ?? 0) === 0) {
      await this.seedSqlite();
    }
    await this.backfillSyncOutbox();
    await this.recalculateDerivedData();
  }

  /**
   * SQLite has no boolean type: boolean columns come back as integer 0/1. The
   * memory repo (and our domain types) use real JS booleans, so every list/read
   * mapper must hydrate boolean columns through this helper to keep the two
   * repositories in parity (see the dual-repo test harness).
   */
  private toBool(value: unknown): boolean {
    return value === 1 || value === true;
  }

  /**
   * Guarantee a default 帳本 (個人帳) row and assign every book-less account to
   * it. SQLite mirror of `ensureDefaultBookInMemory`. Idempotent: the insert is
   * skipped once a personal book exists, and the update only touches accounts
   * whose book_id is still the empty sentinel.
   */
  private async ensureSqliteDefaultBook(): Promise<string> {
    const existing = await this.db.select<Array<{ id: string }>>(
      `select id from books where kind = 'personal' and deleted_at is null order by created_at, id limit 1`,
    );
    let defaultId = existing[0]?.id;
    if (!defaultId) {
      defaultId = createId("book");
      const timestamp = nowIso();
      await this.db.execute(
        `insert into books (id, space_id, revision, created_at, updated_at, deleted_at, name, kind, include_in_personal_net_worth, include_in_fire_metrics, color)
         values ($1,$2,1,$3,$3,null,$4,'personal',1,1,null)`,
        [defaultId, personalSpace, timestamp, "個人帳"],
      );
    }
    // Backfill orphan accounts. Bump revision so the assignment propagates over
    // sync (a device that synced these accounts pre-books needs the higher
    // revision to accept book_id under last-write-wins).
    await this.db.execute(
      `update accounts set book_id = $1, updated_at = $2, revision = revision + 1 where book_id = '' or book_id is null`,
      [defaultId, nowIso()],
    );
    return defaultId;
  }

  /**
   * Plan 211 — merge untouched system-minted duplicate 個人帳 (decision 2's
   * narrowed domain, `planMintMerge`), then run the kind-aware straggler heal
   * (decision 4). SQLite mirror of `mergeAndHealBooksInMemory`. Called right
   * after `ensureSqliteDefaultBook` at every wired call site (initialize,
   * importSnapshot, applySyncChanges — the last one specifically OUTSIDE
   * `withOutboxSuppressed`, see the call site for why). Never called from
   * createBook/updateBook/deleteBook — a book the user creates or edits is
   * never a merge candidate (planMintMerge's domain already guarantees this
   * too; not calling it from those paths is belt-and-suspenders).
   *
   * Idempotent: once at most 1 untouched mint remains active, planMintMerge
   * returns null and the loop below never runs; healStragglerBooks likewise
   * finds zero stray accounts once every account points at an active book.
   */
  private async mergeAndHealBooks(): Promise<{ mergedCount: number }> {
    const plan = planMintMerge(await this.listBooks());
    let mergedCount = 0;

    if (plan) {
      const timestamp = nowIso();
      for (const loserId of plan.loserIds) {
        // Tombstone the loser. Revision bump is what makes the outbox trigger
        // fire (it only fires `when new.revision <> old.revision`) — this is
        // what propagates the merge to every other device.
        await this.db.execute(
          `update books set deleted_at = $1, updated_at = $1, revision = revision + 1 where id = $2`,
          [timestamp, loserId],
        );
        // Re-point every account/invoice/client this device currently knows
        // about from the loser to the survivor. Rows this device hasn't
        // synced yet (a straggler on another device) are caught by
        // healStragglerBooks below, here or on a later cycle.
        await this.db.execute(
          `update accounts set book_id = $1, updated_at = $2, revision = revision + 1 where book_id = $3`,
          [plan.survivorId, timestamp, loserId],
        );
        await this.db.execute(
          `update invoices set book_id = $1, updated_at = $2, revision = revision + 1 where book_id = $3`,
          [plan.survivorId, timestamp, loserId],
        );
        await this.db.execute(
          `update clients set book_id = $1, updated_at = $2, revision = revision + 1 where book_id = $3`,
          [plan.survivorId, timestamp, loserId],
        );
        mergedCount += 1;
      }
    }

    await this.healStragglerBooks();

    // Only a merge THIS device computed (planMintMerge found ≥2 mints in its
    // own local book set) increments the announce counter — a tombstone this
    // device merely received via sync leaves only 1 active mint, so `plan`
    // above is null and nothing is added here. See consumeBookMergeAnnouncement.
    if (mergedCount > 0) this.bookMergeAnnounceCount += mergedCount;

    return { mergedCount };
  }

  /**
   * Plan 211 decision 4 — kind-aware straggler self-heal. Generalizes the
   * ''/null sentinel backfill in `ensureSqliteDefaultBook` to also catch
   * accounts whose book_id references a book that is dead (tombstoned) or
   * entirely unknown to this device — the risk the 207 spike's §3(c) found:
   * a naive merge alone can silently exclude such an account from
   * FIRE/personal-net-worth (bookScope.ts builds includedBookIds from active
   * books only).
   *
   * Dead COMPANY book → resurrect (deletedAt = null, revision bumped). This
   * can never move a KPI — the account's scoping returns to exactly what the
   * user set — and a company book can never be an untouched mint (kind
   * mismatch), so resurrecting one can never feed back into the merge above.
   * Dead PERSONAL book, or an id this device has never seen at all → re-home
   * to the current default (we cannot know an unknown id's kind; this also
   * matches the existing ''-sentinel behavior).
   */
  private async healStragglerBooks(): Promise<void> {
    const strays = await this.db.select<Array<{ id: string; bookId: string }>>(
      `select id, book_id as bookId from accounts
       where book_id <> '' and book_id is not null
         and book_id not in (select id from books where deleted_at is null)`,
    );
    if (strays.length === 0) return;

    const timestamp = nowIso();
    const distinctDeadIds = [...new Set(strays.map((row) => row.bookId))];
    const deadBookKind = new Map<string, string | undefined>();
    for (const deadId of distinctDeadIds) {
      const rows = await this.db.select<Array<{ kind: string }>>(
        `select kind from books where id = $1`, [deadId],
      );
      deadBookKind.set(deadId, rows[0]?.kind);
    }

    // Resurrect every dead COMPANY book referenced by a straggler, once each.
    for (const deadId of distinctDeadIds) {
      if (deadBookKind.get(deadId) === "company") {
        await this.db.execute(
          `update books set deleted_at = null, revision = revision + 1, updated_at = $1 where id = $2`,
          [timestamp, deadId],
        );
      }
    }

    // Everything else (dead personal book, or an id unknown to this device) re-homes.
    const toRehome = strays.filter((row) => deadBookKind.get(row.bookId) !== "company");
    if (toRehome.length > 0) {
      const defaultId = await this.ensureSqliteDefaultBook();
      for (const stray of toRehome) {
        await this.db.execute(
          `update accounts set book_id = $1, updated_at = $2, revision = revision + 1 where id = $3`,
          [defaultId, timestamp, stray.id],
        );
      }
    }
  }

  override async listBooks() {
    return (await this.db.select<Book[]>(`select
      id, space_id as spaceId, revision, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt,
      name, kind, include_in_personal_net_worth as includeInPersonalNetWorth, include_in_fire_metrics as includeInFireMetrics, color
      from books where deleted_at is null order by created_at, id`)).map((row) => ({
        ...row,
        includeInPersonalNetWorth: this.toBool(row.includeInPersonalNetWorth),
        includeInFireMetrics: this.toBool(row.includeInFireMetrics),
        color: row.color ?? null,
      }));
  }

  override async createBook(input: BookDraft) {
    const timestamp = nowIso();
    await this.db.execute(
      `insert into books (id, space_id, revision, created_at, updated_at, deleted_at, name, kind, include_in_personal_net_worth, include_in_fire_metrics, color)
       values ($1,$2,1,$3,$3,null,$4,$5,$6,$7,$8)`,
      [createId("book"), personalSpace, timestamp, input.name, input.kind, Number(input.includeInPersonalNetWorth), Number(input.includeInFireMetrics), input.color ?? null],
    );
  }

  override async updateBook(id: string, input: BookDraft) {
    await this.db.execute(
      `update books set revision = revision + 1, updated_at = $1, name = $2, kind = $3, include_in_personal_net_worth = $4, include_in_fire_metrics = $5, color = $6 where id = $7`,
      [nowIso(), input.name, input.kind, Number(input.includeInPersonalNetWorth), Number(input.includeInFireMetrics), input.color ?? null, id],
    );
  }

  override async deleteBook(id: string) {
    const books = await this.db.select<Array<{ kind: string }>>(
      `select kind from books where id = $1 and deleted_at is null`, [id],
    );
    const book = books[0];
    if (!book) return;
    const accounts = await this.db.select<Array<{ count: number }>>(
      `select count(*) as count from accounts where book_id = $1 and deleted_at is null`, [id],
    );
    const accountCount = accounts[0]?.count ?? 0;
    if (accountCount > 0) throw new Error(`此帳本還有 ${accountCount} 個帳戶，請先將它們移到其他帳本。`);
    const invoices = await this.db.select<Array<{ count: number }>>(
      `select count(*) as count from invoices where book_id = $1 and deleted_at is null`, [id],
    );
    const clients = await this.db.select<Array<{ count: number }>>(
      `select count(*) as count from clients where book_id = $1 and deleted_at is null`, [id],
    );
    if ((invoices[0]?.count ?? 0) > 0 || (clients[0]?.count ?? 0) > 0) throw new Error("此帳本還有發票或客戶資料，不能刪除。");
    if (book.kind === "personal") {
      const otherPersonalBooks = await this.db.select<Array<{ count: number }>>(
        `select count(*) as count from books where id <> $1 and kind = 'personal' and deleted_at is null`, [id],
      );
      if ((otherPersonalBooks[0]?.count ?? 0) === 0) throw new Error("這是最後一個個人帳本，不能刪除。");
    }
    await this.db.execute(`update books set deleted_at = $1, updated_at = $1, revision = revision + 1 where id = $2`, [nowIso(), id]);
  }

  override async listInvoices() {
    return (await this.db.select<Invoice[]>(`select
      id, space_id as spaceId, revision, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt,
      book_id as bookId, client_id as clientId, invoice_number as invoiceNumber, issue_date as issueDate, due_date as dueDate,
      amount, tax_exclusive_amount as taxExclusiveAmount, tax_amount as taxAmount, settled_at as settledAt, linked_ledger_transaction_id as linkedLedgerTransactionId
      from invoices where deleted_at is null order by issue_date, id`)).map((row) => ({
        ...row,
        clientId: row.clientId ?? null,
        dueDate: row.dueDate ?? null,
        settledAt: row.settledAt ?? null,
        linkedLedgerTransactionId: row.linkedLedgerTransactionId ?? null,
      }));
  }

  override async createInvoice(input: InvoiceDraft) {
    const timestamp = nowIso();
    await this.db.execute(
      `insert into invoices (id, space_id, revision, created_at, updated_at, deleted_at, book_id, client_id, invoice_number, issue_date, due_date, amount, tax_exclusive_amount, tax_amount, settled_at, linked_ledger_transaction_id)
       values ($1,$2,1,$3,$3,null,$4,$5,$6,$7,$8,$9,$10,$11,null,$12)`,
      [
        createId("invoice"),
        personalSpace,
        timestamp,
        input.bookId,
        input.clientId ?? null,
        input.invoiceNumber,
        input.issueDate,
        input.dueDate ?? null,
        input.amount,
        input.taxExclusiveAmount,
        input.taxAmount,
        input.linkedLedgerTransactionId ?? null,
      ],
    );
  }

  override async updateInvoice(id: string, input: InvoiceDraft) {
    await this.db.execute(
      `update invoices set revision = revision + 1, updated_at = $1, book_id = $2, client_id = $3, invoice_number = $4, issue_date = $5, due_date = $6, amount = $7, tax_exclusive_amount = $8, tax_amount = $9, linked_ledger_transaction_id = $10 where id = $11`,
      [nowIso(), input.bookId, input.clientId ?? null, input.invoiceNumber, input.issueDate, input.dueDate ?? null, input.amount, input.taxExclusiveAmount, input.taxAmount, input.linkedLedgerTransactionId ?? null, id],
    );
  }

  override async listClients() {
    return (await this.db.select<Client[]>(`select
      id, space_id as spaceId, revision, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt,
      book_id as bookId, name, tax_id as taxId, default_payment_terms as defaultPaymentTerms
      from clients where deleted_at is null order by name, id`)).map((row) => ({
        ...row,
        taxId: row.taxId ?? "",
        defaultPaymentTerms: row.defaultPaymentTerms ?? null,
      }));
  }

  override async createClient(input: ClientDraft) {
    const timestamp = nowIso();
    await this.db.execute(
      `insert into clients (id, space_id, revision, created_at, updated_at, deleted_at, book_id, name, tax_id, default_payment_terms)
       values ($1,$2,1,$3,$3,null,$4,$5,$6,$7)`,
      [createId("client"), personalSpace, timestamp, input.bookId, input.name, input.taxId ?? "", input.defaultPaymentTerms ?? null],
    );
  }

  override async updateClient(id: string, input: ClientDraft) {
    await this.db.execute(
      `update clients set revision = revision + 1, updated_at = $1, book_id = $2, name = $3, tax_id = $4, default_payment_terms = $5 where id = $6`,
      [nowIso(), input.bookId, input.name, input.taxId ?? "", input.defaultPaymentTerms ?? null, id],
    );
  }

  override async listCreditGroups() {
    return (await this.db.select<CreditGroup[]>(`select
      id, space_id as spaceId, revision, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt,
      name, currency, credit_limit as creditLimit, statement_day as statementDay, payment_due_day as paymentDueDay
      from credit_groups where deleted_at is null order by name, id`)).map((row) => ({
        ...row,
        name: row.name ?? "",
        creditLimit: row.creditLimit ?? null,
        statementDay: row.statementDay ?? null,
        paymentDueDay: row.paymentDueDay ?? null,
      }));
  }

  override async createCreditGroup(input: CreditGroupDraft) {
    const timestamp = nowIso();
    await this.db.execute(
      `insert into credit_groups (id, space_id, revision, created_at, updated_at, deleted_at, name, currency, credit_limit, statement_day, payment_due_day)
       values ($1,$2,1,$3,$3,null,$4,$5,$6,$7,$8)`,
      [createId("creditGroup"), personalSpace, timestamp, input.name, input.currency, input.creditLimit ?? null, input.statementDay ?? null, input.paymentDueDay ?? null],
    );
  }

  override async updateCreditGroup(id: string, input: CreditGroupDraft) {
    await this.db.execute(
      `update credit_groups set revision = revision + 1, updated_at = $1, name = $2, currency = $3, credit_limit = $4, statement_day = $5, payment_due_day = $6 where id = $7`,
      [nowIso(), input.name, input.currency, input.creditLimit ?? null, input.statementDay ?? null, input.paymentDueDay ?? null, id],
    );
  }

  override async deleteCreditGroup(id: string) {
    const timestamp = nowIso();
    await this.db.execute(
      `update credit_groups set revision = revision + 1, updated_at = $1, deleted_at = $1 where id = $2`,
      [timestamp, id],
    );
  }

  override async stampInvoiceSettled(linkedLedgerTransactionId: string, settledAt: string | null) {
    await this.db.execute(
      `update invoices set revision = revision + 1, updated_at = $1, settled_at = $2 where linked_ledger_transaction_id = $3 and deleted_at is null`,
      [nowIso(), settledAt, linkedLedgerTransactionId],
    );
  }

  override async findInvoiceByLedgerId(ledgerId: string): Promise<Invoice | null> {
    const rows = await this.db.select<Invoice[]>(
      `select
       id, space_id as spaceId, revision, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt,
       book_id as bookId, client_id as clientId, invoice_number as invoiceNumber, issue_date as issueDate, due_date as dueDate,
       amount, tax_exclusive_amount as taxExclusiveAmount, tax_amount as taxAmount, settled_at as settledAt, linked_ledger_transaction_id as linkedLedgerTransactionId
       from invoices where linked_ledger_transaction_id = $1 and deleted_at is null limit 1`,
      [ledgerId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      ...row,
      clientId: row.clientId ?? null,
      dueDate: row.dueDate ?? null,
      settledAt: row.settledAt ?? null,
      linkedLedgerTransactionId: row.linkedLedgerTransactionId ?? null,
    };
  }

  override async listAccounts() {
    const rows = (await this.db.select<Account[]>(`select
      id, space_id as spaceId, revision, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt,
      name, currency, opening_balance as openingBalance, balance, type, credit_limit as creditLimit, credit_limit_group as creditLimitGroup, credit_group_id as creditGroupId, is_shared_to_household as isSharedToHousehold,
      loan_start_date as loanStartDate, annual_interest_rate as annualInterestRate, loan_term as loanTerm, icon_name as iconName, color, bank_brand_domain as bankBrandDomain, statement_day as statementDay, payment_due_day as paymentDueDay,
      credit_payment_paid_until as creditPaymentPaidUntil, custom_group as customGroup, book_id as bookId
      from accounts where deleted_at is null order by name`)).map((row) => ({
        ...row,
        creditLimit: row.creditLimit ?? null,
        creditLimitGroup: row.creditLimitGroup ?? "",
        creditGroupId: row.creditGroupId ?? null,
        isSharedToHousehold: Boolean(row.isSharedToHousehold),
        loanStartDate: row.loanStartDate ?? null,
        annualInterestRate: row.annualInterestRate ?? null,
        loanTerm: row.loanTerm ?? null,
        iconName: row.iconName ?? null,
        color: row.color ?? null,
        bankBrandDomain: row.bankBrandDomain ?? null,
        statementDay: row.statementDay ?? null,
        paymentDueDay: row.paymentDueDay ?? null,
        creditPaymentPaidUntil: (row as any).creditPaymentPaidUntil ?? null,
        customGroup: row.customGroup ?? "",
        bookId: row.bookId ?? "",
      }));
    const groups = await this.listCreditGroups();
    return applyCreditGroupDerivation(rows, groups);
  }

  override async createAccount(input: AccountDraft) {
    const timestamp = nowIso();
    const bookId = input.bookId || (await this.ensureSqliteDefaultBook());
    await this.db.execute(
      `insert into accounts (id, space_id, revision, created_at, updated_at, deleted_at, name, currency, opening_balance, balance, type, credit_limit, credit_limit_group, credit_group_id, is_shared_to_household, loan_start_date, annual_interest_rate, loan_term, icon_name, color, bank_brand_domain, statement_day, payment_due_day, credit_payment_paid_until, custom_group, book_id)
       values ($1,$2,1,$3,$3,null,$4,$5,$6,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
      [createId("acct"), personalSpace, timestamp, input.name, input.currency, input.openingBalance, input.type, input.type === "credit" ? input.creditLimit : null, input.type === "credit" ? input.creditLimitGroup : "", input.creditGroupId ?? null, Number(input.isSharedToHousehold), input.type === "loan" ? (input.loanStartDate ?? null) : null, input.type === "loan" ? (input.annualInterestRate ?? null) : null, input.type === "loan" ? (input.loanTerm ?? null) : null, input.iconName ?? null, input.color ?? null, input.bankBrandDomain ?? null, input.type === "credit" ? (input.statementDay ?? null) : null, input.type === "credit" ? (input.paymentDueDay ?? null) : null, null, input.customGroup?.trim() ?? "", bookId],
    );
  }

  override async updateAccount(id: string, input: AccountDraft) {
    // Leave-group snapshot (plan 254/255 Decision 2): if the caller explicitly
    // clears creditGroupId (was set, now null), freeze the group's current
    // statementDay/paymentDueDay/creditLimit onto the account's own columns
    // before the link is cleared, mirroring the browser repo's updateAccount.
    let leaveGroupOverrides: { statementDay: number | null; paymentDueDay: number | null; creditLimit: number | null } | null = null;
    if (input.creditGroupId === null) {
      const priorRows = await this.db.select<Array<{ creditGroupId: string | null }>>(
        `select credit_group_id as creditGroupId from accounts where id = $1`, [id],
      );
      const priorCreditGroupId = priorRows[0]?.creditGroupId ?? null;
      if (priorCreditGroupId) {
        const groupRows = await this.db.select<Array<{ statementDay: number | null; paymentDueDay: number | null; creditLimit: number | null }>>(
          `select statement_day as statementDay, payment_due_day as paymentDueDay, credit_limit as creditLimit from credit_groups where id = $1 and deleted_at is null`,
          [priorCreditGroupId],
        );
        if (groupRows[0]) leaveGroupOverrides = groupRows[0];
      }
    }
    // Only overwrite book_id when the caller supplies one, otherwise preserve
    // the account's current book (coalesce keeps the existing value).
    await this.db.execute(
      `update accounts set revision = revision + 1, updated_at = $1, name = $2, currency = $3, opening_balance = $4, type = $5, credit_limit = $6, credit_limit_group = $7, is_shared_to_household = $8, loan_start_date = $9, annual_interest_rate = $10, loan_term = $11, icon_name = $12, color = $13, bank_brand_domain = $14, statement_day = $15, payment_due_day = $16, credit_payment_paid_until = $17, custom_group = $18, book_id = coalesce($19, book_id) where id = $20`,
      [
        nowIso(), input.name, input.currency, input.openingBalance, input.type,
        input.type === "credit" ? (leaveGroupOverrides?.creditLimit ?? input.creditLimit) : null,
        input.type === "credit" ? input.creditLimitGroup : "",
        Number(input.isSharedToHousehold),
        input.type === "loan" ? (input.loanStartDate ?? null) : null,
        input.type === "loan" ? (input.annualInterestRate ?? null) : null,
        input.type === "loan" ? (input.loanTerm ?? null) : null,
        input.iconName ?? null, input.color ?? null, input.bankBrandDomain ?? null,
        input.type === "credit" ? (leaveGroupOverrides?.statementDay ?? input.statementDay ?? null) : null,
        input.type === "credit" ? (leaveGroupOverrides?.paymentDueDay ?? input.paymentDueDay ?? null) : null,
        input.creditPaymentPaidUntil ?? null, input.customGroup?.trim() ?? "", input.bookId ?? null, id,
      ],
    );
    // credit_group_id is written in a separate, narrower statement: `undefined`
    // (caller didn't touch it) must preserve the existing link, while `null`
    // (explicit leave-group) or a string (join/switch group) must overwrite it
    // — the shared UPDATE above can't express "skip this column" conditionally.
    if (input.creditGroupId !== undefined) {
      await this.db.execute(`update accounts set credit_group_id = $1 where id = $2`, [input.creditGroupId, id]);
    }
    await this.recomputeSqliteAccounts();
  }

  override async deleteAccount(id: string) {
    const linkedLedger = await this.db.select<Array<{ count: number }>>(
      `select count(*) as count from ledger_transactions where (account_id = $1 or counter_account_id = $1) and deleted_at is null`,
      [id],
    );
    const linkedInvestments = await this.db.select<Array<{ count: number }>>(
      `select count(*) as count from investment_records where linked_account_id = $1 and deleted_at is null`,
      [id],
    );
    if ((linkedLedger[0]?.count ?? 0) > 0 || (linkedInvestments[0]?.count ?? 0) > 0) throw new Error("已有交易的帳戶不能刪除。");
    await this.db.execute(`update accounts set deleted_at = $1, updated_at = $1, revision = revision + 1 where id = $2`, [nowIso(), id]);
  }

  override async listLedgerTransactions() {
    return (await this.db.select<LedgerTransaction[]>(`select
      id, space_id as spaceId, revision, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt,
      account_id as accountId, counter_account_id as counterAccountId, date, name, amount, currency, original_amount as originalAmount, original_currency as originalCurrency,
      category, subcategory, merchant, entry_type as entryType, settlement_status as settlementStatus, note,
      linked_investment_record_id as linkedInvestmentRecordId, group_id as groupId, leg_kind as legKind,
      installment_group_id as installmentGroupId, installment_index as installmentIndex, installment_total as installmentTotal,
      refund_of_ledger_id as refundOfLedgerId,
      is_reviewed as isReviewed, receipt_attachment_id as receiptAttachmentId, recurring_rule_id as recurringRuleId,
      recurring_occurrence_key as recurringOccurrenceKey, post_date as postDate
      from ledger_transactions where deleted_at is null order by date desc, created_at desc`)).map((row) => ({
        ...row,
        isReviewed: this.toBool(row.isReviewed),
      }));
  }

  override async createLedgerTransaction(input: LedgerDraft) {
    assertLedgerInvariants(input, await this.listAccounts());
    await this.withTransaction(async () => {
      if (input.feeAmount && input.feeAmount > 0) {
        const groupId = input.groupId || createId("group");
        await this.insertLedgerRow(createLedgerRow({ ...input, groupId }));
        await this.insertLedgerRow(createLedgerRow({
          accountId: input.accountId,
          date: input.date,
          name: "手續費",
          amount: -Math.abs(input.feeAmount),
          currency: input.currency,
          category: "手續費",
          // Income fees are bank/remittance charges, not FX surcharges.
          subcategory: input.entryType === "income" ? "收入手續費" : "海外交易手續費",
          merchant: input.merchant,
          entryType: "expense",
          settlementStatus: "settled",
          note: "由系統自動建立的手續費紀錄",
          groupId,
        }));
      } else {
        await this.insertLedgerRow(createLedgerRow(input));
      }
      await this.recomputeSqliteAccounts();
    });
  }

  override async updateLedgerTransaction(id: string, input: LedgerDraft) {
    assertLedgerInvariants(input, await this.listAccounts(), { allowTransfer: input.entryType === "transfer" });
    await this.withTransaction(async () => {
      const existingRows = await this.db.select<Array<{ groupId: string | null }>>(
        `select group_id as groupId from ledger_transactions where id = $1`,
        [id],
      );
      const existingRow = existingRows[0] as { groupId: string | null } | undefined;
      // Fee-leg reconciliation (plan 226) only applies to expense/income rows —
      // transfers keep their separate createTransfer fee path. See the
      // sibling logic (and its comments) in BrowserFinanceRepository above —
      // this override mirrors it 1:1 over SQL instead of the in-memory array.
      const feeEligible = Boolean(existingRow) && (input.entryType === "expense" || input.entryType === "income");
      let existingLegId: string | undefined;
      if (feeEligible && existingRow!.groupId) {
        const legs = await this.db.select<Array<{ id: string }>>(
          `select id from ledger_transactions where group_id = $1 and category = $2 and leg_kind is null and deleted_at is null`,
          [existingRow!.groupId, "手續費"],
        );
        existingLegId = legs[0]?.id;
      }
      const plan: FeeLegPlan = feeEligible ? planFeeLegUpdate(existingLegId, input.feeAmount) : { kind: "none" };
      let groupId = feeEligible ? existingRow!.groupId : (input.groupId ?? null);
      if (plan.kind === "create" && !groupId) groupId = createId("group");

      await this.db.execute(
        `update ledger_transactions set revision = revision + 1, updated_at = $1, account_id = $2, date = $3, name = $4, amount = $5, currency = $6, original_amount = $7, original_currency = $8, category = $9, subcategory = $10, merchant = $11, entry_type = $12, settlement_status = $13, note = $14, group_id = $15, counter_account_id = $17, post_date = $18 where id = $16`,
        [nowIso(), input.accountId, input.date, input.name, input.amount, input.currency, input.originalAmount ?? null, input.originalCurrency ?? null, input.category, input.subcategory, input.merchant, input.entryType, input.settlementStatus, input.note, groupId, id, input.counterAccountId ?? null, input.postDate ?? null],
      );

      if (plan.kind === "create") {
        await this.insertLedgerRow(createLedgerRow(feeLegDraft(input, groupId!)));
      } else if (plan.kind === "update") {
        await this.db.execute(
          `update ledger_transactions set revision = revision + 1, updated_at = $1, amount = $2, date = $3, merchant = $4, account_id = $5, currency = $6 where id = $7`,
          [nowIso(), -Math.abs(input.feeAmount!), input.date, input.merchant, input.accountId, input.currency, plan.legId],
        );
      } else if (plan.kind === "tombstone") {
        await this.db.execute(
          `update ledger_transactions set deleted_at = $1, updated_at = $1, revision = revision + 1 where id = $2`,
          [nowIso(), plan.legId],
        );
      }

      await this.recomputeSqliteAccounts();
    });
  }

  override async applyRecurringScopeEdit(id: string, scope: RecurringEditScope, input: LedgerDraft) {
    // Wrap the inherited series edit in one transaction so a mid-loop failure on
    // scope === "all" rolls back every sibling update instead of half-applying it.
    // withTransaction is re-entrant (txDepth guard), so the inner update/recompute
    // writes run inline within this BEGIN…COMMIT rather than issuing their own.
    await this.withTransaction(() => super.applyRecurringScopeEdit(id, scope, input));
  }

  override async setLedgerReviewed(id: string, reviewed: boolean) {
    await this.db.execute(
      `update ledger_transactions set is_reviewed = $1, updated_at = $2, revision = revision + 1 where id = $3`,
      [Number(reviewed), nowIso(), id],
    );
  }

  override async setLedgerPostDate(id: string, postDate: string | null) {
    await this.db.execute(
      `update ledger_transactions set post_date = $1, updated_at = $2, revision = revision + 1 where id = $3`,
      [postDate, nowIso(), id],
    );
  }

  override async deleteLedgerTransaction(id: string) {
    const rows = await this.db.select<Array<{ groupId: string | null }>>(`select group_id as groupId from ledger_transactions where id = $1`, [id]);
    const groupId = rows[0]?.groupId;
    if (groupId) {
      await this.db.execute(`update ledger_transactions set deleted_at = $1, updated_at = $1, revision = revision + 1 where group_id = $2`, [nowIso(), groupId]);
    } else {
      await this.db.execute(`update ledger_transactions set deleted_at = $1, updated_at = $1, revision = revision + 1 where id = $2`, [nowIso(), id]);
    }
    await this.recomputeSqliteAccounts();
  }

  override async createInstallmentPlan(input: LedgerDraft, periods: number) {
    assertLedgerInvariants(input, await this.listAccounts());
    const schedule = buildInstallmentSchedule({ totalAmount: input.amount, periods, startDate: input.date });
    const installmentGroupId = createId("inst");
    await this.withTransaction(async () => {
      for (const period of schedule) {
        await this.insertLedgerRow(createLedgerRow({
          ...input,
          date: period.date,
          amount: period.amount,
          feeAmount: 0,
          groupId: null,
          installmentGroupId,
          installmentIndex: period.index,
          installmentTotal: periods,
        }));
      }
      await this.recomputeSqliteAccounts();
    });
  }

  override async deleteInstallmentPlan(installmentGroupId: string, opts?: { fromIndex?: number }) {
    const fromIndex = opts?.fromIndex;
    if (fromIndex !== undefined) {
      await this.db.execute(
        `update ledger_transactions set deleted_at = $1, updated_at = $1, revision = revision + 1
         where installment_group_id = $2 and deleted_at is null and installment_index >= $3`,
        [nowIso(), installmentGroupId, fromIndex],
      );
    } else {
      await this.db.execute(
        `update ledger_transactions set deleted_at = $1, updated_at = $1, revision = revision + 1
         where installment_group_id = $2 and deleted_at is null`,
        [nowIso(), installmentGroupId],
      );
    }
    await this.recomputeSqliteAccounts();
  }

  override async createSplit(shared: SplitSharedFields, legs: SplitLegInput[], shares: SplitShareInput[] = []) {
    const drafts = buildSplitLegs(shared, legs, createId("group"), shares);
    const accounts = await this.listAccounts();
    for (const draft of drafts) {
      if ("counterAccountId" in draft && !accounts.some((a) => a.id === draft.counterAccountId && a.deletedAt === null)) {
        throw new Error("找不到應收帳戶。");
      }
      assertLedgerInvariants(draft, accounts);
    }
    await this.withTransaction(async () => {
      for (const draft of drafts) await this.insertLedgerRow(createLedgerRow(draft));
      await this.recomputeSqliteAccounts();
    });
  }

  override async updateSplit(groupId: string, shared: SplitSharedFields, legs: SplitLegInput[], shares: SplitShareInput[] = []) {
    // Tombstone-all + recreate with the SAME groupId, atomically (a mid-way
    // failure rolls back both the tombstones and the new legs). Revision bumps
    // on the tombstoned rows keep sync LWW propagating the deletes.
    const drafts = buildSplitLegs(shared, legs, groupId, shares);
    const accounts = await this.listAccounts();
    for (const draft of drafts) {
      if ("counterAccountId" in draft && !accounts.some((a) => a.id === draft.counterAccountId && a.deletedAt === null)) {
        throw new Error("找不到應收帳戶。");
      }
      assertLedgerInvariants(draft, accounts);
    }
    await this.withTransaction(async () => {
      const existing = await this.db.select<Array<{ count: number }>>(
        `select count(*) as count from ledger_transactions where group_id = $1 and deleted_at is null`,
        [groupId],
      );
      if ((existing[0]?.count ?? 0) === 0) throw new Error("找不到拆分群組。");
      await this.db.execute(
        `update ledger_transactions set deleted_at = $1, updated_at = $1, revision = revision + 1 where group_id = $2 and deleted_at is null`,
        [nowIso(), groupId],
      );
      for (const draft of drafts) await this.insertLedgerRow(createLedgerRow(draft));
      await this.recomputeSqliteAccounts();
    });
  }

  override async createTransfer(input: TransferDraft) {
    assertTransferInvariants(input, await this.listAccounts());
    await this.withTransaction(async () => {
      const groupId = createId("group");
      const category = input.sourceCurrency === input.destinationCurrency ? "轉帳" : "外幣兌換";
      await this.insertLedgerRow(createLedgerRow({
      accountId: input.sourceAccountId,
      date: input.date,
      name: input.sourceCurrency === input.destinationCurrency ? "轉出" : "外幣換出",
      amount: -Math.abs(input.sourceAmount),
      currency: input.sourceCurrency,
      category,
      subcategory: input.sourceCurrency === input.destinationCurrency ? "帳戶轉移" : "外幣兌換",
      merchant: "",
      entryType: "transfer",
      settlementStatus: "settled",
      note: input.note,
      groupId,
      }));
      await this.insertLedgerRow(createLedgerRow({
      accountId: input.destinationAccountId,
      date: input.date,
      name: input.sourceCurrency === input.destinationCurrency ? "轉入" : "外幣換入",
      amount: input.sourceCurrency === input.destinationCurrency ? Math.abs(input.sourceAmount) : Math.abs(input.destinationAmount ?? 0),
      currency: input.destinationCurrency,
      category,
      subcategory: input.sourceCurrency === input.destinationCurrency ? "帳戶轉移" : "外幣兌換",
      merchant: "",
      entryType: "transfer",
      settlementStatus: "settled",
      note: input.note,
      groupId,
      }));
      if (input.feeAmount && input.feeAmount > 0) {
        await this.insertLedgerRow(createLedgerRow({
        accountId: input.sourceAccountId,
        date: input.date,
        name: "手續費",
        amount: -Math.abs(input.feeAmount),
        currency: input.sourceCurrency,
        category: "手續費",
        subcategory: "轉帳手續費",
        merchant: "",
        entryType: "expense",
        settlementStatus: "settled",
        note: "由系統自動建立的轉帳手續費紀錄",
        groupId,
        }));
      }
      await this.recomputeSqliteAccounts();
    });
  }

  override async updateTransfer(groupId: string, input: TransferDraft) {
    assertTransferInvariants(input, await this.listAccounts());
    await this.withTransaction(async () => {
      const rows = await this.db.select<Array<{ id: string; entryType: string; amount: number; category: string }>>(
        `select id, entry_type as entryType, amount, category from ledger_transactions where group_id = $1 and deleted_at is null`,
        [groupId],
      );
      const transferLegs = rows.filter((row) => row.entryType === "transfer");
      const sourceLegs = transferLegs.filter((row) => row.amount < 0);
      const destLegs = transferLegs.filter((row) => row.amount >= 0);
      if (sourceLegs.length !== 1 || destLegs.length !== 1) throw new Error("找不到轉帳交易。");
      const sourceLeg = sourceLegs[0];
      const destLeg = destLegs[0];
      const feeLeg = rows.find((row) => row.category === "手續費");

      const sameCurrency = input.sourceCurrency === input.destinationCurrency;
      const destAmount = sameCurrency
        ? Math.abs(input.sourceAmount)
        : Math.abs(input.destinationAmount ?? 0);
      const transferName = sameCurrency ? { source: "轉出", dest: "轉入" } : { source: "外幣換出", dest: "外幣換入" };
      const transferCategory = sameCurrency ? "轉帳" : "外幣兌換";
      const transferSubcategory = sameCurrency ? "帳戶轉移" : "外幣兌換";
      const timestamp = nowIso();

      await this.db.execute(
        `update ledger_transactions set revision = revision + 1, updated_at = $1, account_id = $2, date = $3, name = $4, amount = $5, currency = $6, category = $7, subcategory = $8, note = $9 where id = $10`,
        [timestamp, input.sourceAccountId, input.date, transferName.source, -Math.abs(input.sourceAmount), input.sourceCurrency, transferCategory, transferSubcategory, input.note, sourceLeg.id],
      );
      await this.db.execute(
        `update ledger_transactions set revision = revision + 1, updated_at = $1, account_id = $2, date = $3, name = $4, amount = $5, currency = $6, category = $7, subcategory = $8, note = $9 where id = $10`,
        [timestamp, input.destinationAccountId, input.date, transferName.dest, destAmount, input.destinationCurrency, transferCategory, transferSubcategory, input.note, destLeg.id],
      );

      const wantsFee = Boolean(input.feeAmount && input.feeAmount > 0);
      if (feeLeg && wantsFee) {
        await this.db.execute(
          `update ledger_transactions set revision = revision + 1, updated_at = $1, account_id = $2, date = $3, amount = $4, currency = $5 where id = $6`,
          [timestamp, input.sourceAccountId, input.date, -Math.abs(input.feeAmount ?? 0), input.sourceCurrency, feeLeg.id],
        );
      } else if (feeLeg && !wantsFee) {
        await this.db.execute(
          `update ledger_transactions set deleted_at = $1, updated_at = $1, revision = revision + 1 where id = $2`,
          [timestamp, feeLeg.id],
        );
      } else if (!feeLeg && wantsFee) {
        await this.insertLedgerRow(createLedgerRow({
          accountId: input.sourceAccountId,
          date: input.date,
          name: "手續費",
          amount: -Math.abs(input.feeAmount ?? 0),
          currency: input.sourceCurrency,
          category: "手續費",
          subcategory: "轉帳手續費",
          merchant: "",
          entryType: "expense",
          settlementStatus: "settled",
          note: "由系統自動建立的轉帳手續費紀錄",
          groupId,
        }));
      }

      await this.recomputeSqliteAccounts();
    });
  }

  override async importLedgerTransactions(rows: LedgerDraft[]) {
    const accounts = await this.listAccounts();
    rows.forEach((row) => assertLedgerInvariants(row, accounts));
    await this.withTransaction(async () => {
      for (const row of rows) await this.insertLedgerRow(createLedgerRow(row));
      await this.recomputeSqliteAccounts();
    });
  }

  override async listPortfolioAssets() {
    const rows = await this.db.select<Array<PortfolioAsset & { classificationLocked?: number | boolean | null }>>(`select
      id, space_id as spaceId, revision, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt,
      ticker, name, name_zh as nameZh, name_en as nameEn, currency, total_quantity as totalQuantity, average_cost as averageCost, holding_source as holdingSource, acquisition_date as acquisitionDate,
      asset_type as assetType, sector, industry, sector_canonical as sectorCanonical, account_id as accountId, base_quantity as baseQuantity, classification_locked as classificationLocked
      from portfolio_assets where deleted_at is null order by ticker`);
    return rows.map((row) => ({
      ...row,
      nameZh: row.nameZh ?? null,
      nameEn: row.nameEn ?? null,
      assetType: row.assetType ?? null,
      sector: row.sector ?? null,
      industry: row.industry ?? null,
      // Derive-on-read for pre-070 rows whose column is null (no destructive migration).
      sectorCanonical: row.sectorCanonical ?? toCanonicalSector({ sector: row.sector, industry: row.industry }),
      accountId: row.accountId ?? null,
      baseQuantity: row.baseQuantity ?? null,
      classificationLocked: Boolean(row.classificationLocked),
    }));
  }

  override async createManualHolding(input: PortfolioAssetDraft) {
    await this.withTransaction(async () => {
      const asset = createManualHoldingRow(input);
      await this.insertAssetRow(asset);
      await this.insertInvestmentRow(buildOpeningRecord(asset, input));
      await this.recomputeSqliteAssets();
    });
  }

  override async updateManualHolding(id: string, input: PortfolioAssetDraft) {
    const classification = assetClassificationFields(input);
    await this.withTransaction(async () => {
      await this.db.execute(
        `update portfolio_assets set revision = revision + 1, updated_at = $1, ticker = $2, name = $3, currency = $4, acquisition_date = $5, account_id = $6, asset_type = $7, sector = $8, industry = $9, sector_canonical = $10, base_quantity = $11 where id = $12 and holding_source = 'manual'`,
        [nowIso(), input.ticker.trim().toUpperCase(), input.name.trim() || input.ticker.trim().toUpperCase(), input.currency.trim().toUpperCase(), input.acquisitionDate || null, input.accountId || null, classification.assetType, classification.sector, classification.industry, classification.sectorCanonical, Math.max(0, Number(input.totalQuantity) || 0), id],
      );
      // Upsert the opening-balance record (single source of truth for qty/cost).
      const rebuilt = buildOpeningRecord({ id, accountId: input.accountId || null }, input);
      const existing = await this.db.select<Array<{ id: string }>>(`select id from investment_records where id = $1`, [rebuilt.id]);
      if (existing[0]) {
        await this.db.execute(
          `update investment_records set revision = revision + 1, updated_at = $1, deleted_at = null, linked_account_id = $2, date = $3, price = $4, quantity = $5 where id = $6`,
          [nowIso(), rebuilt.linkedAccountId, rebuilt.date, rebuilt.price, rebuilt.quantity, rebuilt.id],
        );
      } else {
        await this.insertInvestmentRow(rebuilt);
      }
      await this.recomputeSqliteAssets();
    });
  }

  override async updateAssetClassification(id: string, input: AssetClassificationInput) {
    const classification = assetClassificationFields(input);
    // Manual edits set classification_locked = 1; auto-backfill (no signal)
    // leaves the column untouched so it preserves any existing user lock.
    await this.db.execute(
      `update portfolio_assets
       set revision = revision + 1, updated_at = $1, asset_type = $2, sector = $3, industry = $4,
           sector_canonical = $5,
           name_zh = coalesce($6, name_zh), name_en = coalesce($7, name_en),
           classification_locked = case when $8 = 1 then 1 else classification_locked end
       where id = $9 and deleted_at is null`,
      [nowIso(), classification.assetType, classification.sector, classification.industry, classification.sectorCanonical, input.nameZh ?? null, input.nameEn ?? null, input.lockClassification ? 1 : 0, id],
    );
  }

  override async deleteManualHolding(id: string) {
    // Only real trades (cashless = 0) block deletion; the cashless opening lot
    // is ours to soft-delete alongside the asset.
    const linked = await this.db.select<Array<{ count: number }>>(
      `select count(*) as count from investment_records where asset_id = $1 and deleted_at is null and cashless = 0`,
      [id],
    );
    if ((linked[0]?.count ?? 0) > 0) throw new Error("已有逐筆交易的持倉不能直接刪除。");
    await this.db.execute(
      `update investment_records set deleted_at = $1, updated_at = $1, revision = revision + 1 where id = $2 and deleted_at is null`,
      [nowIso(), openingRecordId(id)],
    );
    await this.db.execute(
      `update portfolio_assets set deleted_at = $1, updated_at = $1, revision = revision + 1 where id = $2 and holding_source = 'manual'`,
      [nowIso(), id],
    );
  }

  override async listInvestmentRecords() {
    return (await this.db.select<InvestmentRecord[]>(`select
      id, space_id as spaceId, revision, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt,
      asset_id as assetId, linked_account_id as linkedAccountId, date, action, price, quantity, fee, note,
      is_reviewed as isReviewed, linked_ledger_transaction_id as linkedLedgerTransactionId, cashless, drip_group_id as dripGroupId
      from investment_records where deleted_at is null order by date desc, created_at desc`)).map((row) => ({
        ...row,
        isReviewed: this.toBool(row.isReviewed),
        cashless: this.toBool(row.cashless),
      }));
  }

  override async createInvestmentRecord(input: InvestmentDraft) {
    await this.withTransaction(async () => {
      const ticker = input.ticker.trim().toUpperCase();
      const transactionAssetId = await this.findSqliteTransactionAssetId(input);
      const manualAssetId = !transactionAssetId ? (await this.findSqliteManualAsset(ticker, input.linkedAccountId ?? null))?.id : undefined;
      const existingAssetId = transactionAssetId ?? manualAssetId;
      await this.validateSqliteInvestmentDraft(input, existingAssetId);
      const assetId = await this.findOrCreateSqliteAsset(input);
      const record = createInvestmentRow(input, assetId);
      const ledger = createInvestmentLedgerRow(input, record.id);
      if (ledger) {
        record.linkedLedgerTransactionId = ledger.id;
        await this.insertLedgerRow(ledger);
      }
      await this.insertInvestmentRow(record);
      await this.recomputeSqliteAccounts();
      await this.recomputeSqliteAssets();
    });
  }

  override async createDividendReinvestment(input: DividendReinvestmentDraft) {
    validateDividendReinvestment(input);
    const { dividend, buy } = dividendReinvestmentLegs(input);
    const dripGroupId = createId("drip");
    await this.withTransaction(async () => {
      // Dividend leg first, then buy — its ledger row is inserted before the buy
      // is validated, so the buy's purchasing-power check (which sums ledger
      // rows) sees the credited dividend. Both legs share one dripGroupId.
      const buildLeg = async (leg: InvestmentDraft) => {
        const ticker = leg.ticker.trim().toUpperCase();
        const transactionAssetId = await this.findSqliteTransactionAssetId(leg);
        const manualAssetId = !transactionAssetId ? (await this.findSqliteManualAsset(ticker, leg.linkedAccountId ?? null))?.id : undefined;
        const existingAssetId = transactionAssetId ?? manualAssetId;
        await this.validateSqliteInvestmentDraft(leg, existingAssetId);
        const assetId = await this.findOrCreateSqliteAsset(leg);
        const record = createInvestmentRow(leg, assetId);
        record.dripGroupId = dripGroupId;
        const ledger = createInvestmentLedgerRow(leg, record.id);
        if (ledger) {
          record.linkedLedgerTransactionId = ledger.id;
          await this.insertLedgerRow(ledger);
        }
        await this.insertInvestmentRow(record);
      };
      await buildLeg(dividend);
      await buildLeg(buy);
      await this.recomputeSqliteAccounts();
      await this.recomputeSqliteAssets();
    });
  }

  override async updateInvestmentRecord(id: string, input: InvestmentDraft) {
    const existingRows = await this.db.select<InvestmentRecord[]>(`select
      id, space_id as spaceId, revision, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt,
      asset_id as assetId, linked_account_id as linkedAccountId, date, action, price, quantity, fee, note,
      is_reviewed as isReviewed, linked_ledger_transaction_id as linkedLedgerTransactionId, cashless, drip_group_id as dripGroupId
      from investment_records where id = $1 and deleted_at is null`, [id]);
    const existingRecord = existingRows[0];
    if (!existingRecord) throw new Error("找不到投資交易。");
    // The cashless flag is a stored property of the record, not something the edit
    // UI supplies — an opening lot must stay cashless no matter what draft arrives.
    const effective: InvestmentDraft = { ...input, cashless: existingRecord.cashless };
    const ticker = effective.ticker.trim().toUpperCase();
    const transactionAssetId = await this.findSqliteTransactionAssetId(effective);
    const manualAssetId = !transactionAssetId ? (await this.findSqliteManualAsset(ticker, effective.linkedAccountId ?? null))?.id : undefined;
    const existingAssetId = transactionAssetId ?? manualAssetId;
    await this.validateSqliteInvestmentDraft(effective, existingAssetId, {
      excludeRecordId: id,
      excludeLedgerId: existingRecord.linkedLedgerTransactionId,
    });
    await this.withTransaction(async () => {
      const assetId = await this.findOrCreateSqliteAsset(effective);
      const ledger = createInvestmentLedgerRow(effective, id);
      let linkedLedgerTransactionId: string | null = existingRecord.linkedLedgerTransactionId;
      if (linkedLedgerTransactionId) {
        if (ledger) {
          const fields = investmentLedgerFields(effective, id);
          await this.db.execute(
            `update ledger_transactions set revision = revision + 1, updated_at = $1, deleted_at = null, account_id = $2, date = $3, name = $4, amount = $5, currency = $6, category = $7, subcategory = $8, merchant = $9, entry_type = $10, settlement_status = $11, note = $12, linked_investment_record_id = $13, group_id = $14 where id = $15`,
            [nowIso(), fields.accountId, fields.date, fields.name, fields.amount, fields.currency, fields.category, fields.subcategory, fields.merchant, fields.entryType, fields.settlementStatus, fields.note, fields.linkedInvestmentRecordId, fields.groupId, linkedLedgerTransactionId],
          );
        } else {
          await this.db.execute(
            `update ledger_transactions set deleted_at = $1, updated_at = $1, revision = revision + 1 where id = $2`,
            [nowIso(), linkedLedgerTransactionId],
          );
          linkedLedgerTransactionId = null;
        }
      } else if (ledger) {
        linkedLedgerTransactionId = ledger.id;
        await this.insertLedgerRow(ledger);
      }
      await this.db.execute(
        `update investment_records set revision = revision + 1, updated_at = $1, asset_id = $2, linked_account_id = $3, date = $4, action = $5, price = $6, quantity = $7, fee = $8, note = $9, linked_ledger_transaction_id = $10, cashless = $11 where id = $12`,
        [nowIso(), assetId, effective.linkedAccountId ?? null, effective.date, effective.action, effective.price, effective.quantity, effective.fee, effective.note, linkedLedgerTransactionId, effective.cashless ? 1 : 0, id],
      );
      await this.recomputeSqliteAccounts();
      await this.recomputeSqliteAssets();
    });
  }

  override async deleteInvestmentRecord(id: string) {
    const existingRows = await this.db.select<Array<{ assetId: string; linkedLedgerTransactionId: string | null; dripGroupId: string | null }>>(
      `select asset_id as assetId, linked_ledger_transaction_id as linkedLedgerTransactionId, drip_group_id as dripGroupId from investment_records where id = $1 and deleted_at is null`,
      [id],
    );
    const existingRecord = existingRows[0];
    if (!existingRecord) throw new Error("找不到投資交易。");
    // Deleting a manual holding's opening lot must remove the whole holding —
    // otherwise recomputeSqliteAssets self-heals the quantity from baseQuantity
    // and the holding resurrects. Defer to deleteManualHolding, which tombstones
    // the asset + opening record and enforces the "已有逐筆交易" guard when real
    // trades exist. (Mirrors the browser FinanceRepository.)
    if (id === openingRecordId(existingRecord.assetId)) {
      const assetRows = await this.db.select<Array<{ holdingSource: string }>>(
        `select holding_source as holdingSource from portfolio_assets where id = $1`,
        [existingRecord.assetId],
      );
      if (assetRows[0]?.holdingSource === "manual") {
        await this.deleteManualHolding(existingRecord.assetId);
        return;
      }
    }
    // A 股息再投入 (DRIP) entry is two linked legs sharing one dripGroupId; deleting
    // either removes both so the dividend and its reinvestment never half-exist.
    const targets = existingRecord.dripGroupId
      ? await this.db.select<Array<{ id: string; linkedLedgerTransactionId: string | null }>>(
          `select id, linked_ledger_transaction_id as linkedLedgerTransactionId from investment_records where drip_group_id = $1 and deleted_at is null`,
          [existingRecord.dripGroupId],
        )
      : [{ id, linkedLedgerTransactionId: existingRecord.linkedLedgerTransactionId }];
    await this.withTransaction(async () => {
      const timestamp = nowIso();
      for (const target of targets) {
        await this.db.execute(`update investment_records set deleted_at = $1, updated_at = $1, revision = revision + 1 where id = $2`, [timestamp, target.id]);
        if (target.linkedLedgerTransactionId) {
          await this.db.execute(
            `update ledger_transactions set deleted_at = $1, updated_at = $1, revision = revision + 1 where id = $2`,
            [timestamp, target.linkedLedgerTransactionId],
          );
        }
      }
      await this.recomputeSqliteAccounts();
      await this.recomputeSqliteAssets();
    });
  }

  override async importInvestmentRecords(rows: InvestmentDraft[]) {
    await this.withTransaction(async () => {
      for (const row of rows) {
        const rowTicker = row.ticker.trim().toUpperCase();
        const txAssetId = await this.findSqliteTransactionAssetId(row);
        const manualId = !txAssetId ? (await this.findSqliteManualAsset(rowTicker, row.linkedAccountId ?? null))?.id : undefined;
        const existingAssetId = txAssetId ?? manualId;
        await this.validateSqliteInvestmentDraft(row, existingAssetId);
        const assetId = await this.findOrCreateSqliteAsset(row);
        const record = createInvestmentRow(row, assetId);
        const ledger = createInvestmentLedgerRow(row, record.id);
        if (ledger) {
          record.linkedLedgerTransactionId = ledger.id;
          await this.insertLedgerRow(ledger);
        }
        await this.insertInvestmentRow(record);
      }
      await this.recomputeSqliteAccounts();
      await this.recomputeSqliteAssets();
    });
  }

  override async importInvestmentActivity(input: InvestmentActivityImportDraft) {
    const accounts = await this.listAccounts();
    const rows = [
      ...input.cash.map((row) => ({ kind: "cash" as const, row })),
      ...input.investments.map((row) => ({ kind: "investment" as const, row })),
    ].sort((a, b) => (a.row.importRow ?? Number.MAX_SAFE_INTEGER) - (b.row.importRow ?? Number.MAX_SAFE_INTEGER));

    await this.withTransaction(async () => {
      for (const item of rows) {
        try {
          if (item.kind === "cash") {
            assertLedgerInvariants(item.row, accounts, { allowTransfer: item.row.entryType === "transfer" });
            await this.insertLedgerRow(createLedgerRow(item.row));
          } else {
            const row = item.row;
            const rowTicker = row.ticker.trim().toUpperCase();
            const txAssetId = await this.findSqliteTransactionAssetId(row);
            const manualId = !txAssetId ? (await this.findSqliteManualAsset(rowTicker, row.linkedAccountId ?? null))?.id : undefined;
            const existingAssetId = txAssetId ?? manualId;
            await this.validateSqliteInvestmentDraft(row, existingAssetId);
            const assetId = await this.findOrCreateSqliteAsset(row);
            const record = createInvestmentRow(row, assetId);
            const ledger = createInvestmentLedgerRow(row, record.id);
            if (ledger) {
              record.linkedLedgerTransactionId = ledger.id;
              await this.insertLedgerRow(ledger);
            }
            await this.insertInvestmentRow(record);
          }
        } catch (error) {
          throw formatImportError(item.row, error);
        }
      }
      await this.recomputeSqliteAccounts();
      await this.recomputeSqliteAssets();
    });
  }

  override async listRecurringTransactions() {
    return (await this.db.select<RecurringTransaction[]>(`select
      id, space_id as spaceId, revision, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt,
      account_id as accountId, counter_account_id as counterAccountId, amount, currency, category, subcategory, merchant, entry_type as entryType, settlement_status as settlementStatus, note, frequency, day_of_month as dayOfMonth, next_run_date as nextRunDate, is_active as isActive
      from recurring_transactions where deleted_at is null order by next_run_date`)).map((row) => ({
        ...row,
        frequency: (row.frequency ?? "monthly") as import("../domain").RecurringFrequency,
        isActive: Boolean(row.isActive),
      }));
  }

  override async createRecurringTransaction(input: RecurringDraft) {
    assertLedgerInvariants(input, await this.listAccounts());
    await this.insertRecurringRow(createRecurringRow(input));
  }

  override async updateRecurringTransaction(id: string, input: RecurringDraft) {
    assertLedgerInvariants(input, await this.listAccounts());
    await this.db.execute(
      `update recurring_transactions set revision = revision + 1, updated_at = $1, account_id = $2, amount = $3, currency = $4, category = $5, subcategory = $6, merchant = $7, entry_type = $8, settlement_status = $9, note = $10, frequency = $11, day_of_month = $12, next_run_date = $13, is_active = $14, counter_account_id = $16 where id = $15`,
      [nowIso(), input.accountId, input.amount, input.currency, input.category, input.subcategory, input.merchant, input.entryType, input.settlementStatus, input.note, input.frequency ?? "monthly", input.dayOfMonth, input.nextRunDate, Number(input.isActive), id, input.counterAccountId ?? null],
    );
  }

  override async deleteRecurringTransaction(id: string) {
    await this.db.execute(`update recurring_transactions set deleted_at = $1, updated_at = $1, revision = revision + 1 where id = $2`, [nowIso(), id]);
  }

  override async postRecurringTransaction(id: string) {
    const rows = await this.db.select<RecurringTransaction[]>(`select
      id, space_id as spaceId, revision, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt,
      account_id as accountId, counter_account_id as counterAccountId, amount, currency, category, subcategory, merchant, entry_type as entryType, settlement_status as settlementStatus, note, frequency, day_of_month as dayOfMonth, next_run_date as nextRunDate, is_active as isActive
      from recurring_transactions where id = $1 and deleted_at is null`, [id]);
    const recurring = rows[0];
    if (!recurring) throw new Error("找不到週期事件。");
    const recurringOccurrenceKey = recurringKey(recurring.id, recurring.nextRunDate);
    const existing = await this.db.select<Array<{ count: number }>>(
      `select count(*) as count from ledger_transactions where recurring_occurrence_key = $1 and deleted_at is null`,
      [recurringOccurrenceKey],
    );
    if ((existing[0]?.count ?? 0) > 0) throw new Error("這一期週期交易已經建立。");
    await this.withTransaction(async () => {
      await this.insertLedgerRow(createLedgerRow({
        accountId: recurring.accountId,
        counterAccountId: recurring.counterAccountId ?? null,
        date: `${recurring.nextRunDate}T09:00`,
        name: recurring.merchant || recurring.category,
        amount: recurring.amount,
        currency: recurring.currency,
        category: recurring.category,
        subcategory: recurring.subcategory,
        merchant: recurring.merchant,
        entryType: recurring.entryType,
        settlementStatus: recurring.settlementStatus,
        note: recurring.note,
        recurringRuleId: recurring.id,
        recurringOccurrenceKey,
      }));
      const freq = (recurring.frequency ?? "monthly") as import("../domain").RecurringFrequency;
      await this.db.execute(`update recurring_transactions set next_run_date = $1, updated_at = $2, revision = revision + 1 where id = $3`, [nextRecurringDate(recurring.nextRunDate, freq, recurring.dayOfMonth), nowIso(), id]);
      await this.recomputeSqliteAccounts();
    });
  }

  override async postDueRecurringTransactions(today: string) {
    const rules = await this.db.select<RecurringTransaction[]>(`select
      id, account_id as accountId, counter_account_id as counterAccountId, amount, currency, category, subcategory, merchant, entry_type as entryType, settlement_status as settlementStatus, note, frequency, day_of_month as dayOfMonth, next_run_date as nextRunDate, is_active as isActive
      from recurring_transactions where deleted_at is null and is_active = 1`);
    let posted = 0;
    await this.withTransaction(async () => {
      for (const rule of rules) {
        const frequency = (rule.frequency ?? "monthly") as import("../domain").RecurringFrequency;
        let next = rule.nextRunDate;
        let guard = 0;
        while (next <= today && guard < 120) {
          const recurringOccurrenceKey = recurringKey(rule.id, next);
          const existing = await this.db.select<Array<{ count: number }>>(
            `select count(*) as count from ledger_transactions where recurring_occurrence_key = $1 and deleted_at is null`,
            [recurringOccurrenceKey],
          );
          if ((existing[0]?.count ?? 0) > 0) {
            next = nextRecurringDate(next, frequency, rule.dayOfMonth);
            guard += 1;
            continue;
          }
          await this.insertLedgerRow(createLedgerRow({
            accountId: rule.accountId,
            counterAccountId: rule.counterAccountId ?? null,
            date: `${next}T09:00`,
            name: rule.merchant || rule.category,
            amount: rule.amount,
            currency: rule.currency,
            category: rule.category,
            subcategory: rule.subcategory,
            merchant: rule.merchant,
            entryType: rule.entryType,
            settlementStatus: rule.settlementStatus,
            note: rule.note,
            recurringRuleId: rule.id,
            recurringOccurrenceKey,
          }));
          next = nextRecurringDate(next, frequency, rule.dayOfMonth);
          posted += 1;
          guard += 1;
        }
        if (next !== rule.nextRunDate) {
          await this.db.execute(`update recurring_transactions set next_run_date = $1, updated_at = $2, revision = revision + 1 where id = $3`, [next, nowIso(), rule.id]);
        }
      }
      if (posted > 0) await this.recomputeSqliteAccounts();
    });
    return posted;
  }

  private recurringInvestmentSelect = `select
    id, space_id as spaceId, revision, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt,
    account_id as accountId, ticker, name, currency, mode, amount, quantity, price, fee, frequency,
    day_of_month as dayOfMonth, next_run_date as nextRunDate, is_active as isActive
    from recurring_investments`;

  override async listRecurringInvestments() {
    return (await this.db.select<RecurringInvestment[]>(
      `${this.recurringInvestmentSelect} where deleted_at is null order by next_run_date`,
    )).map((row) => ({
      ...row,
      frequency: (row.frequency ?? "monthly") as import("../domain").RecurringFrequency,
      mode: (row.mode ?? "fixedAmount") as RecurringInvestmentMode,
      isActive: Boolean(row.isActive),
    }));
  }

  override async createRecurringInvestment(input: RecurringInvestmentDraft) {
    await this.insertRecurringInvestmentRow(createRecurringInvestmentRow(input));
  }

  override async updateRecurringInvestment(id: string, input: RecurringInvestmentDraft) {
    await this.db.execute(
      `update recurring_investments set revision = revision + 1, updated_at = $1, account_id = $2, ticker = $3, name = $4, currency = $5, mode = $6, amount = $7, quantity = $8, price = $9, fee = $10, frequency = $11, day_of_month = $12, next_run_date = $13, is_active = $14 where id = $15`,
      [nowIso(), input.accountId, input.ticker.trim().toUpperCase(), input.name, input.currency.trim().toUpperCase(), input.mode, input.amount, input.quantity, input.price, input.fee, input.frequency ?? "monthly", input.dayOfMonth, input.nextRunDate, Number(input.isActive), id],
    );
  }

  override async deleteRecurringInvestment(id: string) {
    await this.db.execute(`update recurring_investments set deleted_at = $1, updated_at = $1, revision = revision + 1 where id = $2`, [nowIso(), id]);
  }

  override async postRecurringInvestment(id: string) {
    const rows = await this.db.select<RecurringInvestment[]>(`${this.recurringInvestmentSelect} where id = $1 and deleted_at is null`, [id]);
    const rule = rows[0];
    if (!rule) throw new Error("找不到定期定額計畫。");
    // createInvestmentRecord runs its own transaction (asset + ledger + record).
    await this.createInvestmentRecord(recurringInvestmentToDraft({
      ...rule,
      mode: (rule.mode ?? "fixedAmount") as RecurringInvestmentMode,
    }));
    const freq = (rule.frequency ?? "monthly") as import("../domain").RecurringFrequency;
    await this.db.execute(
      `update recurring_investments set next_run_date = $1, updated_at = $2, revision = revision + 1 where id = $3`,
      [nextRecurringDate(rule.nextRunDate, freq, rule.dayOfMonth), nowIso(), id],
    );
  }

  override async adjustAccountBalance(accountId: string, targetBalance: number, date: string, note: string) {
    const rows = await this.db.select<Array<{ balance: number; currency: string }>>(
      `select balance, currency from accounts where id = $1 and deleted_at is null`, [accountId],
    );
    const account = rows[0];
    if (!account) throw new Error("找不到帳戶。");
    const diff = targetBalance - account.balance;
    if (diff === 0) return;
    await this.insertLedgerRow(createLedgerRow({
      accountId,
      date,
      name: "餘額調整",
      amount: diff,
      currency: account.currency,
      category: "餘額調整",
      subcategory: "",
      merchant: "",
      entryType: diff > 0 ? "income" : "expense",
      settlementStatus: "settled",
      note,
    }));
    await this.recomputeSqliteAccounts();
  }

  override async recalculateDerivedData(): Promise<RecalculationReport> {
    const beforeAccounts = await this.listAccounts();
    const beforeAssets = await this.listPortfolioAssets();
    const ledger = await this.listLedgerTransactions();
    const investments = await this.listInvestmentRecords();
    const settings = await this.getAppSettings();
    const dailyRates = await this.listDailyFxRates();
    await this.recomputeSqliteAccounts();
    await this.recomputeSqliteAssets();
    const afterAccounts = await this.listAccounts();
    const afterAssets = await this.listPortfolioAssets();
    return buildRecalculationReport(beforeAccounts, afterAccounts, beforeAssets, afterAssets, ledger, investments, findMissingFxPairs(afterAccounts, ledger, afterAssets, settings, dailyRates));
  }

  override async renameMerchant(oldName: string, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed) throw new Error("新商家名稱不能為空。");
    await this.db.execute(
      `update ledger_transactions set merchant = $1, updated_at = $2, revision = revision + 1 where merchant = $3 and deleted_at is null`,
      [trimmed, nowIso(), oldName],
    );
    const settingsRows = await this.db.select<Array<{ value: string }>>(`select value from app_settings where key = 'merchants'`);
    if (settingsRows[0]) {
      const merchants: string[] = JSON.parse(settingsRows[0].value);
      const updated = merchants.map((m) => (m === oldName ? trimmed : m));
      await this.db.execute(`insert into app_settings (key, value, updated_at) values ('merchants',$1,$2) on conflict(key) do update set value=excluded.value, updated_at=excluded.updated_at`, [JSON.stringify(updated), nowIso()]);
      await this.bumpSqliteSettingsRevision();
    }
  }

  override async renameCategory(oldName: string, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed) throw new Error("新分類名稱不能為空。");
    await this.db.execute(
      `update ledger_transactions set category = $1, updated_at = $2, revision = revision + 1 where category = $3 and deleted_at is null`,
      [trimmed, nowIso(), oldName],
    );
    const settingsRows = await this.db.select<Array<{ value: string }>>(`select value from app_settings where key = 'categories'`);
    if (settingsRows[0]) {
      const cats: Array<{ name: string; children: string[] }> = JSON.parse(settingsRows[0].value);
      const updated = cats.map((g) => g.name === oldName ? { ...g, name: trimmed } : g);
      await this.db.execute(`insert into app_settings (key, value, updated_at) values ('categories',$1,$2) on conflict(key) do update set value=excluded.value, updated_at=excluded.updated_at`, [JSON.stringify(updated), nowIso()]);
      await this.bumpSqliteSettingsRevision();
    }
  }

  override async renameSubcategory(category: string, oldSub: string, newSub: string) {
    const trimmed = newSub.trim();
    if (!trimmed) throw new Error("新子分類名稱不能為空。");
    await this.db.execute(
      `update ledger_transactions set subcategory = $1, updated_at = $2, revision = revision + 1 where category = $3 and subcategory = $4 and deleted_at is null`,
      [trimmed, nowIso(), category, oldSub],
    );
    const settingsRows = await this.db.select<Array<{ value: string }>>(`select value from app_settings where key = 'categories'`);
    if (settingsRows[0]) {
      const cats: Array<{ name: string; children: string[] }> = JSON.parse(settingsRows[0].value);
      const updated = cats.map((g) =>
        g.name === category ? { ...g, children: g.children.map((c) => (c === oldSub ? trimmed : c)) } : g,
      );
      await this.db.execute(`insert into app_settings (key, value, updated_at) values ('categories',$1,$2) on conflict(key) do update set value=excluded.value, updated_at=excluded.updated_at`, [JSON.stringify(updated), nowIso()]);
      await this.bumpSqliteSettingsRevision();
    }
  }

  override async listMarketQuotes() {
    return this.db.select<StoredMarketQuote[]>(`select
      symbol, name, currency, price, change, change_percent as changePercent, market_time as marketTime, source, updated_at as updatedAt
      from market_quotes order by symbol`);
  }

  override async saveMarketQuotes(quotes: MarketQuote[], source: string) {
    const updatedAt = nowIso();
    for (const quote of quotes) {
      await this.db.execute(
        `insert into market_quotes (symbol, name, currency, price, change, change_percent, market_time, source, updated_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         on conflict(symbol) do update set name = excluded.name, currency = excluded.currency, price = excluded.price,
         change = excluded.change, change_percent = excluded.change_percent, market_time = excluded.market_time,
         source = excluded.source, updated_at = excluded.updated_at`,
        [quote.symbol, quote.name, quote.currency, quote.price, quote.change, quote.changePercent, quote.marketTime, source, updatedAt],
      );
      // Cache localized names alongside the portfolio_assets row so
      // resolveDisplayName() can pick the user's preferred locale
      // without re-hitting the network.
      //
      // CRITICAL: only write (and only then bump revision) when the cached name
      // actually changes. Quotes refresh on every focus/poll; an unconditional
      // `revision = revision + 1` here manufactured a brand-new sync envelope per
      // asset on every single refresh, bloating the relay to tens of thousands of
      // near-duplicate asset envelopes and making other devices' pull never drain.
      // `is not` is SQLite's null-safe distinct-from, so a no-op refresh is a no-op
      // write. See project_sync_sqlite memory (relay history bloat).
      if (quote.nameZh) {
        await this.db.execute(
          `update portfolio_assets set name_zh = $1, updated_at = $2, revision = revision + 1
           where upper(ticker) = upper($3) and deleted_at is null and name_zh is not $1`,
          [quote.nameZh, updatedAt, quote.symbol],
        );
      }
      if (quote.nameEn) {
        await this.db.execute(
          `update portfolio_assets set name_en = $1, updated_at = $2, revision = revision + 1
           where upper(ticker) = upper($3) and deleted_at is null and name_en is not $1`,
          [quote.nameEn, updatedAt, quote.symbol],
        );
      }
    }
  }

  override async getAppSettings() {
    const rows = await this.db.select<Array<{ key: string; value: string }>>("select key, value from app_settings");
    const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));
    return normalizeSettings({
      primaryCurrency: values.primaryCurrency,
      categories: parseJsonList(values.categories, defaultSettings.categories),
      merchants: parseJsonList(values.merchants, defaultSettings.merchants),
      exchangeRates: parseJsonList(values.exchangeRates, defaultSettings.exchangeRates),
    });
  }

  override async updateAppSettings(input: AppSettings) {
    const settings = normalizeSettings(input);
    await this.upsertSetting("primaryCurrency", settings.primaryCurrency);
    await this.upsertSetting("categories", JSON.stringify(settings.categories));
    await this.upsertSetting("merchants", JSON.stringify(settings.merchants));
    await this.upsertSetting("exchangeRates", JSON.stringify(settings.exchangeRates));
    await this.bumpSqliteSettingsRevision();
  }

  override async listDailyFxRates(filter?: { from?: string; to?: string; since?: string }) {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter?.from) {
      params.push(filter.from.toUpperCase());
      clauses.push(`currency_from = $${params.length}`);
    }
    if (filter?.to) {
      params.push(filter.to.toUpperCase());
      clauses.push(`currency_to = $${params.length}`);
    }
    if (filter?.since) {
      params.push(filter.since.slice(0, 10));
      clauses.push(`date >= $${params.length}`);
    }
    const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
    const rows = await this.db.select<Array<{
      currency_from: string;
      currency_to: string;
      date: string;
      rate: number;
      source: string;
      updated_at: string;
    }>>(
      `select currency_from, currency_to, date, rate, source, updated_at from fx_rates ${where} order by date asc`,
      params,
    );
    return rows.map((row) => ({
      from: row.currency_from,
      to: row.currency_to,
      date: row.date,
      rate: row.rate,
      source: row.source,
      updatedAt: row.updated_at,
    }));
  }

  override async saveDailyFxRates(rates: DailyFxRate[]) {
    if (!rates.length) return;
    const updatedAt = nowIso();
    // Normalize and drop invalid rows up front so the chunked INSERT below
    // can build clean parameter tuples.
    const normalized = rates
      .map((rate) => ({
        from: rate.from.trim().toUpperCase(),
        to: rate.to.trim().toUpperCase(),
        date: rate.date.slice(0, 10),
        rate: Number(rate.rate),
        source: rate.source || "manual",
        updatedAt: rate.updatedAt || updatedAt,
      }))
      .filter((row) => row.from && row.to && row.date && Number.isFinite(row.rate) && row.rate > 0);

    await this.executeBatchedInsert({
      rows: normalized,
      columnsPerRow: 6,
      buildTuple: (row) => [row.from, row.to, row.date, row.rate, row.source, row.updatedAt],
      sqlPrefix:
        `insert into fx_rates (currency_from, currency_to, date, rate, source, updated_at) values `,
      sqlSuffix:
        ` on conflict(currency_from, currency_to, date) do update set rate = excluded.rate, source = excluded.source, updated_at = excluded.updated_at`,
    });
  }

  override async getDailyFxRate(from: string, to: string, date: string) {
    const rows = await this.db.select<Array<{
      currency_from: string;
      currency_to: string;
      date: string;
      rate: number;
      source: string;
      updated_at: string;
    }>>(
      `select currency_from, currency_to, date, rate, source, updated_at from fx_rates
       where currency_from = $1 and currency_to = $2 and date <= $3
       order by date desc limit 1`,
      [from.toUpperCase(), to.toUpperCase(), date.slice(0, 10)],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      from: row.currency_from,
      to: row.currency_to,
      date: row.date,
      rate: row.rate,
      source: row.source,
      updatedAt: row.updated_at,
    };
  }

  override async listDailyPrices(filter?: { ticker?: string; since?: string }) {
    const clauses: string[] = [];
    const params: unknown[] = [];
    if (filter?.ticker) {
      params.push(filter.ticker.toUpperCase());
      clauses.push(`ticker = $${params.length}`);
    }
    if (filter?.since) {
      params.push(filter.since.slice(0, 10));
      clauses.push(`date >= $${params.length}`);
    }
    const where = clauses.length ? `where ${clauses.join(" and ")}` : "";
    const rows = await this.db.select<Array<{
      ticker: string;
      date: string;
      close: number;
      currency: string;
      source: string;
      updated_at: string;
    }>>(
      `select ticker, date, close, currency, source, updated_at from daily_prices ${where} order by ticker, date asc`,
      params,
    );
    return rows.map((row) => ({
      ticker: row.ticker,
      date: row.date,
      close: row.close,
      currency: row.currency ?? "",
      source: row.source,
      updatedAt: row.updated_at,
    }));
  }

  override async saveDailyPrices(prices: DailyPrice[]) {
    if (!prices.length) return;
    const updatedAt = nowIso();
    const normalized = prices
      .map((price) => ({
        ticker: price.ticker.trim().toUpperCase(),
        date: price.date.slice(0, 10),
        close: Number(price.close),
        currency: price.currency || "",
        source: price.source || "manual",
        updatedAt: price.updatedAt || updatedAt,
      }))
      .filter((row) => row.ticker && row.date && Number.isFinite(row.close) && row.close > 0);

    await this.executeBatchedInsert({
      rows: normalized,
      columnsPerRow: 6,
      buildTuple: (row) => [row.ticker, row.date, row.close, row.currency, row.source, row.updatedAt],
      sqlPrefix:
        `insert into daily_prices (ticker, date, close, currency, source, updated_at) values `,
      sqlSuffix:
        ` on conflict(ticker, date) do update set close = excluded.close, currency = excluded.currency, source = excluded.source, updated_at = excluded.updated_at`,
    });
  }

  /**
   * Insert a large set of rows in chunks. Each chunk is a single
   * `INSERT INTO ... VALUES (?,?,?,?), (?,?,?,?), ...` statement, which
   * collapses the dominant cost of bulk import (per-row IPC + per-row fsync)
   * down to a handful of round-trips for tens of thousands of rows.
   *
   * The chunk size is tuned to stay well under SQLite's default 32,766
   * bound parameter limit. `bind` parameters are written as `$N` to match
   * the rest of the repository's prepared statements.
   */
  private async executeBatchedInsert<TRow>({
    rows,
    columnsPerRow,
    buildTuple,
    sqlPrefix,
    sqlSuffix,
  }: {
    rows: TRow[];
    columnsPerRow: number;
    buildTuple: (row: TRow) => unknown[];
    sqlPrefix: string;
    sqlSuffix: string;
  }) {
    if (!rows.length) return;
    const maxParamsPerStatement = 900; // SQLite default cap is 32766; stay safe.
    const rowsPerChunk = Math.max(1, Math.floor(maxParamsPerStatement / columnsPerRow));

    for (let start = 0; start < rows.length; start += rowsPerChunk) {
      const chunk = rows.slice(start, start + rowsPerChunk);
      const tuples: string[] = [];
      const params: unknown[] = [];
      let cursor = 1;
      for (const row of chunk) {
        const placeholders: string[] = [];
        for (let i = 0; i < columnsPerRow; i += 1) {
          placeholders.push(`$${cursor}`);
          cursor += 1;
        }
        tuples.push(`(${placeholders.join(",")})`);
        const values = buildTuple(row);
        if (values.length !== columnsPerRow) {
          throw new Error(`Row tuple width mismatch: expected ${columnsPerRow}, got ${values.length}`);
        }
        params.push(...values);
      }
      const sql = `${sqlPrefix}${tuples.join(",")}${sqlSuffix}`;
      await this.db.execute(sql, params);
    }
  }

  override async getDailyPrice(ticker: string, date: string) {
    const rows = await this.db.select<Array<{
      ticker: string;
      date: string;
      close: number;
      currency: string;
      source: string;
      updated_at: string;
    }>>(
      `select ticker, date, close, currency, source, updated_at from daily_prices
       where ticker = $1 and date <= $2
       order by date desc limit 1`,
      [ticker.toUpperCase(), date.slice(0, 10)],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      ticker: row.ticker,
      date: row.date,
      close: row.close,
      currency: row.currency ?? "",
      source: row.source,
      updatedAt: row.updated_at,
    };
  }

  override async listManualPriceSnapshots(filter?: { assetId?: string }) {
    const rows = await this.db.select<Array<{
      id: string;
      asset_id: string;
      date: string;
      price: number;
      note: string;
      created_at: string;
    }>>(
      filter?.assetId
        ? `select id, asset_id, date, price, note, created_at from manual_price_snapshots where asset_id = $1 order by date asc`
        : `select id, asset_id, date, price, note, created_at from manual_price_snapshots order by date asc`,
      filter?.assetId ? [filter.assetId] : [],
    );
    return rows.map((row) => ({
      id: row.id,
      assetId: row.asset_id,
      date: row.date,
      price: row.price,
      note: row.note,
      createdAt: row.created_at,
    }));
  }

  override async createManualPriceSnapshot(input: ManualPriceSnapshotDraft) {
    await this.db.execute(
      `insert into manual_price_snapshots (id, asset_id, date, price, note, created_at) values ($1,$2,$3,$4,$5,$6)`,
      [createId("mps"), input.assetId, input.date.slice(0, 10), input.price, input.note, nowIso()],
    );
  }

  override async deleteManualPriceSnapshot(id: string) {
    await this.db.execute(`delete from manual_price_snapshots where id = $1`, [id]);
  }

  override async listFinancialGoals() {
    const rows = await this.db.select<Array<{
      id: string;
      spaceId: string;
      revision: number;
      createdAt: string;
      updatedAt: string;
      deletedAt: string | null;
      kind: string;
      name: string;
      currency: string;
      annualSpending: number;
      withdrawalRate: number;
      expectedAnnualReturn: number;
      monthlyContribution: number;
      targetAmount: number | null;
      startDate: string;
      currentAge: number | null;
      retirementAge: number | null;
      planThroughAge: number | null;
      preRetirementReturn: number | null;
      postRetirementReturn: number | null;
      inflationRate: number | null;
      annualFee: number | null;
      contributionGrowthRate: number | null;
      spendingItems: string | null;
      incomeItems: string | null;
      displayMode: string | null;
      accountShareMap: string | null;
      targetDate: string | null;
    }>>(
      `select id, space_id as spaceId, revision, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt,
       kind, name, currency, annual_spending as annualSpending, withdrawal_rate as withdrawalRate,
       expected_annual_return as expectedAnnualReturn, monthly_contribution as monthlyContribution,
       target_amount as targetAmount, start_date as startDate,
       current_age as currentAge, retirement_age as retirementAge, plan_through_age as planThroughAge,
       pre_retirement_return as preRetirementReturn, post_retirement_return as postRetirementReturn,
       inflation_rate as inflationRate, annual_fee as annualFee,
       contribution_growth_rate as contributionGrowthRate,
       spending_items as spendingItems, income_items as incomeItems,
       display_mode as displayMode, account_share_map as accountShareMap,
       target_date as targetDate
       from financial_goals where deleted_at is null order by created_at asc`,
    );
    return rows.map((row) => ({
      ...row,
      kind: (row.kind === "custom" ? "custom" : "fire") as GoalKind,
      // Legacy rows may hold percent-unit rates; normalize to canonical decimal.
      withdrawalRate: normalizeRateUnit(row.withdrawalRate) ?? 0.04,
      expectedAnnualReturn: normalizeRateUnit(row.expectedAnnualReturn) ?? 0.07,
      targetAmount: row.targetAmount ?? null,
      targetDate: row.targetDate ?? null,
      spendingItems: parseJsonArray<SpendingItem>(row.spendingItems),
      incomeItems: parseJsonArray<IncomeItem>(row.incomeItems),
      displayMode: (row.displayMode === "nominal" ? "nominal" : "today") as GoalDisplayMode,
      accountShareMap: parseJsonObject<number>(row.accountShareMap),
    }));
  }

  override async upsertFinancialGoal(input: FinancialGoalDraft & { id?: string }) {
    const timestamp = nowIso();
    const fields = goalFieldsFromDraft(input);
    const spendingJson = JSON.stringify(fields.spendingItems);
    const incomeJson = JSON.stringify(fields.incomeItems);
    const accountShareJson = JSON.stringify(fields.accountShareMap);
    if (input.id) {
      await this.db.execute(
        `update financial_goals set revision = revision + 1, updated_at = $1, kind = $2, name = $3, currency = $4,
         annual_spending = $5, withdrawal_rate = $6, expected_annual_return = $7, monthly_contribution = $8,
         target_amount = $9, start_date = $10,
         current_age = $11, retirement_age = $12, plan_through_age = $13,
         pre_retirement_return = $14, post_retirement_return = $15,
         inflation_rate = $16, annual_fee = $17, contribution_growth_rate = $18,
         spending_items = $19, income_items = $20, display_mode = $21, account_share_map = $22,
         target_date = $23
         where id = $24`,
        [
          timestamp,
          fields.kind,
          fields.name,
          fields.currency,
          fields.annualSpending,
          fields.withdrawalRate,
          fields.expectedAnnualReturn,
          fields.monthlyContribution,
          fields.targetAmount,
          fields.startDate,
          fields.currentAge,
          fields.retirementAge,
          fields.planThroughAge,
          fields.preRetirementReturn,
          fields.postRetirementReturn,
          fields.inflationRate,
          fields.annualFee,
          fields.contributionGrowthRate,
          spendingJson,
          incomeJson,
          fields.displayMode,
          accountShareJson,
          fields.targetDate,
          input.id,
        ],
      );
      const refreshed = await this.listFinancialGoals();
      const found = refreshed.find((goal) => goal.id === input.id);
      if (!found) throw new Error("找不到要更新的目標。");
      return found;
    }
    const id = createId("goal");
    await this.db.execute(
      `insert into financial_goals (id, space_id, revision, created_at, updated_at, deleted_at, kind, name, currency,
         annual_spending, withdrawal_rate, expected_annual_return, monthly_contribution, target_amount, start_date,
         current_age, retirement_age, plan_through_age, pre_retirement_return, post_retirement_return,
         inflation_rate, annual_fee, contribution_growth_rate,
         spending_items, income_items, display_mode, account_share_map, target_date)
       values ($1,$2,1,$3,$3,null,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)`,
      [
        id,
        personalSpace,
        timestamp,
        fields.kind,
        fields.name,
        fields.currency,
        fields.annualSpending,
        fields.withdrawalRate,
        fields.expectedAnnualReturn,
        fields.monthlyContribution,
        fields.targetAmount,
        fields.startDate,
        fields.currentAge,
        fields.retirementAge,
        fields.planThroughAge,
        fields.preRetirementReturn,
        fields.postRetirementReturn,
        fields.inflationRate,
        fields.annualFee,
        fields.contributionGrowthRate,
        spendingJson,
        incomeJson,
        fields.displayMode,
        accountShareJson,
        fields.targetDate,
      ],
    );
    const refreshed = await this.listFinancialGoals();
    const found = refreshed.find((goal) => goal.id === id);
    if (!found) throw new Error("目標儲存失敗。");
    return found;
  }

  override async deleteFinancialGoal(id: string) {
    const timestamp = nowIso();
    await this.db.execute(
      `update financial_goals set deleted_at = $1, updated_at = $1, revision = revision + 1 where id = $2`,
      [timestamp, id],
    );
  }

  override async exportSnapshot(): Promise<RepositorySnapshot> {
    const [books, accounts, ledger, assetsList, investments, recurring, recurringInvestments, quotes, settings, fx, prices, goals, manualSnapshots, invoices, clients, creditGroups] = await Promise.all([
      this.listBooks(),
      this.listAccounts(),
      this.listLedgerTransactions(),
      this.listPortfolioAssets(),
      this.listInvestmentRecords(),
      this.listRecurringTransactions(),
      this.listRecurringInvestments(),
      this.listMarketQuotes(),
      this.getAppSettings(),
      this.listDailyFxRates(),
      this.listDailyPrices(),
      this.listFinancialGoals(),
      this.listManualPriceSnapshots(),
      this.listInvoices(),
      this.listClients(),
      this.listCreditGroups(),
    ]);
    const metaRows = await this.db.select<Array<{ value: string }>>(`select value from app_settings where key = '__settingsMeta'`);
    const meta = metaRows[0] ? JSON.parse(metaRows[0].value) : { revision: 1, updatedAt: nowIso() };
    return {
      version: 1,
      exportedAt: nowIso(),
      books,
      accounts,
      ledgerTransactions: ledger,
      portfolioAssets: assetsList,
      investmentRecords: investments,
      recurringTransactions: recurring,
      recurringInvestments,
      marketQuotes: quotes,
      settings,
      settingsRevision: meta.revision ?? 1,
      settingsUpdatedAt: meta.updatedAt ?? nowIso(),
      dailyFxRates: fx,
      dailyPrices: prices,
      financialGoals: goals,
      manualPriceSnapshots: manualSnapshots,
      invoices,
      clients,
      creditGroups,
    };
  }

  protected override async allSyncRecords(): Promise<SyncSource> {
    const q = (table: string) =>
      this.db.select<Array<{ id: string; revision: number; updatedAt: string; deletedAt: string | null }>>(
        `select id, revision, updated_at as updatedAt, deleted_at as deletedAt from ${table}`,
      );
    const [accounts, ledger, assets, investments, recurring, recurringInvestments, goals, books, invoices, clients, creditGroups] = await Promise.all([
      q("accounts"),
      q("ledger_transactions"),
      q("portfolio_assets"),
      q("investment_records"),
      q("recurring_transactions"),
      q("recurring_investments"),
      q("financial_goals"),
      q("books"),
      q("invoices"),
      q("clients"),
      q("credit_groups"),
    ]);
    const metaRows = await this.db.select<Array<{ value: string }>>(`select value from app_settings where key = '__settingsMeta'`);
    const meta = metaRows[0] ? JSON.parse(metaRows[0].value) : { revision: 1, updatedAt: nowIso() };
    return {
      accounts,
      ledgerTransactions: ledger,
      portfolioAssets: assets,
      investmentRecords: investments,
      recurringTransactions: recurring,
      recurringInvestments,
      financialGoals: goals,
      books,
      invoices,
      clients,
      creditGroups,
      appSettings: [{ id: "app_settings", revision: meta.revision ?? 1, updatedAt: meta.updatedAt ?? nowIso(), deletedAt: null }],
    };
  }

  override async collectPendingChanges(_sinceCursor: string | null) {
    const rows = await this.db.select<Array<{
      id: string;
      recordType: SyncEntity;
      recordId: string;
      revision: number;
      updatedAt: string;
      deletedAt: string | null;
    }>>(
      `select o.id, o.record_type as recordType, o.record_id as recordId, o.revision,
         coalesce(o.updated_at, o.created_at) as updatedAt, o.deleted_at as deletedAt
       from sync_outbox o
       where o.pushed_at is null
       order by o.created_at, o.id`,
    );
    return {
      changes: rows.map((row) => ({
        outboxId: row.id,
        entity: row.recordType,
        entityId: row.recordId,
        revision: row.revision,
        updatedAt: row.updatedAt,
        deleted: row.deletedAt !== null,
      })),
      nextCursor: rows.at(-1)?.updatedAt ?? null,
      count: rows.length,
    };
  }

  override async acknowledgePendingChanges(outboxIds: string[]) {
    if (!outboxIds.length) return;
    const placeholders = outboxIds.map((_, index) => `$${index + 1}`).join(",");
    await this.db.execute(
      `update sync_outbox set pushed_at = $${outboxIds.length + 1} where id in (${placeholders})`,
      [...outboxIds, nowIso()],
    );
  }

  override async requeueAllPendingChanges() {
    // Make sure every current record actually has an outbox row (older rows or
    // records created before the entity was tracked may be missing), then clear
    // every push mark so the next sync re-uploads the complete dataset.
    await this.backfillSyncOutbox();
    await this.db.execute(`update sync_outbox set pushed_at = null`);
  }

  override async listSyncConflicts() {
    const rows = await this.db.select<Array<{
      id: string;
      entity: SyncEntity;
      entityId: string;
      revision: number;
      sourceDeviceId: string;
      localPayload: string;
      incomingPayload: string;
      createdAt: string;
      resolvedAt: string | null;
    }>>(
      `select id, entity, entity_id as entityId, revision, source_device_id as sourceDeviceId,
         local_payload as localPayload, incoming_payload as incomingPayload,
         created_at as createdAt, resolved_at as resolvedAt
       from sync_conflicts order by created_at desc`,
    );
    return rows.map((row) => ({
      ...row,
      localPayload: JSON.parse(row.localPayload),
      incomingPayload: JSON.parse(row.incomingPayload),
    }));
  }

  override async resolveSyncConflict(id: string, strategy: "keepLocal" | "useIncoming") {
    const conflict = (await this.listSyncConflicts()).find((row) => row.id === id && row.resolvedAt === null);
    if (!conflict) throw new Error("找不到待處理的同步衝突。");
    if (strategy === "useIncoming") {
      await this.applySyncChanges([{ entity: conflict.entity, payload: conflict.incomingPayload }]);
    } else if (conflict.entity === "settings") {
      const settings = await this.getAppSettings();
      await this.updateAppSettings(settings);
    } else {
      const tableByEntity: Record<Exclude<SyncEntity, "settings">, string> = {
        account: "accounts",
        ledger: "ledger_transactions",
        asset: "portfolio_assets",
        investment: "investment_records",
        recurring: "recurring_transactions",
        recurringInvestment: "recurring_investments",
        goal: "financial_goals",
        book: "books",
        invoice: "invoices",
        client: "clients",
        creditGroup: "credit_groups",
      };
      await this.db.execute(
        `update ${tableByEntity[conflict.entity]} set revision = revision + 1, updated_at = $1 where id = $2`,
        [nowIso(), conflict.entityId],
      );
    }
    await this.db.execute(`update sync_conflicts set resolved_at = $1 where id = $2`, [nowIso(), id]);
  }

  override async clearSyncConflicts(): Promise<void> {
    await this.db.execute("delete from sync_conflicts");
  }

  override async getSyncPayload(entity: SyncEntity, entityId: string): Promise<Record<string, unknown> | null> {
    if (entity === "settings") {
      if (entityId !== "app_settings") return null;
      const settings = await this.getAppSettings();
      const metaRows = await this.db.select<Array<{ value: string }>>(`select value from app_settings where key = '__settingsMeta'`);
      const meta = metaRows[0] ? JSON.parse(metaRows[0].value) : { revision: 1, updatedAt: nowIso() };
      return { id: entityId, revision: meta.revision ?? 1, updatedAt: meta.updatedAt ?? nowIso(), deletedAt: null, settings };
    }
    const tableByEntity: Record<Exclude<SyncEntity, "settings">, string> = {
      account: "accounts",
      ledger: "ledger_transactions",
      asset: "portfolio_assets",
      investment: "investment_records",
      recurring: "recurring_transactions",
      recurringInvestment: "recurring_investments",
      goal: "financial_goals",
      book: "books",
      invoice: "invoices",
      client: "clients",
      creditGroup: "credit_groups",
    };
    const rows = await this.db.select<Array<Record<string, unknown>>>(
      `select * from ${tableByEntity[entity]} where id = $1 limit 1`,
      [entityId],
    );
    return rows[0] ? normalizeSqliteSyncPayload(entity, rows[0]) : null;
  }

  override async getSyncPayloads(entity: SyncEntity, entityIds: string[]): Promise<Map<string, Record<string, unknown>>> {
    const map = new Map<string, Record<string, unknown>>();
    const ids = [...new Set(entityIds)];
    if (ids.length === 0) return map;

    // Settings is a single synthetic row; nothing to batch.
    if (entity === "settings") {
      for (const id of ids) {
        const payload = await this.getSyncPayload(entity, id);
        if (payload) map.set(id, payload);
      }
      return map;
    }

    const tableByEntity: Record<Exclude<SyncEntity, "settings">, string> = {
      account: "accounts",
      ledger: "ledger_transactions",
      asset: "portfolio_assets",
      investment: "investment_records",
      recurring: "recurring_transactions",
      recurringInvestment: "recurring_investments",
      goal: "financial_goals",
      book: "books",
      invoice: "invoices",
      client: "clients",
      creditGroup: "credit_groups",
    };
    const table = tableByEntity[entity];

    // Chunk to stay under SQLite's ~999 bound-parameter limit.
    const CHUNK = 500;
    for (let i = 0; i < ids.length; i += CHUNK) {
      const chunk = ids.slice(i, i + CHUNK);
      const placeholders = chunk.map((_, j) => `$${j + 1}`).join(", ");
      const rows = await this.db.select<Array<Record<string, unknown>>>(
        `select * from ${table} where id in (${placeholders})`,
        chunk,
      );
      for (const row of rows) {
        map.set(String(row.id), normalizeSqliteSyncPayload(entity, row));
      }
    }
    return map;
  }

  override async applySyncChanges(changes: SyncApplyChange[], conflicts: SyncConflictRecord[] = []) {
    if (!changes.length && !conflicts.length) return;
    await this.withOutboxSuppressed(async () => {
      await this.withTransaction(async () => {
        for (const change of changes) await this.applySqliteSyncChange(change);
        for (const conflict of conflicts) {
          await this.db.execute(
            `insert or ignore into sync_conflicts
             (id, entity, entity_id, revision, source_device_id, local_payload, incoming_payload, created_at, resolved_at)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
              conflict.id,
              conflict.entity,
              conflict.entityId,
              conflict.revision,
              conflict.sourceDeviceId,
              JSON.stringify(conflict.localPayload),
              JSON.stringify(conflict.incomingPayload),
              conflict.createdAt,
              conflict.resolvedAt,
            ],
          );
        }
      });
    });
    // Plan 211 — THE TRAP: this call must sit here, after withOutboxSuppressed
    // has already exited (its `finally` reset suppress_outbox back to '0'
    // above), never inside it. mergeAndHealBooks tombstones books and
    // re-points accounts/invoices/clients by writing ordinary UPDATEs; if
    // those ran while suppression was still active, the outbox triggers
    // (`sync_outbox_*_update`, gated on `suppress_outbox <> '1'`) would not
    // fire, the tombstone/re-point would apply locally only, and the other
    // device would never converge — silently. Placed here, suppression is
    // already off, so these writes flow into sync_outbox exactly like any
    // other local mutation and push out on the next sync.
    await this.mergeAndHealBooks();
    await this.recomputeSqliteAccounts();
    await this.recomputeSqliteAssets();
  }

  override async importSnapshot(snapshot: RepositorySnapshot) {
    // Wrap everything in a single transaction so SQLite skips per-row fsync
    // (which is the dominant cost) and the whole import either lands or
    // rolls back. Without this a 60k-row dailyPrices payload would take
    // many minutes and feel like the app is frozen.
    //
    // Route through withTransaction() (not a raw BEGIN/COMMIT) so the whole
    // import claims the single connection exclusively. A raw BEGIN here would
    // interleave with a concurrent edit's BEGIN — the second BEGIN then fails
    // with "cannot start a transaction within a transaction", and a half-applied
    // import can strand an open transaction that locks the DB until restart.
    const t0 = performance.now();
    try {
      await this.withTransaction(async () => {
      await this.db.execute("delete from sync_outbox");
      await this.db.execute("delete from market_quotes");
      await this.db.execute("delete from fx_rates");
      await this.db.execute("delete from daily_prices");
      await this.db.execute("delete from manual_price_snapshots");
      await this.db.execute("delete from recurring_transactions");
      await this.db.execute("delete from recurring_investments");
      await this.db.execute("delete from investment_records");
      await this.db.execute("delete from ledger_transactions");
      await this.db.execute("delete from portfolio_assets");
      await this.db.execute("delete from accounts");
      await this.db.execute("delete from app_settings");
      await this.db.execute("delete from financial_goals");
      await this.db.execute("delete from invoices");
      await this.db.execute("delete from clients");
      await this.db.execute("delete from credit_groups");
      await this.db.execute("delete from books");
      console.debug("[import] cleared existing tables");

      for (const book of snapshot.books ?? []) await this.insertBookRow(book);
      console.debug(`[import] inserted ${(snapshot.books ?? []).length} books`);

      for (const client of snapshot.clients ?? []) await this.insertClientRow(client);
      console.debug(`[import] inserted ${(snapshot.clients ?? []).length} clients`);

      for (const group of snapshot.creditGroups ?? []) await this.insertCreditGroupRow(group);
      console.debug(`[import] inserted ${(snapshot.creditGroups ?? []).length} credit_groups`);

      for (const invoice of snapshot.invoices ?? []) await this.insertInvoiceRow(invoice);
      console.debug(`[import] inserted ${(snapshot.invoices ?? []).length} invoices`);

      for (const account of snapshot.accounts) await this.insertAccountRow(account);
      console.debug(`[import] inserted ${snapshot.accounts.length} accounts`);

      for (const asset of snapshot.portfolioAssets) {
        // Older backups (pre Phase 2/3) don't carry name_zh, name_en, or
        // account_id. Coalesce so insertAssetRow's prepared statement sees
        // explicit nulls instead of undefined.
        await this.insertAssetRow({
          ...asset,
          nameZh: asset.nameZh ?? null,
          nameEn: asset.nameEn ?? null,
          assetType: asset.assetType ?? null,
          sector: asset.sector ?? null,
          industry: asset.industry ?? null,
          // Older backups predate the canonical key; insertAssetRow derives it
          // from sector/industry when this is null.
          sectorCanonical: asset.sectorCanonical ?? null,
          accountId: asset.accountId ?? null,
        });
      }
      console.debug(`[import] inserted ${snapshot.portfolioAssets.length} portfolio_assets`);

      for (const row of snapshot.investmentRecords) await this.insertInvestmentRow(row);
      console.debug(`[import] inserted ${snapshot.investmentRecords.length} investment_records`);

      for (const row of snapshot.ledgerTransactions) {
        await this.insertLedgerRow({ ...row, name: row.name ?? row.merchant ?? "" });
      }
      console.debug(`[import] inserted ${snapshot.ledgerTransactions.length} ledger_transactions`);

      for (const row of snapshot.recurringTransactions) await this.insertRecurringRow(row);
      console.debug(`[import] inserted ${snapshot.recurringTransactions.length} recurring_transactions`);

      for (const row of snapshot.recurringInvestments ?? []) await this.insertRecurringInvestmentRow(row);
      console.debug(`[import] inserted ${(snapshot.recurringInvestments ?? []).length} recurring_investments`);

      if (snapshot.marketQuotes.length) {
        await this.saveMarketQuotes(snapshot.marketQuotes, snapshot.marketQuotes[0]?.source ?? "import");
        console.debug(`[import] saved ${snapshot.marketQuotes.length} market_quotes`);
      }
      if (snapshot.dailyFxRates.length) {
        await this.saveDailyFxRates(snapshot.dailyFxRates);
        console.debug(`[import] saved ${snapshot.dailyFxRates.length} fx_rates`);
      }
      if (snapshot.dailyPrices.length) {
        await this.saveDailyPrices(snapshot.dailyPrices);
        console.debug(`[import] saved ${snapshot.dailyPrices.length} daily_prices`);
      }
      if (snapshot.financialGoals?.length) {
        for (const goal of snapshot.financialGoals) {
          const now = nowIso();
          await this.db.execute(
            `insert into financial_goals (id, space_id, revision, created_at, updated_at, deleted_at, kind, name, currency,
               annual_spending, withdrawal_rate, expected_annual_return, monthly_contribution, target_amount, start_date,
               current_age, retirement_age, plan_through_age, pre_retirement_return, post_retirement_return,
               inflation_rate, annual_fee, contribution_growth_rate,
               spending_items, income_items, display_mode, account_share_map, target_date)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)`,
            [
              goal.id,
              goal.spaceId ?? personalSpace,
              goal.revision ?? 1,
              goal.createdAt ?? now,
              goal.updatedAt ?? now,
              goal.deletedAt ?? null,
              goal.kind ?? "fire",
              goal.name ?? "",
              goal.currency ?? "",
              goal.annualSpending ?? 0,
              goal.withdrawalRate ?? 0.04,
              goal.expectedAnnualReturn ?? 0.07,
              goal.monthlyContribution ?? 0,
              goal.targetAmount ?? null,
              goal.startDate ?? now.slice(0, 10),
              goal.currentAge ?? null,
              goal.retirementAge ?? null,
              goal.planThroughAge ?? null,
              goal.preRetirementReturn ?? null,
              goal.postRetirementReturn ?? null,
              goal.inflationRate ?? null,
              goal.annualFee ?? null,
              goal.contributionGrowthRate ?? null,
              JSON.stringify(goal.spendingItems ?? []),
              JSON.stringify(goal.incomeItems ?? []),
              goal.displayMode ?? "today",
              JSON.stringify(goal.accountShareMap ?? {}),
              goal.targetDate ?? null,
            ],
          );
        }
        console.debug(`[import] inserted ${snapshot.financialGoals.length} financial_goals`);
      }
      if (snapshot.manualPriceSnapshots?.length) {
        for (const row of snapshot.manualPriceSnapshots) {
          const now = nowIso();
          await this.db.execute(
            `insert into manual_price_snapshots (id, asset_id, date, price, note, created_at) values ($1,$2,$3,$4,$5,$6)`,
            [row.id, row.assetId ?? "", row.date ?? "", row.price ?? 0, row.note ?? "", row.createdAt ?? now],
          );
        }
        console.debug(`[import] inserted ${snapshot.manualPriceSnapshots.length} manual_price_snapshots`);
      }
      await this.updateAppSettings(snapshot.settings);
      await this.upsertSetting("__settingsMeta", JSON.stringify({
        revision: snapshot.settingsRevision ?? 1,
        updatedAt: snapshot.settingsUpdatedAt ?? nowIso(),
      }));
      });
      // A pre-books snapshot carries no books; guarantee the default 個人帳 and
      // assign any book-less imported account to it. (Outside the transaction —
      // withTransaction has already committed.)
      await this.ensureSqliteDefaultBook();
      // Plan 211 — an imported snapshot (restore, or a pre-books backup) can
      // itself carry duplicate untouched mints; converge them the same way a
      // sync pull would.
      await this.mergeAndHealBooks();
      // Recompute account balances from the just-imported ledger transactions
      // so two devices that had different transactions converge after sync.
      // (Outside the transaction — withTransaction has already committed.)
      await this.recomputeSqliteAccounts();
      await this.recomputeSqliteAssets();
      const elapsed = Math.round(performance.now() - t0);
      console.debug(`[import] complete in ${elapsed}ms`);
    } catch (error) {
      // withTransaction already issued ROLLBACK; just surface the failure.
      console.error("[import] failed, rolled back", error);
      throw error;
    }
  }

  private async seedSqlite() {
    for (const account of seedAccounts) await this.insertAccountRow(account);
    for (const asset of seedAssets) await this.insertAssetRow(asset);
    for (const record of seedInvestmentRecords) await this.insertInvestmentRow(record);
    for (const row of seedLedgerTransactions) await this.insertLedgerRow(row);
    for (const row of seedRecurringTransactions) {
      await this.insertRecurringRow(row);
    }
  }

  // ── Insert helpers ────────────────────────────────────────────────────────
  // All NOT NULL columns use defensive fallbacks. Records decrypted from the
  // relay may have been pushed by an older app version that didn't serialise
  // every field; JavaScript `undefined` is mapped to SQL NULL by plugin-sql,
  // which immediately violates NOT NULL constraints. Coalescing here means we
  // tolerate partial payloads and fill in the safest possible default rather
  // than aborting the entire import.
  //
  // Fields shared by all entities (SyncFields): spaceId, revision,
  // createdAt, updatedAt. Boolean-as-integer columns: Number(x ?? false)
  // guards against Number(undefined) = NaN.

  private async insertBookRow(row: Book) {
    const now = nowIso();
    await this.db.execute(
      `insert into books (id, space_id, revision, created_at, updated_at, deleted_at, name, kind, include_in_personal_net_worth, include_in_fire_metrics, color)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        row.id,
        row.spaceId ?? personalSpace,
        row.revision ?? 1,
        row.createdAt ?? now,
        row.updatedAt ?? now,
        row.deletedAt ?? null,
        row.name ?? "",
        (row.kind ?? "personal") as BookKind,
        Number(row.includeInPersonalNetWorth ?? true),
        Number(row.includeInFireMetrics ?? true),
        row.color ?? null,
      ],
    );
  }

  private async insertInvoiceRow(row: Invoice) {
    const now = nowIso();
    await this.db.execute(
      `insert into invoices (id, space_id, revision, created_at, updated_at, deleted_at, book_id, client_id, invoice_number, issue_date, due_date, amount, tax_exclusive_amount, tax_amount, settled_at, linked_ledger_transaction_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        row.id,
        row.spaceId ?? personalSpace,
        row.revision ?? 1,
        row.createdAt ?? now,
        row.updatedAt ?? now,
        row.deletedAt ?? null,
        row.bookId ?? "",
        row.clientId ?? null,
        row.invoiceNumber ?? "",
        row.issueDate ?? now,
        row.dueDate ?? null,
        row.amount ?? 0,
        row.taxExclusiveAmount ?? 0,
        row.taxAmount ?? 0,
        row.settledAt ?? null,
        row.linkedLedgerTransactionId ?? null,
      ],
    );
  }

  private async insertClientRow(row: Client) {
    const now = nowIso();
    await this.db.execute(
      `insert into clients (id, space_id, revision, created_at, updated_at, deleted_at, book_id, name, tax_id, default_payment_terms)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        row.id,
        row.spaceId ?? personalSpace,
        row.revision ?? 1,
        row.createdAt ?? now,
        row.updatedAt ?? now,
        row.deletedAt ?? null,
        row.bookId ?? "",
        row.name ?? "",
        row.taxId ?? "",
        row.defaultPaymentTerms ?? null,
      ],
    );
  }

  private async insertAccountRow(row: Account) {
    const now = nowIso();
    await this.db.execute(
      `insert into accounts (id, space_id, revision, created_at, updated_at, deleted_at, name, currency, opening_balance, balance, type, credit_limit, credit_limit_group, credit_group_id, is_shared_to_household, loan_start_date, annual_interest_rate, loan_term, icon_name, color, bank_brand_domain, statement_day, payment_due_day, credit_payment_paid_until, custom_group, book_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)`,
      [
        row.id,
        row.spaceId ?? personalSpace,
        row.revision ?? 1,
        row.createdAt ?? now,
        row.updatedAt ?? now,
        row.deletedAt ?? null,
        row.name ?? "",
        row.currency ?? "",
        row.openingBalance ?? 0,
        row.balance ?? 0,
        row.type ?? "checking",
        row.creditLimit ?? null,
        row.creditLimitGroup ?? "",
        row.creditGroupId ?? null,
        Number(row.isSharedToHousehold ?? false),
        row.loanStartDate ?? null,
        row.annualInterestRate ?? null,
        row.loanTerm ?? null,
        row.iconName ?? null,
        row.color ?? null,
        row.bankBrandDomain ?? null,
        row.statementDay ?? null,
        row.paymentDueDay ?? null,
        row.creditPaymentPaidUntil ?? null,
        row.customGroup ?? "",
        // Empty sentinel when a pre-books account arrives via import/sync;
        // ensureSqliteDefaultBook() (run after import) assigns the default book.
        row.bookId ?? "",
      ],
    );
  }

  private async insertCreditGroupRow(row: CreditGroup) {
    const now = nowIso();
    await this.db.execute(
      `insert into credit_groups (id, space_id, revision, created_at, updated_at, deleted_at, name, currency, credit_limit, statement_day, payment_due_day)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [
        row.id,
        row.spaceId ?? personalSpace,
        row.revision ?? 1,
        row.createdAt ?? now,
        row.updatedAt ?? now,
        row.deletedAt ?? null,
        row.name ?? "",
        row.currency ?? "",
        row.creditLimit ?? null,
        row.statementDay ?? null,
        row.paymentDueDay ?? null,
      ],
    );
  }

  private async insertAssetRow(row: PortfolioAsset) {
    const now = nowIso();
    await this.db.execute(
      `insert into portfolio_assets (id, space_id, revision, created_at, updated_at, deleted_at, ticker, name, name_zh, name_en, currency, total_quantity, average_cost, holding_source, acquisition_date, asset_type, sector, industry, sector_canonical, account_id, base_quantity, classification_locked)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
      [
        row.id,
        row.spaceId ?? personalSpace,
        row.revision ?? 1,
        row.createdAt ?? now,
        row.updatedAt ?? now,
        row.deletedAt ?? null,
        row.ticker ?? "",
        row.name ?? "",
        row.nameZh ?? null,
        row.nameEn ?? null,
        row.currency ?? "",
        row.totalQuantity ?? 0,
        row.averageCost ?? 0,
        row.holdingSource ?? "transactions",
        row.acquisitionDate ?? null,
        row.assetType ?? null,
        row.sector ?? null,
        row.industry ?? null,
        // Persist the canonical key; derive it from the raw values when the row
        // doesn't already carry one (e.g. older backups / sync rows).
        row.sectorCanonical ?? toCanonicalSector({ sector: row.sector, industry: row.industry }),
        row.accountId ?? null,
        row.baseQuantity ?? null,
        row.classificationLocked ? 1 : 0,
      ],
    );
  }

  private async insertLedgerRow(row: LedgerTransaction) {
    const now = nowIso();
    await this.db.execute(
      `insert into ledger_transactions (id, space_id, revision, created_at, updated_at, deleted_at, account_id, counter_account_id, date, name, amount, currency, original_amount, original_currency, category, subcategory, merchant, entry_type, settlement_status, note, linked_investment_record_id, group_id, is_reviewed, receipt_attachment_id, recurring_rule_id, recurring_occurrence_key, installment_group_id, installment_index, installment_total, refund_of_ledger_id, post_date, leg_kind)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32)`,
      [
        row.id,
        row.spaceId ?? personalSpace,
        row.revision ?? 1,
        row.createdAt ?? now,
        row.updatedAt ?? now,
        row.deletedAt ?? null,
        row.accountId ?? "",
        row.counterAccountId ?? null,
        row.date ?? "",
        row.name ?? "",
        row.amount ?? 0,
        row.currency ?? "",
        row.originalAmount ?? null,
        row.originalCurrency ?? null,
        row.category ?? "",
        row.subcategory ?? "",
        row.merchant ?? "",
        row.entryType ?? "expense",
        row.settlementStatus ?? "settled",
        row.note ?? "",
        row.linkedInvestmentRecordId ?? null,
        row.groupId ?? null,
        Number(row.isReviewed ?? false),
        row.receiptAttachmentId ?? null,
        row.recurringRuleId ?? null,
        row.recurringOccurrenceKey ?? null,
        row.installmentGroupId ?? null,
        row.installmentIndex ?? null,
        row.installmentTotal ?? null,
        row.refundOfLedgerId ?? null,
        row.postDate ?? null,
        row.legKind ?? null,
      ],
    );
  }

  private async insertRecurringRow(row: RecurringTransaction) {
    const now = nowIso();
    await this.db.execute(
      `insert into recurring_transactions (id, space_id, revision, created_at, updated_at, deleted_at, account_id, counter_account_id, amount, currency, category, subcategory, merchant, entry_type, settlement_status, note, frequency, day_of_month, next_run_date, is_active)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
      [
        row.id,
        row.spaceId ?? personalSpace,
        row.revision ?? 1,
        row.createdAt ?? now,
        row.updatedAt ?? now,
        row.deletedAt ?? null,
        row.accountId ?? "",
        row.counterAccountId ?? null,
        row.amount ?? 0,
        row.currency ?? "",
        row.category ?? "",
        row.subcategory ?? "",
        row.merchant ?? "",
        row.entryType ?? "expense",
        row.settlementStatus ?? "settled",
        row.note ?? "",
        row.frequency ?? "monthly",
        row.dayOfMonth ?? 1,
        row.nextRunDate ?? "",
        Number(row.isActive ?? true),
      ],
    );
  }

  private async insertRecurringInvestmentRow(row: RecurringInvestment) {
    const now = nowIso();
    await this.db.execute(
      `insert into recurring_investments (id, space_id, revision, created_at, updated_at, deleted_at, account_id, ticker, name, currency, mode, amount, quantity, price, fee, frequency, day_of_month, next_run_date, is_active)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [
        row.id,
        row.spaceId ?? personalSpace,
        row.revision ?? 1,
        row.createdAt ?? now,
        row.updatedAt ?? now,
        row.deletedAt ?? null,
        row.accountId ?? "",
        row.ticker ?? "",
        row.name ?? "",
        row.currency ?? "",
        row.mode ?? "fixedAmount",
        row.amount ?? 0,
        row.quantity ?? 0,
        row.price ?? 0,
        row.fee ?? 0,
        row.frequency ?? "monthly",
        row.dayOfMonth ?? 1,
        row.nextRunDate ?? "",
        Number(row.isActive ?? true),
      ],
    );
  }

  private async insertInvestmentRow(row: InvestmentRecord) {
    const now = nowIso();
    await this.db.execute(
      `insert into investment_records (id, space_id, revision, created_at, updated_at, deleted_at, asset_id, linked_account_id, date, action, price, quantity, fee, note, is_reviewed, linked_ledger_transaction_id, cashless, drip_group_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [
        row.id,
        row.spaceId ?? personalSpace,
        row.revision ?? 1,
        row.createdAt ?? now,
        row.updatedAt ?? now,
        row.deletedAt ?? null,
        row.assetId ?? "",
        row.linkedAccountId ?? null,
        row.date ?? "",
        row.action ?? "buy",
        row.price ?? 0,
        row.quantity ?? 0,
        row.fee ?? 0,
        row.note ?? "",
        Number(row.isReviewed ?? false),
        row.linkedLedgerTransactionId ?? null,
        Number(row.cashless ?? false),
        row.dripGroupId ?? null,
      ],
    );
  }

  private async insertGoalRow(goal: FinancialGoal) {
    const now = nowIso();
    await this.db.execute(
      `insert into financial_goals (id, space_id, revision, created_at, updated_at, deleted_at, kind, name, currency,
         annual_spending, withdrawal_rate, expected_annual_return, monthly_contribution, target_amount, start_date,
         current_age, retirement_age, plan_through_age, pre_retirement_return, post_retirement_return,
         inflation_rate, annual_fee, contribution_growth_rate, spending_items, income_items, display_mode, account_share_map,
         target_date)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)`,
      [
        goal.id,
        goal.spaceId ?? personalSpace,
        goal.revision ?? 1,
        goal.createdAt ?? now,
        goal.updatedAt ?? now,
        goal.deletedAt ?? null,
        goal.kind ?? "fire",
        goal.name ?? "",
        goal.currency ?? "",
        goal.annualSpending ?? 0,
        goal.withdrawalRate ?? 0.04,
        goal.expectedAnnualReturn ?? 0.07,
        goal.monthlyContribution ?? 0,
        goal.targetAmount ?? null,
        goal.startDate ?? now.slice(0, 10),
        goal.currentAge ?? null,
        goal.retirementAge ?? null,
        goal.planThroughAge ?? null,
        goal.preRetirementReturn ?? null,
        goal.postRetirementReturn ?? null,
        goal.inflationRate ?? null,
        goal.annualFee ?? null,
        goal.contributionGrowthRate ?? null,
        JSON.stringify(goal.spendingItems ?? []),
        JSON.stringify(goal.incomeItems ?? []),
        goal.displayMode ?? "today",
        JSON.stringify(goal.accountShareMap ?? {}),
        goal.targetDate ?? null,
      ],
    );
  }

  private async findSqliteTransactionAssetId(input: InvestmentDraft) {
    const ticker = input.ticker.trim().toUpperCase();
    const rows = await this.db.select<Array<{ id: string }>>(
      `select id from portfolio_assets where ticker = $1 and holding_source = 'transactions' and deleted_at is null limit 1`,
      [ticker],
    );
    return rows[0]?.id;
  }

  // Decision A (SQLite mirror): same-ticker manual holding, preferring a row
  // whose account_id matches the trade's account, then an account-less import.
  // Mirrors the browser findManualAsset preference order exactly.
  private async findSqliteManualAsset(ticker: string, accountId: string | null) {
    const rows = await this.db.select<Array<{ id: string; accountId: string | null }>>(
      `select id, account_id as accountId from portfolio_assets where ticker = $1 and holding_source = 'manual' and deleted_at is null`,
      [ticker],
    );
    return rows.find((row) => row.accountId === accountId) ?? rows.find((row) => row.accountId === null);
  }

  private async findOrCreateSqliteAsset(input: InvestmentDraft) {
    const ticker = input.ticker.trim().toUpperCase();
    // Prefer a same-ticker manual holding over reusing/creating a transaction
    // asset, so trades accumulate into ONE asset (matches browser order).
    const manualAsset = await this.findSqliteManualAsset(ticker, input.linkedAccountId ?? null);
    if (manualAsset) {
      // Account adoption: an account-less import takes on the trade's account
      // and re-points its cashless opening record so per-account available
      // quantity stays correct.
      if (manualAsset.accountId === null && input.linkedAccountId) {
        await this.db.execute(`update portfolio_assets set account_id = $1, updated_at = $2, revision = revision + 1 where id = $3`, [
          input.linkedAccountId,
          nowIso(),
          manualAsset.id,
        ]);
        await this.db.execute(
          `update investment_records set linked_account_id = $1, updated_at = $2, revision = revision + 1 where id = $3 and deleted_at is null`,
          [input.linkedAccountId, nowIso(), openingRecordId(manualAsset.id)],
        );
      }
      return manualAsset.id;
    }
    const existingId = await this.findSqliteTransactionAssetId(input);
    if (existingId) return existingId;
    const timestamp = nowIso();
    const asset: PortfolioAsset = {
      id: createId("asset"),
      spaceId: personalSpace,
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
      ticker,
      name: input.name || ticker,
      nameZh: null,
      nameEn: null,
      currency: input.currency,
      totalQuantity: 0,
      averageCost: 0,
      holdingSource: "transactions",
      acquisitionDate: null,
      ...assetClassificationFields(input),
      accountId: null,
      baseQuantity: null,
    };
    await this.insertAssetRow(asset);
    return asset.id;
  }

  private async validateSqliteInvestmentDraft(
    input: InvestmentDraft,
    assetId: string | undefined,
    options: { excludeRecordId?: string; excludeLedgerId?: string | null } = {},
  ) {
    const accountRows = await this.db.select<Account[]>(`select
      id, space_id as spaceId, revision, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt,
      name, currency, opening_balance as openingBalance, balance, type, credit_limit as creditLimit, credit_limit_group as creditLimitGroup, is_shared_to_household as isSharedToHousehold, custom_group as customGroup
      from accounts where id = $1 and deleted_at is null`, [input.linkedAccountId ?? ""]);
    const account = accountRows[0];
    if (!account || account.type !== "investment") throw new Error("請選擇投資帳戶。");
    if (input.currency.trim().toUpperCase() !== account.currency.trim().toUpperCase()) throw new Error("交易幣別必須與投資帳戶一致。");

    if (input.action === "sell") {
      if (!assetId) throw new Error("賣出股數大於目前庫存。");
      const records = await this.listInvestmentRecords();
      // Manual holdings carry their opening lot as a record in the same account,
      // so available quantity is the per-account record sum for both kinds.
      const available = calculateInvestmentAccountQuantity(records, assetId, account.id, options.excludeRecordId);
      if (input.quantity > available + 0.000001) throw new Error(`賣出股數大於目前庫存，可賣出 ${available} 股。`);
    }

    // Cashless opening lots never settle cash, so purchasing power is irrelevant.
    if (input.cashless) return;
    const cashDelta = calculateInvestmentCashDelta(input);
    if (cashDelta >= 0) return;
    if (allowsTwdTPlus2Buffer(input, account.currency)) return;
    const ledgerRows = await this.db.select<LedgerTransaction[]>(`select
      id, space_id as spaceId, revision, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt,
      account_id as accountId, counter_account_id as counterAccountId, date, name, amount, currency, category, subcategory, merchant, entry_type as entryType, settlement_status as settlementStatus, note, linked_investment_record_id as linkedInvestmentRecordId,
      group_id as groupId, is_reviewed as isReviewed, receipt_attachment_id as receiptAttachmentId
      from ledger_transactions where account_id = $1 or counter_account_id = $1`, [account.id]);
    const baseBalance = computeAccountBalance(account, ledgerRows, options.excludeLedgerId ?? null);
    const nextBalance = baseBalance + cashDelta;
    if (isEffectivelyNegative(nextBalance)) throw new Error(`購買力不足，目前餘額 ${formatPlainAmount(baseBalance)} ${account.currency}。`);
  }

  /**
   * DDL for the sync outbox infrastructure: the runtime-flags table, the
   * conflicts table, the unique index, and the 22 outbox-enqueue triggers — all
   * `if not exists`, so this is safe to skip once already applied (plan 268).
   * The two `sync_outbox` columns this used to add here have moved into
   * `ADDITIVE_COLUMNS` (runSchemaDdl runs them before this). Nothing row-touching
   * belongs in this method — see runSchemaDdl()'s doc comment.
   */
  private async ensureSyncTriggers() {
    await this.db.execute(`create unique index if not exists idx_sync_outbox_record_revision on sync_outbox (record_type, record_id, revision)`);
    await this.db.execute(`create table if not exists sync_runtime_flags (key text primary key, value text not null)`);
    await this.db.execute(`insert or ignore into sync_runtime_flags (key, value) values ('suppress_outbox', '0')`);
    await this.db.execute(`create table if not exists sync_conflicts (
      id text primary key,
      entity text not null,
      entity_id text not null,
      revision integer not null,
      source_device_id text not null,
      local_payload text not null,
      incoming_payload text not null,
      created_at text not null,
      resolved_at text
    )`);
    for (const [table, entity] of SYNC_TRIGGER_ENTITIES) {
      await this.db.execute(`create trigger if not exists sync_outbox_${entity}_insert
        after insert on ${table}
        when coalesce((select value from sync_runtime_flags where key = 'suppress_outbox'), '0') <> '1'
        begin
          insert or ignore into sync_outbox
            (id, space_id, record_type, record_id, revision, created_at, updated_at, deleted_at)
          values
            ('${entity}:' || new.id || ':' || new.revision, new.space_id, '${entity}', new.id, new.revision, new.updated_at, new.updated_at, new.deleted_at);
        end`);
      await this.db.execute(`create trigger if not exists sync_outbox_${entity}_update
        after update on ${table}
        when new.revision <> old.revision
          and coalesce((select value from sync_runtime_flags where key = 'suppress_outbox'), '0') <> '1'
        begin
          insert or ignore into sync_outbox
            (id, space_id, record_type, record_id, revision, created_at, updated_at, deleted_at)
          values
            ('${entity}:' || new.id || ':' || new.revision, new.space_id, '${entity}', new.id, new.revision, new.updated_at, new.updated_at, new.deleted_at);
        end`);
    }
  }

  private async withOutboxSuppressed<T>(operation: () => Promise<T>): Promise<T> {
    await this.db.execute(`update sync_runtime_flags set value = '1' where key = 'suppress_outbox'`);
    try {
      return await operation();
    } finally {
      await this.db.execute(`update sync_runtime_flags set value = '0' where key = 'suppress_outbox'`);
    }
  }

  private async isOutboxSuppressed() {
    const rows = await this.db.select<Array<{ value: string }>>(
      `select value from sync_runtime_flags where key = 'suppress_outbox'`,
    );
    return rows[0]?.value === "1";
  }

  private async queueSettingsSync(revision: number, updatedAt: string) {
    if (await this.isOutboxSuppressed()) return;
    await this.db.execute(
      `insert or ignore into sync_outbox
       (id, space_id, record_type, record_id, revision, created_at, updated_at, deleted_at)
       values ($1,$2,'settings','app_settings',$3,$4,$4,null)`,
      [`settings:app_settings:${revision}`, personalSpace, revision, updatedAt],
    );
  }

  private async bumpSqliteSettingsRevision() {
    const metaRows = await this.db.select<Array<{ value: string }>>(`select value from app_settings where key = '__settingsMeta'`);
    const meta = metaRows[0] ? JSON.parse(metaRows[0].value) : { revision: 0 };
    const nextMeta = { revision: (meta.revision ?? 0) + 1, updatedAt: nowIso() };
    await this.upsertSetting("__settingsMeta", JSON.stringify(nextMeta));
    await this.queueSettingsSync(nextMeta.revision, nextMeta.updatedAt);
  }

  private async backfillSyncOutbox() {
    for (const [table, entity] of SYNC_TRIGGER_ENTITIES) {
      await this.db.execute(
        `insert or ignore into sync_outbox
         (id, space_id, record_type, record_id, revision, created_at, updated_at, deleted_at)
         select '${entity}:' || id || ':' || revision, space_id, '${entity}', id, revision, updated_at, updated_at, deleted_at
         from ${table}`,
      );
    }
    const metaRows = await this.db.select<Array<{ value: string }>>(`select value from app_settings where key = '__settingsMeta'`);
    if (!metaRows[0]) return;
    const meta = JSON.parse(metaRows[0].value);
    await this.queueSettingsSync(meta.revision ?? 1, meta.updatedAt ?? nowIso());
  }

  private async applySqliteSyncChange(change: SyncApplyChange) {
    const payload = change.payload;
    if (change.entity === "settings") {
      if (payload.settings) {
        const settings = normalizeSettings(payload.settings as AppSettings);
        await this.upsertSetting("primaryCurrency", settings.primaryCurrency);
        await this.upsertSetting("categories", JSON.stringify(settings.categories));
        await this.upsertSetting("merchants", JSON.stringify(settings.merchants));
        await this.upsertSetting("exchangeRates", JSON.stringify(settings.exchangeRates));
      }
      await this.upsertSetting("__settingsMeta", JSON.stringify({
        revision: Number(payload.revision ?? 1),
        updatedAt: String(payload.updatedAt ?? nowIso()),
      }));
      return;
    }
    const tableByEntity: Record<Exclude<SyncEntity, "settings">, string> = {
      account: "accounts",
      ledger: "ledger_transactions",
      asset: "portfolio_assets",
      investment: "investment_records",
      recurring: "recurring_transactions",
      recurringInvestment: "recurring_investments",
      goal: "financial_goals",
      book: "books",
      invoice: "invoices",
      client: "clients",
      creditGroup: "credit_groups",
    };
    await this.db.execute(`delete from ${tableByEntity[change.entity]} where id = $1`, [String(payload.id)]);
    switch (change.entity) {
      case "account": await this.insertAccountRow(payload as unknown as Account); break;
      case "ledger": {
        const incoming = payload as unknown as LedgerTransaction;
        const key = incoming.recurringOccurrenceKey;
        if (key && !incoming.deletedAt) {
          const dupes = await this.db.select<Array<{ id: string }>>(
            `select id from ledger_transactions
             where recurring_occurrence_key = $1 and deleted_at is null and id <> $2`,
            [key, incoming.id],
          );
          if (dupes.length > 0) {
            const existingId = dupes[0].id;
            const winner = [existingId, incoming.id].sort()[0];
            const now = nowIso();
            if (winner === incoming.id) {
              await this.db.execute(
                `update ledger_transactions set deleted_at = $1, updated_at = $1, revision = revision + 1 where id = $2`,
                [now, existingId],
              );
            } else {
              incoming.deletedAt = incoming.deletedAt ?? now;
            }
          }
        }
        await this.insertLedgerRow(incoming);
        break;
      }
      case "asset": await this.insertAssetRow(payload as unknown as PortfolioAsset); break;
      case "investment": await this.insertInvestmentRow(payload as unknown as InvestmentRecord); break;
      case "recurring": await this.insertRecurringRow(payload as unknown as RecurringTransaction); break;
      case "recurringInvestment": await this.insertRecurringInvestmentRow(payload as unknown as RecurringInvestment); break;
      case "goal": await this.insertGoalRow(payload as unknown as FinancialGoal); break;
      case "book": await this.insertBookRow(payload as unknown as Book); break;
      case "invoice": await this.insertInvoiceRow(payload as unknown as Invoice); break;
      case "client": await this.insertClientRow(payload as unknown as Client); break;
      case "creditGroup": await this.insertCreditGroupRow(payload as unknown as CreditGroup); break;
    }
  }

  /**
   * Cache of `pragma table_info` results, keyed by table. The 64
   * ensureSqliteColumn() calls in initialize() cover only 7 distinct tables, so
   * probing per column cost 64 serialized IPC round trips where 7 suffice
   * (plan 268). Populated lazily; invalidated for a table whenever we add a
   * column to it, so the cache can never go stale within a run.
   */
  private tableColumnsCache = new Map<string, Set<string>>();

  private async readTableColumns(table: string): Promise<Set<string>> {
    const cached = this.tableColumnsCache.get(table);
    if (cached) return cached;
    const rows = await this.db.select<Array<{ name: string }>>(`pragma table_info(${table})`);
    const columns = new Set(rows.map((row) => row.name));
    this.tableColumnsCache.set(table, columns);
    return columns;
  }

  private async ensureSqliteColumn(table: string, column: string, definition: string) {
    const columns = await this.readTableColumns(table);
    if (columns.has(column)) return;
    await this.db.execute(`alter table ${table} add column ${column} ${definition}`);
    columns.add(column);
  }

  private async readSchemaFingerprint(): Promise<number> {
    try {
      const rows = await this.db.select<Array<{ user_version: number }>>("PRAGMA user_version;");
      return Number(rows?.[0]?.user_version ?? 0) || 0;
    } catch {
      // Unreadable pragma → treat as "never stamped" and run the full DDL phase.
      // Never skip on uncertainty.
      return 0;
    }
  }

  private async writeSchemaFingerprint(fingerprint: number): Promise<void> {
    // PRAGMA does not accept bound parameters; the value is a locally-computed
    // integer, never user input.
    await this.db.execute(`PRAGMA user_version = ${Math.trunc(fingerprint)};`);
  }

  /**
   * Plan 254/255 Step 9 — SQLite twin of `backfillCreditGroupsInMemory`. Runs
   * ordinary INSERT/UPDATE statements (not wrapped in `withOutboxSuppressed`)
   * so the sync_outbox triggers (already created by `ensureSyncInfrastructure`
   * above) fire normally — the new credit_groups rows and the accounts'
   * credit_group_id updates MUST propagate to other devices (reviewer
   * correction; do not suppress). See `planCreditGroupBackfill` for the
   * idempotent grouping/tie-break/currency-mismatch logic shared with the
   * browser repo.
   */
  private async backfillCreditGroups() {
    const candidates = await this.db.select<CreditGroupBackfillCandidate[]>(
      `select id, currency, credit_limit_group as creditLimitGroup, statement_day as statementDay,
         payment_due_day as paymentDueDay, credit_limit as creditLimit, updated_at as updatedAt
       from accounts
       where deleted_at is null and type = 'credit' and credit_group_id is null
         and credit_limit_group is not null and credit_limit_group <> ''`,
    );
    if (candidates.length === 0) return;
    const existingGroups = await this.db.select<Array<{ id: string; name: string }>>(
      `select id, name from credit_groups where deleted_at is null`,
    );
    const plan = planCreditGroupBackfill(candidates, existingGroups);
    for (const name of plan.skipped) {
      console.warn(`[backfillCreditGroups] skipped "${name}": members disagree on currency, a shared bill can't span currencies.`);
    }
    const memberIdToGroupId = new Map<string, string>();
    for (const group of plan.groupsToCreate) {
      const timestamp = nowIso();
      const id = createId("creditGroup");
      await this.db.execute(
        `insert into credit_groups (id, space_id, revision, created_at, updated_at, deleted_at, name, currency, credit_limit, statement_day, payment_due_day)
         values ($1,$2,1,$3,$3,null,$4,$5,$6,$7,$8)`,
        [id, personalSpace, timestamp, group.name, group.currency, group.creditLimit, group.statementDay, group.paymentDueDay],
      );
      for (const memberId of group.memberIds) memberIdToGroupId.set(memberId, id);
    }
    for (const group of plan.groupsToReuse) {
      for (const memberId of group.memberIds) memberIdToGroupId.set(memberId, group.groupId);
    }
    if (memberIdToGroupId.size === 0) return;
    const timestamp = nowIso();
    for (const [accountId, groupId] of memberIdToGroupId) {
      await this.db.execute(
        `update accounts set revision = revision + 1, updated_at = $1, credit_group_id = $2 where id = $3`,
        [timestamp, groupId, accountId],
      );
    }
  }

  /**
   * Ensure a sentinel "Unassigned" account exists, then point any pre-existing
   * manual holdings and investment records that lack an account to it.
   *
   * Runs every initialize() pass but is idempotent — if every row already has
   * an account_id, nothing changes.
   */
  private async backfillUnassignedAccount() {
    const orphanAssets = await this.db.select<Array<{ count: number }>>(
      `select count(*) as count from portfolio_assets
       where holding_source = 'manual' and account_id is null and deleted_at is null`,
    );
    const orphanRecords = await this.db.select<Array<{ count: number }>>(
      `select count(*) as count from investment_records
       where linked_account_id is null and deleted_at is null`,
    );
    const needsAccount = (orphanAssets[0]?.count ?? 0) > 0 || (orphanRecords[0]?.count ?? 0) > 0;
    if (!needsAccount) return;

    const accountId = await this.ensureUnassignedAccount();

    if ((orphanAssets[0]?.count ?? 0) > 0) {
      await this.db.execute(
        `update portfolio_assets set account_id = $1, updated_at = $2
         where holding_source = 'manual' and account_id is null and deleted_at is null`,
        [accountId, nowIso()],
      );
    }
    if ((orphanRecords[0]?.count ?? 0) > 0) {
      await this.db.execute(
        `update investment_records set linked_account_id = $1, updated_at = $2
         where linked_account_id is null and deleted_at is null`,
        [accountId, nowIso()],
      );
      await this.recomputeSqliteAccounts();
    }
  }

  private async ensureUnassignedAccount(): Promise<string> {
    const existing = await this.db.select<Array<{ id: string }>>(
      `select id from accounts where type = 'investment' and name = $1 and deleted_at is null limit 1`,
      [unassignedAccountName],
    );
    if (existing[0]?.id) return existing[0].id;

    const id = createId("acct");
    const timestamp = nowIso();
    // ensureSqliteDefaultBook() runs before this in initialize(), so assign the
    // default book directly rather than leaving the '' sentinel (which nothing
    // downstream would re-resolve for a fresh Unassigned account).
    const bookId = await this.ensureSqliteDefaultBook();
    await this.db.execute(
      `insert into accounts (id, space_id, revision, created_at, updated_at, deleted_at, name, currency, opening_balance, balance, type, credit_limit, credit_limit_group, is_shared_to_household, book_id)
       values ($1,$2,1,$3,$3,null,$4,$5,0,0,$6,null,'',0,$7)`,
      [id, personalSpace, timestamp, unassignedAccountName, "TWD", "investment", bookId],
    );
    return id;
  }

  private async ensureDefaultSettings() {
    const rows = await this.db.select<Array<{ count: number }>>("select count(*) as count from app_settings");
    if ((rows[0]?.count ?? 0) > 0) return;
    await this.updateAppSettings(defaultSettings);
  }

  private async upsertSetting(key: string, value: string) {
    await this.db.execute(
      `insert into app_settings (key, value, updated_at) values ($1,$2,$3)
       on conflict(key) do update set value = excluded.value, updated_at = excluded.updated_at`,
      [key, value, nowIso()],
    );
  }

  private async recomputeSqliteAccounts() {
    const accounts = await this.db.select<Account[]>(`select
      id, space_id as spaceId, revision, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt,
      name, currency, opening_balance as openingBalance, balance, type, credit_limit as creditLimit, credit_limit_group as creditLimitGroup, is_shared_to_household as isSharedToHousehold
      from accounts`);
    // deriveAccountBalances (recomputeAccounts) skips tombstoned ledger rows, so
    // filtering them in SQL yields an identical derivation while avoiding a
    // full-table load (every tombstone included) on the serialized connection.
    const ledger = await this.db.select<LedgerTransaction[]>(`select
      id, space_id as spaceId, revision, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt,
      account_id as accountId, counter_account_id as counterAccountId, date, name, amount, currency, original_amount as originalAmount, original_currency as originalCurrency,
      category, subcategory, merchant, entry_type as entryType, settlement_status as settlementStatus, note, linked_investment_record_id as linkedInvestmentRecordId,
      group_id as groupId, is_reviewed as isReviewed, receipt_attachment_id as receiptAttachmentId, recurring_occurrence_key as recurringOccurrenceKey
      from ledger_transactions where deleted_at is null`);
    // Only write accounts whose balance actually changed — most mutations touch a
    // handful of accounts, not every account in the file.
    const before = new Map(accounts.map((a) => [a.id, a.balance]));
    for (const account of recomputeAccounts(accounts, ledger)) {
      if (before.get(account.id) === account.balance) continue;
      await this.db.execute(`update accounts set balance = $1 where id = $2`, [account.balance, account.id]);
    }
  }

  private async recomputeSqliteAssets() {
    const assets = await this.listPortfolioAssets();
    const records = await this.listInvestmentRecords();
    // Membership set built once (was an O(assets × records) `records.some(...)`
    // scan per asset). Mirrors the prior predicate exactly: an asset is written
    // iff at least one record references it, tombstoned or not.
    const assetIdsWithRecords = new Set(records.map((r) => r.assetId));
    const before = new Map(assets.map((a) => [a.id, a] as const));
    for (const asset of recomputeAssets(assets, records)) {
      // Manual holdings now carry their opening lot as a record, so every asset
      // with records persists both derived quantity AND blended average cost.
      // Skip assets with no records (manual snapshot pre-migration edge).
      if (!assetIdsWithRecords.has(asset.id)) continue;
      // Skip no-op writes. Derived quantity/cost come straight from the loaded
      // record math, so an unchanged asset round-trips to the identical value;
      // Object.is keeps a NaN self-compare from masquerading as "unchanged".
      const prev = before.get(asset.id);
      if (prev && Object.is(prev.totalQuantity, asset.totalQuantity) && Object.is(prev.averageCost, asset.averageCost)) continue;
      await this.db.execute(`update portfolio_assets set total_quantity = $1, average_cost = $2 where id = $3`, [asset.totalQuantity, asset.averageCost, asset.id]);
    }
  }
}

function normalizeSqliteSyncPayload(entity: SyncEntity, row: Record<string, unknown>): Record<string, unknown> {
  const payload = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
      value,
    ]),
  );
  if (entity === "account") payload.isSharedToHousehold = Boolean(payload.isSharedToHousehold);
  if (entity === "ledger") payload.isReviewed = Boolean(payload.isReviewed);
  if (entity === "investment") {
    payload.isReviewed = Boolean(payload.isReviewed);
    payload.cashless = Boolean(payload.cashless);
  }
  if (entity === "recurring") payload.isActive = Boolean(payload.isActive);
  if (entity === "recurringInvestment") payload.isActive = Boolean(payload.isActive);
  if (entity === "book") {
    payload.includeInPersonalNetWorth = Boolean(payload.includeInPersonalNetWorth);
    payload.includeInFireMetrics = Boolean(payload.includeInFireMetrics);
  }
  if (entity === "goal") {
    payload.spendingItems = parseJsonValue(payload.spendingItems, []);
    payload.incomeItems = parseJsonValue(payload.incomeItems, []);
    payload.accountShareMap = parseJsonValue(payload.accountShareMap, {});
  }
  return payload;
}

function parseJsonValue<T>(value: unknown, fallback: T): T {
  if (typeof value !== "string") return (value as T) ?? fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function createInitialData(): RepositoryData {
  const now = nowIso();
  return {
    books: [],
    invoices: [],
    clients: [],
    creditGroups: [],
    accounts: [...seedAccounts],
    ledgerTransactions: [...seedLedgerTransactions],
    portfolioAssets: [...seedAssets],
    investmentRecords: [...seedInvestmentRecords],
    recurringTransactions: [...seedRecurringTransactions],
    recurringInvestments: [],
    marketQuotes: [] as StoredMarketQuote[],
    settings: defaultSettings,
    settingsRevision: 1,
    settingsUpdatedAt: now,
    dailyFxRates: [] as DailyFxRate[],
    dailyPrices: [] as DailyPrice[],
    financialGoals: [],
    manualPriceSnapshots: [],
    syncConflicts: [],
  };
}

/**
 * Decision B (browser): reconcile a ticker that was split into BOTH a manual
 * (imported) asset and one or more transaction assets — the historical result of
 * the account-scoped resolution gap. Move the transaction assets' records onto
 * the manual asset and tombstone the now-empty transaction assets, collapsing
 * the position into one row with a single blended moving-average cost (the
 * cost-basis math in buildPositionMetrics is unchanged).
 *
 * Idempotent: once a ticker has a single surviving asset, there is no
 * manual+transaction pair left, so a second run is a no-op. Same-ticker only —
 * GOOG and GOOGL are different securities and never merge.
 */
function reconcileDuplicateAssets(
  assets: PortfolioAsset[],
  records: InvestmentRecord[],
): { assets: PortfolioAsset[]; records: InvestmentRecord[] } {
  const byTicker = new Map<string, PortfolioAsset[]>();
  for (const asset of assets) {
    if (asset.deletedAt !== null) continue;
    const list = byTicker.get(asset.ticker);
    if (list) list.push(asset);
    else byTicker.set(asset.ticker, [asset]);
  }

  const tombstoned = new Set<string>();
  // assetId remap: transaction asset id -> canonical manual asset id.
  const remap = new Map<string, string>();
  for (const group of byTicker.values()) {
    // Canonical manual asset = lowest id (lexicographic), matching the SQLite
    // mirror's `min(id)`. Only diverges when a ticker has >1 manual asset, but
    // keeps browser ≡ SQLite reconciliation deterministic.
    const manual = group
      .filter((asset) => asset.holdingSource === "manual")
      .reduce<PortfolioAsset | undefined>((lowest, asset) => (!lowest || asset.id < lowest.id ? asset : lowest), undefined);
    if (!manual) continue; // no manual holding for this ticker → nothing to adopt into
    const transactionAssets = group.filter((asset) => asset.holdingSource === "transactions");
    if (transactionAssets.length === 0) continue; // already a single (manual) row → no-op
    for (const txAsset of transactionAssets) {
      remap.set(txAsset.id, manual.id);
      tombstoned.add(txAsset.id);
    }
  }

  if (remap.size === 0) return { assets, records }; // idempotent fast path

  const timestamp = nowIso();
  const nextRecords = records.map((record) => {
    const target = remap.get(record.assetId);
    return target ? { ...record, assetId: target, updatedAt: timestamp, revision: record.revision + 1 } : record;
  });
  const nextAssets = assets.map((asset) =>
    tombstoned.has(asset.id) ? { ...asset, deletedAt: timestamp, updatedAt: timestamp, revision: asset.revision + 1 } : asset,
  );
  return { assets: nextAssets, records: nextRecords };
}

/**
 * Default `cashless` on legacy records and ensure every manual holding owns its
 * opening-balance lot. Deterministic id (`inv_open_<assetId>`) makes this
 * idempotent across reloads and safe under sync (no duplicate openings).
 */
function materializeOpeningRecords(assets: PortfolioAsset[], records: InvestmentRecord[]): InvestmentRecord[] {
  const normalized = records.map((row) => ({ ...row, cashless: row.cashless ?? false }));
  const existingIds = new Set(normalized.map((row) => row.id));
  for (const asset of assets) {
    if (asset.holdingSource !== "manual" || asset.deletedAt !== null) continue;
    if (existingIds.has(openingRecordId(asset.id))) continue;
    normalized.push(buildOpeningRecord(asset, {
      ticker: asset.ticker,
      name: asset.name,
      currency: asset.currency,
      totalQuantity: asset.baseQuantity ?? asset.totalQuantity,
      averageCost: asset.averageCost,
      acquisitionDate: asset.acquisitionDate,
      accountId: asset.accountId,
    }));
  }
  return normalized;
}

/**
 * Data repair for the opening-lot cash leak: editing an opening lot used to
 * silently create a settled ledger row against it (see updateInvestmentRecord
 * history). A cashless record must never carry a linked settled ledger leg —
 * tombstone any such leg and clear the record's link so `recompute()` derives
 * account balances without the erroneous cash movement. Idempotent: once a
 * cashless record has no linked ledger row, it matches nothing here.
 */
function repairCashlessLedgerLegs(ledger: LedgerTransaction[], records: InvestmentRecord[]): { ledger: LedgerTransaction[]; records: InvestmentRecord[] } {
  const cashlessRecordIds = new Set(records.filter((record) => record.cashless).map((record) => record.id));
  if (cashlessRecordIds.size === 0) return { ledger, records };
  let changed = false;
  const nextLedger = ledger.map((row) => {
    if (row.deletedAt !== null) return row;
    if (!row.linkedInvestmentRecordId || !cashlessRecordIds.has(row.linkedInvestmentRecordId)) return row;
    changed = true;
    return bump({ ...row, deletedAt: nowIso() });
  });
  if (!changed) return { ledger, records };
  const healedRecordIds = new Set(
    nextLedger.filter((row) => row.deletedAt !== null && row.linkedInvestmentRecordId && cashlessRecordIds.has(row.linkedInvestmentRecordId)).map((row) => row.linkedInvestmentRecordId as string),
  );
  const nextRecords = records.map((record) =>
    record.cashless && record.linkedLedgerTransactionId && healedRecordIds.has(record.id)
      ? bump({ ...record, linkedLedgerTransactionId: null })
      : record,
  );
  return { ledger: nextLedger, records: nextRecords };
}

function normalizeStoredData(data: Partial<RepositoryData>): RepositoryData {
  const normalizedAssets = (data.portfolioAssets ?? []).map(normalizePortfolioAsset);
  // Collapse any historical manual+transaction split for a ticker into one asset
  // BEFORE materializing opening lots, so the surviving manual asset is the one
  // that carries the opening record. Idempotent (see reconcileDuplicateAssets).
  const reconciled = reconcileDuplicateAssets(normalizedAssets, data.investmentRecords ?? []);
  const portfolioAssets = reconciled.assets;
  const materializedRecords = materializeOpeningRecords(portfolioAssets, reconciled.records);
  const repaired = repairCashlessLedgerLegs(data.ledgerTransactions ?? [], materializedRecords);
  return {
    books: (data.books ?? []).map((book) => ({ ...book, color: book.color ?? null })),
    invoices: (data.invoices ?? []).map((invoice) => ({
      ...invoice,
      clientId: invoice.clientId ?? null,
      dueDate: invoice.dueDate ?? null,
      settledAt: invoice.settledAt ?? null,
      linkedLedgerTransactionId: invoice.linkedLedgerTransactionId ?? null,
    })),
    clients: (data.clients ?? []).map((client) => ({
      ...client,
      taxId: client.taxId ?? "",
      defaultPaymentTerms: client.defaultPaymentTerms ?? null,
    })),
    creditGroups: (data.creditGroups ?? []).map((group) => ({
      ...group,
      currency: group.currency ?? "",
      creditLimit: group.creditLimit ?? null,
      statementDay: group.statementDay ?? null,
      paymentDueDay: group.paymentDueDay ?? null,
    })),
    accounts: (data.accounts ?? []).map((account) => ({
      ...account,
      // Empty string is the "unassigned" sentinel; ensureDefaultBook*() replaces
      // it with the default 個人帳 id. Never leave bookId undefined at rest.
      bookId: account.bookId ?? "",
      creditLimit: account.creditLimit ?? null,
      creditLimitGroup: account.creditLimitGroup ?? "",
      creditGroupId: account.creditGroupId ?? null,
      bankBrandDomain: account.bankBrandDomain ?? null,
      customGroup: account.customGroup ?? "",
    })),
    ledgerTransactions: repaired.ledger.map((row) => ({
      ...row,
      name: row.name ?? row.merchant ?? "",
      subcategory: row.subcategory ?? "",
      merchant: row.merchant ?? "",
      entryType: row.entryType ?? (row.amount >= 0 ? "income" : "expense"),
      settlementStatus: row.settlementStatus ?? "settled",
      originalAmount: row.originalAmount ?? null,
      originalCurrency: row.originalCurrency ?? null,
      recurringOccurrenceKey: row.recurringOccurrenceKey ?? null,
    })),
    portfolioAssets,
    investmentRecords: repaired.records,
    recurringTransactions: (data.recurringTransactions ?? []).map((row) => ({
      ...row,
      subcategory: row.subcategory ?? "",
      merchant: row.merchant ?? "",
      entryType: row.entryType ?? (row.amount >= 0 ? "income" : "expense"),
      settlementStatus: row.settlementStatus ?? "settled",
    })),
    recurringInvestments: (data.recurringInvestments ?? []).map((row) => ({
      ...row,
      mode: (row.mode ?? "fixedAmount") as RecurringInvestmentMode,
      frequency: (row.frequency ?? "monthly") as import("../domain").RecurringFrequency,
      name: row.name ?? "",
      amount: row.amount ?? 0,
      quantity: row.quantity ?? 0,
      price: row.price ?? 0,
      fee: row.fee ?? 0,
      note: row.note ?? "",
    })),
    marketQuotes: data.marketQuotes ?? [],
    settings: normalizeSettings(data.settings ?? defaultSettings),
    settingsRevision: data.settingsRevision ?? 1,
    settingsUpdatedAt: data.settingsUpdatedAt ?? nowIso(),
    dailyFxRates: data.dailyFxRates ?? [],
    dailyPrices: data.dailyPrices ?? [],
    financialGoals: (data.financialGoals ?? []).map(normalizeFinancialGoal),
    manualPriceSnapshots: data.manualPriceSnapshots ?? [],
    syncConflicts: data.syncConflicts ?? [],
  };
}

/**
 * Backfill optional retirement-projection fields on goals loaded from an
 * older snapshot or browser localStorage. Returning the goal as-is would
 * give us `undefined` for the new keys and break the projection helper's
 * `null`-aware guard. We keep null-vs-undefined uniform across the whole
 * surface.
 */
/**
 * Canonical unit for goal rates is the decimal fraction (0.04 = 4%), the same
 * convention as every other rate on FinancialGoal (preRetirementReturn,
 * inflationRate, annualFee…). The FIRE calculator used to persist percentages
 * (4 for 4%), so any stored value above 1 is unambiguously legacy percent and
 * gets divided once. Applied on every load path AND in goalFieldsFromDraft so
 * old backups/synced rows converge to decimals.
 */
function normalizeRateUnit(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return value > 1 ? value / 100 : value;
}

function normalizeFinancialGoal(goal: FinancialGoal): FinancialGoal {
  return {
    ...goal,
    withdrawalRate: normalizeRateUnit(goal.withdrawalRate) ?? 0.04,
    expectedAnnualReturn: normalizeRateUnit(goal.expectedAnnualReturn) ?? 0.07,
    currentAge: goal.currentAge ?? null,
    retirementAge: goal.retirementAge ?? null,
    planThroughAge: goal.planThroughAge ?? null,
    preRetirementReturn: goal.preRetirementReturn ?? null,
    postRetirementReturn: goal.postRetirementReturn ?? null,
    inflationRate: goal.inflationRate ?? null,
    annualFee: goal.annualFee ?? null,
    contributionGrowthRate: goal.contributionGrowthRate ?? null,
    spendingItems: Array.isArray(goal.spendingItems) ? goal.spendingItems : [],
    incomeItems: Array.isArray(goal.incomeItems) ? goal.incomeItems : [],
    displayMode: goal.displayMode === "nominal" ? "nominal" : "today",
    accountShareMap: goal.accountShareMap && typeof goal.accountShareMap === "object" ? goal.accountShareMap : {},
  };
}

function normalizeSettings(input: Partial<AppSettings>): AppSettings {
  return {
    primaryCurrency: (input.primaryCurrency || defaultSettings.primaryCurrency).trim().toUpperCase(),
    categories: normalizeCategoryGroups(input.categories),
    merchants: uniqueClean(input.merchants, defaultSettings.merchants),
    exchangeRates: normalizeExchangeRates(input.exchangeRates),
  };
}

function uniqueClean(input: unknown, _fallback: string[]) {
  const array = Array.isArray(input) ? input : [];
  const values = array
    .map((item) => String(item).trim())
    .filter(Boolean);
  return [...new Set(values)];
}

// Whitelists CategoryGroup (src/domain/types.ts) fields for persistence and
// sanitizes sync-delivered junk. Any new CategoryGroup field must be added
// here or it will be silently dropped on every settings save.
function normalizeCategoryGroups(input: unknown) {
  const source = Array.isArray(input) ? input : [];
  return source.map((item) => {
    if (typeof item === "string") return { name: item, children: [] };
    const group = item as { name?: unknown; children?: unknown; icon?: unknown; iconName?: unknown; color?: unknown; budget?: unknown; rollover?: unknown; rolloverStart?: unknown; kind?: unknown };
    return {
      name: String(group.name ?? "").trim(),
      children: uniqueClean(group.children, []),
      iconName: group.iconName ? String(group.iconName) : group.icon ? String(group.icon) : undefined,
      color: group.color ? String(group.color) : undefined,
      budget: typeof group.budget === "number" ? group.budget : group.budget ? Number(group.budget) : undefined,
      rollover: group.rollover === true ? true : undefined,
      rolloverStart: typeof group.rolloverStart === "string" && group.rolloverStart.trim() ? group.rolloverStart.trim() : undefined,
      kind: (group.kind === "income" || group.kind === "expense" || group.kind === "both" ? group.kind : undefined) as "income" | "expense" | "both" | undefined,
    };
  }).filter((item) => item.name);
}

function normalizeExchangeRates(input: unknown) {
  const source = Array.isArray(input) ? input : [];
  return source.map((item) => {
    const rate = item as { from?: unknown; to?: unknown; rate?: unknown; updatedAt?: unknown };
    return {
      from: String(rate.from ?? "").trim().toUpperCase(),
      to: String(rate.to ?? defaultSettings.primaryCurrency).trim().toUpperCase(),
      rate: Number(rate.rate),
      updatedAt: String(rate.updatedAt ?? nowIso()),
    };
  }).filter((item) => item.from && item.to && Number.isFinite(item.rate) && item.rate > 0);
}

function parseJsonList<T>(value: string | undefined, fallback: T[]) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function normalizePortfolioAsset(asset: PortfolioAsset): PortfolioAsset {
  return {
    ...asset,
    ticker: asset.ticker.trim().toUpperCase(),
    name: asset.name || asset.ticker,
    nameZh: asset.nameZh ?? null,
    nameEn: asset.nameEn ?? null,
    currency: asset.currency || "TWD",
    holdingSource: asset.holdingSource ?? "transactions",
    acquisitionDate: asset.acquisitionDate ?? null,
    assetType: normalizeAssetType(asset.assetType),
    sector: cleanOptionalText(asset.sector),
    industry: cleanOptionalText(asset.industry),
    // Derive the canonical (coarse) key on read when an older row has none, so
    // pre-070 data groups correctly without a destructive migration.
    sectorCanonical:
      cleanOptionalText(asset.sectorCanonical) ??
      toCanonicalSector({ sector: asset.sector, industry: asset.industry }),
    accountId: asset.accountId ?? null,
    baseQuantity: asset.baseQuantity ?? null,
  };
}

function goalFieldsFromDraft(input: FinancialGoalDraft) {
  const withdrawalRate = normalizeRateUnit(input.withdrawalRate);
  const expectedAnnualReturn = normalizeRateUnit(input.expectedAnnualReturn);
  return {
    kind: input.kind === "custom" ? ("custom" as const) : ("fire" as const),
    name: input.name.trim() || "FIRE 目標",
    currency: (input.currency || "TWD").toUpperCase(),
    annualSpending: Math.max(0, Number(input.annualSpending) || 0),
    withdrawalRate: withdrawalRate !== null && withdrawalRate > 0 ? withdrawalRate : 0.04,
    expectedAnnualReturn: expectedAnnualReturn ?? 0.07,
    monthlyContribution: Math.max(0, Number(input.monthlyContribution) || 0),
    targetAmount: input.targetAmount && input.targetAmount > 0 ? input.targetAmount : null,
    startDate: input.startDate || new Date().toISOString().slice(0, 10),
    // Phase 7: nullable retirement-projection inputs. Repo layer keeps null
    // when the caller didn't supply a value; the projection helper itself
    // owns the default selection so an older record can still be projected.
    currentAge: optionalNumber(input.currentAge),
    retirementAge: optionalNumber(input.retirementAge),
    planThroughAge: optionalNumber(input.planThroughAge),
    preRetirementReturn: optionalNumber(input.preRetirementReturn),
    postRetirementReturn: optionalNumber(input.postRetirementReturn),
    inflationRate: optionalNumber(input.inflationRate),
    annualFee: optionalNumber(input.annualFee),
    contributionGrowthRate: optionalNumber(input.contributionGrowthRate),
    spendingItems: sanitizeSpendingItems(input.spendingItems),
    incomeItems: sanitizeIncomeItems(input.incomeItems),
    displayMode: input.displayMode === "nominal" ? ("nominal" as const) : ("today" as const),
    accountShareMap: sanitizeAccountShareMap(input.accountShareMap),
    targetDate: input.targetDate ?? null,
  };
}

function optionalNumber(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  return Number.isFinite(value) ? value : null;
}

function sanitizeSpendingItems(items: SpendingItem[] | undefined): SpendingItem[] {
  if (!items || !Array.isArray(items)) return [];
  return items
    .filter((item) => item && typeof item.name === "string")
    .map((item) => ({
      id: item.id || createId("spending"),
      name: item.name.trim().slice(0, 80),
      monthlyAmount: Math.max(0, Number(item.monthlyAmount) || 0),
      mustHave: item.mustHave !== false,
    }));
}

function sanitizeIncomeItems(items: IncomeItem[] | undefined): IncomeItem[] {
  if (!items || !Array.isArray(items)) return [];
  return items
    .filter((item) => item && typeof item.name === "string")
    .map((item) => ({
      id: item.id || createId("income"),
      name: item.name.trim().slice(0, 80),
      monthlyAmount: Math.max(0, Number(item.monthlyAmount) || 0),
      startAge: Math.max(0, Math.min(130, Number(item.startAge) || 65)),
      endAge: Math.max(0, Math.min(130, Number(item.endAge) || 90)),
    }));
}

function sanitizeAccountShareMap(map: Record<string, number> | undefined): Record<string, number> {
  if (!map || typeof map !== "object") return {};
  const cleaned: Record<string, number> = {};
  for (const [key, value] of Object.entries(map)) {
    if (typeof key !== "string" || !key) continue;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) continue;
    cleaned[key] = Math.max(0, Math.min(1, numeric));
  }
  return cleaned;
}

function parseJsonArray<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function parseJsonObject<V>(raw: string | null): Record<string, V> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, V>) : {};
  } catch {
    return {};
  }
}

function manualHoldingFields(input: PortfolioAssetDraft) {
  const ticker = input.ticker.trim().toUpperCase();
  const totalQuantity = Math.max(0, Number(input.totalQuantity) || 0);
  return {
    ticker,
    name: input.name.trim() || ticker,
    nameZh: null as string | null,
    nameEn: null as string | null,
    currency: input.currency.trim().toUpperCase(),
    totalQuantity,
    averageCost: Math.max(0, Number(input.averageCost) || 0),
    holdingSource: "manual" as const,
    acquisitionDate: input.acquisitionDate || null,
    ...assetClassificationFields(input),
    accountId: input.accountId || null,
    // The snapshot quantity is the durable carrier of a manual holding's
    // baseline. It rides on the asset row (which always syncs), so a peer can
    // reconstruct the opening lot even if the cashless opening record lags in
    // sync. The opening-balance record stays the source of truth when present;
    // see `recomputeAssets` / `syntheticOpeningRecord`.
    baseQuantity: totalQuantity,
  };
}

/**
 * Deterministic id for a manual holding's opening-balance record. Deriving it
 * from the asset id means two devices that create/migrate the same lot converge
 * on one row (sync upsert dedups instead of producing duplicate openings).
 */
function openingRecordId(assetId: string) {
  return `inv_open_${assetId}`;
}

/**
 * The cashless "opening balance" lot that backs a manual holding: the snapshot's
 * quantity/avgCost/date expressed as the position's first buy. Cashless so it
 * never posts a 交割 ledger leg (it records an already-held position).
 */
function buildOpeningRecord(asset: Pick<PortfolioAsset, "id" | "accountId">, draft: PortfolioAssetDraft): InvestmentRecord {
  const timestamp = nowIso();
  return {
    id: openingRecordId(asset.id),
    spaceId: personalSpace,
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    assetId: asset.id,
    linkedAccountId: asset.accountId ?? null,
    date: draft.acquisitionDate || timestamp.slice(0, 10),
    action: "buy",
    price: Math.max(0, Number(draft.averageCost) || 0),
    quantity: Math.max(0, Number(draft.totalQuantity) || 0),
    fee: 0,
    note: "期初部位",
    isReviewed: false,
    linkedLedgerTransactionId: null,
    cashless: true,
    dripGroupId: null,
  };
}

/**
 * Normalize + derive the classification triple written on every classification
 * path. This is the SINGLE place `sectorCanonical` is derived (plan 070): it's
 * shared by `manualHoldingFields` (manual create), `updateManualHolding`, and
 * both `updateAssetClassification` impls (manual edit + provider auto-backfill,
 * which feed Yahoo/TWSE values in here). Deriving once here keeps browser ≡
 * SQLite and means the providers don't each have to remember to set it.
 */
function assetClassificationFields(input: Pick<PortfolioAssetDraft, "assetType" | "sector" | "industry">) {
  const sector = cleanOptionalText(input.sector);
  const industry = cleanOptionalText(input.industry);
  return {
    assetType: normalizeAssetType(input.assetType),
    sector,
    industry,
    sectorCanonical: toCanonicalSector({ sector, industry }),
  };
}

function normalizeAssetType(value: unknown): AssetType | null {
  const normalized = String(value ?? "").trim();
  const allowed: AssetType[] = ["equity", "etf", "mutual_fund", "index", "crypto", "cash", "custom", "other"];
  return allowed.includes(normalized as AssetType) ? (normalized as AssetType) : null;
}

function cleanOptionalText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function createManualHoldingRow(input: PortfolioAssetDraft): PortfolioAsset {
  const timestamp = nowIso();
  return {
    id: createId("asset"),
    spaceId: personalSpace,
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    ...manualHoldingFields(input),
  };
}

function createLedgerRow(input: LedgerDraft & { recurringRuleId?: string | null }): LedgerTransaction {
  const timestamp = nowIso();
  return {
    id: createId("ledger"),
    spaceId: personalSpace,
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    accountId: input.accountId,
    counterAccountId: input.counterAccountId ?? null,
    date: input.date,
    name: input.name,
    amount: input.amount,
    currency: input.currency,
    originalAmount: input.originalAmount ?? null,
    originalCurrency: input.originalCurrency ?? null,
    category: input.category,
    subcategory: input.subcategory,
    merchant: input.merchant,
    entryType: input.entryType,
    settlementStatus: input.settlementStatus,
    note: input.note,
    linkedInvestmentRecordId: null,
    groupId: input.groupId ?? null,
    legKind: input.legKind ?? null,
    installmentGroupId: input.installmentGroupId ?? null,
    installmentIndex: input.installmentIndex ?? null,
    installmentTotal: input.installmentTotal ?? null,
    refundOfLedgerId: input.refundOfLedgerId ?? null,
    isReviewed: false,
    receiptAttachmentId: null,
    recurringRuleId: input.recurringRuleId ?? null,
    recurringOccurrenceKey: input.recurringOccurrenceKey ?? null,
    postDate: input.postDate ?? null,
  };
}

function formatImportError(row: ImportMeta, error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "無效資料");
  const prefix = row.importRow ? `第 ${row.importRow} 列` : "匯入資料";
  const label = row.importLabel ? `（${row.importLabel}）` : "";
  return new Error(`${prefix}${label}：${message}`);
}

function recurringKey(ruleId: string, occurrenceDate: string) {
  return `${ruleId}:${occurrenceDate.slice(0, 10)}`;
}

function createInvestmentLedgerRow(input: InvestmentDraft, investmentRecordId: string): LedgerTransaction | null {
  // Opening-balance lots record an already-held position — they never move cash.
  if (input.cashless) return null;
  const amount = calculateInvestmentCashDelta(input);
  if (amount === 0) return null;
  const timestamp = nowIso();
  return {
    id: createId("ledger"),
    spaceId: personalSpace,
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    counterAccountId: null,
    isReviewed: false,
    receiptAttachmentId: null,
    recurringRuleId: null,
    originalAmount: null,
    originalCurrency: null,
    ...investmentLedgerFields(input, investmentRecordId),
  };
}

function investmentLedgerFields(input: InvestmentDraft, investmentRecordId: string) {
  const amount = calculateInvestmentCashDelta(input);
  const ticker = input.ticker.trim().toUpperCase();
  const actionLabels: Partial<Record<InvestmentAction, string>> = {
    buy: "買進",
    sell: "賣出",
    cashDividend: "現金股利",
    capitalReduction: "減資",
  };
  const subcategory = input.action === "cashDividend" ? "股利" : actionLabels[input.action] ?? "投資";
  return {
    accountId: input.linkedAccountId!,
    date: input.date,
    name: `${ticker} ${actionLabels[input.action] ?? "投資"}`,
    amount,
    currency: input.currency.trim().toUpperCase(),
    category: "投資",
    subcategory,
    merchant: "",
    entryType: input.action === "cashDividend" ? (amount >= 0 ? ("income" as const) : ("expense" as const)) : ("transfer" as const),
    settlementStatus: "settled" as const,
    note: input.note,
    linkedInvestmentRecordId: investmentRecordId,
    groupId: null as string | null,
  };
}

function createRecurringRow(input: RecurringDraft): RecurringTransaction {
  const timestamp = nowIso();
  const frequency = input.frequency ?? "monthly";
  return {
    id: createId("recurring"),
    spaceId: personalSpace,
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    ...input,
    counterAccountId: input.counterAccountId ?? null,
    frequency,
    nextRunDate: firstFutureRunDate(input.nextRunDate, frequency, input.dayOfMonth, input.seedToday),
  };
}

function createRecurringInvestmentRow(input: RecurringInvestmentDraft): RecurringInvestment {
  const timestamp = nowIso();
  const frequency = input.frequency ?? "monthly";
  return {
    id: createId("recinv"),
    spaceId: personalSpace,
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    ...input,
    ticker: input.ticker.trim().toUpperCase(),
    currency: input.currency.trim().toUpperCase(),
    frequency,
    nextRunDate: firstFutureRunDate(input.nextRunDate, frequency, input.dayOfMonth, input.seedToday),
  };
}

// Resolve the buy InvestmentDraft for one occurrence of a recurring investment.
// fixedShares uses the stored share count; fixedAmount derives shares from the
// reference price. The 交割款 (cash settlement) is drawn from `accountId`.
function recurringInvestmentToDraft(rule: RecurringInvestment): InvestmentDraft {
  const price = Math.max(0, rule.price || 0);
  const taiwanListed = isTaiwanListedTicker(rule.ticker);
  let quantity: number;
  if (rule.mode === "fixedShares") {
    quantity = Math.max(0, rule.quantity || 0);
    if (taiwanListed && !Number.isInteger(quantity)) {
      throw new Error("台股定期定股的股數必須是整數，請先編輯規則。");
    }
  } else {
    const raw = price > 0 ? rule.amount / price : 0;
    // 台股：整股向下取整（券商定期定額分配同款）；其他市場：向下取到小數 4 位
    // （美股券商 dollar-based 慣例：3–4 位、無條件捨去）。
    quantity = taiwanListed ? Math.floor(raw) : Math.floor(raw * 10_000) / 10_000;
  }
  if (!(price > 0) || !(quantity > 0)) {
    throw new Error(
      rule.mode === "fixedAmount" && price > 0
        ? "金額不足以買進 1 股，本期不成立（實務上券商會整筆退還），未記錄任何交易。請提高金額或更新參考價格。"
        : "請先設定參考價格與金額／股數，才能記錄這期定期定額。",
    );
  }
  return {
    ticker: rule.ticker,
    name: rule.name || rule.ticker,
    currency: rule.currency,
    linkedAccountId: rule.accountId,
    date: `${rule.nextRunDate}T09:00`,
    action: "buy",
    price,
    quantity,
    fee: Math.max(0, rule.fee || 0),
    note: rule.note || "定期定額",
  };
}

function createInvestmentRow(input: InvestmentDraft, assetId: string): InvestmentRecord {
  const timestamp = nowIso();
  return {
    id: createId("inv"),
    spaceId: personalSpace,
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    assetId,
    ...investmentDraftFields(input),
    isReviewed: false,
    linkedLedgerTransactionId: null,
    dripGroupId: null,
  };
}

function investmentDraftFields(input: InvestmentDraft) {
  return {
    linkedAccountId: input.linkedAccountId ?? null,
    date: input.date,
    action: input.action,
    price: input.price,
    quantity: input.quantity,
    fee: input.fee,
    note: input.note,
    cashless: input.cashless ?? false,
  };
}

/**
 * Split a DRIP draft into its two `InvestmentDraft` legs, ordered
 * **dividend first, then buy** so the buy's purchasing-power check sees the
 * dividend already credited. The cashDividend leg follows the new-row
 * convention (`price` = total dividend amount, `quantity` = 0) so
 * dividendAnalysis counts the full amount; the buy leg is a normal trade that
 * blends into moving-average cost. Validation lives in `validateDividendReinvestment`.
 */
function dividendReinvestmentLegs(input: DividendReinvestmentDraft): { dividend: InvestmentDraft; buy: InvestmentDraft } {
  const shared = {
    ticker: input.ticker,
    name: input.name,
    currency: input.currency,
    linkedAccountId: input.linkedAccountId ?? null,
    date: input.date,
    assetType: input.assetType ?? null,
    sector: input.sector ?? null,
    industry: input.industry ?? null,
  };
  const dividend: InvestmentDraft = {
    ...shared,
    action: "cashDividend",
    price: Math.max(0, Number(input.dividendAmount) || 0),
    quantity: 0,
    fee: Math.max(0, Number(input.dividendFee) || 0),
    note: input.note,
  };
  const buy: InvestmentDraft = {
    ...shared,
    action: "buy",
    price: Math.max(0, Number(input.price) || 0),
    quantity: Math.max(0, Number(input.quantity) || 0),
    fee: Math.max(0, Number(input.buyFee) || 0),
    note: input.note,
  };
  return { dividend, buy };
}

/** Shared DRIP-draft validation (Q > 0, P > 0, A ≥ Q × P − tolerance). */
function validateDividendReinvestment(input: DividendReinvestmentDraft) {
  const quantity = Math.max(0, Number(input.quantity) || 0);
  const price = Math.max(0, Number(input.price) || 0);
  const dividendAmount = Math.max(0, Number(input.dividendAmount) || 0);
  if (!(quantity > 0)) throw new Error("請輸入再投入股數。");
  if (!(price > 0)) throw new Error("請輸入再投入價格。");
  // 容差：券商把零股股數捨入到 4–6 位後，Q×P 可能比實際股利多出幾毫到幾元。
  // 允許 Q×P 超出 A 至多 max(1 元, A 的 0.1%)；差額仍會如實入帳（cash 差額有界）。
  const tolerance = Math.max(1, dividendAmount * 0.001);
  if (dividendAmount + tolerance < quantity * price) {
    throw new Error("股利金額與股數 × 價格差距過大（請確認三個數字，或留空金額讓系統自動帶入）。");
  }
}

function computeAccountBalance(account: Account, ledgerRows: LedgerTransaction[], excludeLedgerId: string | null) {
  const total = ledgerRows
    .filter((row) => row.id !== excludeLedgerId)
    .reduce((sum, row) => sum + accountBalanceDelta(row, account.id), 0);
  return account.openingBalance + total;
}

function formatPlainAmount(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    maximumFractionDigits: 2,
  }).format(value);
}

function allowsTwdTPlus2Buffer(input: InvestmentDraft, accountCurrency: string) {
  return input.action === "buy" && accountCurrency.trim().toUpperCase() === "TWD";
}
