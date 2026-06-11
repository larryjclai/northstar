import type Database from "@tauri-apps/plugin-sql";
import type {
  Account,
  AppSettings,
  AssetType,
  DailyFxRate,
  DailyPrice,
  FinancialGoal,
  GoalDisplayMode,
  GoalKind,
  IncomeItem,
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
import { accountBalanceDelta, assertLedgerInvariants, assertTransferInvariants, buildRecalculationReport, deriveAccountBalances, findMissingFxPairs } from "../domain/ledgerTrust";
import {
  buildPendingChanges,
  type SyncApplyChange,
  type SyncConflictRecord,
  type SyncEntity,
  type SyncSource,
} from "../domain/sync";
import { migrations, splitSqlStatements } from "./migrations";
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
  feeAmount?: number;
  installmentGroupId?: string | null;
  installmentIndex?: number | null;
  installmentTotal?: number | null;
  refundOfLedgerId?: string | null;
  recurringOccurrenceKey?: string | null;
}

export type AccountDraft = Pick<Account, "name" | "currency" | "openingBalance" | "type" | "creditLimit" | "creditLimitGroup" | "statementDay" | "paymentDueDay" | "creditPaymentPaidUntil" | "isSharedToHousehold" | "loanStartDate" | "annualInterestRate" | "loanTerm" | "iconName" | "color"> & {
  customGroup?: string;
};

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
}

export interface FinanceRepository {
  initialize(): Promise<void>;
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
  updateLedgerTransaction(id: string, input: LedgerDraft): Promise<void>;
  setLedgerReviewed(id: string, reviewed: boolean): Promise<void>;
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
  importLedgerTransactions(rows: LedgerDraft[]): Promise<void>;
  listPortfolioAssets(): Promise<PortfolioAsset[]>;
  createManualHolding(input: PortfolioAssetDraft): Promise<void>;
  updateManualHolding(id: string, input: PortfolioAssetDraft): Promise<void>;
  updateAssetClassification(id: string, input: AssetClassificationInput): Promise<void>;
  deleteManualHolding(id: string): Promise<void>;
  listInvestmentRecords(): Promise<InvestmentRecord[]>;
  createInvestmentRecord(input: InvestmentDraft): Promise<void>;
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
  applySyncChanges(changes: SyncApplyChange[], conflicts?: SyncConflictRecord[]): Promise<void>;
  recalculateDerivedData(): Promise<RecalculationReport>;
  /** Connect Sync prep: records changed since `sinceCursor` (an updatedAt). */
  collectPendingChanges(sinceCursor: string | null): Promise<import("../domain").PendingChangeSet>;
  acknowledgePendingChanges(outboxIds: string[]): Promise<void>;
  listSyncConflicts(): Promise<SyncConflictRecord[]>;
  resolveSyncConflict(id: string, strategy: "keepLocal" | "useIncoming"): Promise<void>;
}

