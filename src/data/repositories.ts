import type Database from "@tauri-apps/plugin-sql";
import type {
  Account,
  AppSettings,
  DailyFxRate,
  DailyPrice,
  InvestmentAction,
  InvestmentRecord,
  LedgerTransaction,
  PortfolioAsset,
  RecurringTransaction,
} from "../domain/types";
import type { MarketQuote } from "../features/market-data";
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
}

export interface PortfolioAssetDraft {
  ticker: string;
  name: string;
  currency: string;
  totalQuantity: number;
  averageCost: number;
  acquisitionDate: string | null;
  accountId: string | null;
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
}

const personalSpace = "space_personal_default";
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
}

let repositoryPromise: Promise<FinanceRepository> | null = null;

export function getFinanceRepository(): Promise<FinanceRepository> {
  repositoryPromise ??= createFinanceRepository();
  return repositoryPromise;
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

  async initialize() {
    const stored = window.localStorage.getItem(this.storageKey);
    this.data = stored ? normalizeStoredData(JSON.parse(stored) as Partial<RepositoryData>) : createInitialData();
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
      (account) => account.type === "investment" && account.name === "未指定" && account.deletedAt === null,
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
        name: "未指定",
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
    const asset = this.findOrCreateAsset(input);
    this.data.investmentRecords.push(createInvestmentRow(input, asset.id));
    this.recompute();
    await this.persist();
  }

  async updateInvestmentRecord(id: string, input: InvestmentDraft) {
    const asset = this.findOrCreateAsset(input);
    this.data.investmentRecords = this.data.investmentRecords.map((record) =>
      record.id === id ? bump({ ...record, ...investmentDraftFields(input), assetId: asset.id }) : record,
    );
    this.recompute();
    await this.persist();
  }

  async deleteInvestmentRecord(id: string) {
    this.data.investmentRecords = this.data.investmentRecords.map((record) =>
      record.id === id ? bump({ ...record, deletedAt: nowIso() }) : record,
    );
    this.recompute();
    await this.persist();
  }

  async importInvestmentRecords(rows: InvestmentDraft[]) {
    for (const row of rows) {
      const asset = this.findOrCreateAsset(row);
      this.data.investmentRecords.push(createInvestmentRow(row, asset.id));
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
    });
    await this.persist();
  }

  private findOrCreateAsset(input: InvestmentDraft): PortfolioAsset {
    const ticker = input.ticker.trim().toUpperCase();
    const existing = this.data.portfolioAssets.find((item) => item.ticker === ticker && item.deletedAt === null && item.holdingSource === "transactions");
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
      accountId: null,
    };
    this.data.portfolioAssets.push(asset);
    return asset;
  }

  private recompute() {
    this.data.accounts = recomputeAccounts(this.data.accounts, this.data.ledgerTransactions);
    this.data.portfolioAssets = recomputeAssets(this.data.portfolioAssets, this.data.investmentRecords);
  }

  private async persist() {
    window.localStorage.setItem(this.storageKey, JSON.stringify(this.data));
  }
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
    const linked = await this.db.select<Array<{ count: number }>>(
      `select count(*) as count from ledger_transactions where account_id = $1 and deleted_at is null`,
      [id],
    );
    if ((linked[0]?.count ?? 0) > 0) throw new Error("已有交易的帳戶不能刪除。");
    await this.db.execute(`update accounts set deleted_at = $1, updated_at = $1, revision = revision + 1 where id = $2`, [nowIso(), id]);
  }

  override async listLedgerTransactions() {
    return this.db.select<LedgerTransaction[]>(`select
      id, space_id as spaceId, revision, created_at as createdAt, updated_at as updatedAt, deleted_at as deletedAt,
      account_id as accountId, date, amount, currency, category, subcategory, merchant, entry_type as entryType, settlement_status as settlementStatus, note,
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
      `update ledger_transactions set revision = revision + 1, updated_at = $1, account_id = $2, date = $3, amount = $4, currency = $5, category = $6, subcategory = $7, merchant = $8, entry_type = $9, settlement_status = $10, note = $11, group_id = $12 where id = $13`,
      [nowIso(), input.accountId, input.date, input.amount, input.currency, input.category, input.subcategory, input.merchant, input.entryType, input.settlementStatus, input.note, input.groupId ?? null, id],
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
      ticker, name, name_zh as nameZh, name_en as nameEn, currency, total_quantity as totalQuantity, average_cost as averageCost, holding_source as holdingSource, acquisition_date as acquisitionDate, account_id as accountId
      from portfolio_assets where deleted_at is null order by ticker`);
    return rows.map((row) => ({
      ...row,
      nameZh: row.nameZh ?? null,
      nameEn: row.nameEn ?? null,
      accountId: row.accountId ?? null,
    }));
  }

  override async createManualHolding(input: PortfolioAssetDraft) {
    await this.insertAssetRow(createManualHoldingRow(input));
  }

  override async updateManualHolding(id: string, input: PortfolioAssetDraft) {
    await this.db.execute(
      `update portfolio_assets set revision = revision + 1, updated_at = $1, ticker = $2, name = $3, currency = $4, total_quantity = $5, average_cost = $6, acquisition_date = $7, account_id = $8 where id = $9 and holding_source = 'manual'`,
      [nowIso(), input.ticker.trim().toUpperCase(), input.name.trim() || input.ticker.trim().toUpperCase(), input.currency.trim().toUpperCase(), input.totalQuantity, input.averageCost, input.acquisitionDate || null, input.accountId || null, id],
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
    const assetId = await this.findOrCreateSqliteAsset(input);
    await this.insertInvestmentRow(createInvestmentRow(input, assetId));
    await this.recomputeSqliteAssets();
  }

  override async updateInvestmentRecord(id: string, input: InvestmentDraft) {
    const assetId = await this.findOrCreateSqliteAsset(input);
    await this.db.execute(
      `update investment_records set revision = revision + 1, updated_at = $1, asset_id = $2, linked_account_id = $3, date = $4, action = $5, price = $6, quantity = $7, fee = $8, note = $9 where id = $10`,
      [nowIso(), assetId, input.linkedAccountId ?? null, input.date, input.action, input.price, input.quantity, input.fee, input.note, id],
    );
    await this.recomputeSqliteAssets();
  }

  override async deleteInvestmentRecord(id: string) {
    await this.db.execute(`update investment_records set deleted_at = $1, updated_at = $1, revision = revision + 1 where id = $2`, [nowIso(), id]);
    await this.recomputeSqliteAssets();
  }

  override async importInvestmentRecords(rows: InvestmentDraft[]) {
    for (const row of rows) {
      const assetId = await this.findOrCreateSqliteAsset(row);
      await this.insertInvestmentRow(createInvestmentRow(row, assetId));
    }
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
    for (const rate of rates) {
      const fromCode = rate.from.trim().toUpperCase();
      const toCode = rate.to.trim().toUpperCase();
      const date = rate.date.slice(0, 10);
      const value = Number(rate.rate);
      if (!fromCode || !toCode || !date || !Number.isFinite(value) || value <= 0) continue;
      await this.db.execute(
        `insert into fx_rates (currency_from, currency_to, date, rate, source, updated_at)
         values ($1,$2,$3,$4,$5,$6)
         on conflict(currency_from, currency_to, date) do update set rate = excluded.rate, source = excluded.source, updated_at = excluded.updated_at`,
        [fromCode, toCode, date, value, rate.source || "manual", rate.updatedAt || updatedAt],
      );
    }
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
    for (const price of prices) {
      const ticker = price.ticker.trim().toUpperCase();
      const date = price.date.slice(0, 10);
      const close = Number(price.close);
      if (!ticker || !date || !Number.isFinite(close) || close <= 0) continue;
      await this.db.execute(
        `insert into daily_prices (ticker, date, close, currency, source, updated_at)
         values ($1,$2,$3,$4,$5,$6)
         on conflict(ticker, date) do update set close = excluded.close, currency = excluded.currency, source = excluded.source, updated_at = excluded.updated_at`,
        [ticker, date, close, price.currency || "", price.source || "manual", price.updatedAt || updatedAt],
      );
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

  override async exportSnapshot(): Promise<RepositorySnapshot> {
    const [accounts, ledger, assetsList, investments, recurring, quotes, settings, fx, prices] = await Promise.all([
      this.listAccounts(),
      this.listLedgerTransactions(),
      this.listPortfolioAssets(),
      this.listInvestmentRecords(),
      this.listRecurringTransactions(),
      this.listMarketQuotes(),
      this.getAppSettings(),
      this.listDailyFxRates(),
      this.listDailyPrices(),
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
    };
  }

  override async importSnapshot(snapshot: RepositorySnapshot) {
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

    for (const account of snapshot.accounts) await this.insertAccountRow(account);
    for (const asset of snapshot.portfolioAssets) await this.insertAssetRow(asset);
    for (const row of snapshot.investmentRecords) await this.insertInvestmentRow(row);
    for (const row of snapshot.ledgerTransactions) await this.insertLedgerRow(row);
    for (const row of snapshot.recurringTransactions) await this.insertRecurringRow(row);
    if (snapshot.marketQuotes.length) {
      await this.saveMarketQuotes(snapshot.marketQuotes, snapshot.marketQuotes[0]?.source ?? "import");
    }
    if (snapshot.dailyFxRates.length) await this.saveDailyFxRates(snapshot.dailyFxRates);
    if (snapshot.dailyPrices.length) await this.saveDailyPrices(snapshot.dailyPrices);
    await this.updateAppSettings(snapshot.settings);
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
      `insert into portfolio_assets (id, space_id, revision, created_at, updated_at, deleted_at, ticker, name, name_zh, name_en, currency, total_quantity, average_cost, holding_source, acquisition_date, account_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [row.id, row.spaceId, row.revision, row.createdAt, row.updatedAt, row.deletedAt, row.ticker, row.name, row.nameZh ?? null, row.nameEn ?? null, row.currency, row.totalQuantity, row.averageCost, row.holdingSource, row.acquisitionDate, row.accountId ?? null],
    );
  }

  private async insertLedgerRow(row: LedgerTransaction) {
    await this.db.execute(
      `insert into ledger_transactions (id, space_id, revision, created_at, updated_at, deleted_at, account_id, date, amount, currency, category, subcategory, merchant, entry_type, settlement_status, note, linked_investment_record_id, group_id, is_reviewed, receipt_attachment_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
      [row.id, row.spaceId, row.revision, row.createdAt, row.updatedAt, row.deletedAt, row.accountId, row.date, row.amount, row.currency, row.category, row.subcategory, row.merchant, row.entryType, row.settlementStatus, row.note, row.linkedInvestmentRecordId, row.groupId, Number(row.isReviewed), row.receiptAttachmentId],
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

  private async findOrCreateSqliteAsset(input: InvestmentDraft) {
    const ticker = input.ticker.trim().toUpperCase();
    const rows = await this.db.select<Array<{ id: string }>>(`select id from portfolio_assets where ticker = $1 and holding_source = 'transactions' and deleted_at is null limit 1`, [ticker]);
    if (rows[0]?.id) return rows[0].id;
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
      accountId: null,
    };
    await this.insertAssetRow(asset);
    return asset.id;
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
      `select id from accounts where type = 'investment' and name = '未指定' and deleted_at is null limit 1`,
    );
    if (existing[0]?.id) return existing[0].id;

    const id = createId("acct");
    const timestamp = nowIso();
    await this.db.execute(
      `insert into accounts (id, space_id, revision, created_at, updated_at, deleted_at, name, currency, opening_balance, balance, type, credit_limit, credit_limit_group, is_shared_to_household)
       values ($1,$2,1,$3,$3,null,$4,$5,0,0,$6,null,'',0)`,
      [id, personalSpace, timestamp, "未指定", "TWD", "investment"],
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
      account_id as accountId, date, amount, currency, category, subcategory, merchant, entry_type as entryType, settlement_status as settlementStatus, note, linked_investment_record_id as linkedInvestmentRecordId,
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

function createInitialData() {
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
    accountId: asset.accountId ?? null,
  };
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
    accountId: input.accountId || null,
  };
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
