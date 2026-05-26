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
  PortfolioAsset,
  RecurringTransaction,
  SpendingItem,
} from "../domain/types";
import type { MarketQuote } from "../features/market-data";
import { calculateInvestmentAccountQuantity, calculateInvestmentCashDelta, isEffectivelyNegative } from "../domain/investmentCash";
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
  date: string;
  name: string;
  amount: number;
  currency: string;
  category: string;
  subcategory: string;
  merchant: string;
  entryType: "income" | "expense" | "transfer";
  settlementStatus: "settled" | "receivable" | "payable";
  note: string;
  groupId?: string | null;
}

export type AccountDraft = Pick<Account, "name" | "currency" | "openingBalance" | "type" | "creditLimit" | "creditLimitGroup" | "isSharedToHousehold">;

export interface RecurringDraft {
  accountId: string;
  amount: number;
  currency: string;
  category: string;
  subcategory: string;
  merchant: string;
  entryType: "income" | "expense";
  settlementStatus: "settled" | "receivable" | "payable";
  note: string;
  dayOfMonth: number;
  nextRunDate: string;
  isActive: boolean;
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
  updateLedgerTransaction(id: string, input: LedgerDraft): Promise<void>;
  deleteLedgerTransaction(id: string): Promise<void>;
  createTransfer(input: TransferDraft): Promise<void>;
  importLedgerTransactions(rows: LedgerDraft[]): Promise<void>;
  listPortfolioAssets(): Promise<PortfolioAsset[]>;
  createManualHolding(input: PortfolioAssetDraft): Promise<void>;
  updateManualHolding(id: string, input: PortfolioAssetDraft): Promise<void>;
  updateAssetClassification(id: string, input: Pick<PortfolioAssetDraft, "assetType" | "sector" | "industry">): Promise<void>;
  deleteManualHolding(id: string): Promise<void>;
  listInvestmentRecords(): Promise<InvestmentRecord[]>;
  createInvestmentRecord(input: InvestmentDraft): Promise<void>;
  updateInvestmentRecord(id: string, input: InvestmentDraft): Promise<void>;
  deleteInvestmentRecord(id: string): Promise<void>;
  importInvestmentRecords(rows: InvestmentDraft[]): Promise<void>;
  listRecurringTransactions(): Promise<RecurringTransaction[]>;
  createRecurringTransaction(input: RecurringDraft): Promise<void>;
  updateRecurringTransaction(id: string, input: RecurringDraft): Promise<void>;
  deleteRecurringTransaction(id: string): Promise<void>;
  postRecurringTransaction(id: string): Promise<void>;
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
  listFinancialGoals(): Promise<FinancialGoal[]>;
  upsertFinancialGoal(input: FinancialGoalDraft & { id?: string }): Promise<FinancialGoal>;
  deleteFinancialGoal(id: string): Promise<void>;
  exportSnapshot(): Promise<RepositorySnapshot>;
  importSnapshot(snapshot: RepositorySnapshot): Promise<void>;
}