export interface RepositorySnapshot {
  version: number;
  exportedAt: string;
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

interface RepositoryData {
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
      await db.execute("PRAGMA foreign_keys=ON;");
      const journal = await db.select<{ journal_mode: string }[]>("PRAGMA journal_mode;");
      const mode = journal?.[0]?.journal_mode ?? "unknown";
      if (mode.toLowerCase() !== "wal") {
        console.warn(`[db] journal_mode is '${mode}', expected 'wal' — lock contention is more likely on this platform`);
      } else {
        console.info("[db] journal_mode=wal, busy_timeout=15000");
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

const recomputeAccounts = deriveAccountBalances;

function recomputeAssets(assets: PortfolioAsset[], records: InvestmentRecord[]) {
  const activeRecords = active(records);
  return assets.map((asset) => {
    if (asset.deletedAt !== null) return asset;
    const assetRecords = activeRecords.filter((record) => record.assetId === asset.id);
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
    const metrics = buildPositionMetrics(assetRecords);
    return {
      ...asset,
      totalQuantity: metrics.quantity,
      averageCost: metrics.averageCost,
    };
  });
}

class BrowserFinanceRepository implements FinanceRepository {
  private readonly storageKey = "northstar.browserRepository.v1";
  private data: RepositoryData = createInitialData();
  private skipPersist = false;

  loadDataForTests(data: Partial<RepositoryData>) {
    this.skipPersist = true;
    this.data = normalizeStoredData({ ...createInitialData(), ...data });
  }

  async initialize() {
    const stored = await loadBrowserRepositoryData(this.storageKey);
    this.data = stored ? normalizeStoredData(stored) : createInitialData();
    this.backfillUnassignedAccountInMemory();
    this.recompute();
    await this.persist();
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
        creditLimit: null,
        creditLimitGroup: "",
        isSharedToHousehold: false,
        loanStartDate: null,
        annualInterestRate: null,
        loanTerm: null,
        iconName: null,
        color: null,
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

  async listAccounts() {
    return active(this.data.accounts).map((row) => ({
      ...row,
      loanStartDate: row.loanStartDate ?? null,
      annualInterestRate: row.annualInterestRate ?? null,
      loanTerm: row.loanTerm ?? null,
      iconName: row.iconName ?? null,
      color: row.color ?? null,
      statementDay: row.statementDay ?? null,
      paymentDueDay: row.paymentDueDay ?? null,
    }));
  }

  async createAccount(input: AccountDraft) {
    const timestamp = nowIso();
    this.data.accounts.push({
      id: createId("acct"),
      spaceId: personalSpace,
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      deletedAt: null,
      balance: input.openingBalance,
      ...input,
      creditLimit: input.type === "credit" ? input.creditLimit : null,
      creditLimitGroup: input.type === "credit" ? input.creditLimitGroup : "",
      statementDay: input.type === "credit" ? (input.statementDay ?? null) : null,
      paymentDueDay: input.type === "credit" ? (input.paymentDueDay ?? null) : null,
      loanStartDate: input.type === "loan" ? (input.loanStartDate ?? null) : null,
      annualInterestRate: input.type === "loan" ? (input.annualInterestRate ?? null) : null,
      loanTerm: input.type === "loan" ? (input.loanTerm ?? null) : null,
    });
    await this.persist();
  }

  async updateAccount(id: string, input: AccountDraft) {
    this.data.accounts = this.data.accounts.map((account) =>
      account.id === id ? bump({
        ...account,
        ...input,
        creditLimit: input.type === "credit" ? input.creditLimit : null,
        creditLimitGroup: input.type === "credit" ? input.creditLimitGroup : "",
        loanStartDate: input.type === "loan" ? (input.loanStartDate ?? null) : null,
        annualInterestRate: input.type === "loan" ? (input.annualInterestRate ?? null) : null,
        loanTerm: input.type === "loan" ? (input.loanTerm ?? null) : null,
      }) : account,
    );
    this.recompute();
    await this.persist();
  }

  async deleteAccount(id: string) {
    const hasRows = this.data.ledgerTransactions.some((row) => row.accountId === id && row.deletedAt === null)
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
    this.data.ledgerTransactions = this.data.ledgerTransactions.map((row) =>
      row.id === id ? bump({ ...row, ...input, counterAccountId: input.counterAccountId ?? null, groupId: input.groupId ?? null }) : row,
    );
    this.recompute();
    await this.persist();
  }

  async setLedgerReviewed(id: string, reviewed: boolean) {
    this.data.ledgerTransactions = this.data.ledgerTransactions.map((row) =>
      row.id === id ? bump({ ...row, isReviewed: reviewed }) : row,
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

  async updateInvestmentRecord(id: string, input: InvestmentDraft) {
    const existingRecord = this.data.investmentRecords.find((record) => record.id === id && record.deletedAt === null);
    if (!existingRecord) throw new Error("找不到投資交易。");
    const existingAsset = this.findTransactionAsset(input) ?? this.findManualAsset(input);
    this.validateInvestmentDraft(input, existingAsset, {
      excludeRecordId: id,
      excludeLedgerId: existingRecord.linkedLedgerTransactionId,
    });
    const asset = this.findOrCreateAsset(input);
    const ledger = createInvestmentLedgerRow(input, id);
    let linkedLedgerTransactionId: string | null = existingRecord.linkedLedgerTransactionId;
    if (linkedLedgerTransactionId) {
      this.data.ledgerTransactions = this.data.ledgerTransactions.map((row) => {
        if (row.id !== linkedLedgerTransactionId) return row;
        return ledger
          ? bump({ ...row, ...investmentLedgerFields(input, id) })
          : bump({ ...row, deletedAt: nowIso() });
      });
      if (!ledger) linkedLedgerTransactionId = null;
    } else if (ledger) {
      linkedLedgerTransactionId = ledger.id;
      this.data.ledgerTransactions.push(ledger);
    }
    this.data.investmentRecords = this.data.investmentRecords.map((record) =>
      record.id === id ? bump({ ...record, ...investmentDraftFields(input), assetId: asset.id, linkedLedgerTransactionId }) : record,
    );
    this.recompute();
    await this.persist();
  }

  async deleteInvestmentRecord(id: string) {
    const existingRecord = this.data.investmentRecords.find((record) => record.id === id && record.deletedAt === null);
    if (!existingRecord) throw new Error("找不到投資交易。");
    this.data.investmentRecords = this.data.investmentRecords.map((record) =>
      record.id === id ? bump({ ...record, deletedAt: nowIso() }) : record,
    );
    if (existingRecord.linkedLedgerTransactionId) {
      this.data.ledgerTransactions = this.data.ledgerTransactions.map((row) =>
        row.id === existingRecord.linkedLedgerTransactionId ? bump({ ...row, deletedAt: nowIso() }) : row,
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
    if (posted > 0) {
      this.data.recurringTransactions = this.data.recurringTransactions.map((row) =>
        advanced.has(row.id) ? bump({ ...row, nextRunDate: advanced.get(row.id)! }) : row,
      );
      this.recompute();
      await this.persist();
    }
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

  async listMarketQuotes() {
    return this.data.marketQuotes;
  }

  async saveMarketQuotes(quotes: MarketQuote[], source: string) {
    const updatedAt = nowIso();
    const next = new Map(this.data.marketQuotes.map((quote) => [quote.symbol, quote]));
    for (const quote of quotes) {
      next.set(quote.symbol, { ...quote, source, updatedAt });
    }
    this.data.marketQuotes = [...next.values()];
    // Propagate localized names to any matching portfolio assets so
    // displayName() can pick zh / en based on user preference later.
    const bySymbol = new Map(quotes.map((quote) => [quote.symbol.toUpperCase(), quote]));
    this.data.portfolioAssets = this.data.portfolioAssets.map((asset) => {
      const match = bySymbol.get(asset.ticker.toUpperCase());
      if (!match) return asset;
      const nameZh = match.nameZh ?? asset.nameZh ?? null;
      const nameEn = match.nameEn ?? asset.nameEn ?? null;
      if (nameZh === asset.nameZh && nameEn === asset.nameEn) return asset;
      return { ...asset, nameZh, nameEn };
    });
    await this.persist();
  }

  async getAppSettings() {
    return this.data.settings;
  }

  async updateAppSettings(input: AppSettings) {
    this.data.settings = normalizeSettings(input);
    this.data.settingsRevision = (this.data.settingsRevision ?? 0) + 1;
    this.data.settingsUpdatedAt = nowIso();
    await this.persist();
  }

  async listDailyFxRates(filter?: { from?: string; to?: string; since?: string }) {
    const from = filter?.from?.toUpperCase();
    const to = filter?.to?.toUpperCase();
    const since = filter?.since;
    return this.data.dailyFxRates
      .filter((row) => (from ? row.from === from : true))
      .filter((row) => (to ? row.to === to : true))
      .filter((row) => (since ? row.date >= since : true))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async saveDailyFxRates(rates: DailyFxRate[]) {
    if (!rates.length) return;
    const updatedAt = nowIso();
    const map = new Map<string, DailyFxRate>(
      this.data.dailyFxRates.map((row) => [`${row.from}|${row.to}|${row.date}`, row]),
    );
    for (const rate of rates) {
      const normalized: DailyFxRate = {
        from: rate.from.toUpperCase(),
        to: rate.to.toUpperCase(),
        date: rate.date.slice(0, 10),
        rate: Number(rate.rate),
        source: rate.source || "manual",
        updatedAt: rate.updatedAt || updatedAt,
      };
      if (!normalized.from || !normalized.to || !Number.isFinite(normalized.rate) || normalized.rate <= 0) continue;
      map.set(`${normalized.from}|${normalized.to}|${normalized.date}`, normalized);
    }
    this.data.dailyFxRates = [...map.values()];
    await this.persist();
  }

  async getDailyFxRate(from: string, to: string, date: string): Promise<DailyFxRate | null> {
    const target = date.slice(0, 10);
    const fromCode = from.toUpperCase();
    const toCode = to.toUpperCase();
    const matches = this.data.dailyFxRates
      .filter((row) => row.from === fromCode && row.to === toCode && row.date <= target)
      .sort((a, b) => b.date.localeCompare(a.date));
    return matches[0] ?? null;
  }

  async listDailyPrices(filter?: { ticker?: string; since?: string }) {
    const ticker = filter?.ticker?.toUpperCase();
    const since = filter?.since;
    return this.data.dailyPrices
      .filter((row) => (ticker ? row.ticker === ticker : true))
      .filter((row) => (since ? row.date >= since : true))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async saveDailyPrices(prices: DailyPrice[]) {
    if (!prices.length) return;
    const updatedAt = nowIso();
    const map = new Map<string, DailyPrice>(
      this.data.dailyPrices.map((row) => [`${row.ticker}|${row.date}`, row]),
    );
    for (const price of prices) {
      const normalized: DailyPrice = {
        ticker: price.ticker.toUpperCase(),
        date: price.date.slice(0, 10),
        close: Number(price.close),
        currency: price.currency || "",
        source: price.source || "manual",
        updatedAt: price.updatedAt || updatedAt,
      };
      if (!normalized.ticker || !normalized.date || !Number.isFinite(normalized.close) || normalized.close <= 0) continue;
      map.set(`${normalized.ticker}|${normalized.date}`, normalized);
    }
    this.data.dailyPrices = [...map.values()];
    await this.persist();
  }

  async getDailyPrice(ticker: string, date: string): Promise<DailyPrice | null> {
    const target = date.slice(0, 10);
    const code = ticker.toUpperCase();
    const matches = this.data.dailyPrices
      .filter((row) => row.ticker === code && row.date <= target)
      .sort((a, b) => b.date.localeCompare(a.date));
    return matches[0] ?? null;
  }

  async listManualPriceSnapshots(filter?: { assetId?: string }) {
    return this.data.manualPriceSnapshots
      .filter((row) => (filter?.assetId ? row.assetId === filter.assetId : true))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async createManualPriceSnapshot(input: ManualPriceSnapshotDraft) {
    this.data.manualPriceSnapshots.push({
      id: createId("mps"),
      assetId: input.assetId,
      date: input.date.slice(0, 10),
      price: input.price,
      note: input.note,
      createdAt: nowIso(),
    });
    await this.persist();
  }

  async deleteManualPriceSnapshot(id: string) {
    this.data.manualPriceSnapshots = this.data.manualPriceSnapshots.filter((row) => row.id !== id);
    await this.persist();
  }

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
    };
  }

  // Sync-tracked records INCLUDING soft-deleted ones (deletes must propagate).
  // Overridden for SQLite to query rows directly so it isn't subject to the
  // deleted_at filter that the public list* methods apply.
  protected async allSyncRecords(): Promise<SyncSource> {
    return {
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
    };
    return (rowsByEntity[entity].find((row) => row.id === entityId) as unknown as Record<string, unknown> | undefined) ?? null;
  }

  async importSnapshot(snapshot: RepositorySnapshot) {
    this.data = normalizeStoredData({
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
    });
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
      } as const;
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
    await this.persist();
  }

  private findTransactionAsset(input: InvestmentDraft): PortfolioAsset | undefined {
    const ticker = input.ticker.trim().toUpperCase();
    return this.data.portfolioAssets.find((item) => item.ticker === ticker && item.deletedAt === null && item.holdingSource === "transactions");
  }

  private findManualAsset(input: InvestmentDraft): PortfolioAsset | undefined {
    const ticker = input.ticker.trim().toUpperCase();
    return this.data.portfolioAssets.find(
      (item) => item.ticker === ticker && item.deletedAt === null && item.holdingSource === "manual" && item.accountId === input.linkedAccountId,
    );
  }

  private findOrCreateAsset(input: InvestmentDraft): PortfolioAsset {
    const ticker = input.ticker.trim().toUpperCase();
    const existing = this.findTransactionAsset(input);
    if (existing) return existing;
    const manualAsset = this.findManualAsset(input);
    if (manualAsset) return manualAsset;
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
        throw new Error("瀏覽器儲存空間不足，無法寫入這份備份。請使用支援 IndexedDB 的瀏覽器，或改用桌面 App 匯入。");
      }
    }
  }

  try {
    writeLocalStorageRepositoryData(storageKey, data);
  } catch (error) {
    console.error("[repository] localStorage persistence failed", error);
    throw new Error("瀏覽器 localStorage 空間不足，無法寫入這份備份。請改用支援 IndexedDB 的瀏覽器或桌面 App。");
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

  override async initialize() {
    for (const migration of migrations) {
      for (const statement of splitSqlStatements(migration.sql)) {
        await this.db.execute(statement);
      }
    }
    await this.ensureSqliteColumn("ledger_transactions", "merchant", "text not null default ''");
    await this.ensureSqliteColumn("ledger_transactions", "name", "text not null default ''");
    await this.ensureSqliteColumn("ledger_transactions", "entry_type", "text not null default 'expense'");
    await this.ensureSqliteColumn("ledger_transactions", "subcategory", "text not null default ''");
    await this.ensureSqliteColumn("ledger_transactions", "settlement_status", "text not null default 'settled'");
    await this.ensureSqliteColumn("accounts", "credit_limit", "real");
    await this.ensureSqliteColumn("accounts", "credit_limit_group", "text not null default ''");
    await this.ensureSqliteColumn("recurring_transactions", "subcategory", "text not null default ''");
    await this.ensureSqliteColumn("recurring_transactions", "merchant", "text not null default ''");
    await this.ensureSqliteColumn("recurring_transactions", "entry_type", "text not null default 'expense'");
    await this.ensureSqliteColumn("recurring_transactions", "settlement_status", "text not null default 'settled'");
    await this.ensureSqliteColumn("recurring_transactions", "frequency", "text not null default 'monthly'");
    await this.ensureSqliteColumn("accounts", "loan_start_date", "text");
    await this.ensureSqliteColumn("accounts", "annual_interest_rate", "real");
    await this.ensureSqliteColumn("accounts", "loan_term", "real");
    await this.ensureSqliteColumn("accounts", "icon_name", "text");
    await this.ensureSqliteColumn("accounts", "color", "text");
    await this.ensureSqliteColumn("accounts", "statement_day", "integer");
    await this.ensureSqliteColumn("accounts", "credit_payment_paid_until", "text");
    await this.ensureSqliteColumn("accounts", "payment_due_day", "integer");
    await this.ensureSqliteColumn("accounts", "custom_group", "text not null default ''");
    await this.ensureSqliteColumn("portfolio_assets", "holding_source", "text not null default 'transactions'");
    await this.ensureSqliteColumn("portfolio_assets", "acquisition_date", "text");
    await this.ensureSqliteColumn("portfolio_assets", "name_zh", "text");
    await this.ensureSqliteColumn("portfolio_assets", "name_en", "text");
    await this.ensureSqliteColumn("portfolio_assets", "account_id", "text");
    await this.ensureSqliteColumn("portfolio_assets", "asset_type", "text");
    await this.ensureSqliteColumn("portfolio_assets", "sector", "text");
    await this.ensureSqliteColumn("portfolio_assets", "industry", "text");
    await this.ensureSqliteColumn("portfolio_assets", "base_quantity", "real");
    await this.db.execute(
      `update portfolio_assets set base_quantity = total_quantity where holding_source = 'manual' and base_quantity is null`,
    );
    // Opening-balance lot model: every manual holding is backed by a cashless
    // "opening" investment record so quantity, blended cost, P/L, XIRR and the
    // net-worth trend all derive from records uniformly. Materialize one for any
    // manual holding that lacks it. Idempotent via the deterministic id
    // (`inv_open_<assetId>`) — re-running, or two synced devices, converge on a
    // single row instead of duplicating the opening lot.
    await this.ensureSqliteColumn("investment_records", "cashless", "integer not null default 0");
    await this.db.execute(
      `insert into investment_records (id, space_id, revision, created_at, updated_at, deleted_at, asset_id, linked_account_id, date, action, price, quantity, fee, note, is_reviewed, linked_ledger_transaction_id, cashless)
       select 'inv_open_' || a.id, a.space_id, 1, $1, $1, null, a.id, a.account_id,
         coalesce(a.acquisition_date, substr(a.created_at, 1, 10)), 'buy', a.average_cost, coalesce(a.base_quantity, a.total_quantity), 0, '期初部位', 0, null, 1
       from portfolio_assets a
       where a.holding_source = 'manual' and a.deleted_at is null
         and not exists (select 1 from investment_records r where r.id = 'inv_open_' || a.id)`,
      [nowIso()],
    );
    // Retirement-projection extensions for financial_goals. Each one is
    // optional at the DB level — readers coalesce missing values to the
    // sane defaults documented in `goalFieldsFromDraft`.
    await this.ensureSqliteColumn("financial_goals", "current_age", "real");
    await this.ensureSqliteColumn("financial_goals", "retirement_age", "real");
    await this.ensureSqliteColumn("financial_goals", "plan_through_age", "real");
    await this.ensureSqliteColumn("financial_goals", "pre_retirement_return", "real");
    await this.ensureSqliteColumn("financial_goals", "post_retirement_return", "real");
    await this.ensureSqliteColumn("financial_goals", "inflation_rate", "real");
    await this.ensureSqliteColumn("financial_goals", "annual_fee", "real");
    await this.ensureSqliteColumn("financial_goals", "contribution_growth_rate", "real");
    await this.ensureSqliteColumn("financial_goals", "spending_items", "text");
    await this.ensureSqliteColumn("financial_goals", "income_items", "text");
    await this.ensureSqliteColumn("financial_goals", "display_mode", "text");
    await this.ensureSqliteColumn("financial_goals", "account_share_map", "text");
    await this.ensureSqliteColumn("ledger_transactions", "recurring_rule_id", "text");
    await this.ensureSqliteColumn("ledger_transactions", "original_amount", "real");
    await this.ensureSqliteColumn("ledger_transactions", "original_currency", "text");
    await this.ensureSqliteColumn("ledger_transactions", "recurring_occurrence_key", "text");
    await this.ensureSqliteColumn("ledger_transactions", "counter_account_id", "text");
    await this.ensureSqliteColumn("ledger_transactions", "installment_group_id", "text");
    await this.ensureSqliteColumn("ledger_transactions", "installment_index", "integer");
    await this.ensureSqliteColumn("ledger_transactions", "installment_total", "integer");
    await this.ensureSqliteColumn("ledger_transactions", "refund_of_ledger_id", "text");
    await this.ensureSqliteColumn("recurring_transactions", "counter_account_id", "text");
    await this.db.execute(`create unique index if not exists idx_ledger_recurring_occurrence on ledger_transactions (recurring_occurrence_key) where recurring_occurrence_key is not null and deleted_at is null`);
    await this.ensureSyncInfrastructure();
    await this.backfillUnassignedAccount();
    await this.ensureDefaultSettings();
    const rows = await this.db.select<Array<{ count: number }>>("select count(*) as count from accounts");
    if ((rows[0]?.count ?? 0) === 0) {
      await this.seedSqlite();
    }
    await this.backfillSyncOutbox();
    await this.recalculateDerivedData();
  }

  override async listAccounts() {
    return (await this.db.select<Account[]>(`select
      id, space_id as spaceId, revision, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt,
      name, currency, opening_balance as openingBalance, balance, type, credit_limit as creditLimit, credit_limit_group as creditLimitGroup, is_shared_to_household as isSharedToHousehold,
      loan_start_date as loanStartDate, annual_interest_rate as annualInterestRate, loan_term as loanTerm, icon_name as iconName, color, statement_day as statementDay, payment_due_day as paymentDueDay,
      credit_payment_paid_until as creditPaymentPaidUntil, custom_group as customGroup
      from accounts where deleted_at is null order by name`)).map((row) => ({
        ...row,
        creditLimit: row.creditLimit ?? null,
        creditLimitGroup: row.creditLimitGroup ?? "",
        isSharedToHousehold: Boolean(row.isSharedToHousehold),
        loanStartDate: row.loanStartDate ?? null,
        annualInterestRate: row.annualInterestRate ?? null,
        loanTerm: row.loanTerm ?? null,
        iconName: row.iconName ?? null,
        color: row.color ?? null,
        statementDay: row.statementDay ?? null,
        paymentDueDay: row.paymentDueDay ?? null,
        creditPaymentPaidUntil: (row as any).creditPaymentPaidUntil ?? null,
        customGroup: row.customGroup ?? "",
      }));
  }

  override async createAccount(input: AccountDraft) {
    const timestamp = nowIso();
    await this.db.execute(
      `insert into accounts (id, space_id, revision, created_at, updated_at, deleted_at, name, currency, opening_balance, balance, type, credit_limit, credit_limit_group, is_shared_to_household, loan_start_date, annual_interest_rate, loan_term, icon_name, color, statement_day, payment_due_day, credit_payment_paid_until, custom_group)
       values ($1,$2,1,$3,$3,null,$4,$5,$6,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [createId("acct"), personalSpace, timestamp, input.name, input.currency, input.openingBalance, input.type, input.type === "credit" ? input.creditLimit : null, input.type === "credit" ? input.creditLimitGroup : "", Number(input.isSharedToHousehold), input.type === "loan" ? (input.loanStartDate ?? null) : null, input.type === "loan" ? (input.annualInterestRate ?? null) : null, input.type === "loan" ? (input.loanTerm ?? null) : null, input.iconName ?? null, input.color ?? null, input.type === "credit" ? (input.statementDay ?? null) : null, input.type === "credit" ? (input.paymentDueDay ?? null) : null, null, input.customGroup?.trim() ?? ""],
    );
  }

  override async updateAccount(id: string, input: AccountDraft) {
    await this.db.execute(
      `update accounts set revision = revision + 1, updated_at = $1, name = $2, currency = $3, opening_balance = $4, type = $5, credit_limit = $6, credit_limit_group = $7, is_shared_to_household = $8, loan_start_date = $9, annual_interest_rate = $10, loan_term = $11, icon_name = $12, color = $13, statement_day = $14, payment_due_day = $15, credit_payment_paid_until = $16, custom_group = $17 where id = $18`,
      [nowIso(), input.name, input.currency, input.openingBalance, input.type, input.type === "credit" ? input.creditLimit : null, input.type === "credit" ? input.creditLimitGroup : "", Number(input.isSharedToHousehold), input.type === "loan" ? (input.loanStartDate ?? null) : null, input.type === "loan" ? (input.annualInterestRate ?? null) : null, input.type === "loan" ? (input.loanTerm ?? null) : null, input.iconName ?? null, input.color ?? null, input.type === "credit" ? (input.statementDay ?? null) : null, input.type === "credit" ? (input.paymentDueDay ?? null) : null, input.creditPaymentPaidUntil ?? null, input.customGroup?.trim() ?? "", id],
    );
    await this.recomputeSqliteAccounts();
  }

  override async deleteAccount(id: string) {
    const linkedLedger = await this.db.select<Array<{ count: number }>>(
      `select count(*) as count from ledger_transactions where account_id = $1 and deleted_at is null`,
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
    return this.db.select<LedgerTransaction[]>(`select
      id, space_id as spaceId, revision, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt,
      account_id as accountId, counter_account_id as counterAccountId, date, name, amount, currency, original_amount as originalAmount, original_currency as originalCurrency,
      category, subcategory, merchant, entry_type as entryType, settlement_status as settlementStatus, note,
      linked_investment_record_id as linkedInvestmentRecordId, group_id as groupId,
      installment_group_id as installmentGroupId, installment_index as installmentIndex, installment_total as installmentTotal,
      refund_of_ledger_id as refundOfLedgerId,
      is_reviewed as isReviewed, receipt_attachment_id as receiptAttachmentId, recurring_rule_id as recurringRuleId,
      recurring_occurrence_key as recurringOccurrenceKey
      from ledger_transactions where deleted_at is null order by date desc, created_at desc`);
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
    await this.db.execute(
      `update ledger_transactions set revision = revision + 1, updated_at = $1, account_id = $2, date = $3, name = $4, amount = $5, currency = $6, original_amount = $7, original_currency = $8, category = $9, subcategory = $10, merchant = $11, entry_type = $12, settlement_status = $13, note = $14, group_id = $15, counter_account_id = $17 where id = $16`,
      [nowIso(), input.accountId, input.date, input.name, input.amount, input.currency, input.originalAmount ?? null, input.originalCurrency ?? null, input.category, input.subcategory, input.merchant, input.entryType, input.settlementStatus, input.note, input.groupId ?? null, id, input.counterAccountId ?? null],
    );
    await this.recomputeSqliteAccounts();
  }

  override async setLedgerReviewed(id: string, reviewed: boolean) {
    await this.db.execute(
      `update ledger_transactions set is_reviewed = $1, updated_at = $2, revision = revision + 1 where id = $3`,
      [Number(reviewed), nowIso(), id],
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

  override async importLedgerTransactions(rows: LedgerDraft[]) {
    const accounts = await this.listAccounts();
    rows.forEach((row) => assertLedgerInvariants(row, accounts));
    await this.withTransaction(async () => {
      for (const row of rows) await this.insertLedgerRow(createLedgerRow(row));
      await this.recomputeSqliteAccounts();
    });
  }

  override async listPortfolioAssets() {
    const rows = await this.db.select<PortfolioAsset[]>(`select
      id, space_id as spaceId, revision, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt,
      ticker, name, name_zh as nameZh, name_en as nameEn, currency, total_quantity as totalQuantity, average_cost as averageCost, holding_source as holdingSource, acquisition_date as acquisitionDate,
      asset_type as assetType, sector, industry, account_id as accountId, base_quantity as baseQuantity
      from portfolio_assets where deleted_at is null order by ticker`);
    return rows.map((row) => ({
      ...row,
      nameZh: row.nameZh ?? null,
      nameEn: row.nameEn ?? null,
      assetType: row.assetType ?? null,
      sector: row.sector ?? null,
      industry: row.industry ?? null,
      accountId: row.accountId ?? null,
      baseQuantity: row.baseQuantity ?? null,
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
        `update portfolio_assets set revision = revision + 1, updated_at = $1, ticker = $2, name = $3, currency = $4, acquisition_date = $5, account_id = $6, asset_type = $7, sector = $8, industry = $9, base_quantity = null where id = $10 and holding_source = 'manual'`,
        [nowIso(), input.ticker.trim().toUpperCase(), input.name.trim() || input.ticker.trim().toUpperCase(), input.currency.trim().toUpperCase(), input.acquisitionDate || null, input.accountId || null, classification.assetType, classification.sector, classification.industry, id],
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
    await this.db.execute(
      `update portfolio_assets
       set revision = revision + 1, updated_at = $1, asset_type = $2, sector = $3, industry = $4,
           name_zh = coalesce($5, name_zh), name_en = coalesce($6, name_en)
       where id = $7 and deleted_at is null`,
      [nowIso(), classification.assetType, classification.sector, classification.industry, input.nameZh ?? null, input.nameEn ?? null, id],
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
    return this.db.select<InvestmentRecord[]>(`select
      id, space_id as spaceId, revision, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt,
      asset_id as assetId, linked_account_id as linkedAccountId, date, action, price, quantity, fee, note,
      is_reviewed as isReviewed, linked_ledger_transaction_id as linkedLedgerTransactionId, cashless
      from investment_records where deleted_at is null order by date desc, created_at desc`);
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

  override async updateInvestmentRecord(id: string, input: InvestmentDraft) {
    const existingRows = await this.db.select<InvestmentRecord[]>(`select
      id, space_id as spaceId, revision, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt,
      asset_id as assetId, linked_account_id as linkedAccountId, date, action, price, quantity, fee, note,
      is_reviewed as isReviewed, linked_ledger_transaction_id as linkedLedgerTransactionId, cashless
      from investment_records where id = $1 and deleted_at is null`, [id]);
    const existingRecord = existingRows[0];
    if (!existingRecord) throw new Error("找不到投資交易。");
    const ticker = input.ticker.trim().toUpperCase();
    const transactionAssetId = await this.findSqliteTransactionAssetId(input);
    const manualAssetId = !transactionAssetId ? (await this.findSqliteManualAsset(ticker, input.linkedAccountId ?? null))?.id : undefined;
    const existingAssetId = transactionAssetId ?? manualAssetId;
    await this.validateSqliteInvestmentDraft(input, existingAssetId, {
      excludeRecordId: id,
      excludeLedgerId: existingRecord.linkedLedgerTransactionId,
    });
    await this.withTransaction(async () => {
      const assetId = await this.findOrCreateSqliteAsset(input);
      const ledger = createInvestmentLedgerRow(input, id);
      let linkedLedgerTransactionId: string | null = existingRecord.linkedLedgerTransactionId;
      if (linkedLedgerTransactionId) {
        if (ledger) {
          const fields = investmentLedgerFields(input, id);
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
        `update investment_records set revision = revision + 1, updated_at = $1, asset_id = $2, linked_account_id = $3, date = $4, action = $5, price = $6, quantity = $7, fee = $8, note = $9, linked_ledger_transaction_id = $10 where id = $11`,
        [nowIso(), assetId, input.linkedAccountId ?? null, input.date, input.action, input.price, input.quantity, input.fee, input.note, linkedLedgerTransactionId, id],
      );
      await this.recomputeSqliteAccounts();
      await this.recomputeSqliteAssets();
    });
  }

  override async deleteInvestmentRecord(id: string) {
    const existingRows = await this.db.select<Array<{ linkedLedgerTransactionId: string | null }>>(
      `select linked_ledger_transaction_id as linkedLedgerTransactionId from investment_records where id = $1 and deleted_at is null`,
      [id],
    );
    const existingRecord = existingRows[0];
    if (!existingRecord) throw new Error("找不到投資交易。");
    await this.withTransaction(async () => {
      await this.db.execute(`update investment_records set deleted_at = $1, updated_at = $1, revision = revision + 1 where id = $2`, [nowIso(), id]);
      if (existingRecord.linkedLedgerTransactionId) {
        await this.db.execute(
          `update ledger_transactions set deleted_at = $1, updated_at = $1, revision = revision + 1 where id = $2`,
          [nowIso(), existingRecord.linkedLedgerTransactionId],
        );
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
      if (quote.nameZh) {
        await this.db.execute(
          `update portfolio_assets set name_zh = $1, updated_at = $2, revision = revision + 1
           where upper(ticker) = upper($3) and deleted_at is null`,
          [quote.nameZh, updatedAt, quote.symbol],
        );
      }
      if (quote.nameEn) {
        await this.db.execute(
          `update portfolio_assets set name_en = $1, updated_at = $2, revision = revision + 1
           where upper(ticker) = upper($3) and deleted_at is null`,
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
       display_mode as displayMode, account_share_map as accountShareMap
       from financial_goals where deleted_at is null order by created_at asc`,
    );
    return rows.map((row) => ({
      ...row,
      kind: (row.kind === "custom" ? "custom" : "fire") as GoalKind,
      // Legacy rows may hold percent-unit rates; normalize to canonical decimal.
      withdrawalRate: normalizeRateUnit(row.withdrawalRate) ?? 0.04,
      expectedAnnualReturn: normalizeRateUnit(row.expectedAnnualReturn) ?? 0.07,
      targetAmount: row.targetAmount ?? null,
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
         spending_items = $19, income_items = $20, display_mode = $21, account_share_map = $22
         where id = $23`,
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
         spending_items, income_items, display_mode, account_share_map)
       values ($1,$2,1,$3,$3,null,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)`,
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
    const [accounts, ledger, assetsList, investments, recurring, recurringInvestments, quotes, settings, fx, prices, goals, manualSnapshots] = await Promise.all([
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
    ]);
    const metaRows = await this.db.select<Array<{ value: string }>>(`select value from app_settings where key = '__settingsMeta'`);
    const meta = metaRows[0] ? JSON.parse(metaRows[0].value) : { revision: 1, updatedAt: nowIso() };
    return {
      version: 1,
      exportedAt: nowIso(),
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
    };
  }

  protected override async allSyncRecords(): Promise<SyncSource> {
    const q = (table: string) =>
      this.db.select<Array<{ id: string; revision: number; updatedAt: string; deletedAt: string | null }>>(
        `select id, revision, updated_at as updatedAt, deleted_at as deletedAt from ${table}`,
      );
    const [accounts, ledger, assets, investments, recurring, recurringInvestments, goals] = await Promise.all([
      q("accounts"),
      q("ledger_transactions"),
      q("portfolio_assets"),
      q("investment_records"),
      q("recurring_transactions"),
      q("recurring_investments"),
      q("financial_goals"),
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
      };
      await this.db.execute(
        `update ${tableByEntity[conflict.entity]} set revision = revision + 1, updated_at = $1 where id = $2`,
        [nowIso(), conflict.entityId],
      );
    }
    await this.db.execute(`update sync_conflicts set resolved_at = $1 where id = $2`, [nowIso(), id]);
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
    };
    const rows = await this.db.select<Array<Record<string, unknown>>>(
      `select * from ${tableByEntity[entity]} where id = $1 limit 1`,
      [entityId],
    );
    return rows[0] ? normalizeSqliteSyncPayload(entity, rows[0]) : null;
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
      console.debug("[import] cleared existing tables");

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
               spending_items, income_items, display_mode, account_share_map)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)`,
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

  private async insertAccountRow(row: Account) {
    const now = nowIso();
    await this.db.execute(
      `insert into accounts (id, space_id, revision, created_at, updated_at, deleted_at, name, currency, opening_balance, balance, type, credit_limit, credit_limit_group, is_shared_to_household, loan_start_date, annual_interest_rate, loan_term, icon_name, color, statement_day, payment_due_day, credit_payment_paid_until, custom_group)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
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
        Number(row.isSharedToHousehold ?? false),
        row.loanStartDate ?? null,
        row.annualInterestRate ?? null,
        row.loanTerm ?? null,
        row.iconName ?? null,
        row.color ?? null,
        row.statementDay ?? null,
        row.paymentDueDay ?? null,
        row.creditPaymentPaidUntil ?? null,
        row.customGroup ?? "",
      ],
    );
  }

  private async insertAssetRow(row: PortfolioAsset) {
    const now = nowIso();
    await this.db.execute(
      `insert into portfolio_assets (id, space_id, revision, created_at, updated_at, deleted_at, ticker, name, name_zh, name_en, currency, total_quantity, average_cost, holding_source, acquisition_date, asset_type, sector, industry, account_id, base_quantity)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
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
        row.accountId ?? null,
        row.baseQuantity ?? null,
      ],
    );
  }

  private async insertLedgerRow(row: LedgerTransaction) {
    const now = nowIso();
    await this.db.execute(
      `insert into ledger_transactions (id, space_id, revision, created_at, updated_at, deleted_at, account_id, counter_account_id, date, name, amount, currency, original_amount, original_currency, category, subcategory, merchant, entry_type, settlement_status, note, linked_investment_record_id, group_id, is_reviewed, receipt_attachment_id, recurring_rule_id, recurring_occurrence_key, installment_group_id, installment_index, installment_total, refund_of_ledger_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30)`,
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
      `insert into investment_records (id, space_id, revision, created_at, updated_at, deleted_at, asset_id, linked_account_id, date, action, price, quantity, fee, note, is_reviewed, linked_ledger_transaction_id, cashless)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
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
      ],
    );
  }

  private async insertGoalRow(goal: FinancialGoal) {
    const now = nowIso();
    await this.db.execute(
      `insert into financial_goals (id, space_id, revision, created_at, updated_at, deleted_at, kind, name, currency,
         annual_spending, withdrawal_rate, expected_annual_return, monthly_contribution, target_amount, start_date,
         current_age, retirement_age, plan_through_age, pre_retirement_return, post_retirement_return,
         inflation_rate, annual_fee, contribution_growth_rate, spending_items, income_items, display_mode, account_share_map)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)`,
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

  private async findSqliteManualAsset(ticker: string, accountId: string | null) {
    if (!accountId) return undefined;
    const rows = await this.db.select<Array<{ id: string; totalQuantity: number; baseQuantity: number | null }>>(
      `select id, total_quantity as totalQuantity, base_quantity as baseQuantity from portfolio_assets where ticker = $1 and holding_source = 'manual' and account_id = $2 and deleted_at is null limit 1`,
      [ticker, accountId],
    );
    return rows[0];
  }

  private async findOrCreateSqliteAsset(input: InvestmentDraft) {
    const ticker = input.ticker.trim().toUpperCase();
    const existingId = await this.findSqliteTransactionAssetId(input);
    if (existingId) return existingId;
    const manualAsset = await this.findSqliteManualAsset(ticker, input.linkedAccountId ?? null);
    if (manualAsset) return manualAsset.id;
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

  private async ensureSyncInfrastructure() {
    await this.ensureSqliteColumn("sync_outbox", "updated_at", "text");
    await this.ensureSqliteColumn("sync_outbox", "deleted_at", "text");
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
    const tables: Array<[string, Exclude<SyncEntity, "settings">]> = [
      ["accounts", "account"],
      ["ledger_transactions", "ledger"],
      ["portfolio_assets", "asset"],
      ["investment_records", "investment"],
      ["recurring_transactions", "recurring"],
      ["recurring_investments", "recurringInvestment"],
      ["financial_goals", "goal"],
    ];
    for (const [table, entity] of tables) {
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
    const tables: Array<[string, Exclude<SyncEntity, "settings">]> = [
      ["accounts", "account"],
      ["ledger_transactions", "ledger"],
      ["portfolio_assets", "asset"],
      ["investment_records", "investment"],
      ["recurring_transactions", "recurring"],
      ["recurring_investments", "recurringInvestment"],
      ["financial_goals", "goal"],
    ];
    for (const [table, entity] of tables) {
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
    };
    await this.db.execute(`delete from ${tableByEntity[change.entity]} where id = $1`, [String(payload.id)]);
    switch (change.entity) {
      case "account": await this.insertAccountRow(payload as unknown as Account); break;
      case "ledger": await this.insertLedgerRow(payload as unknown as LedgerTransaction); break;
      case "asset": await this.insertAssetRow(payload as unknown as PortfolioAsset); break;
      case "investment": await this.insertInvestmentRow(payload as unknown as InvestmentRecord); break;
      case "recurring": await this.insertRecurringRow(payload as unknown as RecurringTransaction); break;
      case "recurringInvestment": await this.insertRecurringInvestmentRow(payload as unknown as RecurringInvestment); break;
      case "goal": await this.insertGoalRow(payload as unknown as FinancialGoal); break;
    }
  }

  private async ensureSqliteColumn(table: string, column: string, definition: string) {
    const rows = await this.db.select<Array<{ name: string }>>(`pragma table_info(${table})`);
    if (rows.some((row) => row.name === column)) return;
    await this.db.execute(`alter table ${table} add column ${column} ${definition}`);
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
    await this.db.execute(
      `insert into accounts (id, space_id, revision, created_at, updated_at, deleted_at, name, currency, opening_balance, balance, type, credit_limit, credit_limit_group, is_shared_to_household)
       values ($1,$2,1,$3,$3,null,$4,$5,0,0,$6,null,'',0)`,
      [id, personalSpace, timestamp, unassignedAccountName, "TWD", "investment"],
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
    const ledger = await this.db.select<LedgerTransaction[]>(`select
      id, space_id as spaceId, revision, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt,
      account_id as accountId, counter_account_id as counterAccountId, date, name, amount, currency, original_amount as originalAmount, original_currency as originalCurrency,
      category, subcategory, merchant, entry_type as entryType, settlement_status as settlementStatus, note, linked_investment_record_id as linkedInvestmentRecordId,
      group_id as groupId, is_reviewed as isReviewed, receipt_attachment_id as receiptAttachmentId, recurring_occurrence_key as recurringOccurrenceKey from ledger_transactions`);
    for (const account of recomputeAccounts(accounts, ledger)) {
      await this.db.execute(`update accounts set balance = $1 where id = $2`, [account.balance, account.id]);
    }
  }

  private async recomputeSqliteAssets() {
    const assets = await this.listPortfolioAssets();
    const records = await this.listInvestmentRecords();
    for (const asset of recomputeAssets(assets, records)) {
      // Manual holdings now carry their opening lot as a record, so every asset
      // with records persists both derived quantity AND blended average cost.
      // Skip assets with no records (manual snapshot pre-migration edge).
      if (!records.some((r) => r.assetId === asset.id)) continue;
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

function normalizeStoredData(data: Partial<RepositoryData>): RepositoryData {
  const portfolioAssets = (data.portfolioAssets ?? []).map(normalizePortfolioAsset);
  return {
    accounts: (data.accounts ?? []).map((account) => ({
      ...account,
      creditLimit: account.creditLimit ?? null,
      creditLimitGroup: account.creditLimitGroup ?? "",
      customGroup: account.customGroup ?? "",
    })),
    ledgerTransactions: (data.ledgerTransactions ?? []).map((row) => ({
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
    investmentRecords: materializeOpeningRecords(portfolioAssets, data.investmentRecords ?? []),
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

function normalizeCategoryGroups(input: unknown) {
  const source = Array.isArray(input) ? input : [];
  return source.map((item) => {
    if (typeof item === "string") return { name: item, children: [] };
    const group = item as { name?: unknown; children?: unknown; icon?: unknown; iconName?: unknown; color?: unknown; budget?: unknown };
    return {
      name: String(group.name ?? "").trim(),
      children: uniqueClean(group.children, []),
      iconName: group.iconName ? String(group.iconName) : group.icon ? String(group.icon) : undefined,
      color: group.color ? String(group.color) : undefined,
      budget: typeof group.budget === "number" ? group.budget : group.budget ? Number(group.budget) : undefined,
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
    // baseQuantity is vestigial now that quantity derives from records (incl.
    // the opening-balance lot). Kept as a nullable column for back-compat.
    baseQuantity: null,
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
  };
}

function assetClassificationFields(input: Pick<PortfolioAssetDraft, "assetType" | "sector" | "industry">) {
  return {
    assetType: normalizeAssetType(input.assetType),
    sector: cleanOptionalText(input.sector),
    industry: cleanOptionalText(input.industry),
  };
}

function normalizeAssetType(value: unknown): AssetType | null {
  const normalized = String(value ?? "").trim();
  const allowed: AssetType[] = ["equity", "etf", "mutual_fund", "index", "crypto", "cash", "other"];
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
    installmentGroupId: input.installmentGroupId ?? null,
    installmentIndex: input.installmentIndex ?? null,
    installmentTotal: input.installmentTotal ?? null,
    refundOfLedgerId: input.refundOfLedgerId ?? null,
    isReviewed: false,
    receiptAttachmentId: null,
    recurringRuleId: input.recurringRuleId ?? null,
    recurringOccurrenceKey: input.recurringOccurrenceKey ?? null,
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
    nextRunDate: firstFutureRunDate(input.nextRunDate, frequency, input.dayOfMonth),
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
    nextRunDate: firstFutureRunDate(input.nextRunDate, frequency, input.dayOfMonth),
  };
}

// Resolve the buy InvestmentDraft for one occurrence of a recurring investment.
// fixedShares uses the stored share count; fixedAmount derives shares from the
// reference price. The 交割款 (cash settlement) is drawn from `accountId`.
function recurringInvestmentToDraft(rule: RecurringInvestment): InvestmentDraft {
  const price = Math.max(0, rule.price || 0);
  const quantity = rule.mode === "fixedShares"
    ? Math.max(0, rule.quantity || 0)
    : price > 0 ? rule.amount / price : 0;
  if (!(price > 0) || !(quantity > 0)) {
    throw new Error("請先設定參考價格與金額／股數，才能記錄這期定期定額。");
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