export interface RepositorySnapshot {
  version: number;
  exportedAt: string;
  accounts: Account[];
  ledgerTransactions: LedgerTransaction[];
  portfolioAssets: PortfolioAsset[];
  investmentRecords: InvestmentRecord[];
  recurringTransactions: RecurringTransaction[];
  marketQuotes: StoredMarketQuote[];
  settings: AppSettings;
  dailyFxRates: DailyFxRate[];
  dailyPrices: DailyPrice[];
  financialGoals?: FinancialGoal[];
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
  marketQuotes: StoredMarketQuote[];
  settings: AppSettings;
  dailyFxRates: DailyFxRate[];
  dailyPrices: DailyPrice[];
  financialGoals: FinancialGoal[];
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

async function createFinanceRepository(): Promise<FinanceRepository> {
  if (isTauriRuntime()) {
    const mod = await import("@tauri-apps/plugin-sql");
    const db = await mod.default.load("sqlite:northstar.db");
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

function recomputeAccounts(accounts: Account[], ledger: LedgerTransaction[]) {
  const activeLedger = active(ledger).filter((row) => row.settlementStatus === "settled");
  return accounts.map((account) => {
    if (account.deletedAt !== null) return account;
    const total = activeLedger
      .filter((row) => row.accountId === account.id)
      .reduce((sum, row) => sum + row.amount, 0);
    return { ...account, balance: account.openingBalance + total };
  });
}

function recomputeAssets(assets: PortfolioAsset[], records: InvestmentRecord[]) {
  const activeRecords = active(records);
  return assets.map((asset) => {
    if (asset.deletedAt !== null) return asset;
    if (asset.holdingSource === "manual") return asset;
    const assetRecords = activeRecords.filter((record) => record.assetId === asset.id);
    let quantity = 0;
    let cost = 0;
    for (const record of assetRecords.sort((a, b) => a.date.localeCompare(b.date))) {
      if (record.action === "buy") {
        quantity += record.quantity;
        cost += record.price * record.quantity + record.fee;
      } else if (record.action === "sell") {
        const averageCost = quantity === 0 ? 0 : cost / quantity;
        quantity -= record.quantity;
        cost -= averageCost * record.quantity;
      } else if (record.action === "stockDividend") {
        quantity += record.quantity;
      } else if (record.action === "capitalReduction") {
        cost = Math.max(0, cost - record.price * record.quantity);
      } else if (record.action === "stockSplit" && record.quantity > 0) {
        quantity *= record.quantity;
      }
    }
    return {
      ...asset,
      totalQuantity: quantity,
      averageCost: quantity === 0 ? 0 : cost / quantity,
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
    return active(this.data.accounts);
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
    this.data.ledgerTransactions.push(createLedgerRow(input));
    this.recompute();
    await this.persist();
  }

  async updateLedgerTransaction(id: string, input: LedgerDraft) {
    this.data.ledgerTransactions = this.data.ledgerTransactions.map((row) =>
      row.id === id ? bump({ ...row, ...input, groupId: input.groupId ?? null }) : row,
    );
    this.recompute();
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

  async createTransfer(input: TransferDraft) {
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
    this.recompute();
    await this.persist();
  }

  async importLedgerTransactions(rows: LedgerDraft[]) {
    this.data.ledgerTransactions.push(...rows.map(createLedgerRow));
    this.recompute();
    await this.persist();
  }

  async listPortfolioAssets() {
    return active(this.data.portfolioAssets);
  }

  async createManualHolding(input: PortfolioAssetDraft) {
    this.data.portfolioAssets.push(createManualHoldingRow(input));
    await this.persist();
  }

  async updateManualHolding(id: string, input: PortfolioAssetDraft) {
    this.data.portfolioAssets = this.data.portfolioAssets.map((asset) =>
      asset.id === id && asset.holdingSource === "manual" ? bump({ ...asset, ...manualHoldingFields(input) }) : asset,
    );
    await this.persist();
  }

  async updateAssetClassification(id: string, input: Pick<PortfolioAssetDraft, "assetType" | "sector" | "industry">) {
    this.data.portfolioAssets = this.data.portfolioAssets.map((asset) =>
      asset.id === id && asset.deletedAt === null ? bump({ ...asset, ...assetClassificationFields(input) }) : asset,
    );
    await this.persist();
  }

  async deleteManualHolding(id: string) {
    const hasRecords = this.data.investmentRecords.some((record) => record.assetId === id && record.deletedAt === null);
    if (hasRecords) throw new Error("已有逐筆交易的持倉不能直接刪除。");
    this.data.portfolioAssets = this.data.portfolioAssets.map((asset) =>
      asset.id === id && asset.holdingSource === "manual" ? bump({ ...asset, deletedAt: nowIso() }) : asset,
    );
    await this.persist();
  }

  async listInvestmentRecords() {
    return active(this.data.investmentRecords).sort((a, b) => b.date.localeCompare(a.date));
  }

  async createInvestmentRecord(input: InvestmentDraft) {
    const existingAsset = this.findTransactionAsset(input);
    this.validateInvestmentDraft(input, existingAsset?.id);
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
    const existingAsset = this.findTransactionAsset(input);
    this.validateInvestmentDraft(input, existingAsset?.id, {
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
      const existingAsset = this.findTransactionAsset(row);
      this.validateInvestmentDraft(row, existingAsset?.id);
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

  async listRecurringTransactions() {
    return active(this.data.recurringTransactions);
  }

  async createRecurringTransaction(input: RecurringDraft) {
    this.data.recurringTransactions.push(createRecurringRow(input));
    await this.persist();
  }

  async updateRecurringTransaction(id: string, input: RecurringDraft) {
    this.data.recurringTransactions = this.data.recurringTransactions.map((row) =>
      row.id === id ? bump({ ...row, ...input }) : row,
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
    this.data.ledgerTransactions.push(createLedgerRow({
      accountId: recurring.accountId,
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
    }));
    this.data.recurringTransactions = this.data.recurringTransactions.map((row) =>
      row.id === id ? bump({ ...row, nextRunDate: nextMonthlyDate(row.nextRunDate, row.dayOfMonth) }) : row,
    );
    this.recompute();
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
      marketQuotes: this.data.marketQuotes,
      settings: this.data.settings,
      dailyFxRates: this.data.dailyFxRates,
      dailyPrices: this.data.dailyPrices,
      financialGoals: this.data.financialGoals,
    };
  }

  async importSnapshot(snapshot: RepositorySnapshot) {
    this.data = normalizeStoredData({
      accounts: snapshot.accounts,
      ledgerTransactions: snapshot.ledgerTransactions,
      portfolioAssets: snapshot.portfolioAssets,
      investmentRecords: snapshot.investmentRecords,
      recurringTransactions: snapshot.recurringTransactions,
      marketQuotes: snapshot.marketQuotes,
      settings: snapshot.settings,
      dailyFxRates: snapshot.dailyFxRates,
      dailyPrices: snapshot.dailyPrices,
      financialGoals: snapshot.financialGoals,
    });
    await this.persist();
  }

  private findTransactionAsset(input: InvestmentDraft): PortfolioAsset | undefined {
    const ticker = input.ticker.trim().toUpperCase();
    return this.data.portfolioAssets.find((item) => item.ticker === ticker && item.deletedAt === null && item.holdingSource === "transactions");
  }

  private findOrCreateAsset(input: InvestmentDraft): PortfolioAsset {
    const ticker = input.ticker.trim().toUpperCase();
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
    };
    this.data.portfolioAssets.push(asset);
    return asset;
  }

  private validateInvestmentDraft(
    input: InvestmentDraft,
    assetId: string | undefined,
    options: { excludeRecordId?: string; excludeLedgerId?: string | null } = {},
  ) {
    const account = this.data.accounts.find((row) => row.id === input.linkedAccountId && row.deletedAt === null);
    if (!account || account.type !== "investment") throw new Error("請選擇投資帳戶。");
    if (input.currency.trim().toUpperCase() !== account.currency.trim().toUpperCase()) throw new Error("交易幣別必須與投資帳戶一致。");

    if (input.action === "sell") {
      if (!assetId) throw new Error("賣出股數大於目前庫存。");
      const available = calculateInvestmentAccountQuantity(this.data.investmentRecords, assetId, account.id, options.excludeRecordId);
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

class TauriSqlFinanceRepository extends BrowserFinanceRepository {
  constructor(private readonly db: Database) {
    super();
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
    await this.ensureSqliteColumn("portfolio_assets", "holding_source", "text not null default 'transactions'");
    await this.ensureSqliteColumn("portfolio_assets", "acquisition_date", "text");
    await this.ensureSqliteColumn("portfolio_assets", "name_zh", "text");
    await this.ensureSqliteColumn("portfolio_assets", "name_en", "text");
    await this.ensureSqliteColumn("portfolio_assets", "account_id", "text");
    await this.ensureSqliteColumn("portfolio_assets", "asset_type", "text");
    await this.ensureSqliteColumn("portfolio_assets", "sector", "text");
    await this.ensureSqliteColumn("portfolio_assets", "industry", "text");
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
    await this.backfillUnassignedAccount();
    await this.ensureDefaultSettings();
    const rows = await this.db.select<Array<{ count: number }>>("select count(*) as count from accounts");
    if ((rows[0]?.count ?? 0) === 0) {
      await this.seedSqlite();
    }
  }

  override async listAccounts() {
    return (await this.db.select<Account[]>(`select
      id, space_id as spaceId, revision, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt,
      name, currency, opening_balance as openingBalance, balance, type, credit_limit as creditLimit, credit_limit_group as creditLimitGroup, is_shared_to_household as isSharedToHousehold
      from accounts where deleted_at is null order by name`)).map((row) => ({
        ...row,
        creditLimit: row.creditLimit ?? null,
        creditLimitGroup: row.creditLimitGroup ?? "",
        isSharedToHousehold: Boolean(row.isSharedToHousehold),
      }));
  }

  override async createAccount(input: AccountDraft) {
    const timestamp = nowIso();
    await this.db.execute(
      `insert into accounts (id, space_id, revision, created_at, updated_at, deleted_at, name, currency, opening_balance, balance, type, credit_limit, credit_limit_group, is_shared_to_household)
       values ($1,$2,1,$3,$3,null,$4,$5,$6,$6,$7,$8,$9,$10)`,
      [createId("acct"), personalSpace, timestamp, input.name, input.currency, input.openingBalance, input.type, input.type === "credit" ? input.creditLimit : null, input.type === "credit" ? input.creditLimitGroup : "", Number(input.isSharedToHousehold)],
    );
  }

  override async updateAccount(id: string, input: AccountDraft) {
    await this.db.execute(
      `update accounts set revision = revision + 1, updated_at = $1, name = $2, currency = $3, opening_balance = $4, type = $5, credit_limit = $6, credit_limit_group = $7, is_shared_to_household = $8 where id = $9`,
      [nowIso(), input.name, input.currency, input.openingBalance, input.type, input.type === "credit" ? input.creditLimit : null, input.type === "credit" ? input.creditLimitGroup : "", Number(input.isSharedToHousehold), id],
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
      account_id as accountId, date, name, amount, currency, category, subcategory, merchant, entry_type as entryType, settlement_status as settlementStatus, note,
      linked_investment_record_id as linkedInvestmentRecordId, group_id as groupId,
      is_reviewed as isReviewed, receipt_attachment_id as receiptAttachmentId
      from ledger_transactions where deleted_at is null order by date desc, created_at desc`);
  }

  override async createLedgerTransaction(input: LedgerDraft) {
    await this.insertLedgerRow(createLedgerRow(input));
    await this.recomputeSqliteAccounts();
  }

  override async updateLedgerTransaction(id: string, input: LedgerDraft) {
    await this.db.execute(
      `update ledger_transactions set revision = revision + 1, updated_at = $1, account_id = $2, date = $3, name = $4, amount = $5, currency = $6, category = $7, subcategory = $8, merchant = $9, entry_type = $10, settlement_status = $11, note = $12, group_id = $13 where id = $14`,
      [nowIso(), input.accountId, input.date, input.name, input.amount, input.currency, input.category, input.subcategory, input.merchant, input.entryType, input.settlementStatus, input.note, input.groupId ?? null, id],
    );
    await this.recomputeSqliteAccounts();
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

  override async createTransfer(input: TransferDraft) {
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
    await this.recomputeSqliteAccounts();
  }

  override async importLedgerTransactions(rows: LedgerDraft[]) {
    for (const row of rows) await this.insertLedgerRow(createLedgerRow(row));
    await this.recomputeSqliteAccounts();
  }

  override async listPortfolioAssets() {
    const rows = await this.db.select<PortfolioAsset[]>(`select
      id, space_id as spaceId, revision, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt,
      ticker, name, name_zh as nameZh, name_en as nameEn, currency, total_quantity as totalQuantity, average_cost as averageCost, holding_source as holdingSource, acquisition_date as acquisitionDate,
      asset_type as assetType, sector, industry, account_id as accountId
      from portfolio_assets where deleted_at is null order by ticker`);
    return rows.map((row) => ({
      ...row,
      nameZh: row.nameZh ?? null,
      nameEn: row.nameEn ?? null,
      assetType: row.assetType ?? null,
      sector: row.sector ?? null,
      industry: row.industry ?? null,
      accountId: row.accountId ?? null,
    }));
  }

  override async createManualHolding(input: PortfolioAssetDraft) {
    await this.insertAssetRow(createManualHoldingRow(input));
  }

  override async updateManualHolding(id: string, input: PortfolioAssetDraft) {
    const classification = assetClassificationFields(input);
    await this.db.execute(
      `update portfolio_assets set revision = revision + 1, updated_at = $1, ticker = $2, name = $3, currency = $4, total_quantity = $5, average_cost = $6, acquisition_date = $7, account_id = $8, asset_type = $9, sector = $10, industry = $11 where id = $12 and holding_source = 'manual'`,
      [nowIso(), input.ticker.trim().toUpperCase(), input.name.trim() || input.ticker.trim().toUpperCase(), input.currency.trim().toUpperCase(), input.totalQuantity, input.averageCost, input.acquisitionDate || null, input.accountId || null, classification.assetType, classification.sector, classification.industry, id],
    );
  }

  override async updateAssetClassification(id: string, input: Pick<PortfolioAssetDraft, "assetType" | "sector" | "industry">) {
    const classification = assetClassificationFields(input);
    await this.db.execute(
      `update portfolio_assets set revision = revision + 1, updated_at = $1, asset_type = $2, sector = $3, industry = $4 where id = $5 and deleted_at is null`,
      [nowIso(), classification.assetType, classification.sector, classification.industry, id],
    );
  }

  override async deleteManualHolding(id: string) {
    const linked = await this.db.select<Array<{ count: number }>>(
      `select count(*) as count from investment_records where asset_id = $1 and deleted_at is null`,
      [id],
    );
    if ((linked[0]?.count ?? 0) > 0) throw new Error("已有逐筆交易的持倉不能直接刪除。");
    await this.db.execute(
      `update portfolio_assets set deleted_at = $1, updated_at = $1, revision = revision + 1 where id = $2 and holding_source = 'manual'`,
      [nowIso(), id],
    );
  }

  override async listInvestmentRecords() {
    return this.db.select<InvestmentRecord[]>(`select
      id, space_id as spaceId, revision, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt,
      asset_id as assetId, linked_account_id as linkedAccountId, date, action, price, quantity, fee, note,
      is_reviewed as isReviewed, linked_ledger_transaction_id as linkedLedgerTransactionId
      from investment_records where deleted_at is null order by date desc, created_at desc`);
  }

  override async createInvestmentRecord(input: InvestmentDraft) {
    const existingAssetId = await this.findSqliteTransactionAssetId(input);
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
  }

  override async updateInvestmentRecord(id: string, input: InvestmentDraft) {
    const existingRows = await this.db.select<InvestmentRecord[]>(`select
      id, space_id as spaceId, revision, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt,
      asset_id as assetId, linked_account_id as linkedAccountId, date, action, price, quantity, fee, note,
      is_reviewed as isReviewed, linked_ledger_transaction_id as linkedLedgerTransactionId
      from investment_records where id = $1 and deleted_at is null`, [id]);
    const existingRecord = existingRows[0];
    if (!existingRecord) throw new Error("找不到投資交易。");
    const existingAssetId = await this.findSqliteTransactionAssetId(input);
    await this.validateSqliteInvestmentDraft(input, existingAssetId, {
      excludeRecordId: id,
      excludeLedgerId: existingRecord.linkedLedgerTransactionId,
    });
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
  }

  override async deleteInvestmentRecord(id: string) {
    const existingRows = await this.db.select<Array<{ linkedLedgerTransactionId: string | null }>>(
      `select linked_ledger_transaction_id as linkedLedgerTransactionId from investment_records where id = $1 and deleted_at is null`,
      [id],
    );
    const existingRecord = existingRows[0];
    if (!existingRecord) throw new Error("找不到投資交易。");
    await this.db.execute(`update investment_records set deleted_at = $1, updated_at = $1, revision = revision + 1 where id = $2`, [nowIso(), id]);
    if (existingRecord.linkedLedgerTransactionId) {
      await this.db.execute(
        `update ledger_transactions set deleted_at = $1, updated_at = $1, revision = revision + 1 where id = $2`,
        [nowIso(), existingRecord.linkedLedgerTransactionId],
      );
    }
    await this.recomputeSqliteAccounts();
    await this.recomputeSqliteAssets();
  }

  override async importInvestmentRecords(rows: InvestmentDraft[]) {
    for (const row of rows) {
      const existingAssetId = await this.findSqliteTransactionAssetId(row);
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
  }

  override async listRecurringTransactions() {
    return this.db.select<RecurringTransaction[]>(`select
      id, space_id as spaceId, revision, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt,
      account_id as accountId, amount, currency, category, subcategory, merchant, entry_type as entryType, settlement_status as settlementStatus, note, day_of_month as dayOfMonth, next_run_date as nextRunDate, is_active as isActive
      from recurring_transactions where deleted_at is null order by next_run_date`);
  }

  override async createRecurringTransaction(input: RecurringDraft) {
    await this.insertRecurringRow(createRecurringRow(input));
  }

  override async updateRecurringTransaction(id: string, input: RecurringDraft) {
    await this.db.execute(
      `update recurring_transactions set revision = revision + 1, updated_at = $1, account_id = $2, amount = $3, currency = $4, category = $5, subcategory = $6, merchant = $7, entry_type = $8, settlement_status = $9, note = $10, day_of_month = $11, next_run_date = $12, is_active = $13 where id = $14`,
      [nowIso(), input.accountId, input.amount, input.currency, input.category, input.subcategory, input.merchant, input.entryType, input.settlementStatus, input.note, input.dayOfMonth, input.nextRunDate, Number(input.isActive), id],
    );
  }

  override async deleteRecurringTransaction(id: string) {
    await this.db.execute(`update recurring_transactions set deleted_at = $1, updated_at = $1, revision = revision + 1 where id = $2`, [nowIso(), id]);
  }

  override async postRecurringTransaction(id: string) {
    const rows = await this.db.select<RecurringTransaction[]>(`select
      id, space_id as spaceId, revision, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt,
      account_id as accountId, amount, currency, category, subcategory, merchant, entry_type as entryType, settlement_status as settlementStatus, note, day_of_month as dayOfMonth, next_run_date as nextRunDate, is_active as isActive
      from recurring_transactions where id = $1 and deleted_at is null`, [id]);
    const recurring = rows[0];
    if (!recurring) throw new Error("找不到週期事件。");
    await this.insertLedgerRow(createLedgerRow({
      accountId: recurring.accountId,
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
    }));
    await this.db.execute(`update recurring_transactions set next_run_date = $1, updated_at = $2, revision = revision + 1 where id = $3`, [nextMonthlyDate(recurring.nextRunDate, recurring.dayOfMonth), nowIso(), id]);
    await this.recomputeSqliteAccounts();
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
    const [accounts, ledger, assetsList, investments, recurring, quotes, settings, fx, prices, goals] = await Promise.all([
      this.listAccounts(),
      this.listLedgerTransactions(),
      this.listPortfolioAssets(),
      this.listInvestmentRecords(),
      this.listRecurringTransactions(),
      this.listMarketQuotes(),
      this.getAppSettings(),
      this.listDailyFxRates(),
      this.listDailyPrices(),
      this.listFinancialGoals(),
    ]);
    return {
      version: 1,
      exportedAt: nowIso(),
      accounts,
      ledgerTransactions: ledger,
      portfolioAssets: assetsList,
      investmentRecords: investments,
      recurringTransactions: recurring,
      marketQuotes: quotes,
      settings,
      dailyFxRates: fx,
      dailyPrices: prices,
      financialGoals: goals,
    };
  }

  override async importSnapshot(snapshot: RepositorySnapshot) {
    // Wrap everything in a single transaction so SQLite skips per-row fsync
    // (which is the dominant cost) and the whole import either lands or
    // rolls back. Without this a 60k-row dailyPrices payload would take
    // many minutes and feel like the app is frozen.
    const t0 = performance.now();
    await this.db.execute("BEGIN");
    try {
      await this.db.execute("delete from sync_outbox");
      await this.db.execute("delete from market_quotes");
      await this.db.execute("delete from fx_rates");
      await this.db.execute("delete from daily_prices");
      await this.db.execute("delete from recurring_transactions");
      await this.db.execute("delete from investment_records");
      await this.db.execute("delete from ledger_transactions");
      await this.db.execute("delete from portfolio_assets");
      await this.db.execute("delete from accounts");
      await this.db.execute("delete from app_settings");
      await this.db.execute("delete from financial_goals");
      console.log("[import] cleared existing tables");

      for (const account of snapshot.accounts) await this.insertAccountRow(account);
      console.log(`[import] inserted ${snapshot.accounts.length} accounts`);

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
      console.log(`[import] inserted ${snapshot.portfolioAssets.length} portfolio_assets`);

      for (const row of snapshot.investmentRecords) await this.insertInvestmentRow(row);
      console.log(`[import] inserted ${snapshot.investmentRecords.length} investment_records`);

      for (const row of snapshot.ledgerTransactions) {
        await this.insertLedgerRow({ ...row, name: row.name ?? row.merchant ?? "" });
      }
      console.log(`[import] inserted ${snapshot.ledgerTransactions.length} ledger_transactions`);

      for (const row of snapshot.recurringTransactions) await this.insertRecurringRow(row);
      console.log(`[import] inserted ${snapshot.recurringTransactions.length} recurring_transactions`);

      if (snapshot.marketQuotes.length) {
        await this.saveMarketQuotes(snapshot.marketQuotes, snapshot.marketQuotes[0]?.source ?? "import");
        console.log(`[import] saved ${snapshot.marketQuotes.length} market_quotes`);
      }
      if (snapshot.dailyFxRates.length) {
        await this.saveDailyFxRates(snapshot.dailyFxRates);
        console.log(`[import] saved ${snapshot.dailyFxRates.length} fx_rates`);
      }
      if (snapshot.dailyPrices.length) {
        await this.saveDailyPrices(snapshot.dailyPrices);
        console.log(`[import] saved ${snapshot.dailyPrices.length} daily_prices`);
      }
      if (snapshot.financialGoals?.length) {
        for (const goal of snapshot.financialGoals) {
          await this.db.execute(
            `insert into financial_goals (id, space_id, revision, created_at, updated_at, deleted_at, kind, name, currency,
               annual_spending, withdrawal_rate, expected_annual_return, monthly_contribution, target_amount, start_date,
               current_age, retirement_age, plan_through_age, pre_retirement_return, post_retirement_return,
               inflation_rate, annual_fee, contribution_growth_rate,
               spending_items, income_items, display_mode, account_share_map)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)`,
            [
              goal.id,
              goal.spaceId,
              goal.revision,
              goal.createdAt,
              goal.updatedAt,
              goal.deletedAt,
              goal.kind,
              goal.name,
              goal.currency,
              goal.annualSpending,
              goal.withdrawalRate,
              goal.expectedAnnualReturn,
              goal.monthlyContribution,
              goal.targetAmount,
              goal.startDate,
              // Phase-7 extension columns. We coalesce to null for older
              // snapshots that don't carry these fields so the prepared
              // statement still gets a valid bind argument.
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
        console.log(`[import] inserted ${snapshot.financialGoals.length} financial_goals`);
      }
      await this.updateAppSettings(snapshot.settings);
      await this.db.execute("COMMIT");
      const elapsed = Math.round(performance.now() - t0);
      console.log(`[import] complete in ${elapsed}ms`);
    } catch (error) {
      try {
        await this.db.execute("ROLLBACK");
      } catch {
        // Ignore rollback failure — the originating error matters more.
      }
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

  private async insertAccountRow(row: Account) {
    await this.db.execute(
      `insert into accounts (id, space_id, revision, created_at, updated_at, deleted_at, name, currency, opening_balance, balance, type, credit_limit, credit_limit_group, is_shared_to_household)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
      [row.id, row.spaceId, row.revision, row.createdAt, row.updatedAt, row.deletedAt, row.name, row.currency, row.openingBalance, row.balance, row.type, row.creditLimit, row.creditLimitGroup, Number(row.isSharedToHousehold)],
    );
  }

  private async insertAssetRow(row: PortfolioAsset) {
    await this.db.execute(
      `insert into portfolio_assets (id, space_id, revision, created_at, updated_at, deleted_at, ticker, name, name_zh, name_en, currency, total_quantity, average_cost, holding_source, acquisition_date, asset_type, sector, industry, account_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [row.id, row.spaceId, row.revision, row.createdAt, row.updatedAt, row.deletedAt, row.ticker, row.name, row.nameZh ?? null, row.nameEn ?? null, row.currency, row.totalQuantity, row.averageCost, row.holdingSource, row.acquisitionDate, row.assetType ?? null, row.sector ?? null, row.industry ?? null, row.accountId ?? null],
    );
  }

  private async insertLedgerRow(row: LedgerTransaction) {
    await this.db.execute(
      `insert into ledger_transactions (id, space_id, revision, created_at, updated_at, deleted_at, account_id, date, name, amount, currency, category, subcategory, merchant, entry_type, settlement_status, note, linked_investment_record_id, group_id, is_reviewed, receipt_attachment_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)`,
      [row.id, row.spaceId, row.revision, row.createdAt, row.updatedAt, row.deletedAt, row.accountId, row.date, row.name, row.amount, row.currency, row.category, row.subcategory, row.merchant, row.entryType, row.settlementStatus, row.note, row.linkedInvestmentRecordId, row.groupId, Number(row.isReviewed), row.receiptAttachmentId],
    );
  }

  private async insertRecurringRow(row: RecurringTransaction) {
    await this.db.execute(
      `insert into recurring_transactions (id, space_id, revision, created_at, updated_at, deleted_at, account_id, amount, currency, category, subcategory, merchant, entry_type, settlement_status, note, day_of_month, next_run_date, is_active)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [row.id, row.spaceId, row.revision, row.createdAt, row.updatedAt, row.deletedAt, row.accountId, row.amount, row.currency, row.category, row.subcategory, row.merchant, row.entryType, row.settlementStatus, row.note, row.dayOfMonth, row.nextRunDate, Number(row.isActive)],
    );
  }

  private async insertInvestmentRow(row: InvestmentRecord) {
    await this.db.execute(
      `insert into investment_records (id, space_id, revision, created_at, updated_at, deleted_at, asset_id, linked_account_id, date, action, price, quantity, fee, note, is_reviewed, linked_ledger_transaction_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [row.id, row.spaceId, row.revision, row.createdAt, row.updatedAt, row.deletedAt, row.assetId, row.linkedAccountId, row.date, row.action, row.price, row.quantity, row.fee, row.note, Number(row.isReviewed), row.linkedLedgerTransactionId],
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

  private async findOrCreateSqliteAsset(input: InvestmentDraft) {
    const ticker = input.ticker.trim().toUpperCase();
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
      name, currency, opening_balance as openingBalance, balance, type, credit_limit as creditLimit, credit_limit_group as creditLimitGroup, is_shared_to_household as isSharedToHousehold
      from accounts where id = $1 and deleted_at is null`, [input.linkedAccountId ?? ""]);
    const account = accountRows[0];
    if (!account || account.type !== "investment") throw new Error("請選擇投資帳戶。");
    if (input.currency.trim().toUpperCase() !== account.currency.trim().toUpperCase()) throw new Error("交易幣別必須與投資帳戶一致。");

    if (input.action === "sell") {
      if (!assetId) throw new Error("賣出股數大於目前庫存。");
      const records = await this.listInvestmentRecords();
      const available = calculateInvestmentAccountQuantity(records, assetId, account.id, options.excludeRecordId);
      if (input.quantity > available + 0.000001) throw new Error(`賣出股數大於目前庫存，可賣出 ${available} 股。`);
    }

    const cashDelta = calculateInvestmentCashDelta(input);
    if (cashDelta >= 0) return;
    if (allowsTwdTPlus2Buffer(input, account.currency)) return;
    const ledgerRows = await this.db.select<LedgerTransaction[]>(`select
      id, space_id as spaceId, revision, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt,
      account_id as accountId, date, name, amount, currency, category, subcategory, merchant, entry_type as entryType, settlement_status as settlementStatus, note, linked_investment_record_id as linkedInvestmentRecordId,
      group_id as groupId, is_reviewed as isReviewed, receipt_attachment_id as receiptAttachmentId
      from ledger_transactions where account_id = $1`, [account.id]);
    const baseBalance = computeAccountBalance(account, ledgerRows, options.excludeLedgerId ?? null);
    const nextBalance = baseBalance + cashDelta;
    if (isEffectivelyNegative(nextBalance)) throw new Error(`購買力不足，目前餘額 ${formatPlainAmount(baseBalance)} ${account.currency}。`);
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
      account_id as accountId, date, name, amount, currency, category, subcategory, merchant, entry_type as entryType, settlement_status as settlementStatus, note, linked_investment_record_id as linkedInvestmentRecordId,
      group_id as groupId, is_reviewed as isReviewed, receipt_attachment_id as receiptAttachmentId from ledger_transactions`);
    for (const account of recomputeAccounts(accounts, ledger)) {
      await this.db.execute(`update accounts set balance = $1 where id = $2`, [account.balance, account.id]);
    }
  }

  private async recomputeSqliteAssets() {
    const assets = await this.listPortfolioAssets();
    const records = await this.listInvestmentRecords();
    for (const asset of recomputeAssets(assets, records)) {
      if (asset.holdingSource === "manual") continue;
      await this.db.execute(`update portfolio_assets set total_quantity = $1, average_cost = $2 where id = $3`, [asset.totalQuantity, asset.averageCost, asset.id]);
    }
  }
}

function createInitialData(): RepositoryData {
  return {
    accounts: [...seedAccounts],
    ledgerTransactions: [...seedLedgerTransactions],
    portfolioAssets: [...seedAssets],
    investmentRecords: [...seedInvestmentRecords],
    recurringTransactions: [...seedRecurringTransactions],
    marketQuotes: [] as StoredMarketQuote[],
    settings: defaultSettings,
    dailyFxRates: [] as DailyFxRate[],
    dailyPrices: [] as DailyPrice[],
    financialGoals: [],
  };
}

function normalizeStoredData(data: Partial<RepositoryData>): RepositoryData {
  return {
    accounts: (data.accounts ?? []).map((account) => ({
      ...account,
      creditLimit: account.creditLimit ?? null,
      creditLimitGroup: account.creditLimitGroup ?? "",
    })),
    ledgerTransactions: (data.ledgerTransactions ?? []).map((row) => ({
      ...row,
      name: row.name ?? row.merchant ?? "",
      subcategory: row.subcategory ?? "",
      merchant: row.merchant ?? "",
      entryType: row.entryType ?? (row.amount >= 0 ? "income" : "expense"),
      settlementStatus: row.settlementStatus ?? "settled",
    })),
    portfolioAssets: (data.portfolioAssets ?? []).map(normalizePortfolioAsset),
    investmentRecords: data.investmentRecords ?? [],
    recurringTransactions: (data.recurringTransactions ?? []).map((row) => ({
      ...row,
      subcategory: row.subcategory ?? "",
      merchant: row.merchant ?? "",
      entryType: row.entryType ?? (row.amount >= 0 ? "income" : "expense"),
      settlementStatus: row.settlementStatus ?? "settled",
    })),
    marketQuotes: data.marketQuotes ?? [],
    settings: normalizeSettings(data.settings ?? defaultSettings),
    dailyFxRates: data.dailyFxRates ?? [],
    dailyPrices: data.dailyPrices ?? [],
    financialGoals: (data.financialGoals ?? []).map(normalizeFinancialGoal),
  };
}

/**
 * Backfill optional retirement-projection fields on goals loaded from an
 * older snapshot or browser localStorage. Returning the goal as-is would
 * give us `undefined` for the new keys and break the projection helper's
 * `null`-aware guard. We keep null-vs-undefined uniform across the whole
 * surface.
 */
function normalizeFinancialGoal(goal: FinancialGoal): FinancialGoal {
  return {
    ...goal,
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
    const group = item as { name?: unknown; children?: unknown };
    return {
      name: String(group.name ?? "").trim(),
      children: uniqueClean(group.children, []),
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
  };
}

function goalFieldsFromDraft(input: FinancialGoalDraft) {
  return {
    kind: input.kind === "custom" ? ("custom" as const) : ("fire" as const),
    name: input.name.trim() || "FIRE 目標",
    currency: (input.currency || "TWD").toUpperCase(),
    annualSpending: Math.max(0, Number(input.annualSpending) || 0),
    withdrawalRate:
      Number.isFinite(input.withdrawalRate) && input.withdrawalRate > 0 ? input.withdrawalRate : 0.04,
    expectedAnnualReturn: Number.isFinite(input.expectedAnnualReturn) ? input.expectedAnnualReturn : 0.07,
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
  return {
    ticker,
    name: input.name.trim() || ticker,
    nameZh: null as string | null,
    nameEn: null as string | null,
    currency: input.currency.trim().toUpperCase(),
    totalQuantity: Math.max(0, Number(input.totalQuantity) || 0),
    averageCost: Math.max(0, Number(input.averageCost) || 0),
    holdingSource: "manual" as const,
    acquisitionDate: input.acquisitionDate || null,
    ...assetClassificationFields(input),
    accountId: input.accountId || null,
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

function createLedgerRow(input: LedgerDraft): LedgerTransaction {
  const timestamp = nowIso();
  return {
    id: createId("ledger"),
    spaceId: personalSpace,
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    accountId: input.accountId,
    date: input.date,
    name: input.name,
    amount: input.amount,
    currency: input.currency,
    category: input.category,
    subcategory: input.subcategory,
    merchant: input.merchant,
    entryType: input.entryType,
    settlementStatus: input.settlementStatus,
    note: input.note,
    linkedInvestmentRecordId: null,
    groupId: input.groupId ?? null,
    isReviewed: false,
    receiptAttachmentId: null,
  };
}

function createInvestmentLedgerRow(input: InvestmentDraft, investmentRecordId: string): LedgerTransaction | null {
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
    isReviewed: false,
    receiptAttachmentId: null,
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
    entryType: amount >= 0 ? ("income" as const) : ("expense" as const),
    settlementStatus: "settled" as const,
    note: input.note,
    linkedInvestmentRecordId: investmentRecordId,
    groupId: null as string | null,
  };
}

function createRecurringRow(input: RecurringDraft): RecurringTransaction {
  const timestamp = nowIso();
  return {
    id: createId("recurring"),
    spaceId: personalSpace,
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
    ...input,
  };
}

function nextMonthlyDate(value: string, dayOfMonth: number) {
  const [year, month] = value.split("-").map(Number);
  const next = new Date(year, month, 1);
  next.setDate(Math.min(dayOfMonth, daysInMonth(next.getFullYear(), next.getMonth())));
  return next.toISOString().slice(0, 10);
}

function daysInMonth(year: number, zeroBasedMonth: number) {
  return new Date(year, zeroBasedMonth + 1, 0).getDate();
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
  };
}

function computeAccountBalance(account: Account, ledgerRows: LedgerTransaction[], excludeLedgerId: string | null) {
  const total = ledgerRows
    .filter((row) =>
      row.deletedAt === null &&
      row.settlementStatus === "settled" &&
      row.accountId === account.id &&
      row.id !== excludeLedgerId
    )
    .reduce((sum, row) => sum + row.amount, 0);
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
